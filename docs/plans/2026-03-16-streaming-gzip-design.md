# Gzip Support, Size Limits, and Streaming Parse API — Design

## Summary

Three features that enable parsing arbitrarily large combat logs with bounded memory:
1. Auto-detect gzip and decompress on the fly (zero dependencies)
2. Enforce 1 GB decompressed size limit
3. New `parseLogStream()` AsyncGenerator that yields encounters incrementally for DB persistence

## Context

- WoW combat logs compress 12-13x with gzip (591 MB → 48 MB)
- scanLog runs client-side (browser Web Worker), parseLog runs server-side (Node.js)
- Current `parseLog()` accumulates all encounters in memory before returning
- Consumer app (wow-core) wants to save encounters to DB as they're parsed

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Compression format | gzip only (.gz) | Only format supporting streaming decompression. Browser-native DecompressionStream. Zero deps. |
| Detection | Auto-detect gzip magic bytes | Library handles compression internally. Consumer doesn't need to change anything. |
| Size limit | 1 GB decompressed | Covers all realistic logs. With 12-13x compression, a 100 MB upload = ~1.2 GB decompressed. |
| Streaming API | AsyncGenerator (`parseLogStream`) | Yields `ParsedEncounter` per boss encounter. Consumer iterates with `for await`. |
| Persistence granularity | Per encounter | Natural DB unit. State machine already has encounter end hooks. |
| Existing API | Unchanged | `parseLog()` stays as-is, implemented on top of `parseLogStream()`. |

## Part 1: Gzip auto-detection

### Pipeline change

```
ReadableStream<Uint8Array>
  → maybeDecompress() — peek first 2 bytes, if 0x1f 0x8b pipe through DecompressionStream
  → byteCounter (counts decompressed bytes, enforces maxBytes)
  → TextDecoderStream → LineSplitter → parseLine
```

### `maybeDecompress(stream)` utility

New file `src/pipeline/decompress.ts`. Reads the first chunk, checks for gzip magic bytes (`0x1f`, `0x8b`), then either:
- Creates a new stream that re-enqueues the first chunk + pipes the rest through `DecompressionStream('gzip')`
- Or passes through the original stream unchanged

Uses only the web-standard `DecompressionStream` API — available in browsers, Node 18+, Deno, Bun. Zero runtime dependencies.

Applied to both `scanLog` and `parseLog` pipelines. The consumer never needs to know if the file is compressed.

## Part 2: Decompressed size limit

### Options change

```typescript
interface ScanOptions {
  maxBytes?: number;       // default: 1_073_741_824 (1 GB)
  onProgress?: (bytesRead: number) => void;
}

interface ParseOptions {
  maxBytes?: number;       // default: 1_073_741_824 (1 GB)
  onProgress?: (bytesRead: number) => void;
}
```

### Enforcement

The existing `byteCounter` TransformStream checks `bytesRead > maxBytes` after each chunk. If exceeded, it cancels the reader and throws `FileTooLargeError` with the decompressed byte count.

```typescript
class FileTooLargeError extends Error {
  bytesRead: number;
  maxBytes: number;
}
```

Exported from the library for consumers to catch.

## Part 3: Streaming parse API

### New function

```typescript
async function* parseLogStream(
  stream: ReadableStream<Uint8Array>,
  raidSelections: RaidSelection[],
  options?: ParseOptions,
): AsyncGenerator<ParsedEncounter, ParseStreamSummary>
```

### Yielded per encounter

```typescript
interface ParsedEncounter {
  bossName: string;
  startTime: string;
  endTime: string;
  duration: number;
  result: "kill" | "wipe";
  difficulty: string | null;
  combatStats: Record<string, PlayerCombatStats>;
  consumables?: Record<string, ConsumableUse[]>;
  deaths?: PlayerDeath[];
  buffUptime?: Record<string, EncounterBuffUptime>;
  externals?: Record<string, ExternalBuffUse[]>;
  players: EncounterPlayer[];
}
```

### Returned at end (generator return value)

```typescript
interface ParseStreamSummary {
  raidInstance: string | null;
  raidDate: Date;
  raidDurationMs: number;
  players: PlayerInfo[];
}
```

### Implementation approach

The state machine already fires encounter-end callbacks. Currently `parseLog()` collects all encounter summaries into an array and returns them at the end. `parseLogStream()` instead `yield`s each encounter summary as it's produced.

The main loop becomes:

```typescript
// Inside parseLogStream():
for (;;) {
  const { done, value: line } = await reader.read();
  if (done) break;
  // ... date fast-reject, parseLine, etc. ...
  
  for (const ctx of contexts) {
    ctx.stateMachine.processEvent(event);
    
    // Check if any encounter just ended
    const completed = ctx.stateMachine.popCompletedEncounter();
    if (completed !== null && completed.duration >= MIN_ENCOUNTER_DURATION_S) {
      yield completed;  // Consumer can save to DB here
    }
  }
}

// After stream ends: compute and return raid-level summary
return buildSummary(contexts);
```

The key change to the state machine: add `popCompletedEncounter()` that returns and clears the most recently completed encounter, instead of accumulating them all.

### Existing `parseLog()` becomes a wrapper

```typescript
async function parseLog(stream, selections, options): Promise<ParseResult> {
  const encounters = [];
  const gen = parseLogStream(stream, selections, options);
  for await (const encounter of gen) {
    encounters.push(encounter);
  }
  const summary = gen.return();
  return { raids: [{ ...summary, encounters }] };
}
```

### Consumer usage (wow-core)

```typescript
import { parseLogStream } from "@munigan/wow-combatlog-parser";

const stream = parseLogStream(file.stream(), selections);

for await (const encounter of stream) {
  await db.encounters.create({
    data: {
      logId,
      bossName: encounter.bossName,
      duration: encounter.duration,
      result: encounter.result,
      combatStats: encounter.combatStats,
      deaths: encounter.deaths,
    },
  });
}
```

Memory stays bounded: each encounter's data is yielded, saved, and GC'd. Only ongoing tracker state persists (~50 MB peak for raid-wide buff uptime, player detection, etc.).

## File size recommendations for consumer app

| Limit | Value | Where |
|-------|-------|-------|
| Upload size (compressed) | 100 MB | Server middleware (nginx/Next.js body-parser) |
| Decompressed size | 1 GB | Parser library (`maxBytes` option) |
| Accepted extensions | `.txt`, `.txt.gz` | Consumer app validation |
