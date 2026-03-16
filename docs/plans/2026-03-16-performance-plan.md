# Performance Optimizations + Benchmarking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add memory/GC profiling tooling and reduce per-line allocation pressure in the parsing pipeline by ~40-80%.

**Architecture:** Benchmarks first (establish baseline), then two optimizations (fast-path rawFields extraction + date fast-reject in parseLog), then re-benchmark. All changes are internal — no public API changes.

**Tech Stack:** TypeScript, vitest (bench mode), Node.js `process.memoryUsage()` + `PerformanceObserver`

---

### Task 1: Create benchmark script (`scripts/bench.ts`)

**Files:**
- Create: `scripts/bench.ts`

**Step 1: Create the benchmark script**

Create `scripts/bench.ts`:

```typescript
import { scanLog, parseLog } from "../dist/index.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PerformanceObserver, performance } from "node:perf_hooks";

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

interface GcStats {
  count: number;
  totalPauseMs: number;
  maxPauseMs: number;
}

function observeGc(): { stats: GcStats; stop: () => void } {
  const stats: GcStats = { count: 0, totalPauseMs: 0, maxPauseMs: 0 };
  const obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      stats.count++;
      stats.totalPauseMs += entry.duration;
      if (entry.duration > stats.maxPauseMs) stats.maxPauseMs = entry.duration;
    }
  });
  obs.observe({ entryTypes: ["gc"] });
  return { stats, stop: () => obs.disconnect() };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function benchScan(filePath: string) {
  const gc = globalThis.gc;
  if (gc) gc();

  const memBefore = process.memoryUsage();
  const { stats: gcStats, stop } = observeGc();

  const start = performance.now();
  const result = await scanLog(fileToStream(filePath));
  const elapsed = performance.now() - start;

  stop();
  const memAfter = process.memoryUsage();

  const fileSize = readFileSync(filePath).byteLength;
  const mbPerSec = (fileSize / (1024 * 1024)) / (elapsed / 1000);

  return {
    phase: "scanLog",
    elapsed: Math.round(elapsed),
    fileSizeMB: (fileSize / (1024 * 1024)).toFixed(1),
    mbPerSec: mbPerSec.toFixed(1),
    raids: result.raids.length,
    encounters: result.raids.reduce((s, r) => s + r.encounters.length, 0),
    memory: {
      heapBefore: formatBytes(memBefore.heapUsed),
      heapAfter: formatBytes(memAfter.heapUsed),
      heapDelta: formatBytes(memAfter.heapUsed - memBefore.heapUsed),
      rssPeak: formatBytes(memAfter.rss),
      external: formatBytes(memAfter.external),
    },
    gc: {
      count: gcStats.count,
      totalPauseMs: Math.round(gcStats.totalPauseMs),
      maxPauseMs: Math.round(gcStats.maxPauseMs * 100) / 100,
    },
    scanResult: result,
  };
}

async function benchParse(filePath: string, scanResult: Awaited<ReturnType<typeof scanLog>>) {
  const gc = globalThis.gc;
  if (gc) gc();

  // Select all raids
  const selections = scanResult.raids.map((r) => ({
    instance: r.instance,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    dates: r.dates,
    timeRanges: r.timeRanges,
  }));

  const memBefore = process.memoryUsage();
  const { stats: gcStats, stop } = observeGc();

  const start = performance.now();
  const result = await parseLog(fileToStream(filePath), selections);
  const elapsed = performance.now() - start;

  stop();
  const memAfter = process.memoryUsage();

  const fileSize = readFileSync(filePath).byteLength;
  const mbPerSec = (fileSize / (1024 * 1024)) / (elapsed / 1000);

  return {
    phase: "parseLog",
    elapsed: Math.round(elapsed),
    fileSizeMB: (fileSize / (1024 * 1024)).toFixed(1),
    mbPerSec: mbPerSec.toFixed(1),
    memory: {
      heapBefore: formatBytes(memBefore.heapUsed),
      heapAfter: formatBytes(memAfter.heapUsed),
      heapDelta: formatBytes(memAfter.heapUsed - memBefore.heapUsed),
      rssPeak: formatBytes(memAfter.rss),
      external: formatBytes(memAfter.external),
    },
    gc: {
      count: gcStats.count,
      totalPauseMs: Math.round(gcStats.totalPauseMs),
      maxPauseMs: Math.round(gcStats.maxPauseMs * 100) / 100,
    },
  };
}

async function main() {
  const logFile = process.argv[2];
  if (!logFile) {
    console.error("Usage: pnpm run bench <log-file>");
    console.error("Example: pnpm run bench tests/example-logs/example-log-6.txt");
    process.exit(1);
  }

  const filePath = join(process.cwd(), logFile);
  console.log(`\nBenchmarking: ${logFile}`);
  console.log(`File size: ${formatBytes(readFileSync(filePath).byteLength)}\n`);

  console.log("--- scanLog ---");
  const scanBench = await benchScan(filePath);
  console.log(`  Time:     ${scanBench.elapsed}ms (${scanBench.mbPerSec} MB/s)`);
  console.log(`  Raids:    ${scanBench.raids}, Encounters: ${scanBench.encounters}`);
  console.log(`  Heap:     ${scanBench.memory.heapBefore} → ${scanBench.memory.heapAfter} (Δ${scanBench.memory.heapDelta})`);
  console.log(`  RSS peak: ${scanBench.memory.rssPeak}`);
  console.log(`  GC:       ${scanBench.gc.count} collections, ${scanBench.gc.totalPauseMs}ms total, ${scanBench.gc.maxPauseMs}ms max\n`);

  console.log("--- parseLog ---");
  const parseBench = await benchParse(filePath, scanBench.scanResult);
  console.log(`  Time:     ${parseBench.elapsed}ms (${parseBench.mbPerSec} MB/s)`);
  console.log(`  Heap:     ${parseBench.memory.heapBefore} → ${parseBench.memory.heapAfter} (Δ${parseBench.memory.heapDelta})`);
  console.log(`  RSS peak: ${parseBench.memory.rssPeak}`);
  console.log(`  GC:       ${parseBench.gc.count} collections, ${parseBench.gc.totalPauseMs}ms total, ${parseBench.gc.maxPauseMs}ms max\n`);
}

main().catch(console.error);
```

