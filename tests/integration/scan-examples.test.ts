import { describe, it, expect } from "vitest";
import { scanLog, parseLog } from "../../src/index.js";
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

const LOGS_DIR = join(__dirname, "../example-logs");

describe("integration: scan example logs", () => {
  describe("example-log-3 - Vault of Archavon", () => {
    it("detects at least one raid on date 2/22", async () => {
      const stream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
      const result = await scanLog(stream);
      expect(result.raids.length).toBeGreaterThanOrEqual(1);
      // Find a raid containing date 2/22
      const hasDate = result.raids.some(r => r.dates.includes("2/22"));
      expect(hasDate).toBe(true);
    });

    it("detects boss encounters", async () => {
      const stream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
      const result = await scanLog(stream);
      const allEncounters = result.raids.flatMap(r => r.encounters);
      expect(allEncounters.length).toBeGreaterThan(0);
      // Each encounter has required fields
      for (const enc of allEncounters) {
        expect(enc.bossName).toBeTruthy();
        expect(enc.startTime).toBeTruthy();
        expect(enc.endTime).toBeTruthy();
        expect(enc.duration).toBeGreaterThanOrEqual(0);
        expect(["kill", "wipe"]).toContain(enc.result);
      }
    });

    it("detects players with classes", async () => {
      const stream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
      const result = await scanLog(stream);
      const allPlayers = result.raids.flatMap(r => r.players);
      expect(allPlayers.length).toBeGreaterThan(5);
      const withClass = allPlayers.filter(p => p.class !== null);
      expect(withClass.length).toBeGreaterThan(0);
    });
  });

  describe("example-log-1 - Naxxramas raid", () => {
    it("detects Naxxramas as the raid instance", async () => {
      const stream = fileToStream(join(LOGS_DIR, "example-log-1.txt"));
      const result = await scanLog(stream);
      expect(result.raids.length).toBeGreaterThanOrEqual(1);
      const naxxRaid = result.raids.find(r => r.raidInstance === "Naxxramas");
      expect(naxxRaid).toBeDefined();
    }, 30000);

    it("has encounters from Naxxramas bosses", async () => {
      const stream = fileToStream(join(LOGS_DIR, "example-log-1.txt"));
      const result = await scanLog(stream);
      const naxxRaid = result.raids.find(r => r.raidInstance === "Naxxramas");
      if (naxxRaid) {
        expect(naxxRaid.encounters.length).toBeGreaterThan(0);
        const bossNames = naxxRaid.encounters.map(e => e.bossName);
        // Should have at least some Naxx bosses
        const naxxBosses = ["Patchwerk", "Grobbulus", "Gluth", "Thaddius", "Maexxna", "Loatheb", "Sapphiron"];
        const found = naxxBosses.filter(b => bossNames.includes(b));
        expect(found.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe("example-log-6 - multiple raids", () => {
    it("detects multiple raids across different dates", async () => {
      const stream = fileToStream(join(LOGS_DIR, "example-log-6.txt"));
      const result = await scanLog(stream);
      expect(result.raids.length).toBeGreaterThan(1);
      // Should have raids from at least a few different dates
      const allDates = new Set(result.raids.flatMap(r => r.dates));
      expect(allDates.size).toBeGreaterThan(1);
    }, 60000);

    it("all timestamps are valid ISO strings", async () => {
      const stream = fileToStream(join(LOGS_DIR, "example-log-6.txt"));
      const result = await scanLog(stream);
      for (const raid of result.raids) {
        expect(new Date(raid.startTime).getTime()).not.toBeNaN();
        expect(new Date(raid.endTime).getTime()).not.toBeNaN();
        for (const enc of raid.encounters) {
          expect(new Date(enc.startTime).getTime()).not.toBeNaN();
          expect(new Date(enc.endTime).getTime()).not.toBeNaN();
        }
      }
    }, 60000);

    it("encounters are sorted chronologically within each raid", async () => {
      const stream = fileToStream(join(LOGS_DIR, "example-log-6.txt"));
      const result = await scanLog(stream);
      for (const raid of result.raids) {
        for (let i = 1; i < raid.encounters.length; i++) {
          const prev = new Date(raid.encounters[i - 1].startTime).getTime();
          const curr = new Date(raid.encounters[i].startTime).getTime();
          expect(curr).toBeGreaterThanOrEqual(prev);
        }
      }
    }, 60000);
  });

  describe("scan + parse roundtrip", () => {
    it("parse returns consistent data with scan results", async () => {
      // Scan first
      const scanStream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
      const scanResult = await scanLog(scanStream);
      const firstRaid = scanResult.raids[0];

      // Parse the same file with scan results
      const parseStream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
      const parseResult = await parseLog(parseStream, [{
        dates: firstRaid.dates,
        startTime: firstRaid.startTime,
        endTime: firstRaid.endTime,
        timeRanges: firstRaid.timeRanges,
      }]);

      expect(parseResult.raids.length).toBe(1);
      const parsed = parseResult.raids[0];
      
      // Parse should find players
      expect(parsed.players.length).toBeGreaterThan(0);
      
      // Parse should find encounters
      expect(parsed.encounters.length).toBeGreaterThan(0);
      
      // raidDate should be a Date
      expect(parsed.raidDate).toBeInstanceOf(Date);
    });
  });
});
