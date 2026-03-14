import { describe, it, expect, beforeEach } from "vitest";
import { CombatTracker } from "../../src/state/combat-tracker.js";
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
const BOSS_GUID = "0xF130001234000001";
const PET_GUID = "0xF140001234000001";

describe("CombatTracker", () => {
  let tracker: CombatTracker;

  beforeEach(() => {
    tracker = new CombatTracker();
  });

  describe("damage tracking", () => {
    it("tracks SPELL_DAMAGE with overkill subtracted", () => {
      tracker.onEncounterStart();
      // rawFields for SPELL_DAMAGE: spellId,spellName,spellSchool,amount,overkill,...
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,5000,200,0x10,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeDefined();
      expect(stats[PLAYER1].damage).toBe(4800); // 5000 - 200
    });

    it("tracks SWING_DAMAGE with no overkill", () => {
      tracker.onEncounterStart();
      // rawFields for SWING_DAMAGE: amount,overkill,...
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SWING_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "3000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(3000);
    });

    it("tracks SPELL_PERIODIC_DAMAGE", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_PERIODIC_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "348,Immolate,0x4,1500,0,0x4,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(1500);
    });

    it("tracks RANGE_DAMAGE", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "RANGE_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "75,Auto Shot,0x1,2000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(2000);
    });

    it("tracks DAMAGE_SHIELD", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "DAMAGE_SHIELD",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "7294,Retribution Aura,0x2,500,0,0x2,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(500);
    });

    it("treats overkill of -1 (nil) as 0 → full amount counted", () => {
      tracker.onEncounterStart();
      // WoW logs sometimes use -1 for nil overkill
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,5000,-1,0x10,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      // overkill = -1, Math.max(0, -1) = 0, useful = 5000 - 0 = 5000
      expect(stats[PLAYER1].damage).toBe(5000);
    });

    it("sums multiple damage events for the same player", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,3000,0,0x10,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1001,
          eventType: "SWING_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "2000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(5000); // 3000 + 2000
    });

    it("excludes friendly fire (dest is a player GUID)", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: PLAYER2, // dest is player → friendly fire
          rawFields: "12345,Frostbolt,0x10,5000,0,0x10,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeUndefined(); // no damage recorded
    });

    it("excludes damage to friendly-flagged NPCs (e.g., MC'd Understudies)", () => {
      tracker.onEncounterStart();
      // destFlags 0x1114 = PET | PLAYER_CONTROLLED | REACTION_FRIENDLY | PARTY
      // This matches MC'd Death Knight Understudies on Razuvious
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID, // NPC GUID, but friendly-flagged
          destFlags: "0x1114",
          rawFields: "42897,Arcane Blast,0x40,9000,0,0x40,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeUndefined(); // friendly target → excluded
    });

    it("includes damage to hostile-flagged NPCs", () => {
      tracker.onEncounterStart();
      // destFlags 0xa48 = hostile NPC (normal boss)
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          destFlags: "0xa48",
          rawFields: "42897,Arcane Blast,0x40,9000,0,0x40,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeDefined();
      expect(stats[PLAYER1].damage).toBe(9000);
    });

    it("ignores damage events outside an encounter", () => {
      // Process event WITHOUT calling onEncounterStart()
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,5000,0,0x10,0,0,0,nil,nil,nil",
        }),
      );
      // Start and immediately end an encounter
      tracker.onEncounterStart();
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeUndefined();
    });
  });

  describe("pet resolution", () => {
    it("attributes pet damage to the owner via SPELL_SUMMON", () => {
      // Register pet ownership
      tracker.processEvent(
        makeEvent({
          timestamp: 500,
          eventType: "SPELL_SUMMON",
          sourceGuid: PLAYER1,
          destGuid: PET_GUID,
          rawFields: "688,Summon Imp,0x20",
        }),
      );

      tracker.onEncounterStart();
      // Pet does damage
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PET_GUID,
          destGuid: BOSS_GUID,
          rawFields: "3110,Firebolt,0x4,1500,0,0x4,0,0,0,nil,nil,nil",
        }),
      );

      const stats = tracker.onEncounterEnd();
      // Damage attributed to owner, not pet
      expect(stats[PET_GUID]).toBeUndefined();
      expect(stats[PLAYER1]).toBeDefined();
      expect(stats[PLAYER1].damage).toBe(1500);
    });

    it("maps pet via player→pet filter spell (Kill Command)", () => {
      // No SPELL_SUMMON — pet detected via Kill Command cast (in PET_FILTER_SPELLS)
      tracker.processEvent(
        makeEvent({
          timestamp: 400,
          eventType: "SPELL_CAST_SUCCESS",
          sourceGuid: PLAYER1,
          sourceName: "Hunter",
          destGuid: PET_GUID,
          destName: "Cat",
          rawFields: "19574,Bestial Wrath,0x1",
        }),
      );

      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PET_GUID,
          destGuid: BOSS_GUID,
          rawFields: "16827,Claw,0x1,2000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      const stats = tracker.onEncounterEnd();
      expect(stats[PET_GUID]).toBeUndefined();
      expect(stats[PLAYER1]).toBeDefined();
      expect(stats[PLAYER1].damage).toBe(2000);
    });

    it("maps pet via player→pet filter spell (Mend Pet)", () => {
      tracker.processEvent(
        makeEvent({
          timestamp: 400,
          eventType: "SPELL_HEAL",
          sourceGuid: PLAYER1,
          sourceName: "Hunter",
          destGuid: PET_GUID,
          destName: "Cat",
          rawFields: "48990,Mend Pet,0x8,1000,0,0,nil",
        }),
      );

      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SWING_DAMAGE",
          sourceGuid: PET_GUID,
          destGuid: BOSS_GUID,
          rawFields: "1500,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      const stats = tracker.onEncounterEnd();
      expect(stats[PET_GUID]).toBeUndefined();
      expect(stats[PLAYER1].damage).toBe(1500);
    });

    it("maps pet via pet→owner filter spell (Kindred Spirits)", () => {
      // Pet applies Kindred Spirits to its owner — in PET_FILTER_SPELLS
      tracker.processEvent(
        makeEvent({
          timestamp: 400,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PET_GUID,
          sourceName: "Cat",
          destGuid: PLAYER1,
          destName: "Hunter",
          rawFields: "57475,Kindred Spirits,0x1,BUFF",
        }),
      );

      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PET_GUID,
          destGuid: BOSS_GUID,
          rawFields: "16827,Claw,0x1,2500,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      const stats = tracker.onEncounterEnd();
      expect(stats[PET_GUID]).toBeUndefined();
      expect(stats[PLAYER1].damage).toBe(2500);
    });

    it("maps DK ghoul via Ghoul Frenzy filter spell", () => {
      // DK casts Ghoul Frenzy on their permanent ghoul
      tracker.processEvent(
        makeEvent({
          timestamp: 400,
          eventType: "SPELL_AURA_APPLIED",
          sourceGuid: PLAYER1,
          sourceName: "Mopex",
          destGuid: PET_GUID,
          destName: "Gravemasher",
          rawFields: "63560,Ghoul Frenzy,0x1,BUFF",
        }),
      );

      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SWING_DAMAGE",
          sourceGuid: PET_GUID,
          destGuid: BOSS_GUID,
          rawFields: "4000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      const stats = tracker.onEncounterEnd();
      expect(stats[PET_GUID]).toBeUndefined();
      expect(stats[PLAYER1].damage).toBe(4000);
    });

    it("merges pet and owner damage into a single entry", () => {
      // Register pet
      tracker.processEvent(
        makeEvent({
          timestamp: 500,
          eventType: "SPELL_SUMMON",
          sourceGuid: PLAYER1,
          destGuid: PET_GUID,
          rawFields: "688,Summon Imp,0x20",
        }),
      );

      tracker.onEncounterStart();

      // Owner does damage
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "47632,Death Coil,0x20,4000,0,0x20,0,0,0,nil,nil,nil",
        }),
      );

      // Pet does damage
      tracker.processEvent(
        makeEvent({
          timestamp: 1001,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PET_GUID,
          destGuid: BOSS_GUID,
          rawFields: "3110,Firebolt,0x4,1500,0,0x4,0,0,0,nil,nil,nil",
        }),
      );

      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(5500); // 4000 + 1500
    });
  });

  describe("encounter lifecycle", () => {
    it("resets stats between encounters", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,5000,0,0x10,0,0,0,nil,nil,nil",
        }),
      );
      const stats1 = tracker.onEncounterEnd();
      expect(stats1[PLAYER1].damage).toBe(5000);

      // Second encounter — fresh stats
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 2000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,3000,0,0x10,0,0,0,nil,nil,nil",
        }),
      );
      const stats2 = tracker.onEncounterEnd();
      expect(stats2[PLAYER1].damage).toBe(3000); // not 8000
    });

    it("aggregates raid-wide summaries across encounters", () => {
      // Encounter 1
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,5000,0,0x10,0,0,0,nil,nil,nil",
        }),
      );
      tracker.onEncounterEnd();

      // Encounter 2
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 2000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,3000,0,0x10,0,0,0,nil,nil,nil",
        }),
      );
      tracker.onEncounterEnd();

      const summaries = tracker.getPlayerSummaries();
      expect(summaries.get(PLAYER1)!.damage).toBe(8000); // 5000 + 3000
      expect(summaries.get(PLAYER2)).toBeUndefined();
    });

    it("forceEnd returns null when not in encounter", () => {
      const result = tracker.forceEnd();
      expect(result).toBeNull();
    });

    it("forceEnd finalizes the current encounter", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,2000,0,0x10,0,0,0,nil,nil,nil",
        }),
      );

      const result = tracker.forceEnd();
      expect(result).not.toBeNull();
      expect(result![PLAYER1].damage).toBe(2000);

      // After forceEnd, no longer in encounter
      const result2 = tracker.forceEnd();
      expect(result2).toBeNull();
    });
  });
});
