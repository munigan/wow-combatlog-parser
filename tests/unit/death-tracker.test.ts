import { describe, it, expect, beforeEach } from "vitest";
import { DeathTracker } from "../../src/state/death-tracker.js";
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

describe("DeathTracker", () => {
  let tracker: DeathTracker;

  beforeEach(() => {
    tracker = new DeathTracker();
  });

  describe("basic death tracking", () => {
    it("records a death with recap and killing blow", () => {
      tracker.onEncounterStart(1000);

      // Boss hits player three times
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Patchwerk",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "12345,Hateful Strike,0x1,8000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1200,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Patchwerk",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "12345,Hateful Strike,0x1,9000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1300,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Patchwerk",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "12345,Hateful Strike,0x1,10000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      // Player dies
      tracker.processEvent(
        makeEvent({
          timestamp: 1350,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(1);

      const death = deaths[0];
      expect(death.playerGuid).toBe(PLAYER1);
      expect(death.playerName).toBe("Warrior");
      expect(death.timestamp).toBe(1350);
      expect(death.timeIntoEncounter).toBe(0.35); // (1350 - 1000) / 1000 seconds

      // Recap should have 3 events
      expect(death.recap).toHaveLength(3);

      // Killing blow is the last damage event (positive amount)
      expect(death.killingBlow).not.toBeNull();
      expect(death.killingBlow!.amount).toBe(10000);
      expect(death.killingBlow!.spellName).toBe("Hateful Strike");
      expect(death.killingBlow!.sourceGuid).toBe(BOSS_GUID);
    });

    it("tracks SWING_DAMAGE with spellId null and spellName 'Melee'", () => {
      tracker.onEncounterStart(1000);

      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Patchwerk",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "15000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(1);

      const recap = deaths[0].recap;
      expect(recap).toHaveLength(1);
      expect(recap[0].spellId).toBeNull();
      expect(recap[0].spellName).toBe("Melee");
      expect(recap[0].amount).toBe(15000);

      expect(deaths[0].killingBlow).not.toBeNull();
      expect(deaths[0].killingBlow!.spellId).toBeNull();
      expect(deaths[0].killingBlow!.spellName).toBe("Melee");
    });

    it("tracks ENVIRONMENTAL_DAMAGE with spellId null and amount at rawFields index 1", () => {
      tracker.onEncounterStart(1000);

      // ENVIRONMENTAL_DAMAGE rawFields: environmentType,amount,...
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "ENVIRONMENTAL_DAMAGE",
          sourceGuid: "0x0000000000000000",
          sourceName: "",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "Falling,5000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(1);

      const recap = deaths[0].recap;
      expect(recap).toHaveLength(1);
      expect(recap[0].spellId).toBeNull();
      expect(recap[0].spellName).toBe("Environmental");
      expect(recap[0].amount).toBe(5000);
      expect(recap[0].eventType).toBe("ENVIRONMENTAL_DAMAGE");
    });

    it("stores healing events as negative amounts in recap", () => {
      tracker.onEncounterStart(1000);

      // Player takes damage
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "12345,Shadow Bolt,0x20,8000,0,0x20,0,0,0,nil,nil,nil",
        }),
      );

      // Healer heals the player
      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "SPELL_HEAL",
          sourceGuid: PLAYER2,
          sourceName: "Priest",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "48071,Flash Heal,0x2,6000,0,0,nil",
        }),
      );

      // Player takes fatal damage
      tracker.processEvent(
        makeEvent({
          timestamp: 1200,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "12345,Shadow Bolt,0x20,12000,0,0x20,0,0,0,nil,nil,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1250,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(1);

      const recap = deaths[0].recap;
      expect(recap).toHaveLength(3);

      // Damage event
      expect(recap[0].amount).toBe(8000);

      // Heal event → negative amount
      expect(recap[1].amount).toBe(-6000);
      expect(recap[1].spellName).toBe("Flash Heal");
      expect(recap[1].eventType).toBe("SPELL_HEAL");

      // Fatal damage
      expect(recap[2].amount).toBe(12000);

      // Killing blow is last positive-amount event
      expect(deaths[0].killingBlow!.amount).toBe(12000);
    });

    it("stores SPELL_PERIODIC_HEAL as negative amount", () => {
      tracker.onEncounterStart(1000);

      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SPELL_PERIODIC_HEAL",
          sourceGuid: PLAYER2,
          sourceName: "Druid",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "48441,Rejuvenation,0x8,3000,0,0,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1200,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "20000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1250,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      const recap = deaths[0].recap;
      expect(recap[0].amount).toBe(-3000);
      expect(recap[0].eventType).toBe("SPELL_PERIODIC_HEAL");
    });
  });

  describe("rolling buffer", () => {
    it("keeps only the last 10 events when more than 10 are buffered", () => {
      tracker.onEncounterStart(1000);

      // Send 15 damage events
      for (let i = 1; i <= 15; i++) {
        tracker.processEvent(
          makeEvent({
            timestamp: 1000 + i * 100,
            eventType: "SPELL_DAMAGE",
            sourceGuid: BOSS_GUID,
            sourceName: "Boss",
            destGuid: PLAYER1,
            destName: "Warrior",
            rawFields: `12345,Bolt,0x20,${i * 1000},0,0x20,0,0,0,nil,nil,nil`,
          }),
        );
      }

      tracker.processEvent(
        makeEvent({
          timestamp: 3000,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(1);

      const recap = deaths[0].recap;
      expect(recap).toHaveLength(10);

      // First event in recap should be event #6 (amount 6000), last should be #15 (amount 15000)
      expect(recap[0].amount).toBe(6000);
      expect(recap[9].amount).toBe(15000);

      // Killing blow = last damage event = #15
      expect(deaths[0].killingBlow!.amount).toBe(15000);
    });
  });

  describe("multiple deaths", () => {
    it("records multiple deaths for the same player (battle rez scenario)", () => {
      tracker.onEncounterStart(1000);

      // First death
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "20000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      // After battle rez, second death
      tracker.processEvent(
        makeEvent({
          timestamp: 2100,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "99999,Enrage,0x1,25000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 2200,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(2);

      // First death recap should only have the first swing damage
      expect(deaths[0].recap).toHaveLength(1);
      expect(deaths[0].recap[0].amount).toBe(20000);
      expect(deaths[0].timestamp).toBe(1150);

      // Second death recap should only have the second damage event (buffer was cleared)
      expect(deaths[1].recap).toHaveLength(1);
      expect(deaths[1].recap[0].amount).toBe(25000);
      expect(deaths[1].timestamp).toBe(2200);
    });

    it("tracks deaths independently per player", () => {
      tracker.onEncounterStart(1000);

      // Player 1 takes damage
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "20000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      // Player 2 takes different damage
      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: "12345,Cleave,0x1,15000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      // Both die
      tracker.processEvent(
        makeEvent({
          timestamp: 1200,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1250,
          eventType: "UNIT_DIED",
          destGuid: PLAYER2,
          destName: "Mage",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(2);

      const death1 = deaths.find((d) => d.playerGuid === PLAYER1)!;
      const death2 = deaths.find((d) => d.playerGuid === PLAYER2)!;

      expect(death1.recap).toHaveLength(1);
      expect(death1.recap[0].amount).toBe(20000);
      expect(death1.killingBlow!.spellName).toBe("Melee");

      expect(death2.recap).toHaveLength(1);
      expect(death2.recap[0].amount).toBe(15000);
      expect(death2.killingBlow!.spellName).toBe("Cleave");
    });
  });

  describe("encounter lifecycle", () => {
    it("ignores events outside encounters", () => {
      // Process events WITHOUT calling onEncounterStart()
      tracker.processEvent(
        makeEvent({
          timestamp: 500,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "20000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 550,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      // Start and immediately end encounter
      tracker.onEncounterStart(1000);
      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(0);
    });

    it("resets state between encounters", () => {
      // First encounter: player dies
      tracker.onEncounterStart(1000);
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "20000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );
      const deaths1 = tracker.onEncounterEnd();
      expect(deaths1).toHaveLength(1);

      // Second encounter: no deaths
      tracker.onEncounterStart(2000);
      const deaths2 = tracker.onEncounterEnd();
      expect(deaths2).toHaveLength(0);
    });

    it("resets rolling buffers between encounters", () => {
      // First encounter: buffer some damage but no death
      tracker.onEncounterStart(1000);
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "5000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.onEncounterEnd();

      // Second encounter: player takes one hit and dies
      tracker.onEncounterStart(2000);
      tracker.processEvent(
        makeEvent({
          timestamp: 2100,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "30000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 2150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );
      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(1);

      // Recap should only have the second encounter's event, not the first encounter's
      expect(deaths[0].recap).toHaveLength(1);
      expect(deaths[0].recap[0].amount).toBe(30000);
    });
  });

  describe("aggregate summaries", () => {
    it("aggregates death counts per player via getPlayerSummaries()", () => {
      // Encounter 1: PLAYER1 dies once
      tracker.onEncounterStart(1000);
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "20000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );
      tracker.onEncounterEnd();

      // Encounter 2: PLAYER1 dies twice (battle rez), PLAYER2 dies once
      tracker.onEncounterStart(2000);
      tracker.processEvent(
        makeEvent({
          timestamp: 2100,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "20000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 2150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 2300,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "25000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 2350,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 2400,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER2,
          destName: "Mage",
          rawFields: "12345,Shadow Bolt,0x20,30000,0,0x20,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 2450,
          eventType: "UNIT_DIED",
          destGuid: PLAYER2,
          destName: "Mage",
        }),
      );
      tracker.onEncounterEnd();

      const summaries = tracker.getPlayerSummaries();
      // PLAYER1: 1 (enc1) + 2 (enc2) = 3
      expect(summaries.get(PLAYER1)).toBe(3);
      // PLAYER2: 1
      expect(summaries.get(PLAYER2)).toBe(1);
    });
  });

  describe("forceEnd", () => {
    it("finalizes current encounter mid-encounter", () => {
      tracker.onEncounterStart(1000);
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "20000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.forceEnd();
      expect(deaths).not.toBeNull();
      expect(deaths!).toHaveLength(1);
      expect(deaths![0].playerGuid).toBe(PLAYER1);
    });

    it("returns null when not in encounter", () => {
      const result = tracker.forceEnd();
      expect(result).toBeNull();
    });

    it("after forceEnd, further forceEnd returns null", () => {
      tracker.onEncounterStart(1000);
      tracker.forceEnd();
      const result = tracker.forceEnd();
      expect(result).toBeNull();
    });
  });

  describe("non-player UNIT_DIED", () => {
    it("ignores UNIT_DIED for boss NPCs", () => {
      tracker.onEncounterStart(1000);

      // Boss takes damage and dies — should not be tracked
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          sourceName: "Warrior",
          destGuid: BOSS_GUID,
          destName: "Patchwerk",
          rawFields: "12345,Execute,0x1,50000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1200,
          eventType: "UNIT_DIED",
          destGuid: BOSS_GUID,
          destName: "Patchwerk",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(0);
    });

    it("ignores UNIT_DIED for pets", () => {
      tracker.onEncounterStart(1000);

      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "UNIT_DIED",
          destGuid: PET_GUID,
          destName: "Cat",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("records mysterious death with null killingBlow when buffer is empty", () => {
      tracker.onEncounterStart(1000);

      // Player dies with no preceding damage events in buffer
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(1);
      expect(deaths[0].killingBlow).toBeNull();
      expect(deaths[0].recap).toHaveLength(0);
    });

    it("only counts damage events (positive amount) for killing blow, not heals", () => {
      tracker.onEncounterStart(1000);

      // Player takes damage, gets healed, then dies (heal is last event)
      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "12345,Shadow Bolt,0x20,30000,0,0x20,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1200,
          eventType: "SPELL_HEAL",
          sourceGuid: PLAYER2,
          sourceName: "Priest",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "48071,Flash Heal,0x2,5000,0,0,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1250,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      // Killing blow should be the Shadow Bolt (last positive amount), not the heal
      expect(deaths[0].killingBlow!.amount).toBe(30000);
      expect(deaths[0].killingBlow!.spellName).toBe("Shadow Bolt");
    });

    it("tracks DAMAGE_SHIELD events in recap", () => {
      tracker.onEncounterStart(1000);

      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "DAMAGE_SHIELD",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "7294,Retribution Aura,0x2,3000,0,0x2,0,0,0,nil,nil,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths[0].recap).toHaveLength(1);
      expect(deaths[0].recap[0].eventType).toBe("DAMAGE_SHIELD");
      expect(deaths[0].recap[0].amount).toBe(3000);
    });

    it("tracks RANGE_DAMAGE events in recap", () => {
      tracker.onEncounterStart(1000);

      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "RANGE_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "75,Auto Shot,0x1,7000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths[0].recap).toHaveLength(1);
      expect(deaths[0].recap[0].eventType).toBe("RANGE_DAMAGE");
      expect(deaths[0].recap[0].amount).toBe(7000);
    });

    it("tracks SPELL_PERIODIC_DAMAGE in recap", () => {
      tracker.onEncounterStart(1000);

      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SPELL_PERIODIC_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "348,Immolate,0x4,2000,0,0x4,0,0,0,nil,nil,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1150,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      expect(deaths[0].recap).toHaveLength(1);
      expect(deaths[0].recap[0].eventType).toBe("SPELL_PERIODIC_DAMAGE");
      expect(deaths[0].recap[0].spellName).toBe("Immolate");
    });

    it("recap events are in chronological order", () => {
      tracker.onEncounterStart(1000);

      tracker.processEvent(
        makeEvent({
          timestamp: 1100,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "12345,Bolt,0x20,1000,0,0x20,0,0,0,nil,nil,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1200,
          eventType: "SPELL_HEAL",
          sourceGuid: PLAYER2,
          sourceName: "Priest",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "48071,Flash Heal,0x2,500,0,0,nil",
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1300,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Warrior",
          rawFields: "9000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );

      tracker.processEvent(
        makeEvent({
          timestamp: 1350,
          eventType: "UNIT_DIED",
          destGuid: PLAYER1,
          destName: "Warrior",
        }),
      );

      const deaths = tracker.onEncounterEnd();
      const recap = deaths[0].recap;
      expect(recap[0].timestamp).toBe(1100);
      expect(recap[1].timestamp).toBe(1200);
      expect(recap[2].timestamp).toBe(1300);
    });
  });
});
