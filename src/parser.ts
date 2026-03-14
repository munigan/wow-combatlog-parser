import type {
  ParseOptions,
  ParseResult,
  ParsedRaid,
  RaidSelection,
  PlayerInfo,
  ConsumableSummaryEntry,
} from "./types.js";
import { CombatLogStateMachine } from "./state/state-machine.js";
import { createLineSplitter } from "./pipeline/line-splitter.js";
import { parseLine } from "./pipeline/line-parser.js";

/**
 * Minimum encounter duration (seconds) to include in parse results.
 * Matches the same threshold used by scanLog in scanner.ts.
 * Filters out Grobbulus hallway poison (6s), brief pull-and-resets, etc.
 */
const MIN_ENCOUNTER_DURATION_S = 10;

/** Per-selection context: time ranges in epoch ms for fast comparison. */
interface SelectionContext {
  selection: RaidSelection;
  dateSet: Set<string>;
  epochRanges: Array<{ start: number; end: number }>;
  stateMachine: CombatLogStateMachine;
}

/**
 * Parse a WoW combat log stream, only processing events within the given
 * RaidSelection time ranges. Returns detailed ParsedRaid results.
 */
export async function parseLog(
  stream: ReadableStream<Uint8Array>,
  raidSelections: RaidSelection[],
  options?: ParseOptions,
): Promise<ParseResult> {
  const year = new Date().getFullYear();

  // Pre-process selections: convert ISO time ranges to epoch ms
  const contexts: SelectionContext[] = raidSelections.map((sel) => {
    const dateSet = new Set(sel.dates);
    const epochRanges: Array<{ start: number; end: number }> = [];

    if (sel.timeRanges && sel.timeRanges.length > 0) {
      for (const tr of sel.timeRanges) {
        epochRanges.push({
          start: new Date(tr.startTime).getTime(),
          end: new Date(tr.endTime).getTime(),
        });
      }
    } else {
      // Fall back to the single startTime/endTime range
      epochRanges.push({
        start: new Date(sel.startTime).getTime(),
        end: new Date(sel.endTime).getTime(),
      });
    }

    return {
      selection: sel,
      dateSet,
      epochRanges,
      stateMachine: new CombatLogStateMachine(true /* trackConsumables */),
    };
  });

  // Build a set of all relevant dates across all selections for fast rejection
  const allRelevantDates = new Set<string>();
  for (const ctx of contexts) {
    for (const d of ctx.dateSet) {
      allRelevantDates.add(d);
    }
  }

  let bytesRead = 0;
  let lineCount = 0;
  let lastProgressBytes = 0;
  const lastTimestamps = new Array<number>(contexts.length).fill(0);
  const firstTimestamps = new Array<number>(contexts.length).fill(0);

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

    // Fast date rejection
    if (!allRelevantDates.has(event.date)) {
      lineCount++;
      if (onProgress && lineCount % PROGRESS_LINE_INTERVAL === 0) {
        if (bytesRead - lastProgressBytes >= PROGRESS_BYTE_INTERVAL) {
          onProgress(bytesRead);
          lastProgressBytes = bytesRead;
        }
      }
      continue;
    }

    // Check each selection
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];

      // Date must be in this selection's dates
      if (!ctx.dateSet.has(event.date)) continue;

      // Timestamp must fall within one of this selection's epoch ranges
      const inRange = ctx.epochRanges.some(
        (r) => event.timestamp >= r.start && event.timestamp <= r.end,
      );
      if (!inRange) continue;

      ctx.stateMachine.processEvent(event);
      lastTimestamps[i] = event.timestamp;
      if (firstTimestamps[i] === 0) {
        firstTimestamps[i] = event.timestamp;
      }
    }

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

  // Finalize each selection's state machine and build results
  const raids: ParsedRaid[] = contexts.map((ctx, i) => {
    ctx.stateMachine.finalize(lastTimestamps[i]);

    const segments = ctx.stateMachine.getRaidSegments();
    const encounters = ctx.stateMachine.getEncounters();
    const playerMap = ctx.stateMachine.getDetectedPlayers();
    const encounterParticipants = ctx.stateMachine.getEncounterParticipants();

    // Find the raid instance from segments (first non-null)
    let raidInstance: string | null = null;
    for (const seg of segments) {
      if (seg.raidInstance !== null) {
        raidInstance = seg.raidInstance;
        break;
      }
    }

    // Determine raid date from the first date in the selection
    const firstDate = ctx.selection.dates[0] ?? "";
    const raidDate = parseDateString(firstDate, year);

    // Build per-player consumable summaries from encounter data
    const playerConsumableSummaries = new Map<string, Record<number, ConsumableSummaryEntry>>();
    for (const enc of encounters) {
      if (enc.consumables === undefined) continue;
      for (const [guid, uses] of Object.entries(enc.consumables)) {
        let summary = playerConsumableSummaries.get(guid);
        if (summary === undefined) {
          summary = {};
          playerConsumableSummaries.set(guid, summary);
        }
        for (const use of uses) {
          const existing = summary[use.spellId];
          if (existing !== undefined) {
            existing.totalUses += use.count;
            if (use.prePot) existing.prePotCount += use.count;
          } else {
            summary[use.spellId] = {
              spellName: use.spellName,
              type: use.type,
              totalUses: use.count,
              prePotCount: use.prePot ? use.count : 0,
            };
          }
        }
      }
    }

    // Get per-player combat stat summaries
    const combatSummaries = ctx.stateMachine.getCombatPlayerSummaries();

    // Get buff uptime results
    const raidStartMs = firstTimestamps[i];
    const raidEndMs = lastTimestamps[i];
    const raidDurationMs = raidEndMs - raidStartMs;
    const buffUptimeResults = ctx.stateMachine.getBuffUptimeResults(raidStartMs, raidEndMs);

    // Filter out phantom encounters (< 10s wipes from proximity triggers,
    // Grobbulus hallway poison, brief pull-and-resets, etc.) — same threshold
    // used by scanLog in scanner.ts.
    // Sort remaining encounters chronologically.
    const sortedEncounters = encounters
      .filter((enc) => enc.duration >= MIN_ENCOUNTER_DURATION_S)
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );

    // Get death summaries
    const deathSummaries = ctx.stateMachine.getDeathSummaries();

    // Get externals summaries
    const totalEncounterDurationMs = sortedEncounters.reduce(
      (sum, enc) => sum + enc.duration * 1000, 0,
    );
    const externalsSummaries = ctx.stateMachine.getExternalsSummaries(totalEncounterDurationMs);

    // Build per-player encounter-aggregate buff uptime
    const playerEncounterBuffUptime = new Map<string, { flaskMs: number; foodMs: number; totalMs: number }>();
    for (const enc of sortedEncounters) {
      if (enc.buffUptime === undefined) continue;
      const encDurationMs = enc.duration * 1000; // duration is in seconds
      for (const [guid, bu] of Object.entries(enc.buffUptime)) {
        let agg = playerEncounterBuffUptime.get(guid);
        if (agg === undefined) {
          agg = { flaskMs: 0, foodMs: 0, totalMs: 0 };
          playerEncounterBuffUptime.set(guid, agg);
        }
        agg.flaskMs += (bu.flaskUptimePercent / 100) * encDurationMs;
        agg.foodMs += (bu.foodUptimePercent / 100) * encDurationMs;
        agg.totalMs += encDurationMs;
      }
    }

    // Build player list: only include players who participated in encounters
    const players: PlayerInfo[] = [];
    for (const record of playerMap.values()) {
      if (!encounterParticipants.has(record.guid)) continue;
      const consumables = playerConsumableSummaries.get(record.guid);
      const combat = combatSummaries?.get(record.guid);
      const buffUptime = buffUptimeResults?.get(record.guid);
      const encAgg = playerEncounterBuffUptime.get(record.guid);
      const mergedBuffUptime = buffUptime !== undefined ? {
        ...buffUptime,
        encounterFlaskUptimePercent: encAgg !== undefined && encAgg.totalMs > 0
          ? Math.min(100, Math.round((encAgg.flaskMs / encAgg.totalMs) * 100 * 100) / 100)
          : 0,
        encounterFoodUptimePercent: encAgg !== undefined && encAgg.totalMs > 0
          ? Math.min(100, Math.round((encAgg.foodMs / encAgg.totalMs) * 100 * 100) / 100)
          : 0,
      } : undefined;
      players.push({
        guid: record.guid,
        name: record.name,
        class: record.class,
        spec: record.spec,
        ...(consumables !== undefined && Object.keys(consumables).length > 0
          ? { consumables }
          : {}),
        ...(combat !== undefined ? { combatStats: combat } : {}),
        ...(mergedBuffUptime !== undefined ? { buffUptime: mergedBuffUptime } : {}),
        ...(deathSummaries?.has(record.guid) ? { deathCount: deathSummaries.get(record.guid) } : {}),
        ...(externalsSummaries?.has(record.guid) ? { externals: externalsSummaries.get(record.guid) } : {}),
      });
    }
    players.sort((a, b) => a.name.localeCompare(b.name));

    return {
      raidInstance,
      raidDate,
      raidDurationMs,
      players,
      encounters: sortedEncounters,
    };
  });

  return { raids };
}

/** Parse a "M/D" date string into a Date object with the given year. */
function parseDateString(dateStr: string, year: number): Date {
  const slashIdx = dateStr.indexOf("/");
  if (slashIdx === -1) return new Date(year, 0, 1);
  const month = parseInt(dateStr.substring(0, slashIdx), 10);
  const day = parseInt(dateStr.substring(slashIdx + 1), 10);
  return new Date(year, month - 1, day);
}
