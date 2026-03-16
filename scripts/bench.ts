import { scanLog, parseLog } from "../dist/index.js";
import { readFileSync, statSync } from "node:fs";
import { PerformanceObserver } from "node:perf_hooks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let u = -1;
  let b = Math.abs(bytes);
  while (b >= 1024 && u < units.length - 1) {
    b /= 1024;
    u++;
  }
  const sign = bytes < 0 ? "-" : "";
  return `${sign}${b.toFixed(1)} ${units[u]}`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(3)} s`;
}

interface GcStats {
  count: number;
  totalPauseMs: number;
  maxPauseMs: number;
}

function observeGc(): { stop: () => GcStats } {
  let count = 0;
  let totalPauseMs = 0;
  let maxPauseMs = 0;

  const obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      count++;
      totalPauseMs += entry.duration;
      if (entry.duration > maxPauseMs) maxPauseMs = entry.duration;
    }
  });

  try {
    obs.observe({ entryTypes: ["gc"] });
  } catch {
    // --expose-gc may not be set; GC observation will be empty
  }

  return {
    stop() {
      obs.disconnect();
      return { count, totalPauseMs, maxPauseMs };
    },
  };
}

interface PhaseResult {
  wallMs: number;
  heapBefore: number;
  heapAfter: number;
  heapDelta: number;
  rssPeak: number;
  gc: GcStats;
}

function printPhase(label: string, r: PhaseResult) {
  console.log(`\n--- ${label} ---`);
  console.log(`  Wall time:      ${formatMs(r.wallMs)}`);
  console.log(`  Heap before:    ${formatBytes(r.heapBefore)}`);
  console.log(`  Heap after:     ${formatBytes(r.heapAfter)}`);
  console.log(`  Heap delta:     ${formatBytes(r.heapDelta)}`);
  console.log(`  RSS peak:       ${formatBytes(r.rssPeak)}`);
  console.log(`  GC count:       ${r.gc.count}`);
  console.log(`  GC total pause: ${formatMs(r.gc.totalPauseMs)}`);
  console.log(`  GC max pause:   ${formatMs(r.gc.maxPauseMs)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: pnpm run bench <path-to-log-file>");
    process.exit(1);
  }

  const fileSize = statSync(filePath).size;
  console.log(`File: ${filePath}`);
  console.log(`Size: ${formatBytes(fileSize)}`);

  // ---- Phase 1: scanLog ----
  globalThis.gc?.();
  const heapBeforeScan = process.memoryUsage().heapUsed;
  let rssPeakScan = process.memoryUsage().rss;

  const gcObsScan = observeGc();
  const scanStart = performance.now();

  const scanStream = fileToStream(filePath);
  const scanResult = await scanLog(scanStream);

  const scanEnd = performance.now();
  const gcScan = gcObsScan.stop();

  const memAfterScan = process.memoryUsage();
  rssPeakScan = Math.max(rssPeakScan, memAfterScan.rss);

  const scanPhase: PhaseResult = {
    wallMs: scanEnd - scanStart,
    heapBefore: heapBeforeScan,
    heapAfter: memAfterScan.heapUsed,
    heapDelta: memAfterScan.heapUsed - heapBeforeScan,
    rssPeak: rssPeakScan,
    gc: gcScan,
  };

  console.log(`\nScan found ${scanResult.raids.length} raid(s)`);
  for (const raid of scanResult.raids) {
    console.log(
      `  ${raid.raidInstance ?? "Unknown"} — ${raid.encounters.length} encounters, ${raid.playerCount} players`,
    );
  }
  printPhase("scanLog", scanPhase);

  // ---- Phase 2: parseLog (all raids) ----
  const raidSelections = scanResult.raids.map((raid) => ({
    dates: raid.dates,
    startTime: raid.startTime,
    endTime: raid.endTime,
    timeRanges: raid.timeRanges,
  }));

  if (raidSelections.length === 0) {
    console.log("\nNo raids to parse — skipping parseLog phase.");
    return;
  }

  globalThis.gc?.();
  const heapBeforeParse = process.memoryUsage().heapUsed;
  let rssPeakParse = process.memoryUsage().rss;

  const gcObsParse = observeGc();
  const parseStart = performance.now();

  const parseStream = fileToStream(filePath);
  const parseResult = await parseLog(parseStream, raidSelections);

  const parseEnd = performance.now();
  const gcParse = gcObsParse.stop();

  const memAfterParse = process.memoryUsage();
  rssPeakParse = Math.max(rssPeakParse, memAfterParse.rss);

  const parsePhase: PhaseResult = {
    wallMs: parseEnd - parseStart,
    heapBefore: heapBeforeParse,
    heapAfter: memAfterParse.heapUsed,
    heapDelta: memAfterParse.heapUsed - heapBeforeParse,
    rssPeak: rssPeakParse,
    gc: gcParse,
  };

  console.log(`\nParse produced ${parseResult.raids.length} raid(s)`);
  for (const raid of parseResult.raids) {
    console.log(
      `  ${raid.raidInstance ?? "Unknown"} — ${raid.encounters.length} encounters, ${raid.players.length} players`,
    );
  }
  printPhase("parseLog", parsePhase);

  // ---- Summary ----
  const totalMs = scanPhase.wallMs + parsePhase.wallMs;
  const throughput = fileSize / (totalMs / 1000);
  console.log(`\n=== Summary ===`);
  console.log(`  Total wall time: ${formatMs(totalMs)}`);
  console.log(`  Throughput:      ${formatBytes(throughput)}/s`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
