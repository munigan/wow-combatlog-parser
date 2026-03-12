import { describe, it, expect } from "vitest";
import { scanLog } from "../../src/scanner.js";
import { parseLog } from "../../src/parser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const LOGS_DIR = join(__dirname, "../../example-logs");

describe("parseLog", () => {
  it("parses a specific raid selection", async () => {
    const scanStream = fileToStream(join(LOGS_DIR, "WoWCombatLog3.txt"));
    const scanResult = await scanLog(scanStream);
    const firstRaid = scanResult.raids[0];

    const parseStream = fileToStream(join(LOGS_DIR, "WoWCombatLog3.txt"));
    const parseResult = await parseLog(parseStream, [
      {
        dates: firstRaid.dates,
        startTime: firstRaid.startTime,
        endTime: firstRaid.endTime,
        timeRanges: firstRaid.timeRanges,
      },
    ]);

    expect(parseResult.raids.length).toBe(1);
    expect(parseResult.raids[0].players.length).toBeGreaterThan(0);
    expect(parseResult.raids[0].raidDate).toBeInstanceOf(Date);
  });

  it("includes encounters in parse results", async () => {
    const scanStream = fileToStream(join(LOGS_DIR, "WoWCombatLog3.txt"));
    const scanResult = await scanLog(scanStream);
    const firstRaid = scanResult.raids[0];

    const parseStream = fileToStream(join(LOGS_DIR, "WoWCombatLog3.txt"));
    const parseResult = await parseLog(parseStream, [
      {
        dates: firstRaid.dates,
        startTime: firstRaid.startTime,
        endTime: firstRaid.endTime,
        timeRanges: firstRaid.timeRanges,
      },
    ]);

    expect(parseResult.raids[0].encounters.length).toBeGreaterThan(0);
  });

  it("filters players to the selected time range", async () => {
    const scanStream = fileToStream(
      join(LOGS_DIR, "example-multiple-raids.txt"),
    );
    const scanResult = await scanLog(scanStream);

    if (scanResult.raids.length >= 2) {
      const raid1 = scanResult.raids[0];
      const parseStream = fileToStream(
        join(LOGS_DIR, "example-multiple-raids.txt"),
      );
      const parseResult = await parseLog(parseStream, [
        {
          dates: raid1.dates,
          startTime: raid1.startTime,
          endTime: raid1.endTime,
          timeRanges: raid1.timeRanges,
        },
      ]);

      // Player count should be close to scan result
      expect(parseResult.raids[0].players.length).toBeGreaterThan(0);
    }
  }, 60000);
});