**Step 2: Add bench script to package.json**

Add to the `scripts` section of `package.json`:

```json
"bench": "node --expose-gc --import tsx scripts/bench.ts"
```

**Step 3: Build and run the benchmark**

Run: `pnpm run build && pnpm run bench tests/example-logs/example-log-3.txt`

Expected: Output showing scan/parse times, heap usage, and GC stats. This is our baseline.

If time permits, also run against the largest log:
Run: `pnpm run bench tests/example-logs/example-log-6.txt`

**Step 4: Commit**

```bash
git add scripts/bench.ts package.json
git commit -m "feat: add memory/GC benchmark script"
```

---

### Task 2: Create vitest micro-benchmarks

**Files:**
- Create: `tests/bench/parse-line.bench.ts`

**Step 1: Create the benchmark file**

Create `tests/bench/parse-line.bench.ts`:

```typescript
import { bench, describe } from "vitest";
import { parseLine } from "../../src/pipeline/line-parser.js";
import { parseFields } from "../../src/utils/fields.js";

const SPELL_DAMAGE_LINE =
  '3/12 20:15:42.123  SPELL_DAMAGE,0x0E000000000A3A18,"Egaroto",0x514,0xF13000393F000001,"Instructor Razuvious",0xa48,49909,"Icy Touch",0x10,5000,200,0x10,0,0,0,nil,nil,nil';

const SWING_DAMAGE_LINE =
  '2/22 15:18:06.300  SWING_DAMAGE,0xF130007E61000002,"Archavon Warder",0xa48,0x0E0000000018667D,"Stranglol",0x512,13337,0,1,0,0,0,nil,nil,nil';

const AURA_APPLIED_LINE =
  '3/12 20:14:41.000  SPELL_AURA_APPLIED,0x0E000000000A3A18,"Egaroto",0x514,0x0E000000000A3A18,"Egaroto",0x514,53908,"Potion of Speed",0x1,BUFF';

const EVENT_DATA =
  'SPELL_DAMAGE,0x0E000000000A3A18,"Egaroto",0x514,0xF13000393F000001,"Instructor Razuvious",0xa48,49909,"Icy Touch",0x10,5000,200,0x10,0,0,0,nil,nil,nil';

describe("parseLine", () => {
  bench("SPELL_DAMAGE", () => {
    parseLine(SPELL_DAMAGE_LINE, 2026);
  });

  bench("SWING_DAMAGE", () => {
    parseLine(SWING_DAMAGE_LINE, 2026);
  });

  bench("SPELL_AURA_APPLIED", () => {
    parseLine(AURA_APPLIED_LINE, 2026);
  });
});

describe("parseFields", () => {
  bench("full field split (15 fields)", () => {
    parseFields(EVENT_DATA);
  });
});
```

