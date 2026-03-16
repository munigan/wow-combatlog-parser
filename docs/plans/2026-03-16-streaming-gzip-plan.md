# Streaming Parse + Gzip Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add gzip auto-detection, 1 GB size limit, and `parseLogStream()` AsyncGenerator that yields encounters incrementally for DB persistence.

**Architecture:** `maybeDecompress()` utility detects gzip magic bytes and pipes through `DecompressionStream`. Size limit enforced in the byte counter. State machine gets `popCompletedEncounter()` to yield encounters one at a time. `parseLog()` becomes a wrapper around `parseLogStream()`.

**Tech Stack:** TypeScript, web-standard `DecompressionStream`, vitest

---

### Task 1: Create `maybeDecompress()` utility

**Files:**
- Create: `src/pipeline/decompress.ts`
- Create: `tests/unit/decompress.test.ts`

**Step 1: Write the tests**

Create `tests/unit/decompress.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { maybeDecompress } from "../../src/pipeline/decompress.js";
import { gzipSync } from "node:zlib";

function toStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const chunkSize = 64 * 1024;
      for (let i = 0; i < data.length; i += chunkSize) {
        controller.enqueue(data.subarray(i, i + chunkSize));
      }
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

describe("maybeDecompress", () => {
  it("passes through non-gzip data unchanged", async () => {
    const raw = new TextEncoder().encode("3/12 20:14:41.702  SPELL_DAMAGE,test\n");
    const result = await readAll(await maybeDecompress(toStream(raw)));
    expect(new TextDecoder().decode(result)).toBe("3/12 20:14:41.702  SPELL_DAMAGE,test\n");
  });

  it("decompresses gzip data", async () => {
    const original = "3/12 20:14:41.702  SPELL_DAMAGE,test data here\n";
    const compressed = gzipSync(Buffer.from(original));
    const result = await readAll(await maybeDecompress(toStream(compressed)));
    expect(new TextDecoder().decode(result)).toBe(original);
  });

  it("handles empty stream", async () => {
    const empty = new Uint8Array(0);
    const result = await readAll(await maybeDecompress(toStream(empty)));
    expect(result.length).toBe(0);
  });

  it("handles single-byte stream (not gzip)", async () => {
    const one = new Uint8Array([0x41]); // 'A'
    const result = await readAll(await maybeDecompress(toStream(one)));
    expect(result.length).toBe(1);
    expect(result[0]).toBe(0x41);
  });
});
```

**Step 2: Run tests — they should fail**

Run: `pnpm run test tests/unit/decompress.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement maybeDecompress**

Create `src/pipeline/decompress.ts`:

```typescript
// src/pipeline/decompress.ts

/** Gzip magic bytes: 0x1f, 0x8b */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/**
 * Peek at the first bytes of a stream to detect gzip compression.
 * If gzip magic bytes are found, pipe through DecompressionStream.
 * Otherwise, pass through unchanged.
 *
 * Returns a new ReadableStream<Uint8Array> that emits decompressed
 * (or original) bytes.
 */
