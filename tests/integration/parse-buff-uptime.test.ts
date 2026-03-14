import { describe, it, expect } from "vitest";
import { scanLog, parseLog } from "../../dist/index.js";
import { existsSync, readFileSync } from "node:fs";
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

const LOG7_PATH = join(import.meta.dirname, "../example-logs/example-log-7.txt");

describe.skipIf(!existsSync(LOG7_PATH))("buff uptime integration", () => {
  it("should populate buffUptime on players and raidDurationMs on raid", async () => {
    // Scan first
    const scanResult = await scanLog(fileToStream(LOG7_PATH));
    expect(scanResult.raids.length).toBeGreaterThan(0);

    const raid = scanResult.raids[0];

    // Parse
    const parseResult = await parseLog(fileToStream(LOG7_PATH), [
      {
        dates: raid.dates,
        startTime: raid.startTime,
        endTime: raid.endTime,
        timeRanges: raid.timeRanges,
      },
    ]);

    expect(parseResult.raids.length).toBeGreaterThan(0);
    const parsedRaid = parseResult.raids[0];

    // raidDurationMs should be positive
    expect(parsedRaid.raidDurationMs).toBeGreaterThan(0);

    // At least some players should have buffUptime data
    const playersWithBuffs = parsedRaid.players.filter((p) => p.buffUptime !== undefined);
    expect(playersWithBuffs.length).toBeGreaterThan(0);

    // Check structure of buffUptime
    for (const player of playersWithBuffs) {
      const bu = player.buffUptime!;
      expect(bu.flaskUptimePercent).toBeGreaterThanOrEqual(0);
      expect(bu.flaskUptimePercent).toBeLessThanOrEqual(100);
      expect(bu.foodUptimePercent).toBeGreaterThanOrEqual(0);
      expect(bu.foodUptimePercent).toBeLessThanOrEqual(100);
      expect(Array.isArray(bu.buffs)).toBe(true);

      for (const buff of bu.buffs) {
        expect(buff.spellId).toBeGreaterThan(0);
        expect(buff.spellName.length).toBeGreaterThan(0);
        expect(["flask", "battle_elixir", "guardian_elixir", "food"]).toContain(buff.category);
        expect(buff.uptimeMs).toBeGreaterThan(0);
        expect(buff.uptimePercent).toBeGreaterThan(0);
        expect(buff.uptimePercent).toBeLessThanOrEqual(100);
      }

      // Buffs should be sorted by uptimeMs descending
      for (let j = 1; j < bu.buffs.length; j++) {
        expect(bu.buffs[j - 1].uptimeMs).toBeGreaterThanOrEqual(bu.buffs[j].uptimeMs);
      }
    }
  });
});
