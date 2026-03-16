# Performance Optimizations + Benchmarking — Design

## Summary

Reduce per-line allocation pressure in the parsing pipeline and add benchmarking tooling to measure memory/GC behavior on large (1 GB) combat log files.

## Context

- `scanLog` runs **client-side in a Web Worker** (browser). GC pauses affect responsiveness.
- `parseLog` runs **server-side** (Node.js) after file upload.
- Target: handle up to 1 GB files safely (~7M lines).
- Current: `parseLine()` creates ~20 short-lived objects per line = ~140M allocations for 1 GB.

## Current bottlenecks (measured by code analysis)

| Problem | Impact | Lines affected |
|---------|--------|---------------|
| `parseFields()` splits all 15 fields, then 7+ are re-joined into `rawFields` | ~8 wasted strings/line | Every line |
| `parseLog` calls full `parseLine()` on all lines, even non-matching dates | ~80% of parse work wasted for single-raid selections | Every line in parseLog |
| No GC/memory visibility | Can't measure improvements | N/A |

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Optimization approach | Fast-path rawFields + date fast-reject | Highest impact-to-effort ratio. ~40-80% allocation reduction. No API changes. |
| Benchmarking | Node.js profiling script + vitest micro-benchmarks | Complete picture (full pipeline + per-function). Zero dependencies. |
| Execution order | Benchmarks first, then optimizations | Establish baseline before measuring improvements. |
| GUID interning | Deferred | Speculative benefit. Benchmark first. |
| Zero-copy rewrite | Rejected | Over-engineering. Destroys readability. |

## Part 1: Fast-path rawFields extraction

### Current path (wasteful)

`parseLine()` calls `parseFields(eventData)` which splits all ~15 fields into an array. Then fields 7+ are re-joined: `fields.slice(7).join(",")`. The 8 intermediate strings for fields 7+ are created and immediately garbage collected.

### New path

Add `parseFieldsPartial(eventData, stopAt)` that stops splitting after `stopAt` fields and returns the rest as a single substring:

```
eventData → parseFieldsPartial(eventData, 7)
          → returns { fields: string[7], rest: string }
          → fields[0..6] for LogEvent, rest = rawFields
```

Implementation: walk through `eventData` counting commas (respecting quotes). When the 7th comma is found, return `eventData.substring(pos)` as `rawFields` directly.

The existing `parseFields()` stays for backward compatibility (used by extractFieldInt/Str). `parseLine()` switches to `parseFieldsPartial()`.

**Impact:** Eliminates ~8 string allocations per line. For 1 GB file: **~56M fewer allocations**.

## Part 2: Date fast-reject in parseLog

Before calling `parseLine()`, extract just the date from the raw line. WotLK timestamps start at position 0 with format `M/D HH:MM:SS.mmm`. Find the first space, take the substring before it, extract the date portion.

```typescript
const spaceIdx = line.indexOf(' ');
const dateStr = line.substring(0, spaceIdx); // "3/12"
if (!allRelevantDates.has(dateStr)) continue;
```

One indexOf + one 4-byte substring vs 20 allocations from full `parseLine()`.

Only in `parseLog`, not `scanLog` (scanLog needs every line).

**Impact:** For single-raid selection from multi-raid log, skips ~80% of `parseLine()` calls. For 1 GB: **~112M fewer allocations**.

## Part 3: Benchmark script

`scripts/bench.ts` — profiles scanLog and parseLog against real log files.

```
$ node --expose-gc --import tsx scripts/bench.ts tests/example-logs/example-log-6.txt
```

Reports per phase (scanLog, parseLog):
- Peak RSS, heap used/total, external (from `process.memoryUsage()`)
- GC count, total pause, max pause (from `PerformanceObserver` entryTypes: ['gc'])
- Wall time, MB/s, lines/s

Output: structured JSON + human-readable table.

New package.json script: `"bench": "node --expose-gc --import tsx scripts/bench.ts"`

## Part 4: Vitest micro-benchmarks

`tests/bench/parse-line.bench.ts` — uses vitest `bench()` for hot-path functions:
- `parseLine()` throughput (ops/sec)
- `parseFields()` vs `parseFieldsPartial()` comparison
- `parseTimestamp()` throughput

New package.json script: `"bench:micro": "vitest bench"`