export async function maybeDecompress(
  stream: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
  const reader = stream.getReader();
  const { done, value: firstChunk } = await reader.read();

  if (done || firstChunk === undefined || firstChunk.length === 0) {
    reader.releaseLock();
    // Return empty stream
    return new ReadableStream({ start(c) { c.close(); } });
  }

  const isGzip =
    firstChunk.length >= 2 &&
    firstChunk[0] === GZIP_MAGIC_0 &&
    firstChunk[1] === GZIP_MAGIC_1;

  // Reconstruct stream: re-enqueue first chunk + pipe remaining
  const reconstructed = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(firstChunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  if (isGzip) {
    return reconstructed.pipeThrough(
      new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>,
    );
  }

  return reconstructed;
}
```

**Step 4: Run tests**

Run: `pnpm run test tests/unit/decompress.test.ts`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/pipeline/decompress.ts tests/unit/decompress.test.ts
git commit -m "feat: add maybeDecompress utility for gzip auto-detection"
```

---

### Task 2: Add `FileTooLargeError` and `maxBytes` support

**Files:**
- Create: `src/errors.ts`
- Modify: `src/types.ts` (add maxBytes to ScanOptions and ParseOptions)

**Step 1: Create the error class**

Create `src/errors.ts`:

```typescript
// src/errors.ts

export class FileTooLargeError extends Error {
  bytesRead: number;
  maxBytes: number;

  constructor(bytesRead: number, maxBytes: number) {
    super(
      `File exceeds maximum size: ${(bytesRead / (1024 * 1024)).toFixed(1)} MB read, limit is ${(maxBytes / (1024 * 1024)).toFixed(0)} MB`,
    );
    this.name = "FileTooLargeError";
    this.bytesRead = bytesRead;
    this.maxBytes = maxBytes;
  }
}

/** Default maximum decompressed file size: 1 GB */
export const DEFAULT_MAX_BYTES = 1_073_741_824;
```

**Step 2: Add maxBytes to options types**

In `src/types.ts`, add `maxBytes?: number` to both `ScanOptions` and `ParseOptions` interfaces.

Find `ScanOptions` and add:
```typescript
  /** Maximum decompressed file size in bytes. Default: 1 GB (1_073_741_824). */
  maxBytes?: number;
```

Find `ParseOptions` and add the same field.

**Step 3: Commit**

```bash
git add src/errors.ts src/types.ts
git commit -m "feat: add FileTooLargeError and maxBytes option"
```

---

### Task 3: Wire gzip + maxBytes into scanLog and parseLog

**Files:**
- Modify: `src/scanner.ts:73-86` (pipeline assembly)
- Modify: `src/parser.ts:86-100` (pipeline assembly)
- Modify: `src/index.ts` (export new types)

**Step 1: Create a shared pipeline builder**

Create `src/pipeline/build-pipeline.ts`:

```typescript
// src/pipeline/build-pipeline.ts

import { maybeDecompress } from "./decompress.js";
import { createLineSplitter } from "./line-splitter.js";
import { FileTooLargeError, DEFAULT_MAX_BYTES } from "../errors.js";

export interface PipelineResult {
  reader: ReadableStreamDefaultReader<string>;
  getBytesRead: () => number;
}

/**
 * Build the standard parsing pipeline:
 * stream → maybeDecompress → byteCounter (with size limit) → TextDecoder → LineSplitter
 */
export async function buildPipeline(
  stream: ReadableStream<Uint8Array>,
  maxBytes?: number,
): Promise<PipelineResult> {
  const limit = maxBytes ?? DEFAULT_MAX_BYTES;
  let bytesRead = 0;

  // Step 1: Auto-detect and decompress gzip
  const decompressed = await maybeDecompress(stream);

  // Step 2: Byte counter with size limit
  const byteCounter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength;
      if (bytesRead > limit) {
        controller.error(new FileTooLargeError(bytesRead, limit));
        return;
      }
      controller.enqueue(chunk);
    },
  });

  // Step 3: Text decoding and line splitting
  const lineSplitter = createLineSplitter();

  const textStream = decompressed
    .pipeThrough(byteCounter)
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>);

  const lineStream = textStream.pipeThrough(lineSplitter);

  return {
    reader: lineStream.getReader(),
    getBytesRead: () => bytesRead,
  };
}
```

**Step 2: Refactor scanLog to use buildPipeline**

In `src/scanner.ts`, replace the pipeline assembly (lines 73-89) with:

```typescript
import { buildPipeline } from "./pipeline/build-pipeline.js";

// ... inside scanLog():

  const { reader, getBytesRead } = await buildPipeline(stream, options?.maxBytes);

  for (;;) {
    const { done, value: line } = await reader.read();
    if (done) break;

    const event = parseLine(line, year);
    if (event === null) continue;

    lastTimestamp = event.timestamp;
    stateMachine.processEvent(event);

    lineCount++;
    if (onProgress) {
      const currentBytes = getBytesRead();
      if (
        currentBytes - lastProgressBytes >= PROGRESS_BYTE_INTERVAL ||
        lineCount % PROGRESS_LINE_INTERVAL === 0
      ) {
        onProgress(currentBytes);
        lastProgressBytes = currentBytes;
      }
    }
  }
```

Remove the old `byteCounter`, `lineSplitter`, `textStream`, `lineStream` variable declarations and the manual `bytesRead` tracking. The `buildPipeline` function handles all of that.

**Step 3: Refactor parseLog to use buildPipeline**

In `src/parser.ts`, same change — replace lines 86-100 with `buildPipeline(stream, options?.maxBytes)`. Update the `getBytesRead()` calls in the progress reporting.

**Step 4: Export new types from index.ts**

Add to `src/index.ts`:
```typescript
export { FileTooLargeError } from "./errors.js";
```

**Step 5: Run full test suite**

Run: `pnpm run test`
Expected: All tests pass. Existing tests use raw (non-gzip) streams, which should pass through `maybeDecompress` unchanged.

**Step 6: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors.

**Step 7: Commit**

```bash
git add src/pipeline/build-pipeline.ts src/scanner.ts src/parser.ts src/index.ts
git commit -m "feat: wire gzip auto-detection and maxBytes into scan/parse pipelines"
```

---

### Task 4: Add `popCompletedEncounter()` to state machine

**Files:**
- Modify: `src/state/state-machine.ts`

**Step 1: Add the method**

The state machine currently pushes completed encounters to `this._encounters` array at line 169. Add a way to pop encounters for streaming consumption.

Add a new field and method to `CombatLogStateMachine`:

```typescript
  // New field (after _encounterParticipants):
  private _pendingEncounter: EncounterSummary | null = null;
  private _pendingParticipants: Set<string> | null = null;

  /**
   * Pop the most recently completed encounter, if any.
   * Returns null if no encounter has completed since the last call.
   * Used by parseLogStream() to yield encounters incrementally.
   */
  popCompletedEncounter(): { encounter: EncounterSummary; participants: Set<string> } | null {
    if (this._pendingEncounter === null) return null;
    const result = {
      encounter: this._pendingEncounter,
      participants: this._pendingParticipants!,
    };
    this._pendingEncounter = null;
    this._pendingParticipants = null;
    return result;
  }
```

Then modify the encounter completion block (lines 132-177) — after all tracker data is collected and BEFORE `this._encounters.push(encounterResult.encounter)`, also store the encounter as pending:

```typescript
      // Store as pending for streaming consumption
      this._pendingEncounter = encounterResult.encounter;
      this._pendingParticipants = encounterResult.participants;

      this._encounters.push(encounterResult.encounter);
```

Same for `finalize()` (lines 219-223) — store the force-ended encounter as pending too:

```typescript
      this._pendingEncounter = forceResult.encounter;
      this._pendingParticipants = forceResult.participants;

      this._encounters.push(forceResult.encounter);
```

**Step 2: Run tests**

Run: `pnpm run test`
Expected: All pass — no external behavior change, just a new method.

**Step 3: Commit**

```bash
git add src/state/state-machine.ts
git commit -m "feat: add popCompletedEncounter() for streaming encounter delivery"
```

---

### Task 5: Implement `parseLogStream()` AsyncGenerator

**Files:**
- Create: `src/stream-parser.ts`
- Modify: `src/index.ts` (export)
- Modify: `src/types.ts` (new types)

**Step 1: Add new types**

Add to `src/types.ts`:

```typescript
/** Player info scoped to a single encounter (yielded during streaming parse). */
export interface EncounterPlayer {
  guid: string;
  name: string;
  class: WowClass | null;
  spec: WowSpec | null;
}

/** A fully-parsed encounter yielded incrementally by parseLogStream(). */
export interface ParsedEncounter extends EncounterSummary {
  /** Players who participated in this encounter. */
  players: EncounterPlayer[];
}

/** Summary returned after parseLogStream() completes. Contains raid-level aggregates. */
export interface ParseStreamSummary {
  raidInstance: string | null;
  raidDate: Date;
  raidDurationMs: number;
  /** Raid-wide player stats (aggregated across all encounters). */
  players: PlayerInfo[];
}
```

**Step 2: Create stream-parser.ts**

Create `src/stream-parser.ts`. This is the core implementation — an AsyncGenerator that yields `ParsedEncounter` objects. The logic mirrors `parseLog()` but yields instead of accumulating.

```typescript
// src/stream-parser.ts

import type {
  ParseOptions,
  RaidSelection,
  ParsedEncounter,
  ParseStreamSummary,
  PlayerInfo,
  ConsumableSummaryEntry,
  EncounterPlayer,
} from "./types.js";
import { CombatLogStateMachine } from "./state/state-machine.js";
import { parseLine } from "./pipeline/line-parser.js";
import { buildPipeline } from "./pipeline/build-pipeline.js";

const MIN_ENCOUNTER_DURATION_S = 10;

interface SelectionContext {
  selection: RaidSelection;
  dateSet: Set<string>;
  epochRanges: Array<{ start: number; end: number }>;
  stateMachine: CombatLogStateMachine;
}

/**
 * Streaming parse: yields ParsedEncounter objects as each boss encounter
 * completes. Returns a ParseStreamSummary with raid-level aggregates
 * when the stream is fully consumed.
 */
export async function* parseLogStream(
  stream: ReadableStream<Uint8Array>,
  raidSelections: RaidSelection[],
  options?: ParseOptions,
): AsyncGenerator<ParsedEncounter, ParseStreamSummary> {
  const year = new Date().getFullYear();

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
      epochRanges.push({
        start: new Date(sel.startTime).getTime(),
        end: new Date(sel.endTime).getTime(),
      });
    }

    return {
      selection: sel,
      dateSet,
      epochRanges,
      stateMachine: new CombatLogStateMachine(true),
    };
  });

  const allRelevantDates = new Set<string>();
  for (const ctx of contexts) {
    for (const d of ctx.dateSet) allRelevantDates.add(d);
  }

  let lineCount = 0;
  const lastTimestamps = new Array<number>(contexts.length).fill(0);
  const firstTimestamps = new Array<number>(contexts.length).fill(0);

  const onProgress = options?.onProgress;
  const PROGRESS_BYTE_INTERVAL = 1024 * 1024;
  const PROGRESS_LINE_INTERVAL = 5000;

  const { reader, getBytesRead } = await buildPipeline(stream, options?.maxBytes);
  let lastProgressBytes = 0;

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
          const currentBytes = getBytesRead();
          if (currentBytes - lastProgressBytes >= PROGRESS_BYTE_INTERVAL) {
            onProgress(currentBytes);
            lastProgressBytes = currentBytes;
          }
        }
        continue;
      }
    }

    const event = parseLine(line, year);
    if (event === null) continue;

    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];
      if (!ctx.dateSet.has(event.date)) continue;

      const inRange = ctx.epochRanges.some(
        (r) => event.timestamp >= r.start && event.timestamp <= r.end,
      );
      if (!inRange) continue;

      ctx.stateMachine.processEvent(event);
      lastTimestamps[i] = event.timestamp;
      if (firstTimestamps[i] === 0) firstTimestamps[i] = event.timestamp;

      // Check if an encounter just completed
      const completed = ctx.stateMachine.popCompletedEncounter();
      if (completed !== null && completed.encounter.duration >= MIN_ENCOUNTER_DURATION_S) {
        // Build encounter player list from participants
        const playerMap = ctx.stateMachine.getDetectedPlayers();
        const players: EncounterPlayer[] = [];
        for (const guid of completed.participants) {
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
        players.sort((a, b) => a.name.localeCompare(b.name));

        yield {
          ...completed.encounter,
          players,
        };
      }
    }

    lineCount++;
    if (onProgress) {
      const currentBytes = getBytesRead();
      if (
        currentBytes - lastProgressBytes >= PROGRESS_BYTE_INTERVAL ||
        lineCount % PROGRESS_LINE_INTERVAL === 0
      ) {
        onProgress(currentBytes);
        lastProgressBytes = currentBytes;
      }
    }
  }

  // Finalize — force-end any in-progress encounters
  for (let i = 0; i < contexts.length; i++) {
    contexts[i].stateMachine.finalize(lastTimestamps[i]);
    const completed = contexts[i].stateMachine.popCompletedEncounter();
    if (completed !== null && completed.encounter.duration >= MIN_ENCOUNTER_DURATION_S) {
      const playerMap = contexts[i].stateMachine.getDetectedPlayers();
      const players: EncounterPlayer[] = [];
      for (const guid of completed.participants) {
        const record = playerMap.get(guid);
        if (record) {
          players.push({ guid: record.guid, name: record.name, class: record.class, spec: record.spec });
        }
      }
      players.sort((a, b) => a.name.localeCompare(b.name));
      yield { ...completed.encounter, players };
    }
  }

  // Build summary — this is returned as the generator's return value.
  // For now, build from the first context (most common case: single selection).
  // Multi-selection returns the first raid's summary.
  const ctx = contexts[0];
  const raidStartMs = firstTimestamps[0];
  const raidEndMs = lastTimestamps[0];

  const segments = ctx.stateMachine.getRaidSegments();
  let raidInstance: string | null = null;
  for (const seg of segments) {
    if (seg.raidInstance !== null) { raidInstance = seg.raidInstance; break; }
  }

  const firstDate = ctx.selection.dates?.[0] ?? "";
  const slashIdx = firstDate.indexOf("/");
  const month = slashIdx > 0 ? parseInt(firstDate.substring(0, slashIdx), 10) : 1;
  const day = slashIdx > 0 ? parseInt(firstDate.substring(slashIdx + 1), 10) : 1;
  const raidDate = new Date(year, month - 1, day);

  // Build raid-wide player aggregates (same logic as parseLog)
  const playerMap = ctx.stateMachine.getDetectedPlayers();
  const encounterParticipants = ctx.stateMachine.getEncounterParticipants();
  const combatSummaries = ctx.stateMachine.getCombatPlayerSummaries();
  const buffUptimeResults = ctx.stateMachine.getBuffUptimeResults(raidStartMs, raidEndMs);
  const deathSummaries = ctx.stateMachine.getDeathSummaries();
  const encounters = ctx.stateMachine.getEncounters();
  const sortedEncounters = encounters.filter(e => e.duration >= MIN_ENCOUNTER_DURATION_S);
  const totalEncounterDurationMs = sortedEncounters.reduce((s, e) => s + e.duration * 1000, 0);
  const externalsSummaries = ctx.stateMachine.getExternalsSummaries(totalEncounterDurationMs);

  // Build per-player consumable summaries
  const playerConsumableSummaries = new Map<string, Record<number, ConsumableSummaryEntry>>();
  for (const enc of encounters) {
    if (enc.consumables === undefined) continue;
    for (const [guid, uses] of Object.entries(enc.consumables)) {
      let summary = playerConsumableSummaries.get(guid);
      if (summary === undefined) { summary = {}; playerConsumableSummaries.set(guid, summary); }
      for (const use of uses) {
        const existing = summary[use.spellId];
        if (existing !== undefined) { existing.totalUses += use.count; if (use.prePot) existing.prePotCount += use.count; }
        else { summary[use.spellId] = { spellName: use.spellName, type: use.type, totalUses: use.count, prePotCount: use.prePot ? use.count : 0 }; }
      }
    }
  }

  // Encounter-aggregate buff uptime
  const playerEncounterBuffUptime = new Map<string, { flaskMs: number; foodMs: number; totalMs: number }>();
  for (const enc of sortedEncounters) {
    if (enc.buffUptime === undefined) continue;
    const encDurationMs = enc.duration * 1000;
    for (const [guid, bu] of Object.entries(enc.buffUptime)) {
      let agg = playerEncounterBuffUptime.get(guid);
      if (agg === undefined) { agg = { flaskMs: 0, foodMs: 0, totalMs: 0 }; playerEncounterBuffUptime.set(guid, agg); }
      agg.flaskMs += (bu.flaskUptimePercent / 100) * encDurationMs;
      agg.foodMs += (bu.foodUptimePercent / 100) * encDurationMs;
      agg.totalMs += encDurationMs;
    }
  }

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
        ? Math.min(100, Math.round((encAgg.flaskMs / encAgg.totalMs) * 100 * 100) / 100) : 0,
      encounterFoodUptimePercent: encAgg !== undefined && encAgg.totalMs > 0
        ? Math.min(100, Math.round((encAgg.foodMs / encAgg.totalMs) * 100 * 100) / 100) : 0,
    } : undefined;
    players.push({
      guid: record.guid, name: record.name, class: record.class, spec: record.spec,
      ...(consumables !== undefined && Object.keys(consumables).length > 0 ? { consumables } : {}),
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
    raidDurationMs: raidEndMs - raidStartMs,
    players,
  };
}
```

**Step 3: Export from index.ts**

Add to `src/index.ts`:
```typescript
export { parseLogStream } from "./stream-parser.js";
export type { ParsedEncounter, ParseStreamSummary, EncounterPlayer } from "./types.js";
```

**Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/stream-parser.ts src/types.ts src/index.ts
git commit -m "feat: add parseLogStream() AsyncGenerator for incremental encounter delivery"
```

---

### Task 6: Rewrite `parseLog()` as wrapper around `parseLogStream()`

**Files:**
- Modify: `src/parser.ts`

**Step 1: Rewrite parseLog**

Replace the entire `parseLog` implementation with a wrapper that collects all yields from `parseLogStream()`:

```typescript
import type {
  ParseOptions,
  ParseResult,
  ParsedRaid,
  RaidSelection,
} from "./types.js";
import { parseLogStream } from "./stream-parser.js";

const MIN_ENCOUNTER_DURATION_S = 10;

export async function parseLog(
  stream: ReadableStream<Uint8Array>,
  raidSelections: RaidSelection[],
  options?: ParseOptions,
): Promise<ParseResult> {
  const encounters = [];
  const gen = parseLogStream(stream, raidSelections, options);

  for (;;) {
    const { done, value } = await gen.next();
    if (done) {
      // done=true means value is the return value (ParseStreamSummary)
      const summary = value;
      const raid: ParsedRaid = {
        raidInstance: summary.raidInstance,
        raidDate: summary.raidDate,
        raidDurationMs: summary.raidDurationMs,
        players: summary.players,
        encounters: encounters.sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        ),
      };
      return { raids: [raid] };
    }
    encounters.push(value);
  }
}
```

Note: The current `parseLog` supports multiple `raidSelections` with separate state machines per selection. The `parseLogStream` implementation above handles the first selection only for the return summary. For backward compatibility with multi-selection, keep the existing multi-selection logic. Actually — looking at the current parser.ts, the multi-selection is important. The wrapper needs to handle this properly.

A simpler approach: for each raidSelection, call `parseLogStream` separately and build a `ParsedRaid` per selection. But that would require reading the file multiple times.

Alternative: keep the existing `parseLog` as-is for multi-selection, and make `parseLogStream` single-selection only (which is the common case for DB persistence). The existing `parseLog` still works for batch processing.

Let me simplify: make `parseLogStream` accept a single `RaidSelection` (not an array), and keep `parseLog` as-is but refactored to use `buildPipeline`.

**Revised Step 1: Simplify parseLog refactor**

Keep `parseLog` mostly as-is but refactor to use `buildPipeline` (which adds gzip + maxBytes). Don't rewrite it as a wrapper — that would break multi-selection support.

In `src/parser.ts`, replace the pipeline assembly section (lines 86-100) with:

```typescript
import { buildPipeline } from "./pipeline/build-pipeline.js";