**Step 2: Add bench:micro script to package.json**

Add to `scripts` in `package.json`:

```json
"bench:micro": "vitest bench"
```

**Step 3: Update vitest.config.ts to include bench files**

The default vitest config already includes `tests/**/*.test.ts` for tests. Vitest bench files use `.bench.ts` extension and are picked up automatically by `vitest bench`. No config change needed — vitest looks for `**/*.bench.ts` by default.

**Step 4: Run the benchmarks**

Run: `pnpm run bench:micro`

Expected: Output showing ops/sec for each benchmark. This is our per-function baseline.

**Step 5: Commit**

```bash
git add tests/bench/parse-line.bench.ts package.json
git commit -m "feat: add vitest micro-benchmarks for hot-path functions"
```

---

### Task 3: Implement `parseFieldsPartial` (fast-path rawFields)

**Files:**
- Modify: `src/utils/fields.ts`
- Test: `tests/unit/fields.test.ts`

**Step 1: Write failing tests for parseFieldsPartial**

Add to `tests/unit/fields.test.ts`:

```typescript
import { parseFields, parseFieldsPartial, stripQuotes } from "../../src/utils/fields.js";

// ... existing tests ...

describe("parseFieldsPartial", () => {
  it("returns first N fields and the rest as a string", () => {
    const input = 'SPELL_DAMAGE,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2';
    const result = parseFieldsPartial(input, 7);
    expect(result.fields).toHaveLength(7);
    expect(result.fields[0]).toBe("SPELL_DAMAGE");
    expect(result.fields[1]).toBe("0x0E000000000A3A18");
    expect(result.fields[2]).toBe("Pattz");
    expect(result.fields[6]).toBe("0x514");
    expect(result.rest).toBe('48782,"Holy Light",0x2');
  });

  it("returns empty rest when exactly N fields exist", () => {
    const input = 'UNIT_DIED,0x0000000000000000,nil,0x80000000,0xF130003F6C0003DE,"Eye Stalk",0xa48';
    const result = parseFieldsPartial(input, 7);
    expect(result.fields).toHaveLength(7);
    expect(result.rest).toBe("");
  });

  it("returns empty rest when fewer than N fields exist", () => {
    const input = "A,B,C";
    const result = parseFieldsPartial(input, 7);
    expect(result.fields).toHaveLength(3);
    expect(result.rest).toBe("");
  });

  it("handles quoted fields with commas", () => {
    const input = 'SPELL_HEAL,0x0E000000000A3A18,"Player, the Great",0x514,0x0E000000000A3A18,"Target",0x514,48782,"Holy Light",0x2';
    const result = parseFieldsPartial(input, 7);
    expect(result.fields[2]).toBe("Player, the Great");
    expect(result.fields).toHaveLength(7);
    expect(result.rest).toBe('48782,"Holy Light",0x2');
  });

  it("produces same first 7 fields as parseFields", () => {
    const input = 'SPELL_DAMAGE,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2,5000,200,0x10';
    const fullFields = parseFields(input);
    const partial = parseFieldsPartial(input, 7);
    for (let i = 0; i < 7; i++) {
      expect(partial.fields[i]).toBe(fullFields[i]);
    }
    // rest should equal the remaining fields joined
    expect(partial.rest).toBe(fullFields.slice(7).join(","));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test tests/unit/fields.test.ts`
