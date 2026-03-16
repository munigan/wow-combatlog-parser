import type {
  ParseOptions,
  RaidSelection,
  PlayerInfo,
  ConsumableSummaryEntry,
  ParseStreamCallbacks,
  EncounterPlayer,
  EncounterSummary,
} from "./types.js";
import { CombatLogStateMachine } from "./state/state-machine.js";
import { buildPipeline } from "./pipeline/build-pipeline.js";
import { parseLine } from "./pipeline/line-parser.js";

/**
 * Minimum encounter duration (seconds) to include in results.
 * Filters out Grobbulus hallway poison (6s), brief pull-and-resets, etc.
 */
const MIN_ENCOUNTER_DURATION_S = 10;

/** Parse a "M/D" date string into a Date object with the given year. */
function parseDateString(dateStr: string, year: number): Date {
  const slashIdx = dateStr.indexOf("/");
  if (slashIdx === -1) return new Date(year, 0, 1);
  const month = parseInt(dateStr.substring(0, slashIdx), 10);
  const day = parseInt(dateStr.substring(slashIdx + 1), 10);
  return new Date(year, month - 1, day);
}

/**
 * Build an EncounterPlayer list from encounter participants and the player map.
 */
function buildEncounterPlayers(
  participants: Set<string>,
  playerMap: Map<string, { guid: string; name: string; class: import("./types.js").WowClass | null; spec: import("./types.js").WowSpec | null }>,
): EncounterPlayer[] {
  const players: EncounterPlayer[] = [];
  for (const guid of participants) {
    const record = playerMap.get(guid);
    if (record !== undefined) {
      players.push({
        guid: record.guid,
        name: record.name,
        class: record.class,
        spec: record.spec,
      });
    }
  }
  players.sort((a, b) => a.name.localeCompare(b.name));
  return players;
}

/**
 * Streaming parse: processes a WoW combat log stream and calls callbacks
 * incrementally as encounters complete.
 *
 * - `callbacks.onEncounter(encounter)` — called after each boss encounter ends.
 *   If the callback returns a Promise, the parser awaits it (backpressure).
 * - `callbacks.onComplete(summary)` — called once after the stream is fully
 *   consumed, with raid-wide player aggregates.
 *
 * @example
 * ```typescript
 * await parseLogStream(file.stream(), selections, {
 *   onEncounter: async (encounter) => {
 *     await db.encounters.insert(encounter);
 *   },
 *   onComplete: async (summary) => {
 *     await db.raids.update({ raidId, ...summary });
 *   },
 * });
 * ```
 */
