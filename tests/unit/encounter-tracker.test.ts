import { describe, it, expect, beforeEach } from "vitest";
import { EncounterTracker } from "../../src/state/encounter-tracker.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";
import { BOSS_DEFAULT_IDLE_MS } from "../../src/data/boss-data.js";

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

// Patchwerk NPC ID: 003E9C → GUID with NPC prefix 0xF130
const PATCHWERK_GUID = "0xF130003E9C000001";
const PLAYER_GUID = "0x0E00000000000001";

// Blood Prince Council NPC IDs (multi-boss)
const VALANAR_GUID = "0xF130009452000001";
const KELESETH_GUID = "0xF130009454000001";
const TALDARAM_GUID = "0xF130009455000001";

// Hodir (coward boss)
const HODIR_GUID = "0xF13000804D000001";

describe("EncounterTracker", () => {
  let tracker: EncounterTracker;

  beforeEach(() => {
    tracker = new EncounterTracker();
  });

  it("starts with no active encounter", () => {
    expect(tracker.isInEncounter()).toBe(false);
    expect(tracker.getCurrentBossName()).toBeNull();
  });

  it("starts encounter when boss GUID appears in a combat event", () => {
    const event = makeEvent({
      timestamp: 1000000,
      eventType: "SPELL_DAMAGE",
      sourceGuid: PLAYER_GUID,
      destGuid: PATCHWERK_GUID,
      destName: "Patchwerk",
      rawFields: "47486,Mortal Strike,1",
    });

    const result = tracker.processEvent(event);

    expect(result.encounterStarted).toBe(true);
    expect(result.encounterEnded).toBe(false);
    expect(result.encounter).toBeNull();
    expect(tracker.isInEncounter()).toBe(true);
    expect(tracker.getCurrentBossName()).toBe("Patchwerk");
  });

  it("does NOT start encounter on non-combat events", () => {
    const event = makeEvent({
      timestamp: 1000000,
      eventType: "COMBATANT_INFO",
      sourceGuid: PLAYER_GUID,
      destGuid: PATCHWERK_GUID,
    });

    const result = tracker.processEvent(event);

    expect(result.encounterStarted).toBe(false);
    expect(tracker.isInEncounter()).toBe(false);
  });

  it("detects boss kill via UNIT_DIED", () => {
    // Start encounter
    tracker.processEvent(
      makeEvent({
        timestamp: 1000000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER_GUID,
        destGuid: PATCHWERK_GUID,
      }),
    );

    // Keep boss active with periodic events (within 30s idle threshold)
    tracker.processEvent(
      makeEvent({
        timestamp: 1025000,
        eventType: "SWING_DAMAGE",
        sourceGuid: PATCHWERK_GUID,
        destGuid: PLAYER_GUID,
      }),
    );

    tracker.processEvent(
      makeEvent({
        timestamp: 1050000,
        eventType: "SWING_DAMAGE",
        sourceGuid: PATCHWERK_GUID,
        destGuid: PLAYER_GUID,
      }),
    );

    // Boss dies
    const result = tracker.processEvent(
      makeEvent({
        timestamp: 1060000,
        eventType: "UNIT_DIED",
        destGuid: PATCHWERK_GUID,
        destName: "Patchwerk",
      }),
    );

    expect(result.encounterEnded).toBe(true);
    expect(result.encounter).not.toBeNull();
    expect(result.encounter!.bossName).toBe("Patchwerk");
    expect(result.encounter!.result).toBe("kill");
    expect(result.encounter!.duration).toBe(60);
    expect(tracker.isInEncounter()).toBe(false);
  });

  it("detects boss kill via PARTY_KILL", () => {
    tracker.processEvent(
      makeEvent({
        timestamp: 1000000,
        eventType: "SWING_DAMAGE",
        sourceGuid: PATCHWERK_GUID,
        destGuid: PLAYER_GUID,
      }),
    );

    // Keep boss active
    tracker.processEvent(
      makeEvent({
        timestamp: 1020000,
        eventType: "SWING_DAMAGE",
        sourceGuid: PATCHWERK_GUID,
        destGuid: PLAYER_GUID,
      }),
    );

    const result = tracker.processEvent(
      makeEvent({
        timestamp: 1045000,
        eventType: "PARTY_KILL",
        sourceGuid: PLAYER_GUID,
        destGuid: PATCHWERK_GUID,
      }),
    );

    expect(result.encounterEnded).toBe(true);
    expect(result.encounter!.result).toBe("kill");
    expect(result.encounter!.duration).toBe(45);
  });

  it("detects wipe via idle timeout", () => {
    const startTs = 1000000;
    tracker.processEvent(
      makeEvent({
        timestamp: startTs,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER_GUID,
        destGuid: PATCHWERK_GUID,
      }),
    );

    // Some boss activity
    tracker.processEvent(
      makeEvent({
        timestamp: startTs + 5000,
        eventType: "SWING_DAMAGE",
        sourceGuid: PATCHWERK_GUID,
        destGuid: PLAYER_GUID,
      }),
    );

    // Event after idle threshold with boss GUID → triggers wipe detection
    const result = tracker.processEvent(
      makeEvent({
        timestamp: startTs + 5000 + BOSS_DEFAULT_IDLE_MS + 1,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER_GUID,
        destGuid: PATCHWERK_GUID,
      }),
    );

    expect(result.encounterEnded).toBe(true);
    expect(result.encounter!.result).toBe("wipe");
    // End time should be the last boss event, not the timeout event
    expect(result.encounter!.bossName).toBe("Patchwerk");
  });

  it("does not end on small gaps within threshold", () => {
    const startTs = 1000000;
    tracker.processEvent(
      makeEvent({
        timestamp: startTs,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER_GUID,
        destGuid: PATCHWERK_GUID,
      }),
    );

    // Boss activity within threshold
    const result = tracker.processEvent(
      makeEvent({
        timestamp: startTs + BOSS_DEFAULT_IDLE_MS - 1,
        eventType: "SWING_DAMAGE",
        sourceGuid: PATCHWERK_GUID,
        destGuid: PLAYER_GUID,
      }),
    );

    expect(result.encounterEnded).toBe(false);
    expect(tracker.isInEncounter()).toBe(true);
  });

  describe("multi-boss encounters", () => {
    it("uses combined encounter name for multi-boss NPCs", () => {
      const result = tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER_GUID,
          destGuid: VALANAR_GUID,
        }),
      );

      expect(result.encounterStarted).toBe(true);
      expect(tracker.getCurrentBossName()).toBe("Blood Prince Council");
    });

    it("keeps encounter active when one of multi-boss NPCs dies", () => {
      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER_GUID,
          destGuid: VALANAR_GUID,
        }),
      );

      // Kill one prince
      const result = tracker.processEvent(
        makeEvent({
          timestamp: 1030000,
          eventType: "UNIT_DIED",
          destGuid: VALANAR_GUID,
        }),
      );

      expect(result.encounterEnded).toBe(false);
      expect(tracker.isInEncounter()).toBe(true);
    });

    it("ends encounter when all multi-boss NPCs are dead", () => {
      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER_GUID,
          destGuid: VALANAR_GUID,
        }),
      );

      // Keep all bosses active
      tracker.processEvent(
        makeEvent({
          timestamp: 1010000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: KELESETH_GUID,
          destGuid: PLAYER_GUID,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1020000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: TALDARAM_GUID,
          destGuid: PLAYER_GUID,
        }),
      );

      // Kill all three
      tracker.processEvent(
        makeEvent({
          timestamp: 1030000,
          eventType: "UNIT_DIED",
          destGuid: VALANAR_GUID,
        }),
      );
      tracker.processEvent(
        makeEvent({
          timestamp: 1031000,
          eventType: "UNIT_DIED",
          destGuid: KELESETH_GUID,
        }),
      );
      const result = tracker.processEvent(
        makeEvent({
          timestamp: 1032000,
          eventType: "UNIT_DIED",
          destGuid: TALDARAM_GUID,
        }),
      );

      expect(result.encounterEnded).toBe(true);
      expect(result.encounter!.bossName).toBe("Blood Prince Council");
      expect(result.encounter!.result).toBe("kill");
    });
  });

  describe("coward boss detection", () => {
    it("detects kill via consecutive SPELL_AURA_REMOVED for coward bosses", () => {
      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER_GUID,
          destGuid: HODIR_GUID,
        }),
      );

      expect(tracker.isInEncounter()).toBe(true);
      expect(tracker.getCurrentBossName()).toBe("Hodir");

      // Keep boss active with periodic damage events
      tracker.processEvent(
        makeEvent({
          timestamp: 1030000,
          eventType: "SWING_DAMAGE",
          sourceGuid: HODIR_GUID,
          destGuid: PLAYER_GUID,
        }),
      );

      // Simulate 15 consecutive SPELL_AURA_REMOVED events from boss
      let result;
      for (let i = 0; i < 15; i++) {
        result = tracker.processEvent(
          makeEvent({
            timestamp: 1055000 + i * 100,
            eventType: "SPELL_AURA_REMOVED",
            sourceGuid: HODIR_GUID,
            destGuid: PLAYER_GUID,
            rawFields: "12345,SomeAura,1",
          }),
        );
      }

      expect(result!.encounterEnded).toBe(true);
      expect(result!.encounter!.result).toBe("kill");
      expect(result!.encounter!.bossName).toBe("Hodir");
    });

    it("resets aura removal count on non-aura-removal events", () => {
      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER_GUID,
          destGuid: HODIR_GUID,
        }),
      );

      // 10 aura removals
      for (let i = 0; i < 10; i++) {
        tracker.processEvent(
          makeEvent({
            timestamp: 1060000 + i * 100,
            eventType: "SPELL_AURA_REMOVED",
            sourceGuid: HODIR_GUID,
            destGuid: PLAYER_GUID,
          }),
        );
      }

      // Non-aura event resets counter
      tracker.processEvent(
        makeEvent({
          timestamp: 1062000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: HODIR_GUID,
          destGuid: PLAYER_GUID,
        }),
      );

      // 5 more aura removals (total since reset = 5, not 15)
      let result;
      for (let i = 0; i < 5; i++) {
        result = tracker.processEvent(
          makeEvent({
            timestamp: 1063000 + i * 100,
            eventType: "SPELL_AURA_REMOVED",
            sourceGuid: HODIR_GUID,
            destGuid: PLAYER_GUID,
          }),
        );
      }

      expect(result!.encounterEnded).toBe(false);
      expect(tracker.isInEncounter()).toBe(true);
    });
  });

  describe("forceEnd", () => {
    it("returns null when no encounter is active", () => {
      expect(tracker.forceEnd(2000000)).toBeNull();
    });

    it("force-ends an active encounter as a wipe", () => {
      tracker.processEvent(
        makeEvent({
          timestamp: 1000000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER_GUID,
          destGuid: PATCHWERK_GUID,
        }),
      );

      const encounter = tracker.forceEnd(1120000);

      expect(encounter).not.toBeNull();
      expect(encounter!.bossName).toBe("Patchwerk");
      expect(encounter!.result).toBe("wipe");
      expect(encounter!.duration).toBe(120);
      expect(tracker.isInEncounter()).toBe(false);
    });
  });

  it("starts a new encounter after idle timeout ends the previous one", () => {
    const startTs = 1000000;

    // Start Patchwerk encounter
    tracker.processEvent(
      makeEvent({
        timestamp: startTs,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER_GUID,
        destGuid: PATCHWERK_GUID,
      }),
    );

    // Event after idle timeout hitting the same boss → ends old, starts new
    const result = tracker.processEvent(
      makeEvent({
        timestamp: startTs + BOSS_DEFAULT_IDLE_MS + 1,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER_GUID,
        destGuid: PATCHWERK_GUID,
      }),
    );

    expect(result.encounterEnded).toBe(true);
    expect(result.encounter!.result).toBe("wipe");
    // The new encounter should be started by _maybeStartNewEncounter
    // but encounterStarted may or may not be set depending on implementation
    // The key check is that after the result, we're in a new encounter
    expect(tracker.isInEncounter()).toBe(true);
  });
});
