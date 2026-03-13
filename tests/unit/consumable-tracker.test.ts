import { describe, it, expect, beforeEach } from "vitest";
import { ConsumableTracker } from "../../src/state/consumable-tracker.js";
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
const PLAYER3_GUID = "0x0E00000000000003";

describe("ConsumableTracker", () => {
  let tracker: ConsumableTracker;

  beforeEach(() => {
    tracker = new ConsumableTracker();
  });

  describe("basic potion tracking during encounter", () => {
    it("tracks Potion of Speed via SPELL_CAST_SUCCESS", () => {
      tracker.onEncounterStart();

      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          rawFields: "53908,Speed,0x1",
        }),
      );

      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID]).toBeDefined();
      expect(result[PLAYER1_GUID].length).toBe(1);
      expect(result[PLAYER1_GUID][0].spellId).toBe(53908);
      expect(result[PLAYER1_GUID][0].spellName).toBe("Potion of Speed");
      expect(result[PLAYER1_GUID][0].type).toBe("potion");
      expect(result[PLAYER1_GUID][0].prePot).toBe(false);
      expect(result[PLAYER1_GUID][0].count).toBe(1);
    });

    it("tracks Potion of Wild Magic", () => {
      tracker.onEncounterStart();

      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Mage",
          rawFields: "53909,Wild Magic,0x1",
        }),
      );

      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID][0].spellId).toBe(53909);
      expect(result[PLAYER1_GUID][0].spellName).toBe("Potion of Wild Magic");
    });

    it("tracks mana potions via SPELL_CAST_SUCCESS", () => {
      tracker.onEncounterStart();

      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Priest",
          rawFields: "43186,Restore Mana,0x1",
        }),
      );

      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID][0].spellId).toBe(43186);
      expect(result[PLAYER1_GUID][0].spellName).toBe("Runic Mana Potion");
      expect(result[PLAYER1_GUID][0].type).toBe("mana_potion");
    });

    it("tracks engineering bombs", () => {
      tracker.onEncounterStart();

      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "DK",
          rawFields: "56488,Global Thermal Sapper Charge,0x4",
        }),
      );

      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID][0].spellId).toBe(56488);
      expect(result[PLAYER1_GUID][0].type).toBe("engineering");
    });
  });

  describe("pre-pot detection via aura tracking", () => {
    it("detects pre-pot when buff is active at encounter start", () => {
      // Player applies potion buff BEFORE encounter
      tracker.processEvent(
        makeEvent({
          timestamp: 999000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: "53908,Speed,0x1,BUFF",
        }),
      );

      // Encounter starts — player has active Speed buff → pre-pot
      tracker.onEncounterStart();

      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID]).toBeDefined();
      expect(result[PLAYER1_GUID].length).toBe(1);
      expect(result[PLAYER1_GUID][0].spellId).toBe(53908);
      expect(result[PLAYER1_GUID][0].prePot).toBe(true);
      expect(result[PLAYER1_GUID][0].count).toBe(1);
    });

    it("does not flag as pre-pot if buff was removed before encounter", () => {
      // Apply buff
      tracker.processEvent(
        makeEvent({
          timestamp: 999000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: "53908,Speed,0x1,BUFF",
        }),
      );

      // Buff expires before encounter
      tracker.processEvent(
        makeEvent({
          timestamp: 999500,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: "53908,Speed,0x1,BUFF",
        }),
      );

      tracker.onEncounterStart();
      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID]).toBeUndefined();
    });

    it("tracks both pre-pot and mid-fight potion for same player", () => {
      // Pre-pot: buff applied before encounter
      tracker.processEvent(
        makeEvent({
          timestamp: 999000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: "53908,Speed,0x1,BUFF",
        }),
      );

      tracker.onEncounterStart();

      // Buff expires during encounter
      tracker.processEvent(
        makeEvent({
          timestamp: 1014000,
          eventType: "SPELL_AURA_REMOVED",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: "53908,Speed,0x1,BUFF",
        }),
      );

      // Mid-fight potion
      tracker.processEvent(
        makeEvent({
          timestamp: 1015000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          rawFields: "53908,Speed,0x1",
        }),
      );

      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID].length).toBe(2);

      const prePot = result[PLAYER1_GUID].find((u) => u.prePot);
      const midFight = result[PLAYER1_GUID].find((u) => !u.prePot);
      expect(prePot).toBeDefined();
      expect(prePot!.count).toBe(1);
      expect(midFight).toBeDefined();
      expect(midFight!.count).toBe(1);
    });
  });

  describe("Flame Cap special handling", () => {
    it("tracks Flame Cap via SPELL_AURA_APPLIED (nil source)", () => {
      tracker.onEncounterStart();

      // Flame Cap SPELL_CAST_SUCCESS has nil source — should be ignored
      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: "0x0000000000000000",
          sourceName: "",
          rawFields: "28714,Flame Cap,0x1",
        }),
      );

      // Flame Cap aura applied to the player (dest has the real GUID)
      tracker.processEvent(
        makeEvent({
          timestamp: 1000050,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: "0x0000000000000000",
          sourceName: "",
          destGuid: PLAYER1_GUID,
          destName: "Mopex",
          rawFields: "28714,Flame Cap,0x1,BUFF",
        }),
      );

      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID]).toBeDefined();
      expect(result[PLAYER1_GUID].length).toBe(1);
      expect(result[PLAYER1_GUID][0].spellId).toBe(28714);
      expect(result[PLAYER1_GUID][0].spellName).toBe("Flame Cap");
      expect(result[PLAYER1_GUID][0].type).toBe("flame_cap");
    });

    it("detects Flame Cap pre-pot via active aura at encounter start", () => {
      // Flame Cap aura applied before encounter
      tracker.processEvent(
        makeEvent({
          timestamp: 999000,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: "0x0000000000000000",
          sourceName: "",
          destGuid: PLAYER1_GUID,
          destName: "Mopex",
          rawFields: "28714,Flame Cap,0x1,BUFF",
        }),
      );

      tracker.onEncounterStart();

      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID]).toBeDefined();
      expect(result[PLAYER1_GUID][0].prePot).toBe(true);
      expect(result[PLAYER1_GUID][0].type).toBe("flame_cap");
    });
  });

  describe("multiple players and encounters", () => {
    it("tracks consumables for multiple players independently", () => {
      tracker.onEncounterStart();

      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          rawFields: "53908,Speed,0x1",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1000100,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER2_GUID,
          sourceName: "Mage",
          rawFields: "53909,Wild Magic,0x1",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1000200,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER3_GUID,
          sourceName: "DK",
          rawFields: "56488,Global Thermal Sapper Charge,0x4",
        }),
      );

      const result = tracker.onEncounterEnd();
      expect(Object.keys(result).length).toBe(3);
      expect(result[PLAYER1_GUID][0].spellName).toBe("Potion of Speed");
      expect(result[PLAYER2_GUID][0].spellName).toBe("Potion of Wild Magic");
      expect(result[PLAYER3_GUID][0].spellName).toBe("Global Thermal Sapper Charge");
    });

    it("resets between encounters", () => {
      // First encounter
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          rawFields: "53908,Speed,0x1",
        }),
      );
      const result1 = tracker.onEncounterEnd();

      // Second encounter — no consumables used
      tracker.onEncounterStart();
      const result2 = tracker.onEncounterEnd();

      expect(Object.keys(result1).length).toBe(1);
      expect(Object.keys(result2).length).toBe(0);
    });
  });

  describe("ignores events outside encounters", () => {
    it("does not track SPELL_CAST_SUCCESS outside encounters", () => {
      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          rawFields: "53908,Speed,0x1",
        }),
      );

      // Start and immediately end an encounter
      tracker.onEncounterStart();
      const result = tracker.onEncounterEnd();
      expect(result[PLAYER1_GUID]).toBeUndefined();
    });

    it("ignores non-consumable spells", () => {
      tracker.onEncounterStart();

      // Mortal Strike — not a consumable
      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          rawFields: "47486,Mortal Strike,0x1",
        }),
      );

      const result = tracker.onEncounterEnd();
      expect(Object.keys(result).length).toBe(0);
    });
  });

  describe("forceEnd", () => {
    it("returns consumable data when force-ending active encounter", () => {
      tracker.onEncounterStart();

      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          rawFields: "53908,Speed,0x1",
        }),
      );

      const result = tracker.forceEnd();
      expect(result).not.toBeNull();
      expect(result![PLAYER1_GUID]).toBeDefined();
    });

    it("returns null when no encounter is active", () => {
      const result = tracker.forceEnd();
      expect(result).toBeNull();
    });
  });
});
