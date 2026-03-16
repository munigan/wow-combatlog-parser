import { describe, it, expect } from "vitest";
import { scanLog, parseLog, parseLogStream } from "../../dist/index.js";
import type { ParsedEncounter, ParseStreamSummary } from "../../dist/index.js";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

function fileToStream(content: Buffer | Uint8Array): ReadableStream<Uint8Array> {
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

const LOG_PATH = join(__dirname, "../example-logs/example-log-7.txt");
const logExists = existsSync(LOG_PATH);

describe.skipIf(!logExists)(
  "integration: parseLogStream and gzip support",
  () => {
    it("parseLogStream calls onEncounter for each boss and onComplete with summary", async () => {
      const content = readFileSync(LOG_PATH);

      // Scan first to get raid selections
      const scanStream = fileToStream(content);
      const scanResult = await scanLog(scanStream);
      expect(scanResult.raids.length).toBeGreaterThanOrEqual(1);

      const firstRaid = scanResult.raids[0];
      const selection = {
        dates: firstRaid.dates,
        startTime: firstRaid.startTime,
        endTime: firstRaid.endTime,
        timeRanges: firstRaid.timeRanges,
      };

      // Use parseLogStream with callbacks
      const encounters: ParsedEncounter[] = [];
      let summary: ParseStreamSummary | undefined;

      await parseLogStream(
        fileToStream(content),
        [selection],
        {
          onEncounter: (encounter) => {
            // Each encounter has expected fields
            expect(encounter.bossName).toBeTruthy();
            expect(encounter.duration).toBeGreaterThan(0);
            expect(encounter.players.length).toBeGreaterThan(0);
            encounters.push(encounter);
          },
          onComplete: (s) => {
            summary = s;
          },
        },
      );

      // onComplete was called with raid-wide data
      expect(summary).toBeDefined();
      expect(summary!.players.length).toBeGreaterThan(0);
      expect(summary!.raidDurationMs).toBeGreaterThan(0);

      // Encounters were yielded
      expect(encounters.length).toBeGreaterThan(0);
    }, 60_000);

    it("onEncounter awaits async callbacks (backpressure)", async () => {
      const content = readFileSync(LOG_PATH);

      const scanResult = await scanLog(fileToStream(content));
      const firstRaid = scanResult.raids[0];
      const selection = {
        dates: firstRaid.dates,
        startTime: firstRaid.startTime,
        endTime: firstRaid.endTime,
        timeRanges: firstRaid.timeRanges,
      };

      const order: string[] = [];

      await parseLogStream(
        fileToStream(content),
        [selection],
        {
          onEncounter: async (encounter) => {
            order.push(`start-${encounter.bossName}`);
            // Simulate async DB write
            await new Promise((r) => setTimeout(r, 1));
            order.push(`end-${encounter.bossName}`);
          },
          onComplete: async () => {
            order.push("complete");
          },
        },
      );

      // Verify callbacks were awaited (no interleaving)
      for (let i = 0; i < order.length - 1; i++) {
        if (order[i].startsWith("start-")) {
          const bossName = order[i].substring(6);
          expect(order[i + 1]).toBe(`end-${bossName}`);
        }
      }
      expect(order[order.length - 1]).toBe("complete");
    }, 60_000);

    it("gzip support in scanLog", async () => {
      const raw = readFileSync(LOG_PATH);
      const compressed = gzipSync(raw);

      // Scan the gzip-compressed version
      const gzStream = fileToStream(compressed);
      const gzResult = await scanLog(gzStream);

      expect(gzResult.raids.length).toBeGreaterThanOrEqual(1);
      const allEncounters = gzResult.raids.flatMap((r) => r.encounters);
      expect(allEncounters.length).toBeGreaterThan(0);

      // Compare with raw scan
      const rawStream = fileToStream(raw);
      const rawResult = await scanLog(rawStream);

      expect(gzResult.raids.length).toBe(rawResult.raids.length);
      expect(allEncounters.length).toBe(
        rawResult.raids.flatMap((r) => r.encounters).length,
      );
    }, 60_000);

    it("gzip support in parseLog", async () => {
      const raw = readFileSync(LOG_PATH);
      const compressed = gzipSync(raw);

      // Scan raw to get selections
      const scanStream = fileToStream(raw);
      const scanResult = await scanLog(scanStream);
      const firstRaid = scanResult.raids[0];
      const selection = {
        dates: firstRaid.dates,
        startTime: firstRaid.startTime,
        endTime: firstRaid.endTime,
        timeRanges: firstRaid.timeRanges,
      };

      // Parse the compressed version
      const parseStream = fileToStream(compressed);
      const parseResult = await parseLog(parseStream, [selection]);

      expect(parseResult.raids.length).toBe(1);
      expect(parseResult.raids[0].encounters.length).toBeGreaterThan(0);
      expect(parseResult.raids[0].players.length).toBeGreaterThan(0);
    }, 60_000);

    it("scanLog on raw file still works (regression)", async () => {
      const content = readFileSync(LOG_PATH);
      const stream = fileToStream(content);
      const result = await scanLog(stream);

      expect(result.raids.length).toBeGreaterThanOrEqual(1);
      const allEncounters = result.raids.flatMap((r) => r.encounters);
      expect(allEncounters.length).toBeGreaterThan(0);

      // Every encounter has valid fields
      for (const enc of allEncounters) {
        expect(enc.bossName).toBeTruthy();
        expect(enc.duration).toBeGreaterThanOrEqual(0);
        expect(["kill", "wipe"]).toContain(enc.result);
      }
    }, 30_000);
  },
);