export async function parseLogStream(
  stream: ReadableStream<Uint8Array>,
  raidSelections: RaidSelection[],
  callbacks: ParseStreamCallbacks,
  options?: ParseOptions,
): Promise<void> {
  const year = new Date().getFullYear();

  // Pre-process selections: convert ISO time ranges to epoch ms
  const contexts = raidSelections.map((sel) => {
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

  let lineCount = 0;
  let lastProgressBytes = 0;
  const lastTimestamps = new Array<number>(contexts.length).fill(0);
  const firstTimestamps = new Array<number>(contexts.length).fill(0);

  const onProgress = options?.onProgress;
  const PROGRESS_BYTE_INTERVAL = 1024 * 1024; // ~1MB
  const PROGRESS_LINE_INTERVAL = 5000;

  // Build pipeline with gzip + maxBytes support
  const { reader, getBytesRead } = await buildPipeline(stream, options?.maxBytes);

  for (;;) {
    const { done, value: line } = await reader.read();
    if (done) break;

    // Fast date rejection
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx > 0) {
      const dateStr = line.substring(0, spaceIdx);
      if (!allRelevantDates.has(dateStr)) {
        lineCount++;
        if (onProgress && lineCount % PROGRESS_LINE_INTERVAL === 0) {
          const bytesRead = getBytesRead();
          if (bytesRead - lastProgressBytes >= PROGRESS_BYTE_INTERVAL) {
            onProgress(bytesRead);
            lastProgressBytes = bytesRead;
          }
        }
        continue;
      }
    }

    const event = parseLine(line, year);
    if (event === null) continue;

    // Check each selection
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];

      if (!ctx.dateSet.has(event.date)) continue;

      const inRange = ctx.epochRanges.some(
        (r) => event.timestamp >= r.start && event.timestamp <= r.end,
      );
      if (!inRange) continue;

      ctx.stateMachine.processEvent(event);
      lastTimestamps[i] = event.timestamp;
      if (firstTimestamps[i] === 0) {
        firstTimestamps[i] = event.timestamp;
      }

      // Check for completed encounter
      const completed = ctx.stateMachine.popCompletedEncounter();
      if (completed !== null && completed.encounter.duration >= MIN_ENCOUNTER_DURATION_S) {
        const players = buildEncounterPlayers(
          completed.participants,
          ctx.stateMachine.getDetectedPlayers(),
        );
        await callbacks.onEncounter({
          ...completed.encounter,
          players,
        });
      }
    }

    lineCount++;
    if (onProgress) {
      const bytesRead = getBytesRead();
      if (
        bytesRead - lastProgressBytes >= PROGRESS_BYTE_INTERVAL ||
        lineCount % PROGRESS_LINE_INTERVAL === 0
      ) {
        onProgress(bytesRead);
        lastProgressBytes = bytesRead;
      }
    }
  }

  // Finalize each selection's state machine — check for in-progress encounters
  for (let i = 0; i < contexts.length; i++) {
    const ctx = contexts[i];
    ctx.stateMachine.finalize(lastTimestamps[i]);

    const completed = ctx.stateMachine.popCompletedEncounter();
    if (completed !== null && completed.encounter.duration >= MIN_ENCOUNTER_DURATION_S) {
      const players = buildEncounterPlayers(
        completed.participants,
        ctx.stateMachine.getDetectedPlayers(),
      );
      await callbacks.onEncounter({
        ...completed.encounter,
        players,
      });
    }
  }

  // Build summary from the first selection (primary raid)
  const ctx = contexts[0];
  const segments = ctx.stateMachine.getRaidSegments();
  const playerMap = ctx.stateMachine.getDetectedPlayers();
  const encounterParticipants = ctx.stateMachine.getEncounterParticipants();

  // Find the raid instance from segments
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

  const raidStartMs = firstTimestamps[0];
  const raidEndMs = lastTimestamps[0];
  const raidDurationMs = raidEndMs - raidStartMs;

  // Build per-player consumable summaries
  const allEncounters = ctx.stateMachine.getEncounters()
    .filter((enc: EncounterSummary) => enc.duration >= MIN_ENCOUNTER_DURATION_S);
  const playerConsumableSummaries = new Map<string, Record<number, ConsumableSummaryEntry>>();
  for (const enc of allEncounters) {
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
  const buffUptimeResults = ctx.stateMachine.getBuffUptimeResults(raidStartMs, raidEndMs);

  // Get death summaries
  const deathSummaries = ctx.stateMachine.getDeathSummaries();

  // Get externals summaries
  const sortedEncounters = allEncounters.sort(
    (a: EncounterSummary, b: EncounterSummary) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  const totalEncounterDurationMs = sortedEncounters.reduce(
    (sum: number, enc: EncounterSummary) => sum + enc.duration * 1000, 0,
  );
  const externalsSummaries = ctx.stateMachine.getExternalsSummaries(totalEncounterDurationMs);

  // Build per-player encounter-aggregate buff uptime
  const playerEncounterBuffUptime = new Map<string, { flaskMs: number; foodMs: number; totalMs: number }>();
  for (const enc of sortedEncounters) {
    if (enc.buffUptime === undefined) continue;
    const encDurationMs = enc.duration * 1000;
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

  await callbacks.onComplete({
    raidInstance,
    raidDate,
    raidDurationMs,
    players,
  });
}
