import type {
  ScanOptions,
  ScanResult,
  DetectedRaid,
  PlayerInfo,
  EncounterSummary,
  TimeRange,
} from "./types.js";
import { CombatLogStateMachine } from "./state/state-machine.js";
import type { PlayerRecord } from "./state/state-machine.js";
import type { RaidSegment } from "./state/raid-separator.js";
import { createLineSplitter } from "./pipeline/line-splitter.js";
import { parseLine } from "./pipeline/line-parser.js";
import { epochToIso } from "./utils/timestamp.js";

/** Tolerance (ms) before a segment start for matching encounters to raids. */
const ENCOUNTER_PRE_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Minimum encounter duration (seconds) to include in scan results.
 * Encounters shorter than this are typically brief pull-and-resets or
 * proximity boss triggers, not real combat attempts.
 */
const MIN_ENCOUNTER_DURATION_S = 5;

/** Jaccard similarity threshold for grouping segments into one DetectedRaid. */
const GROUP_JACCARD_THRESHOLD = 0.5;

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersectionSize = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const item of smaller) {
    if (larger.has(item)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 1 : intersectionSize / unionSize;
}

/**
 * Scan a WoW combat log stream to detect raids, encounters, and players.
 * Processes the entire file in one streaming pass.
 */
export async function scanLog(
  stream: ReadableStream<Uint8Array>,
  options?: ScanOptions,
): Promise<ScanResult> {
  const year = new Date().getFullYear();
  const stateMachine = new CombatLogStateMachine();

  let bytesRead = 0;
  let lineCount = 0;
  let lastProgressBytes = 0;
  let lastTimestamp = 0;

  const onProgress = options?.onProgress;
  const PROGRESS_BYTE_INTERVAL = 1024 * 1024; // ~1MB
  const PROGRESS_LINE_INTERVAL = 5000;

  // Build pipeline: stream → byte counter → TextDecoder → LineSplitter
  const byteCounter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });

  const lineSplitter = createLineSplitter();

  const textStream = stream
    .pipeThrough(byteCounter)
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>);

  const lineStream = textStream.pipeThrough(lineSplitter);

  const reader = lineStream.getReader();

  for (;;) {
    const { done, value: line } = await reader.read();
    if (done) break;

    const event = parseLine(line, year);
    if (event === null) continue;

    lastTimestamp = event.timestamp;
    stateMachine.processEvent(event);

    lineCount++;
    if (onProgress) {
      if (
        bytesRead - lastProgressBytes >= PROGRESS_BYTE_INTERVAL ||
        lineCount % PROGRESS_LINE_INTERVAL === 0
      ) {
        onProgress(bytesRead);
        lastProgressBytes = bytesRead;
      }
    }
  }

  // Finalize
  stateMachine.finalize(lastTimestamp);

  const segments = stateMachine.getRaidSegments();
  const encounters = stateMachine.getEncounters();
  const playerMap = stateMachine.getDetectedPlayers();

  // Group segments into DetectedRaid[]
  const raids = groupSegmentsIntoRaids(segments, encounters, playerMap);

  return { raids };
}

interface SegmentGroup {
  segments: RaidSegment[];
  raidInstance: string | null;
  allPlayerGuids: Set<string>;
}

/**
 * Group RaidSegments into DetectedRaids.
 * Segments with the same raidInstance and high player overlap get merged.
 */
function groupSegmentsIntoRaids(
  segments: RaidSegment[],
  encounters: EncounterSummary[],
  playerMap: Map<string, PlayerRecord>,
): DetectedRaid[] {
  if (segments.length === 0) return [];

  // Build groups by merging similar segments
  const groups: SegmentGroup[] = [];

  for (const segment of segments) {
    let merged = false;

    for (const group of groups) {
      const sameInstance =
        group.raidInstance === segment.raidInstance ||
        group.raidInstance === null ||
        segment.raidInstance === null;

      if (sameInstance) {
        const similarity = jaccardSimilarity(
          group.allPlayerGuids,
          segment.playerGuids,
        );
        if (similarity >= GROUP_JACCARD_THRESHOLD) {
          group.segments.push(segment);
          for (const guid of segment.playerGuids) {
            group.allPlayerGuids.add(guid);
          }
          if (group.raidInstance === null && segment.raidInstance !== null) {
            group.raidInstance = segment.raidInstance;
          }
          merged = true;
          break;
        }
      }
    }

    if (!merged) {
      const allGuids = new Set(segment.playerGuids);
      groups.push({
        segments: [segment],
        raidInstance: segment.raidInstance,
        allPlayerGuids: allGuids,
      });
    }
  }

  // Convert each group to a DetectedRaid
  return groups.map((group) =>
    buildDetectedRaid(group, encounters, playerMap),
  );
}

function buildDetectedRaid(
  group: SegmentGroup,
  allEncounters: EncounterSummary[],
  playerMap: Map<string, PlayerRecord>,
): DetectedRaid {
  // Collect unique dates
  const dateSet = new Set<string>();
  let minTimestamp = Infinity;
  let maxTimestamp = -Infinity;
  const timeRanges: TimeRange[] = [];

  for (const seg of group.segments) {
    dateSet.add(seg.date);
    if (seg.firstTimestamp < minTimestamp) minTimestamp = seg.firstTimestamp;
    if (seg.lastTimestamp > maxTimestamp) maxTimestamp = seg.lastTimestamp;
    timeRanges.push({
      startTime: epochToIso(seg.firstTimestamp),
      endTime: epochToIso(seg.lastTimestamp),
    });
  }

  // Filter players to only those active in this raid's segments
  const players: PlayerInfo[] = [];
  for (const guid of group.allPlayerGuids) {
    const record = playerMap.get(guid);
    if (record) {
      players.push({
        guid: record.guid,
        name: record.name,
        class: record.class,
        spec: record.spec,
      });
    }
  }

  // Sort players by name for stable output
  players.sort((a, b) => a.name.localeCompare(b.name));

  // Filter encounters: an encounter belongs to this raid if its start timestamp
  // falls within any of the raid's time ranges (with pre-tolerance).
  // Also exclude encounters shorter than MIN_ENCOUNTER_DURATION_S — these are
  // typically brief pull-and-resets or proximity triggers, not real attempts.
  const raidEncounters = allEncounters.filter((enc) => {
    if (enc.duration < MIN_ENCOUNTER_DURATION_S) return false;
    const encStart = new Date(enc.startTime).getTime();
    return group.segments.some(
      (seg) =>
        encStart >= seg.firstTimestamp - ENCOUNTER_PRE_TOLERANCE_MS &&
        encStart <= seg.lastTimestamp,
    );
  });

  // Sort encounters chronologically
  raidEncounters.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  return {
    raidInstance: group.raidInstance,
    dates: [...dateSet],
    startTime: epochToIso(minTimestamp),
    endTime: epochToIso(maxTimestamp),
    timeRanges,
    playerCount: players.length,
    players,
    encounters: raidEncounters,
  };
}