// Replace the existing pipeline assembly with:
  const { reader, getBytesRead } = await buildPipeline(stream, options?.maxBytes);
```

And update all `bytesRead` references in the progress reporting to use `getBytesRead()`.

Remove the old `byteCounter`, `lineSplitter`, `textStream`, `lineStream` variables and the manual `bytesRead` tracking.

**Step 2: Run full test suite**

Run: `pnpm run test`
Expected: All tests pass.

**Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/parser.ts
git commit -m "refactor: use buildPipeline in parseLog for gzip + maxBytes support"
```

---

### Task 7: Integration tests

**Files:**
- Create: `tests/unit/stream-parser.test.ts`

**Step 1: Write tests**

Create `tests/unit/stream-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseLogStream, scanLog } from "../../dist/index.js";

function fileToStream(path: string): ReadableStream<Uint8Array> {
  const content = readFileSync(path);
  return new ReadableStream({
    start(controller) {
      const chunkSize = 64 * 1024;
      for (let i = 0; i < content.length; i += chunkSize) {
        controller.enqueue(content.subarray(i, i + chunkSize));
      }
      controller.close();
    },
  });
}

function bufferToStream(buf: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const chunkSize = 64 * 1024;
      for (let i = 0; i < buf.length; i += chunkSize) {
        controller.enqueue(buf.subarray(i, i + chunkSize));
      }
      controller.close();
    },
  });
}

const LOG_PATH = join(__dirname, "../example-logs/example-log-7.txt");
const logExists = existsSync(LOG_PATH);

describe.skipIf(!logExists)("parseLogStream integration", () => {
  it("yields encounters incrementally", async () => {
    // First scan to get selections
    const scanResult = await scanLog(fileToStream(LOG_PATH));
    const raid = scanResult.raids[0];

    const encounters = [];
    const gen = parseLogStream(fileToStream(LOG_PATH), [raid]);

    for (;;) {
      const { done, value } = await gen.next();
      if (done) {
        // value is ParseStreamSummary
        expect(value.players.length).toBeGreaterThan(0);
        expect(value.raidDurationMs).toBeGreaterThan(0);
        break;
      }
      encounters.push(value);
      // Each yielded encounter should have data
      expect(value.bossName).toBeTruthy();
      expect(value.duration).toBeGreaterThan(0);
      expect(value.players.length).toBeGreaterThan(0);
    }

    expect(encounters.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!logExists)("gzip support integration", () => {
  it("scanLog handles gzipped input", async () => {
    const raw = readFileSync(LOG_PATH);
    const compressed = gzipSync(raw);

    const result = await scanLog(bufferToStream(compressed));
    expect(result.raids.length).toBeGreaterThan(0);
    expect(result.raids[0].encounters.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Build and run**

Run: `pnpm run build && pnpm run test tests/unit/stream-parser.test.ts`
Expected: All pass (or skip if example logs not present).

**Step 3: Run full test suite**

Run: `pnpm run test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add tests/unit/stream-parser.test.ts
git commit -m "test: add integration tests for parseLogStream and gzip support"
```

---

### Task 8: Update exports and AGENTS.md

**Files:**
- Modify: `src/index.ts`
- Modify: `AGENTS.md`

**Step 1: Ensure all new exports are in index.ts**

Verify `src/index.ts` exports:
- `parseLogStream` from `./stream-parser.js`
- `FileTooLargeError` from `./errors.js`
- Types: `ParsedEncounter`, `ParseStreamSummary`, `EncounterPlayer`

**Step 2: Update AGENTS.md**

Add a new section documenting:
- Gzip support (auto-detection, DecompressionStream)
- maxBytes option (1 GB default, FileTooLargeError)
- `parseLogStream()` API (AsyncGenerator, yields ParsedEncounter, returns ParseStreamSummary)
- File size recommendations

**Step 3: Run build + typecheck + tests**

Run: `pnpm run build && pnpm run typecheck && pnpm run test`
Expected: All pass.

**Step 4: Commit**

```bash
git add src/index.ts AGENTS.md
git commit -m "docs: update exports and AGENTS.md for streaming parse + gzip"
```
