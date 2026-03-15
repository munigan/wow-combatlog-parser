import { describe, it, expect, beforeEach } from "vitest";
import { ExternalsTracker } from "../../src/state/externals-tracker.js";
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

const PLAYER1 = "0x0E00000000000001";
const PLAYER2 = "0x0E00000000000002";
const PLAYER3 = "0x0E00000000000003";
const NPC_GUID = "0xF130001234000001";

describe("ExternalsTracker", () => {
  let tracker: ExternalsTracker;

  beforeEach(() => {
    tracker = new ExternalsTracker();
  });

  describe("basic external buff tracking", () => {
    it("records external buff applied by one player to another", () => {
      tracker.onEncounterStart(1000);

      // Priest casts Power Infusion on Mage
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Power Infusion removed
      tracker.processEvent(
        makeEvent({
          timestamp: 16500,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(20000, 19000);

      expect(result[PLAYER2]).toBeDefined();
      expect(result[PLAYER2].length).toBe(1);

      const use = result[PLAYER2][0];
      expect(use.spellId).toBe(10060);
      expect(use.spellName).toBe("Power Infusion");
      expect(use.sourceGuid).toBe(PLAYER1);
      expect(use.sourceName).toBe("Priest");
      expect(use.count).toBe(1);
      expect(use.intervals).toHaveLength(1);
      expect(use.intervals[0]).toEqual([1500, 16500]);
      // uptimePercent = (16500 - 1500) / 19000 * 100 = 78.95 (rounded to 2 decimals)
      expect(use.uptimePercent).toBeCloseTo(78.95, 1);
    });
  });

  describe("filtering", () => {
    it("ignores self-buffs (source === dest)", () => {
      tracker.onEncounterStart(1000);

      // Player casts Focus Magic on themselves (shouldn't happen, but guard)
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Mage",
          destGuid: PLAYER1,
          destName: "Mage",
          rawFields: '54646,"Focus Magic",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(5000, 4000);
      expect(result[PLAYER1]).toBeUndefined();
    });

    it("ignores non-external spells", () => {
      tracker.onEncounterStart(1000);

      // Random non-tracked spell
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Warrior",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '12345,"Mortal Strike",0x01,DEBUFF',
        }),
      );

      const result = tracker.onEncounterEnd(5000, 4000);
      expect(Object.keys(result).length).toBe(0);
    });

    it("ignores NPC casts (source is not a player)", () => {
      tracker.onEncounterStart(1000);

      // NPC casts Bloodlust on a player
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: NPC_GUID,
          sourceName: "NPC",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: '2825,"Bloodlust",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(5000, 4000);
      expect(result[PLAYER1]).toBeUndefined();
    });
  });

  describe("multiple applications and sources", () => {
    it("increments count for multiple applications from same source", () => {
      tracker.onEncounterStart(1000);

      // First Power Infusion
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 16500,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Second Power Infusion (120s later for cooldown)
      tracker.processEvent(
        makeEvent({
          timestamp: 136500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 151500,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(200000, 199000);

      expect(result[PLAYER2]).toHaveLength(1);
      const use = result[PLAYER2][0];
      expect(use.count).toBe(2);
      expect(use.intervals).toHaveLength(2);
      expect(use.intervals[0]).toEqual([1500, 16500]);
      expect(use.intervals[1]).toEqual([136500, 151500]);
    });

    it("tracks same spell from different sources separately", () => {
      tracker.onEncounterStart(1000);

      // Priest 1 casts PI on Mage
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest1",
          destGuid: PLAYER3,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 16500,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest1",
          destGuid: PLAYER3,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Priest 2 casts PI on Mage (later)
      tracker.processEvent(
        makeEvent({
          timestamp: 20000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER2,
          sourceName: "Priest2",
          destGuid: PLAYER3,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 35000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER2,
          sourceName: "Priest2",
          destGuid: PLAYER3,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(50000, 49000);

      // Two separate ExternalBuffUse entries for PLAYER3 (one per source)
      expect(result[PLAYER3]).toHaveLength(2);

      const fromPriest1 = result[PLAYER3].find((u) => u.sourceGuid === PLAYER1);
      const fromPriest2 = result[PLAYER3].find((u) => u.sourceGuid === PLAYER2);
      expect(fromPriest1).toBeDefined();
      expect(fromPriest2).toBeDefined();
      expect(fromPriest1!.sourceName).toBe("Priest1");
      expect(fromPriest2!.sourceName).toBe("Priest2");
      expect(fromPriest1!.count).toBe(1);
      expect(fromPriest2!.count).toBe(1);
    });

    it("records Bloodlust on multiple recipients separately", () => {
      tracker.onEncounterStart(1000);

      // Shaman casts Bloodlust — applied to multiple players
      tracker.processEvent(
        makeEvent({
          timestamp: 2000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Shaman",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '2825,"Bloodlust",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 2000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Shaman",
          destGuid: PLAYER3,
          destName: "Rogue",
          rawFields: '2825,"Bloodlust",0x01,BUFF',
        }),
      );

      // Bloodlust removed from both
      tracker.processEvent(
        makeEvent({
          timestamp: 42000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Shaman",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '2825,"Bloodlust",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 42000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Shaman",
          destGuid: PLAYER3,
          destName: "Rogue",
          rawFields: '2825,"Bloodlust",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(50000, 49000);

      expect(result[PLAYER2]).toBeDefined();
      expect(result[PLAYER3]).toBeDefined();
      expect(result[PLAYER2][0].spellName).toBe("Bloodlust");
      expect(result[PLAYER3][0].spellName).toBe("Bloodlust");
    });
  });

  describe("encounter lifecycle", () => {
    it("closes open intervals at encounter end", () => {
      tracker.onEncounterStart(1000);

      // PI applied but never removed during encounter
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(5000, 4000);

      expect(result[PLAYER2]).toHaveLength(1);
      expect(result[PLAYER2][0].intervals[0]).toEqual([1500, 5000]);
      // uptimePercent = (5000 - 1500) / 4000 * 100 = 87.5
      expect(result[PLAYER2][0].uptimePercent).toBe(87.5);
    });

    it("captures buff active at encounter start with start = encounter start", () => {
      // Buff applied BEFORE encounter
      tracker.processEvent(
        makeEvent({
          timestamp: 500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Encounter starts — PI already active
      tracker.onEncounterStart(1000);

      // PI removed during encounter
      tracker.processEvent(
        makeEvent({
          timestamp: 3000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(5000, 4000);

      expect(result[PLAYER2]).toHaveLength(1);
      // Should start at encounter start, not buff apply time
      expect(result[PLAYER2][0].intervals[0]).toEqual([1000, 3000]);
      expect(result[PLAYER2][0].count).toBe(1);
      // uptimePercent = (3000 - 1000) / 4000 * 100 = 50
      expect(result[PLAYER2][0].uptimePercent).toBe(50);
    });

    it("resets between encounters", () => {
      // First encounter
      tracker.onEncounterStart(1000);
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 16500,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      const result1 = tracker.onEncounterEnd(20000, 19000);
      expect(Object.keys(result1).length).toBe(1);

      // Second encounter — no externals
      tracker.onEncounterStart(30000);
      const result2 = tracker.onEncounterEnd(40000, 10000);
      expect(Object.keys(result2).length).toBe(0);
    });
  });

  describe("uptime calculation", () => {
    it("computes uptimePercent correctly with multiple intervals", () => {
      tracker.onEncounterStart(0);

      // Interval 1: 0ms -> 5000ms (5s)
      tracker.processEvent(
        makeEvent({
          timestamp: 0,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 5000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Interval 2: 15000ms -> 20000ms (5s)
      tracker.processEvent(
        makeEvent({
          timestamp: 15000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 20000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Encounter: 0 -> 100000 (100s total)
      const result = tracker.onEncounterEnd(100000, 100000);

      // Total interval time: 10000ms out of 100000ms = 10%
      expect(result[PLAYER2][0].uptimePercent).toBe(10);
      expect(result[PLAYER2][0].count).toBe(2);
    });
  });

  describe("getPlayerSummaries", () => {
    it("aggregates across encounters per dest per spellId", () => {
      // Encounter 1: PI on Mage (1 use, 15s)
      tracker.onEncounterStart(1000);
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 16500,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.onEncounterEnd(20000, 19000);

      // Encounter 2: PI on Mage (1 use, 15s) + Tricks on Mage (1 use, 6s)
      tracker.onEncounterStart(30000);
      tracker.processEvent(
        makeEvent({
          timestamp: 30500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 45500,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 31000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER3,
          sourceName: "Rogue",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '57933,"Tricks of the Trade",0x01,BUFF',
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 37000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER3,
          sourceName: "Rogue",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '57933,"Tricks of the Trade",0x01,BUFF',
        }),
      );
      tracker.onEncounterEnd(50000, 20000);

      // Total encounter duration: 19000 + 20000 = 39000ms
      const summaries = tracker.getPlayerSummaries(39000);

      expect(summaries.has(PLAYER2)).toBe(true);
      const mage = summaries.get(PLAYER2)!;

      // PI: 2 uses total, Tricks: 1 use total
      // Should be sorted by totalCount desc
      expect(mage.received.length).toBe(2);

      const pi = mage.received.find((r) => r.spellId === 10060);
      const tricks = mage.received.find((r) => r.spellId === 57933);

      expect(pi).toBeDefined();
      expect(pi!.totalCount).toBe(2);
      // PI total uptime: 15000 + 15000 = 30000ms over 39000ms = 76.92%
      expect(pi!.uptimePercent).toBeCloseTo(76.92, 1);

      expect(tricks).toBeDefined();
      expect(tricks!.totalCount).toBe(1);
      // Tricks total uptime: 6000ms over 39000ms = 15.38%
      expect(tricks!.uptimePercent).toBeCloseTo(15.38, 1);
    });
  });

  describe("forceEnd", () => {
    it("finalizes current encounter mid-encounter", () => {
      tracker.onEncounterStart(1000);

      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      const result = tracker.forceEnd(5000, 4000);
      expect(result).not.toBeNull();
      expect(result![PLAYER2]).toBeDefined();
      expect(result![PLAYER2][0].intervals[0]).toEqual([1500, 5000]);
    });

    it("returns null when not in encounter", () => {
      const result = tracker.forceEnd(5000, 4000);
      expect(result).toBeNull();
    });
  });

  describe("SPELL_AURA_REFRESH", () => {
    it("starts tracking on refresh if no existing aura (like a late-start)", () => {
      tracker.onEncounterStart(1000);

      // Refresh without prior APPLIED (aura was active before tracking started)
      tracker.processEvent(
        makeEvent({
          timestamp: 2000,
          eventType: "SPELL_AURA_REFRESH",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Then removed
      tracker.processEvent(
        makeEvent({
          timestamp: 5000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(10000, 9000);
      expect(result[PLAYER2]).toBeDefined();
      expect(result[PLAYER2][0].intervals[0]).toEqual([2000, 5000]);
    });

    it("is a no-op when aura is already tracked", () => {
      tracker.onEncounterStart(1000);

      // Applied
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Refresh — should not create a new interval or change anything
      tracker.processEvent(
        makeEvent({
          timestamp: 3000,
          eventType: "SPELL_AURA_REFRESH",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Removed
      tracker.processEvent(
        makeEvent({
          timestamp: 8000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(10000, 9000);
      expect(result[PLAYER2]).toHaveLength(1);
      // One continuous interval from apply to remove
      expect(result[PLAYER2][0].intervals).toHaveLength(1);
      expect(result[PLAYER2][0].intervals[0]).toEqual([1500, 8000]);
      expect(result[PLAYER2][0].count).toBe(1);
    });
  });

  describe("duplicate SPELL_AURA_APPLIED", () => {
    it("closes previous aura and opens new one on duplicate apply", () => {
      tracker.onEncounterStart(1000);

      // First apply
      tracker.processEvent(
        makeEvent({
          timestamp: 1500,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Duplicate apply (no remove in between)
      tracker.processEvent(
        makeEvent({
          timestamp: 5000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      // Remove
      tracker.processEvent(
        makeEvent({
          timestamp: 8000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1,
          sourceName: "Priest",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: '10060,"Power Infusion",0x01,BUFF',
        }),
      );

      const result = tracker.onEncounterEnd(10000, 9000);
      expect(result[PLAYER2]).toHaveLength(1);
      // Two intervals: [1500, 5000] and [5000, 8000]
      expect(result[PLAYER2][0].intervals).toHaveLength(2);
      expect(result[PLAYER2][0].intervals[0]).toEqual([1500, 5000]);
      expect(result[PLAYER2][0].intervals[1]).toEqual([5000, 8000]);
      expect(result[PLAYER2][0].count).toBe(2);
    });
  });
});
