import { describe, it, expect, beforeEach } from "vitest";
import { BuffUptimeTracker } from "../../src/state/buff-uptime-tracker.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";

/** Helper to create a minimal LogEvent for testing. */
function makeEvent(
  overrides: Partial<LogEvent> & { timestamp: number; eventType: string },
): LogEvent {
  return {
    date: "3/12",
    time: "20:00:00.000",
    sourceGuid: "0x0000000000000000",
    sourceName: "",
    sourceFlags: "0x0",
    destGuid: "0x0000000000000000",
    destName: "",
    destFlags: "0x0",
    rawFields: "",
    ...overrides,
  };
}

const PLAYER1_GUID = "0x0E00000000000001";
const PLAYER2_GUID = "0x0E00000000000002";
const NPC_GUID = "0xF130008F14000001";

// Spell IDs and rawFields constants
const FLASK_ENDLESS_RAGE_RAW = "53760,Flask of Endless Rage,0x1,BUFF";
const FLASK_STONEBLOOD_RAW = "53758,Flask of Stoneblood,0x1,BUFF";
const ELIXIR_MIGHTY_STRENGTH_RAW = "53748,Elixir of Mighty Strength,0x1,BUFF";
const WELL_FED_FISH_FEAST_RAW = "57399,Well Fed,0x1,BUFF";

