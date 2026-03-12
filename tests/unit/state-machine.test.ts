import { describe, it, expect, beforeEach } from "vitest";
import { CombatLogStateMachine } from "../../src/state/state-machine.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";

/** Helper to create a minimal LogEvent for testing. */
function makeEvent(
  overrides: Partial<LogEvent> & { timestamp: number; eventType: string },
): LogEvent {
  return {
    date: "3/5",
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
const PATCHWERK_GUID = "0xF130003E9C000001"; // NPC ID 003E9C = Patchwerk
const GROBBULUS_GUID = "0xF130003E3B000001"; // NPC ID 003E3B = Grobbulus

describe("CombatLogStateMachine", () => {
  let sm: CombatLogStateMachine;

  beforeEach(() => {
    sm = new CombatLogStateMachine();
  });

  describe("player detection", () => {
    it("tracks players from source GUIDs", () => {
      sm.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );

      const players = sm.getDetectedPlayers();
      expect(players.has(PLAYER1_GUID)).toBe(true);
      expect(players.get(PLAYER1_GUID)!.name).toBe("Warrior");
    });

    it("tracks players from dest GUIDs", () => {
      sm.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SWING_DAMAGE",
          sourceGuid: PATCHWERK_GUID,
          sourceName: "Patchwerk",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
        }),
      );

      const players = sm.getDetectedPlayers();
      expect(players.has(PLAYER1_GUID)).toBe(true);
    });

    it("does not overwrite existing player on re-detection", () => {
      sm.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );

      sm.processEvent(
        makeEvent({
          timestamp: 1001000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );

      const players = sm.getDetectedPlayers();
      expect(players.size).toBe(1);
    });
  });

  describe("class detection", () => {
    it("detects class from spell usage", () => {
      // Spell 47486 = Mortal Strike → warrior
      sm.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
          rawFields: "47486,Mortal Strike,1",
        }),
      );

      const players = sm.getDetectedPlayers();
      expect(players.get(PLAYER1_GUID)!.class).toBe("warrior");
    });

    it("detects spec from spell usage", () => {
      // Spell 47486 → warrior-arms spec
      sm.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
          rawFields: "47486,Mortal Strike,1",
        }),
      );

      const player = sm.getDetectedPlayers().get(PLAYER1_GUID)!;
      expect(player.class).toBe("warrior");
      expect(player.spec).toBe("warrior-arms");
    });

    it("detects class first, then spec from different spells", () => {
      // Spell 78 = Heroic Strike → warrior (no spec)
      sm.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
          rawFields: "78,Heroic Strike,1",
        }),
      );

      let player = sm.getDetectedPlayers().get(PLAYER1_GUID)!;
      expect(player.class).toBe("warrior");
      expect(player.spec).toBeNull();

      // Spell 23881 = Bloodthirst → warrior-fury spec
      sm.processEvent(
        makeEvent({
          timestamp: 1001000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
          rawFields: "23881,Bloodthirst,1",
        }),
      );

      player = sm.getDetectedPlayers().get(PLAYER1_GUID)!;
      expect(player.spec).toBe("warrior-fury");
    });

    it("does not detect class from non-player sources", () => {
      sm.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PATCHWERK_GUID,
          sourceName: "Patchwerk",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
          rawFields: "47486,Mortal Strike,1",
        }),
      );

      const player = sm.getDetectedPlayers().get(PLAYER1_GUID)!;
      expect(player.class).toBeNull();
    });
  });

  describe("encounter detection", () => {
    it("produces EncounterSummary on boss kill", () => {
      const baseTs = 1000000;

      // Start Patchwerk encounter
      sm.processEvent(
        makeEvent({
          timestamp: baseTs,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
          rawFields: "47486,Mortal Strike,1",
        }),
      );

      // Keep boss active
      sm.processEvent(
        makeEvent({
          timestamp: baseTs + 15000,
          eventType: "SWING_DAMAGE",
          sourceGuid: PATCHWERK_GUID,
          sourceName: "Patchwerk",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
        }),
      );

      // Boss dies
      sm.processEvent(
        makeEvent({
          timestamp: baseTs + 25000,
          eventType: "UNIT_DIED",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );

      const encounters = sm.getEncounters();
      expect(encounters.length).toBe(1);
      expect(encounters[0].bossName).toBe("Patchwerk");
      expect(encounters[0].result).toBe("kill");
      expect(encounters[0].duration).toBe(25);
    });

    it("handles multiple encounters in sequence", () => {
      const baseTs = 1000000;

      // Encounter 1: Patchwerk kill
      sm.processEvent(
        makeEvent({
          timestamp: baseTs,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );
      sm.processEvent(
        makeEvent({
          timestamp: baseTs + 15000,
          eventType: "SWING_DAMAGE",
          sourceGuid: PATCHWERK_GUID,
          sourceName: "Patchwerk",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
        }),
      );
      sm.processEvent(
        makeEvent({
          timestamp: baseTs + 20000,
          eventType: "UNIT_DIED",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );

      // Encounter 2: Grobbulus kill
      sm.processEvent(
        makeEvent({
          timestamp: baseTs + 60000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: GROBBULUS_GUID,
          destName: "Grobbulus",
        }),
      );
      sm.processEvent(
        makeEvent({
          timestamp: baseTs + 75000,
          eventType: "SWING_DAMAGE",
          sourceGuid: GROBBULUS_GUID,
          sourceName: "Grobbulus",
          destGuid: PLAYER1_GUID,
          destName: "Warrior",
        }),
      );
      sm.processEvent(
        makeEvent({
          timestamp: baseTs + 90000,
          eventType: "UNIT_DIED",
          destGuid: GROBBULUS_GUID,
          destName: "Grobbulus",
        }),
      );

      const encounters = sm.getEncounters();
      expect(encounters.length).toBe(2);
      expect(encounters[0].bossName).toBe("Patchwerk");
      expect(encounters[1].bossName).toBe("Grobbulus");
    });
  });

  describe("finalize", () => {
    it("force-ends active encounter on finalize", () => {
      sm.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );

      sm.finalize(1050000);

      const encounters = sm.getEncounters();
      expect(encounters.length).toBe(1);
      expect(encounters[0].result).toBe("wipe");
    });

    it("does nothing when no encounter is active", () => {
      sm.finalize(1000000);
      expect(sm.getEncounters().length).toBe(0);
    });
  });

  describe("raid segments", () => {
    it("creates raid segments from processed events", () => {
      sm.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1_GUID,
          sourceName: "Warrior",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );

      sm.processEvent(
        makeEvent({
          timestamp: 1005000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER2_GUID,
          sourceName: "Mage",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );

      const segments = sm.getRaidSegments();
      expect(segments.length).toBe(1);
      expect(segments[0].playerGuids.size).toBe(2);
      expect(segments[0].raidInstance).toBe("Naxxramas");
    });
  });

  describe("difficulty fallback", () => {
    it("applies player-count difficulty when spell-based detection fails", () => {
      // Add many players (>10 → "25N")
      for (let i = 1; i <= 25; i++) {
        const guid = `0x0E0000000000${String(i).padStart(4, "0")}`;
        sm.processEvent(
          makeEvent({
            timestamp: 1000000 + i * 100,
            eventType: "SPELL_DAMAGE",
            sourceGuid: guid,
            sourceName: `Player${i}`,
            destGuid: PATCHWERK_GUID,
            destName: "Patchwerk",
          }),
        );
      }

      // Boss dies
      sm.processEvent(
        makeEvent({
          timestamp: 1010000,
          eventType: "UNIT_DIED",
          destGuid: PATCHWERK_GUID,
          destName: "Patchwerk",
        }),
      );

      const encounters = sm.getEncounters();
      expect(encounters.length).toBe(1);
      expect(encounters[0].difficulty).toBe("25N");
    });
  });
});