Expected: FAIL — `parseFieldsPartial` is not exported.

**Step 3: Implement parseFieldsPartial**

Add to `src/utils/fields.ts` after the existing `parseFields` function:

```typescript
/**
 * Parse the first `stopAt` comma-separated fields, respecting quotes.
 * Returns { fields, rest } where rest is the unparsed remainder after the
 * stopAt-th field separator. Avoids allocating intermediate strings for
 * fields beyond stopAt.
 */
export function parseFieldsPartial(
  input: string,
  stopAt: number,
): { fields: string[]; rest: string } {
  const fields: string[] = [];
  const len = input.length;
  let i = 0;

  while (i <= len && fields.length < stopAt) {
    if (i === len) {
      fields.push("");
      break;
    }

    if (input.charCodeAt(i) === 34) { // '"'
      const closeQuote = input.indexOf('"', i + 1);
      if (closeQuote === -1) {
        fields.push(input.substring(i + 1));
        i = len;
        break;
      }
      fields.push(input.substring(i + 1, closeQuote));
      i = closeQuote + 2; // skip closing quote + comma
    } else {
      const comma = input.indexOf(",", i);
      if (comma === -1) {
        fields.push(input.substring(i));
        i = len;
        break;
      }
      fields.push(input.substring(i, comma));
      i = comma + 1;
    }
  }

  // Everything from position i onwards is the unparsed rest
  const rest = i < len ? input.substring(i) : "";
  return { fields, rest };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm run test tests/unit/fields.test.ts`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/utils/fields.ts tests/unit/fields.test.ts
git commit -m "feat: add parseFieldsPartial for fast rawFields extraction"
```

---

### Task 4: Wire parseFieldsPartial into parseLine

**Files:**
- Modify: `src/pipeline/line-parser.ts:62-76`
- Test: `tests/unit/line-parser.test.ts`

**Step 1: Write a regression test**

Add to `tests/unit/line-parser.test.ts` to ensure rawFields behavior is preserved:

```typescript
  it("rawFields matches full parseFields output for SPELL_DAMAGE", () => {
    const raw =
      '3/12 20:15:42.123  SPELL_DAMAGE,0x0E000000000A3A18,"Egaroto",0x514,0xF13000393F000001,"Instructor Razuvious",0xa48,49909,"Icy Touch",0x10,5000,200,0x10,0,0,0,nil,nil,nil';
    const event = parseLine(raw, 2026);
    expect(event).not.toBeNull();
    expect(event!.rawFields).toBe('49909,"Icy Touch",0x10,5000,200,0x10,0,0,0,nil,nil,nil');
  });

  it("rawFields is empty for UNIT_DIED with exactly 7 fields", () => {
    const raw =
      '2/24 20:07:05.669  UNIT_DIED,0x0000000000000000,nil,0x80000000,0xF130003F6C0003DE,"Eye Stalk",0xa48';
    const event = parseLine(raw, 2026);
    expect(event).not.toBeNull();
    expect(event!.rawFields).toBe("");
  });
```

**Step 2: Run tests — they should pass (regression baseline)**

Run: `pnpm run test tests/unit/line-parser.test.ts`
Expected: PASS (these test existing behavior).

**Step 3: Switch parseLine to use parseFieldsPartial**

In `src/pipeline/line-parser.ts`, replace lines 3, 62-76:

Change the import (line 3):
```typescript
import { parseFieldsPartial } from "../utils/fields.js";
```

Replace the field parsing block (lines 62-76):
```typescript
  // Parse only the first 7 fields, get the rest as rawFields directly
  const { fields, rest: rawFields } = parseFieldsPartial(eventData, 7);

  // We need at least 7 fields: eventType, srcGUID, srcName, srcFlags, dstGUID, dstName, dstFlags
  if (fields.length < 7) return null;

  const eventType = fields[0];
  const sourceGuid = fields[1];
  const sourceName = fields[2];
  const sourceFlags = fields[3];
  const destGuid = fields[4];
  const destName = fields[5];
  const destFlags = fields[6];
