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

const LOGS_DIR = join(__dirname, "../example-logs");
const LOG7_PATH = join(LOGS_DIR, "example-log-7.txt");

/**
 * Asserts that `actual` is within `tolerancePct`% of `expected`.
 * e.g. withinPct(100, 102, 2) passes; withinPct(100, 103, 2) fails.
 */
function expectWithinPct(actual: number, expected: number, tolerancePct: number) {
  const lo = expected * (1 - tolerancePct / 100);
  const hi = expected * (1 + tolerancePct / 100);
  expect(actual).toBeGreaterThanOrEqual(lo);
  expect(actual).toBeLessThanOrEqual(hi);
}

describe.skipIf(!existsSync(LOG7_PATH))(
  "integration: combat stats validation (example-log-7)",
  () => {
    // Shared state: scan once, parse once, reuse across tests.
    let patchwerk: {
      combatStats: Record<string, { damage: number; healing: number }>;
      players: Map<string, string>; // name → guid
    };
    let razuvious: {
      combatStats: Record<string, { damage: number; healing: number }>;
      players: Map<string, string>;
    };

    // Run scan + parse once before all tests in this suite.
    it("scan and parse example-log-7", async () => {
      // 1. Scan
      const scanStream = fileToStream(LOG7_PATH);
      const scanResult = await scanLog(scanStream);
      expect(scanResult.raids.length).toBeGreaterThanOrEqual(1);

      // Find the Naxxramas raid (contains Patchwerk & Razuvious)
      const naxxRaid = scanResult.raids.find(r => r.raidInstance === "Naxxramas");
      expect(naxxRaid).toBeDefined();

      // 2. Parse
      const parseStream = fileToStream(LOG7_PATH);
      const parseResult = await parseLog(parseStream, [{
        dates: naxxRaid!.dates,
        startTime: naxxRaid!.startTime,
        endTime: naxxRaid!.endTime,
        timeRanges: naxxRaid!.timeRanges,
      }]);

      expect(parseResult.raids.length).toBe(1);
      const raid = parseResult.raids[0];

      // Build player name → guid map
      const playerMap = new Map<string, string>();
      for (const p of raid.players) {
        playerMap.set(p.name, p.guid);
      }

      // Find Patchwerk encounter
      const patchwerkEnc = raid.encounters.find(e => e.bossName === "Patchwerk");
      expect(patchwerkEnc).toBeDefined();
      expect(patchwerkEnc!.combatStats).toBeDefined();
      patchwerk = {
        combatStats: patchwerkEnc!.combatStats!,
        players: playerMap,
      };

      // Find Razuvious encounter
      const razuviousEnc = raid.encounters.find(e => e.bossName === "Instructor Razuvious");
      expect(razuviousEnc).toBeDefined();
      expect(razuviousEnc!.combatStats).toBeDefined();
      razuvious = {
        combatStats: razuviousEnc!.combatStats!,
        players: playerMap,
      };
    }, 30_000);

    // --- Patchwerk damage ---

    it("Patchwerk: Egaroto damage within 2% of uwu-logs (812,995)", () => {
      const guid = patchwerk.players.get("Egaroto");
      expect(guid).toBeDefined();
      const stats = patchwerk.combatStats[guid!];
      expect(stats).toBeDefined();
      // Our value: 814,785 — uwu-logs: 812,995 (+0.22%)
      expectWithinPct(stats.damage, 812_995, 2);
    });

    it("Patchwerk: Mopex damage within 2% of uwu-logs (766,634)", () => {
      const guid = patchwerk.players.get("Mopex");
      expect(guid).toBeDefined();
      const stats = patchwerk.combatStats[guid!];
      expect(stats).toBeDefined();
      // Our value: 766,634 — uwu-logs: 766,634 (exact match)
      expectWithinPct(stats.damage, 766_634, 2);
    });

    // --- Razuvious damage ---

    it("Razuvious: Mareshall damage within 2% of uwu-logs (535,352)", () => {
      const guid = razuvious.players.get("Mareshall");
      expect(guid).toBeDefined();
      const stats = razuvious.combatStats[guid!];
      expect(stats).toBeDefined();
      // Our value: 535,352 — uwu-logs: 535,352 (exact match)
      expectWithinPct(stats.damage, 535_352, 2);
    });
  },
);