describe("BuffUptimeTracker", () => {
  let tracker: BuffUptimeTracker;

  beforeEach(() => {
    tracker = new BuffUptimeTracker();
  });

  describe("single flask, full uptime", () => {
    it("reports 100% uptime when flask covers entire raid", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      expect(player).toBeDefined();
      expect(player.flaskUptimePercent).toBe(100);
      expect(player.buffs.length).toBe(1);
      expect(player.buffs[0].spellId).toBe(53760);
      expect(player.buffs[0].spellName).toBe("Flask of Endless Rage");
      expect(player.buffs[0].category).toBe("flask");
      expect(player.buffs[0].uptimeMs).toBe(10000);
      expect(player.buffs[0].uptimePercent).toBe(100);
    });
  });

  describe("single flask, partial uptime", () => {
    it("reports correct percentage when flask applied mid-raid", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Flask applied 5s into the raid
      tracker.processEvent(
        makeEvent({
          timestamp: 1005000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      expect(player.flaskUptimePercent).toBe(50);
      expect(player.buffs[0].uptimeMs).toBe(5000);
      expect(player.buffs[0].uptimePercent).toBe(50);
    });
  });

  describe("flask swap", () => {
    it("shows no gap in flaskUptimePercent and both buffs in array", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Flask A: 0-5s
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1005000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Flask B: 5s-10s (immediate swap)
      tracker.processEvent(
        makeEvent({
          timestamp: 1005000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_STONEBLOOD_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_STONEBLOOD_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      expect(player.flaskUptimePercent).toBe(100);
      expect(player.buffs.length).toBe(2);
    });
  });

  describe("flask gap", () => {
    it("percentage reflects gap between flasks", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Flask A: 0-3s
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1003000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // 4s gap (3s-7s)

      // Flask B: 7s-10s
      tracker.processEvent(
        makeEvent({
          timestamp: 1007000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_STONEBLOOD_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_STONEBLOOD_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      // 3s + 3s = 6s out of 10s = 60%
      expect(player.flaskUptimePercent).toBe(60);
    });
  });

  describe("elixir counts as flask uptime", () => {
    it("battle elixir contributes to flaskUptimePercent", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: ELIXIR_MIGHTY_STRENGTH_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: ELIXIR_MIGHTY_STRENGTH_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      expect(player.flaskUptimePercent).toBe(100);
      expect(player.buffs[0].category).toBe("battle_elixir");
    });
  });

  describe("food buff tracking", () => {
    it("tracks food uptime independently from flask", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Flask: full duration
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Food: first half only (5s)
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: WELL_FED_FISH_FEAST_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1005000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: WELL_FED_FISH_FEAST_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      expect(player.flaskUptimePercent).toBe(100);
      expect(player.foodUptimePercent).toBe(50);
    });
  });

  describe("buff active at log start", () => {
    it("retroactively starts from raidStart when only SPELL_AURA_REMOVED seen", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Only removal — buff was active before log started
      tracker.processEvent(
        makeEvent({
          timestamp: 1005000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      // Active from raidStart (1000000) to removal (1005000) = 5s out of 10s = 50%
      expect(player.flaskUptimePercent).toBe(50);
      expect(player.buffs[0].uptimeMs).toBe(5000);
    });
  });

  describe("buff active at log end", () => {
    it("closes open interval at raidEnd when no remove event seen", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Apply with no removal
      tracker.processEvent(
        makeEvent({
          timestamp: 1005000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      // Active from 1005000 to raidEnd (1010000) = 5s out of 10s = 50%
      expect(player.flaskUptimePercent).toBe(50);
      expect(player.buffs[0].uptimeMs).toBe(5000);
    });
  });

  describe("SPELL_AURA_REFRESH with no prior apply", () => {
    it("opens retroactively from raidStart", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Refresh with no prior apply — buff was active before log
      tracker.processEvent(
        makeEvent({
          timestamp: 1003000,
          eventType: "SPELL_AURA_REFRESH",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1008000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      // Retroactive from raidStart to removal at 1008000 = 8s out of 10s = 80%
      expect(player.flaskUptimePercent).toBe(80);
      expect(player.buffs[0].uptimeMs).toBe(8000);
    });
  });

  describe("duplicate SPELL_AURA_APPLIED", () => {
    it("closes first interval and opens new one", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // First apply
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Duplicate apply at 3s — should close [0, 3s] and open new
      tracker.processEvent(
        makeEvent({
          timestamp: 1003000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Remove at 8s
      tracker.processEvent(
        makeEvent({
          timestamp: 1008000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      // Interval [0, 3s] + [3s, 8s] = 8s out of 10s = 80%
      expect(player.flaskUptimePercent).toBe(80);
      expect(player.buffs[0].uptimeMs).toBe(8000);
    });
  });

  describe("unknown spell IDs ignored", () => {
    it("does not track non-buff spells", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000;

      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: "99999,Unknown Buff,0x1,BUFF",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: "99999,Unknown Buff,0x1,BUFF",
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      expect(result.has(PLAYER1_GUID)).toBe(false);
    });
  });

  describe("interval merge for union", () => {
    it("overlapping flask+elixir intervals don't double-count", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Flask: 0-7s
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1007000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Elixir: 5s-10s (overlaps with flask from 5-7s)
      tracker.processEvent(
        makeEvent({
          timestamp: 1005000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: ELIXIR_MIGHTY_STRENGTH_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: ELIXIR_MIGHTY_STRENGTH_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      // Union of [0,7s] and [5s,10s] = [0,10s] = 100%
      expect(player.flaskUptimePercent).toBe(100);
      // Individual buffs should still show their individual uptimes
      expect(player.buffs.length).toBe(2);
    });
  });

  describe("multiple players", () => {
    it("tracks independently per player", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Player 1: flask full duration
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Player 2: flask first half only
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER2_GUID,
          destName: "Mage",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1005000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER2_GUID,
          destName: "Mage",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      expect(result.get(PLAYER1_GUID)!.flaskUptimePercent).toBe(100);
      expect(result.get(PLAYER2_GUID)!.flaskUptimePercent).toBe(50);
    });
  });

  describe("non-player GUIDs ignored", () => {
    it("skips NPC aura events", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000;

      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: NPC_GUID,
          destName: "Patchwerk",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: NPC_GUID,
          destName: "Patchwerk",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      expect(result.has(NPC_GUID)).toBe(false);
    });
  });

  describe("buffs sorted by uptimeMs descending", () => {
    it("orders buffs array by uptimeMs descending", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000; // 10s raid

      // Short flask: 2s
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1002000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Long food: 8s
      tracker.processEvent(
        makeEvent({
          timestamp: 1002000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: WELL_FED_FISH_FEAST_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: WELL_FED_FISH_FEAST_RAW,
        }),
      );

      // Medium elixir: 5s
      tracker.processEvent(
        makeEvent({
          timestamp: 1002000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: ELIXIR_MIGHTY_STRENGTH_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1007000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: ELIXIR_MIGHTY_STRENGTH_RAW,
        }),
      );

      const result = tracker.finalize(raidStart, raidEnd);
      const player = result.get(PLAYER1_GUID)!;
      expect(player.buffs.length).toBe(3);
      // Sorted: food (8s) > elixir (5s) > flask (2s)
      expect(player.buffs[0].uptimeMs).toBe(8000);
      expect(player.buffs[1].uptimeMs).toBe(5000);
      expect(player.buffs[2].uptimeMs).toBe(2000);
    });
  });

  describe("zero-duration raid", () => {
    it("returns empty map when raidEnd equals raidStart", () => {
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_AURA_APPLIED",
        destGuid: PLAYER1_GUID,
        rawFields: FLASK_ENDLESS_RAGE_RAW,
      }));

      const result = tracker.finalize(1000, 1000);
      expect(result.size).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      const raidStart = 1000000;
      const raidEnd = 1010000;

      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      tracker.reset();

      const result = tracker.finalize(raidStart, raidEnd);
      expect(result.size).toBe(0);
    });
  });

  describe("computeUptimeForWindow", () => {
    it("full overlap — flask active for entire encounter window → 100%", () => {
      // Apply flask at 1000, remove at 20000
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 20000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Query window [5000, 15000]
      const result = tracker.computeUptimeForWindow(5000, 15000);
      const player = result.get(PLAYER1_GUID)!;
      expect(player).toBeDefined();
      expect(player.flaskUptimePercent).toBe(100);
    });

    it("partial overlap — flask covers half the encounter", () => {
      // Apply flask at 1000, remove at 10000
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 10000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Query window [5000, 15000] — flask covers 5000-10000 of 10000ms window = 50%
      const result = tracker.computeUptimeForWindow(5000, 15000);
      const player = result.get(PLAYER1_GUID)!;
      expect(player).toBeDefined();
      expect(player.flaskUptimePercent).toBe(50);
    });

    it("no overlap — flask not active during encounter", () => {
      // Apply flask at 1000, remove at 4000
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 4000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Query window [5000, 15000] — no overlap
      const result = tracker.computeUptimeForWindow(5000, 15000);
      expect(result.has(PLAYER1_GUID)).toBe(false);
    });

    it("open interval during encounter — flask applied before, still active", () => {
      // Apply flask at 1000, no remove
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Query window [5000, 15000] — open interval treated as extending to window end
      const result = tracker.computeUptimeForWindow(5000, 15000);
      const player = result.get(PLAYER1_GUID)!;
      expect(player).toBeDefined();
      expect(player.flaskUptimePercent).toBe(100);
    });

    it("food tracked independently from flask", () => {
      // Apply food at 5000, remove at 15000
      tracker.processEvent(
        makeEvent({
          timestamp: 5000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: WELL_FED_FISH_FEAST_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 15000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: WELL_FED_FISH_FEAST_RAW,
        }),
      );

      // Query window [5000, 15000]
      const result = tracker.computeUptimeForWindow(5000, 15000);
      const player = result.get(PLAYER1_GUID)!;
      expect(player).toBeDefined();
      expect(player.foodUptimePercent).toBe(100);
      expect(player.flaskUptimePercent).toBe(0);
    });

    it("multiple players — each computed independently", () => {
      // Player 1: flask for full window [5000, 15000]
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 20000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Player 2: flask covers only half — [5000, 10000] of the [5000, 15000] window
      tracker.processEvent(
        makeEvent({
          timestamp: 5000,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER2_GUID,
          destName: "Mage",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 10000,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER2_GUID,
          destName: "Mage",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      const result = tracker.computeUptimeForWindow(5000, 15000);
      expect(result.get(PLAYER1_GUID)!.flaskUptimePercent).toBe(100);
      expect(result.get(PLAYER2_GUID)!.flaskUptimePercent).toBe(50);
    });

    it("does not mutate state — finalize still works correctly after", () => {
      const raidStart = 1000;
      const raidEnd = 20000;

      // Apply flask at 1000, remove at 20000
      tracker.processEvent(
        makeEvent({
          timestamp: raidStart,
          eventType: "SPELL_AURA_APPLIED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: raidEnd,
          eventType: "SPELL_AURA_REMOVED",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: FLASK_ENDLESS_RAGE_RAW,
        }),
      );

      // Call computeUptimeForWindow first
      const windowResult = tracker.computeUptimeForWindow(5000, 15000);
      expect(windowResult.get(PLAYER1_GUID)!.flaskUptimePercent).toBe(100);

      // Now finalize — should still produce correct results
      const finalResult = tracker.finalize(raidStart, raidEnd);
      const player = finalResult.get(PLAYER1_GUID)!;
      expect(player).toBeDefined();
      expect(player.flaskUptimePercent).toBe(100);
      expect(player.buffs[0].uptimeMs).toBe(19000);
    });
  });
});