```

This replaces `parseFields(eventData)` + `fields.slice(7).join(",")` with a single `parseFieldsPartial(eventData, 7)` call. The `rest` output IS the rawFields, no re-joining needed.

**Step 4: Run ALL tests (not just line-parser)**

Run: `pnpm run test`
Expected: All tests pass. This is critical — rawFields is consumed by every tracker.

**Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors.

**Step 6: Commit**

```bash
git add src/pipeline/line-parser.ts tests/unit/line-parser.test.ts
git commit -m "perf: use parseFieldsPartial to avoid re-joining rawFields"
```

---

### Task 5: Add date fast-reject to parseLog

**Files:**
- Modify: `src/parser.ts:102-118`

**Step 1: Add date fast-reject before parseLine**

In `src/parser.ts`, replace lines 102-118 (the main loop start):

```typescript
  for (;;) {
    const { done, value: line } = await reader.read();
    if (done) break;

    // Fast date rejection: extract date from raw line before full parse.
    // WotLK format: "M/D HH:MM:SS.mmm  EVENT..."
    // The date is everything before the first space.
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx > 0) {
      const dateStr = line.substring(0, spaceIdx);
      if (!allRelevantDates.has(dateStr)) {
        lineCount++;
        if (onProgress && lineCount % PROGRESS_LINE_INTERVAL === 0) {
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

    // The existing date check (line 110) is now redundant for non-matching dates,
    // but we keep it for the per-selection date check below.
    // Fast rejection already handled the allRelevantDates check above.
```

Remove the now-redundant `allRelevantDates` check on lines 110-119 since we check before `parseLine`:

```typescript
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
```

**Step 2: Run full test suite**

Run: `pnpm run test`
Expected: All tests pass. The parser tests use example logs and verify parse output — they confirm date filtering still works.

**Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/parser.ts
git commit -m "perf: fast-reject non-matching dates before parseLine in parseLog"
```

---

### Task 6: Add parseFieldsPartial to micro-benchmarks

**Files:**
- Modify: `tests/bench/parse-line.bench.ts`

**Step 1: Add parseFieldsPartial benchmark**

Add to `tests/bench/parse-line.bench.ts`:

```typescript
import { parseFields, parseFieldsPartial } from "../../src/utils/fields.js";

// ... existing benchmarks ...

describe("parseFields vs parseFieldsPartial", () => {
  const eventData =
    'SPELL_DAMAGE,0x0E000000000A3A18,"Egaroto",0x514,0xF13000393F000001,"Instructor Razuvious",0xa48,49909,"Icy Touch",0x10,5000,200,0x10,0,0,0,nil,nil,nil';

  bench("parseFields (all fields)", () => {
    parseFields(eventData);
  });

  bench("parseFieldsPartial (first 7 + rest)", () => {
    parseFieldsPartial(eventData, 7);
  });
});
```

**Step 2: Run micro-benchmarks**

Run: `pnpm run bench:micro`
Expected: `parseFieldsPartial` should be faster than `parseFields` because it creates fewer intermediate strings.

**Step 3: Commit**

```bash
git add tests/bench/parse-line.bench.ts
git commit -m "bench: add parseFieldsPartial comparison to micro-benchmarks"
```

---

### Task 7: Re-benchmark and update AGENTS.md

**Step 1: Rebuild**

Run: `pnpm run build`

**Step 2: Run full benchmark**

Run: `pnpm run bench tests/example-logs/example-log-3.txt`
Compare with baseline from Task 1. Expect:
- Lower GC count and total pause time
- Similar or better throughput (MB/s)

If example-log-6.txt is available:
Run: `pnpm run bench tests/example-logs/example-log-6.txt`

**Step 3: Run micro-benchmarks**

Run: `pnpm run bench:micro`
Compare parseLine throughput with baseline from Task 2.

**Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with benchmarking info"
```
