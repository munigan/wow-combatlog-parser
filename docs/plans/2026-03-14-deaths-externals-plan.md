# Deaths & Externals Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add DeathTracker and ExternalsTracker to parseLog(), providing player death recaps and external buff tracking per encounter.

**Architecture:** Two new tracker classes following the CombatTracker pattern (processEvent/onEncounterStart/onEncounterEnd/forceEnd/getPlayerSummaries). Both are parseLog-only, instantiated when trackConsumables=true. New spell data file for external buffs.

**Tech Stack:** TypeScript, vitest for tests, tsup build.

---

### Task 1: Add Types to types.ts

**Files:**
- Modify: `src/types.ts`

**Step 1: Add the new interfaces and fields**

Add after the `PlayerCombatStats` interface (line 101):

```typescript
// === Deaths ===

export interface DeathRecapEvent {
  timestamp: number;
  sourceGuid: string;
  sourceName: string;
  spellId: number | null;
  spellName: string;
  amount: number;
  eventType: string;
}

export interface PlayerDeath {
  playerGuid: string;
  playerName: string;
  timestamp: number;
  timeIntoEncounter: number;
  killingBlow: DeathRecapEvent | null;
  recap: DeathRecapEvent[];
}

// === Externals ===

export interface ExternalBuffUse {
  spellId: number;
  spellName: string;
  sourceGuid: string;
  sourceName: string;
  count: number;
  uptimePercent: number;
  intervals: Array<[number, number]>;
}

export interface PlayerExternalsSummary {
  received: ExternalBuffSummary[];
}

export interface ExternalBuffSummary {
  spellId: number;
  spellName: string;
  totalCount: number;
  uptimePercent: number;
}
```

Add to `PlayerInfo` (after `buffUptime?`):

```typescript
  /** Total deaths across all encounters (parseLog only). */
  deathCount?: number;
  /** External buffs received summary (parseLog only). */
  externals?: PlayerExternalsSummary;
```

Add to `EncounterSummary` (after `buffUptime?`):

```typescript
  /** Player deaths during this encounter (parseLog only). */
  deaths?: PlayerDeath[];
  /** External buffs cast on players during this encounter (parseLog only). */
  externals?: Record<string, ExternalBuffUse[]>;
```

**Step 2: Update barrel exports in index.ts**

Add to the type export list in `src/index.ts`:

```typescript
  DeathRecapEvent,
  PlayerDeath,
  ExternalBuffUse,
  PlayerExternalsSummary,
  ExternalBuffSummary,
```

**Step 3: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: PASS (new types are just added, not used yet)

**Step 4: Commit**

```
git add src/types.ts src/index.ts
git commit -m "feat: add types for death tracking and externals tracking"
```

---

### Task 2: Create external-data.ts

**Files:**
- Create: `src/data/external-data.ts`

**Step 1: Write the external spells data file**

Follow the pattern from `consumable-data.ts`. Create `src/data/external-data.ts`:

```typescript
// src/data/external-data.ts

export interface ExternalSpellInfo {
  spellId: number;
  displayName: string;
}

/**
 * Curated list of WotLK external buff spells tracked for the Externals page.
 * Only cross-player applications (source != dest) are recorded.
 */
const EXTERNAL_SPELL_LIST: ExternalSpellInfo[] = [
  // Raid-wide cooldowns
  { spellId: 2825, displayName: "Bloodlust" },
  { spellId: 32182, displayName: "Heroism" },

  // DPS externals
  { spellId: 10060, displayName: "Power Infusion" },
  { spellId: 57934, displayName: "Tricks of the Trade" },
  { spellId: 49016, displayName: "Hysteria" },
  { spellId: 54646, displayName: "Focus Magic" },

  // Healer externals
  { spellId: 29166, displayName: "Innervate" },

  // Tank/utility externals
  { spellId: 34477, displayName: "Misdirection" },
  { spellId: 1038, displayName: "Hand of Salvation" },
  { spellId: 1044, displayName: "Hand of Freedom" },

  // Defensive externals
  { spellId: 6940, displayName: "Hand of Sacrifice" },
  { spellId: 10278, displayName: "Hand of Protection" },
  { spellId: 33206, displayName: "Pain Suppression" },
  { spellId: 47788, displayName: "Guardian Spirit" },
  { spellId: 64205, displayName: "Divine Sacrifice" },
  { spellId: 70940, displayName: "Divine Guardian" },
  { spellId: 3411, displayName: "Intervene" },
];

/** Map of spellId (as string) → ExternalSpellInfo for O(1) lookup. */
export const EXTERNAL_SPELLS = new Map<string, ExternalSpellInfo>(
  EXTERNAL_SPELL_LIST.map((s) => [String(s.spellId), s]),
);
```

**Step 2: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```
git add src/data/external-data.ts
git commit -m "feat: add curated external buff spell data for WotLK"
```

---

### Task 3: Implement DeathTracker with Tests (TDD)

**Files:**
- Create: `src/state/death-tracker.ts`
- Create: `tests/unit/death-tracker.test.ts`

**Step 1: Write failing tests**

Create `tests/unit/death-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { DeathTracker } from "../../src/state/death-tracker.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";

const PLAYER1 = "0x0E00000000000001";
const PLAYER2 = "0x0E00000000000002";
const BOSS_GUID = "0xF130001234000001";
const ENV_GUID = "0x0000000000000000";

function makeEvent(overrides: Partial<LogEvent> & { timestamp: number; eventType: string }): LogEvent {
  return {
    date: "3/12",
    time: "20:00:00.000",
    sourceGuid: ENV_GUID,
    sourceName: "",
    sourceFlags: "0x0000",
    destGuid: ENV_GUID,
    destName: "",
    destFlags: "0x0000",
    rawFields: "",
    ...overrides,
  };
}

describe("DeathTracker", () => {
  let tracker: DeathTracker;

  beforeEach(() => {
    tracker = new DeathTracker();
  });

  describe("basic death tracking", () => {
    it("should record a death on UNIT_DIED for a player", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      // Some damage events
      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "12345,\"Spell\",0x01,5000,-1,0,0,0,0,nil,nil,nil",
      }));

      tracker.processEvent(makeEvent({
        timestamp: startTs + 8000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "12345,\"Spell\",0x01,10000,-1,0,0,0,0,nil,nil,nil",
      }));

      // Player dies
      tracker.processEvent(makeEvent({
        timestamp: startTs + 9000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(1);
      expect(deaths[0].playerGuid).toBe(PLAYER1);
      expect(deaths[0].playerName).toBe("Player1");
      expect(deaths[0].timestamp).toBe(startTs + 9000);
      expect(deaths[0].timeIntoEncounter).toBeCloseTo(9.0, 1);
      expect(deaths[0].recap).toHaveLength(2);
      expect(deaths[0].killingBlow).not.toBeNull();
      expect(deaths[0].killingBlow!.amount).toBe(10000);
      expect(deaths[0].killingBlow!.spellName).toBe("Spell");
    });

    it("should record SWING_DAMAGE in recap with spellName 'Melee'", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SWING_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "3000,-1,0,0,0,0,nil,nil,nil",
      }));

      tracker.processEvent(makeEvent({
        timestamp: startTs + 6000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      const deaths = tracker.onEncounterEnd();
      expect(deaths[0].killingBlow!.spellId).toBeNull();
      expect(deaths[0].killingBlow!.spellName).toBe("Melee");
      expect(deaths[0].killingBlow!.amount).toBe(3000);
    });

    it("should record ENVIRONMENTAL_DAMAGE in recap", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "ENVIRONMENTAL_DAMAGE",
        sourceGuid: ENV_GUID,
        sourceName: "",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "FALLING,2000,-1,0,0,0,0,nil,nil,nil",
      }));

      tracker.processEvent(makeEvent({
        timestamp: startTs + 6000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      const deaths = tracker.onEncounterEnd();
      expect(deaths[0].killingBlow!.spellName).toBe("Environmental");
      expect(deaths[0].killingBlow!.amount).toBe(2000);
    });

    it("should include healing events as negative amounts in recap", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      tracker.processEvent(makeEvent({
        timestamp: startTs + 3000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "12345,\"Nuke\",0x01,8000,-1,0,0,0,0,nil,nil,nil",
      }));

      tracker.processEvent(makeEvent({
        timestamp: startTs + 4000,
        eventType: "SPELL_HEAL",
        sourceGuid: PLAYER2,
        sourceName: "Healer",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "99999,\"Flash Heal\",0x02,5000,1000,0",
      }));

      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "12345,\"Nuke\",0x01,20000,-1,0,0,0,0,nil,nil,nil",
      }));

      tracker.processEvent(makeEvent({
        timestamp: startTs + 6000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      const deaths = tracker.onEncounterEnd();
      expect(deaths[0].recap).toHaveLength(3);
      // Heal should be negative
      expect(deaths[0].recap[1].amount).toBe(-5000);
      expect(deaths[0].recap[1].eventType).toBe("SPELL_HEAL");
      expect(deaths[0].recap[1].spellName).toBe("Flash Heal");
      // Killing blow should be the last damage
      expect(deaths[0].killingBlow!.amount).toBe(20000);
    });
  });

  describe("rolling buffer", () => {
    it("should keep only last 10 events per player", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      // 15 damage events
      for (let i = 0; i < 15; i++) {
        tracker.processEvent(makeEvent({
          timestamp: startTs + i * 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          sourceName: "Boss",
          destGuid: PLAYER1,
          destName: "Player1",
          destFlags: "0x0514",
          rawFields: `12345,"Spell",0x01,${(i + 1) * 100},-1,0,0,0,0,nil,nil,nil`,
        }));
      }

      tracker.processEvent(makeEvent({
        timestamp: startTs + 16000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      const deaths = tracker.onEncounterEnd();
      expect(deaths[0].recap).toHaveLength(10);
      // Oldest kept should be event index 5 (amount=600)
      expect(deaths[0].recap[0].amount).toBe(600);
      // Most recent should be event index 14 (amount=1500)
      expect(deaths[0].recap[9].amount).toBe(1500);
    });
  });

  describe("multiple deaths", () => {
    it("should record multiple deaths for the same player", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      // First death
      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SWING_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "3000,-1,0,0,0,0,nil,nil,nil",
      }));
      tracker.processEvent(makeEvent({
        timestamp: startTs + 6000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      // Second death (after battle rez)
      tracker.processEvent(makeEvent({
        timestamp: startTs + 30000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "12345,\"Nuke\",0x01,50000,-1,0,0,0,0,nil,nil,nil",
      }));
      tracker.processEvent(makeEvent({
        timestamp: startTs + 31000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(2);
      expect(deaths[0].timeIntoEncounter).toBeCloseTo(6.0, 1);
      expect(deaths[1].timeIntoEncounter).toBeCloseTo(31.0, 1);
    });

    it("should track deaths independently per player", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SWING_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "3000,-1,0,0,0,0,nil,nil,nil",
      }));
      tracker.processEvent(makeEvent({
        timestamp: startTs + 6000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      tracker.processEvent(makeEvent({
        timestamp: startTs + 7000,
        eventType: "SWING_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER2,
        destName: "Player2",
        destFlags: "0x0514",
        rawFields: "5000,-1,0,0,0,0,nil,nil,nil",
      }));
      tracker.processEvent(makeEvent({
        timestamp: startTs + 8000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER2,
        destName: "Player2",
        destFlags: "0x0514",
      }));

      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(2);
      expect(deaths[0].playerName).toBe("Player1");
      expect(deaths[1].playerName).toBe("Player2");
    });
  });

  describe("lifecycle", () => {
    it("should ignore events outside encounters", () => {
      tracker.processEvent(makeEvent({
        timestamp: 1000000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "12345,\"Spell\",0x01,5000,-1,0,0,0,0,nil,nil,nil",
      }));

      tracker.processEvent(makeEvent({
        timestamp: 1001000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      // Start and end an encounter with no events
      tracker.onEncounterStart(2000000);
      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(0);
    });

    it("should reset between encounters", () => {
      const startTs1 = 1000000;
      tracker.onEncounterStart(startTs1);

      tracker.processEvent(makeEvent({
        timestamp: startTs1 + 5000,
        eventType: "SWING_DAMAGE",
        sourceGuid: BOSS_GUID,
        sourceName: "Boss",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: "3000,-1,0,0,0,0,nil,nil,nil",
      }));
      tracker.processEvent(makeEvent({
        timestamp: startTs1 + 6000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));

      const deaths1 = tracker.onEncounterEnd();
      expect(deaths1).toHaveLength(1);

      // Second encounter — no deaths
      tracker.onEncounterStart(2000000);
      const deaths2 = tracker.onEncounterEnd();
      expect(deaths2).toHaveLength(0);
    });

    it("should aggregate death counts across encounters via getPlayerSummaries", () => {
      // Encounter 1 — player1 dies once
      tracker.onEncounterStart(1000000);
      tracker.processEvent(makeEvent({
        timestamp: 1005000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));
      tracker.onEncounterEnd();

      // Encounter 2 — player1 dies twice, player2 dies once
      tracker.onEncounterStart(2000000);
      tracker.processEvent(makeEvent({
        timestamp: 2005000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));
      tracker.processEvent(makeEvent({
        timestamp: 2010000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));
      tracker.processEvent(makeEvent({
        timestamp: 2015000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER2,
        destName: "Player2",
        destFlags: "0x0514",
      }));
      tracker.onEncounterEnd();

      const summaries = tracker.getPlayerSummaries();
      expect(summaries.get(PLAYER1)).toBe(3);
      expect(summaries.get(PLAYER2)).toBe(1);
    });

    it("should handle forceEnd mid-encounter", () => {
      tracker.onEncounterStart(1000000);
      tracker.processEvent(makeEvent({
        timestamp: 1005000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));
      const deaths = tracker.forceEnd();
      expect(deaths).not.toBeNull();
      expect(deaths!).toHaveLength(1);
    });

    it("should return null from forceEnd when not in encounter", () => {
      expect(tracker.forceEnd()).toBeNull();
    });

    it("should ignore UNIT_DIED for non-player GUIDs", () => {
      tracker.onEncounterStart(1000000);
      tracker.processEvent(makeEvent({
        timestamp: 1005000,
        eventType: "UNIT_DIED",
        destGuid: BOSS_GUID,
        destName: "Boss",
        destFlags: "0x0000",
      }));
      const deaths = tracker.onEncounterEnd();
      expect(deaths).toHaveLength(0);
    });
  });

  describe("mysterious death", () => {
    it("should record death with null killingBlow when buffer is empty", () => {
      tracker.onEncounterStart(1000000);
      tracker.processEvent(makeEvent({
        timestamp: 1005000,
        eventType: "UNIT_DIED",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
      }));
      const deaths = tracker.onEncounterEnd();
      expect(deaths[0].killingBlow).toBeNull();
      expect(deaths[0].recap).toHaveLength(0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/unit/death-tracker.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement DeathTracker**

Create `src/state/death-tracker.ts`:

```typescript
// src/state/death-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import type { PlayerDeath, DeathRecapEvent } from "../types.js";
import { isPlayer } from "../utils/guid.js";
import { getSpellId } from "../pipeline/line-parser.js";

const BUFFER_SIZE = 10;

/** Damage event types that go into the death recap buffer. */
const DAMAGE_EVENTS = new Set([
  "SWING_DAMAGE",
  "SPELL_DAMAGE",
  "SPELL_PERIODIC_DAMAGE",
  "RANGE_DAMAGE",
  "DAMAGE_SHIELD",
  "ENVIRONMENTAL_DAMAGE",
]);

/** Healing event types that go into the death recap buffer (stored as negative amounts). */
const HEAL_EVENTS = new Set([
  "SPELL_HEAL",
  "SPELL_PERIODIC_HEAL",
]);

/**
 * Extract a numeric field from a comma-separated rawFields string by index.
 * Same logic as CombatTracker's extractFieldInt.
 */
function extractFieldInt(rawFields: string, index: number): number {
  let start = 0;
  for (let i = 0; i < index; i++) {
    const comma = rawFields.indexOf(",", start);
    if (comma === -1) return 0;
    start = comma + 1;
  }
  const end = rawFields.indexOf(",", start);
  const field = end === -1 ? rawFields.substring(start) : rawFields.substring(start, end);
  if (field === "" || field === "nil") return 0;
  const n = parseInt(field, 10);
  return isNaN(n) ? 0 : n;
}

/** Circular buffer for recent events per player. */
class RollingBuffer {
  private _items: DeathRecapEvent[] = [];
  private _head = 0;
  private _count = 0;

  constructor(private _size: number) {
    this._items = new Array(_size);
  }

  push(item: DeathRecapEvent): void {
    this._items[this._head] = item;
    this._head = (this._head + 1) % this._size;
    if (this._count < this._size) this._count++;
  }

  snapshot(): DeathRecapEvent[] {
    if (this._count === 0) return [];
    const result: DeathRecapEvent[] = [];
    const start = this._count < this._size ? 0 : this._head;
    for (let i = 0; i < this._count; i++) {
      result.push(this._items[(start + i) % this._size]);
    }
    return result;
  }

  clear(): void {
    this._head = 0;
    this._count = 0;
  }
}

export class DeathTracker {
  private _inEncounter = false;
  private _encounterStartTs = 0;
  private _buffers = new Map<string, RollingBuffer>();
  private _currentDeaths: PlayerDeath[] = [];
  private _completedEncounters: PlayerDeath[][] = [];

  processEvent(event: LogEvent): void {
    if (!this._inEncounter) return;

    const eventType = event.eventType;

    // Handle UNIT_DIED for players
    if (eventType === "UNIT_DIED" && isPlayer(event.destGuid)) {
      const buffer = this._buffers.get(event.destGuid);
      const recap = buffer !== undefined ? buffer.snapshot() : [];

      // Find last damage event for killing blow
      let killingBlow: DeathRecapEvent | null = null;
      for (let i = recap.length - 1; i >= 0; i--) {
        if (recap[i].amount > 0) {
          killingBlow = recap[i];
          break;
        }
      }

      this._currentDeaths.push({
        playerGuid: event.destGuid,
        playerName: event.destName,
        timestamp: event.timestamp,
        timeIntoEncounter: Math.round(event.timestamp - this._encounterStartTs) / 1000,
        killingBlow,
        recap,
      });

      // Reset buffer for this player (they might get battle-rezzed)
      if (buffer !== undefined) buffer.clear();
      return;
    }

    // Buffer damage events where dest is a player
    if (DAMAGE_EVENTS.has(eventType) && isPlayer(event.destGuid)) {
      const recapEvent = this._buildDamageRecapEvent(event);
      if (recapEvent !== null) {
        this._getBuffer(event.destGuid).push(recapEvent);
      }
      return;
    }

    // Buffer healing events where dest is a player
    if (HEAL_EVENTS.has(eventType) && isPlayer(event.destGuid)) {
      const recapEvent = this._buildHealRecapEvent(event);
      if (recapEvent !== null) {
        this._getBuffer(event.destGuid).push(recapEvent);
      }
    }
  }

  onEncounterStart(startTimestamp: number): void {
    this._inEncounter = true;
    this._encounterStartTs = startTimestamp;
    this._buffers.clear();
    this._currentDeaths = [];
  }

  onEncounterEnd(): PlayerDeath[] {
    this._inEncounter = false;
    const result = this._currentDeaths;
    this._completedEncounters.push(result);
    this._currentDeaths = [];
    this._buffers.clear();
    return result;
  }

  forceEnd(): PlayerDeath[] | null {
    if (!this._inEncounter) return null;
    return this.onEncounterEnd();
  }

  getPlayerSummaries(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const deaths of this._completedEncounters) {
      for (const death of deaths) {
        counts.set(death.playerGuid, (counts.get(death.playerGuid) ?? 0) + 1);
      }
    }
    return counts;
  }

  private _getBuffer(playerGuid: string): RollingBuffer {
    let buf = this._buffers.get(playerGuid);
    if (buf === undefined) {
      buf = new RollingBuffer(BUFFER_SIZE);
      this._buffers.set(playerGuid, buf);
    }
    return buf;
  }

  private _buildDamageRecapEvent(event: LogEvent): DeathRecapEvent | null {
    const eventType = event.eventType;

    if (eventType === "SWING_DAMAGE") {
      const amount = extractFieldInt(event.rawFields, 0);
      if (amount <= 0) return null;
      return {
        timestamp: event.timestamp,
        sourceGuid: event.sourceGuid,
        sourceName: event.sourceName,
        spellId: null,
        spellName: "Melee",
        amount,
        eventType,
      };
    }

    if (eventType === "ENVIRONMENTAL_DAMAGE") {
      // rawFields: "FALLING,amount,overkill,..."
      const amount = extractFieldInt(event.rawFields, 1);
      if (amount <= 0) return null;
      return {
        timestamp: event.timestamp,
        sourceGuid: event.sourceGuid,
        sourceName: event.sourceName,
        spellId: null,
        spellName: "Environmental",
        amount,
        eventType,
      };
    }

    // Spell-based damage: spellId,spellName,spellSchool,amount,overkill,...
    const spellIdStr = getSpellId(event);
    const spellId = spellIdStr !== null ? parseInt(spellIdStr, 10) : null;
    const amount = extractFieldInt(event.rawFields, 3);
    if (amount <= 0) return null;

    // Extract spell name from rawFields (field index 1)
    const spellName = this._extractSpellName(event.rawFields);

    return {
      timestamp: event.timestamp,
      sourceGuid: event.sourceGuid,
      sourceName: event.sourceName,
      spellId: spellId !== null && !isNaN(spellId) ? spellId : null,
      spellName,
      amount,
      eventType,
    };
  }

  private _buildHealRecapEvent(event: LogEvent): DeathRecapEvent | null {
    // Spell heal: spellId,spellName,spellSchool,amount,overhealing,absorbed,critical
    const spellIdStr = getSpellId(event);
    const spellId = spellIdStr !== null ? parseInt(spellIdStr, 10) : null;
    const amount = extractFieldInt(event.rawFields, 3);
    if (amount <= 0) return null;

    const spellName = this._extractSpellName(event.rawFields);

    return {
      timestamp: event.timestamp,
      sourceGuid: event.sourceGuid,
      sourceName: event.sourceName,
      spellId: spellId !== null && !isNaN(spellId) ? spellId : null,
      spellName,
      amount: -amount, // negative for healing
      eventType: event.eventType,
    };
  }

  /** Extract spell name from rawFields index 1 (second comma-separated field). */
  private _extractSpellName(rawFields: string): string {
    const firstComma = rawFields.indexOf(",");
    if (firstComma === -1) return "Unknown";
    const start = firstComma + 1;
    const secondComma = rawFields.indexOf(",", start);
    let name = secondComma === -1 ? rawFields.substring(start) : rawFields.substring(start, secondComma);
    // Strip quotes
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.substring(1, name.length - 1);
    }
    return name || "Unknown";
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm run test -- tests/unit/death-tracker.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add src/state/death-tracker.ts tests/unit/death-tracker.test.ts
git commit -m "feat: implement DeathTracker with death recap buffer"
```

---

### Task 4: Implement ExternalsTracker with Tests (TDD)

**Files:**
- Create: `src/state/externals-tracker.ts`
- Create: `tests/unit/externals-tracker.test.ts`

**Step 1: Write failing tests**

Create `tests/unit/externals-tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { ExternalsTracker } from "../../src/state/externals-tracker.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";

const PLAYER1 = "0x0E00000000000001";
const PLAYER2 = "0x0E00000000000002";
const PLAYER3 = "0x0E00000000000003";
const NULL_GUID = "0x0000000000000000";

// Known external spell IDs
const TRICKS_ID = "57934";
const BLOODLUST_ID = "2825";
const POWER_INFUSION_ID = "10060";
const INNERVATE_ID = "29166";

function makeEvent(overrides: Partial<LogEvent> & { timestamp: number; eventType: string }): LogEvent {
  return {
    date: "3/12",
    time: "20:00:00.000",
    sourceGuid: NULL_GUID,
    sourceName: "",
    sourceFlags: "0x0000",
    destGuid: NULL_GUID,
    destName: "",
    destFlags: "0x0000",
    rawFields: "",
    ...overrides,
  };
}

describe("ExternalsTracker", () => {
  let tracker: ExternalsTracker;

  beforeEach(() => {
    tracker = new ExternalsTracker();
  });

  describe("basic tracking", () => {
    it("should record an external buff applied by one player to another", () => {
      const startTs = 1000000;
      const encounterDurationMs = 60000;
      tracker.onEncounterStart(startTs);

      // Rogue casts Tricks on Player1
      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));

      // Buff removed after 6 seconds
      tracker.processEvent(makeEvent({
        timestamp: startTs + 11000,
        eventType: "SPELL_AURA_REMOVED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));

      const externals = tracker.onEncounterEnd(startTs + encounterDurationMs, encounterDurationMs);
      const player1Externals = externals[PLAYER1];
      expect(player1Externals).toBeDefined();
      expect(player1Externals).toHaveLength(1);
      expect(player1Externals[0].spellId).toBe(57934);
      expect(player1Externals[0].spellName).toBe("Tricks of the Trade");
      expect(player1Externals[0].sourceGuid).toBe(PLAYER2);
      expect(player1Externals[0].sourceName).toBe("Rogue");
      expect(player1Externals[0].count).toBe(1);
      expect(player1Externals[0].intervals).toHaveLength(1);
      expect(player1Externals[0].intervals[0][0]).toBe(startTs + 5000);
      expect(player1Externals[0].intervals[0][1]).toBe(startTs + 11000);
      expect(player1Externals[0].uptimePercent).toBeCloseTo(10.0, 1);
    });

    it("should ignore self-buffs (source == dest)", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        sourceName: "Shaman",
        destGuid: PLAYER1,
        destName: "Shaman",
        destFlags: "0x0514",
        rawFields: `${BLOODLUST_ID},"Bloodlust",0x01,BUFF`,
      }));

      const externals = tracker.onEncounterEnd(startTs + 60000, 60000);
      expect(externals[PLAYER1]).toBeUndefined();
    });

    it("should ignore spells not in the external list", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Player2",
        destGuid: PLAYER1,
        destName: "Player1",
        destFlags: "0x0514",
        rawFields: `99999,"Random Buff",0x01,BUFF`,
      }));

      const externals = tracker.onEncounterEnd(startTs + 60000, 60000);
      expect(externals[PLAYER1]).toBeUndefined();
    });
  });

  describe("multiple applications", () => {
    it("should count multiple applications from same source", () => {
      const startTs = 1000000;
      const encounterDurationMs = 60000;
      tracker.onEncounterStart(startTs);

      // First application
      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      tracker.processEvent(makeEvent({
        timestamp: startTs + 11000,
        eventType: "SPELL_AURA_REMOVED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));

      // Second application
      tracker.processEvent(makeEvent({
        timestamp: startTs + 20000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      tracker.processEvent(makeEvent({
        timestamp: startTs + 26000,
        eventType: "SPELL_AURA_REMOVED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));

      const externals = tracker.onEncounterEnd(startTs + encounterDurationMs, encounterDurationMs);
      expect(externals[PLAYER1][0].count).toBe(2);
      expect(externals[PLAYER1][0].intervals).toHaveLength(2);
      // Uptime = (6000 + 6000) / 60000 * 100 = 20%
      expect(externals[PLAYER1][0].uptimePercent).toBeCloseTo(20.0, 1);
    });

    it("should track same spell from different sources separately", () => {
      const startTs = 1000000;
      tracker.onEncounterStart(startTs);

      // Shaman1 casts Bloodlust, Player1 and Player2 get the aura
      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER3,
        sourceName: "Shaman",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${BLOODLUST_ID},"Bloodlust",0x01,BUFF`,
      }));
      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER3,
        sourceName: "Shaman",
        destGuid: PLAYER2,
        destName: "Player2",
        rawFields: `${BLOODLUST_ID},"Bloodlust",0x01,BUFF`,
      }));

      const externals = tracker.onEncounterEnd(startTs + 60000, 60000);
      expect(externals[PLAYER1]).toHaveLength(1);
      expect(externals[PLAYER2]).toHaveLength(1);
      expect(externals[PLAYER1][0].sourceName).toBe("Shaman");
    });
  });

  describe("interval closing", () => {
    it("should close open intervals at encounter end", () => {
      const startTs = 1000000;
      const encounterDurationMs = 60000;
      tracker.onEncounterStart(startTs);

      // Buff applied but never removed during encounter
      tracker.processEvent(makeEvent({
        timestamp: startTs + 5000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Priest",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${POWER_INFUSION_ID},"Power Infusion",0x01,BUFF`,
      }));

      const externals = tracker.onEncounterEnd(startTs + encounterDurationMs, encounterDurationMs);
      expect(externals[PLAYER1][0].intervals[0][1]).toBe(startTs + encounterDurationMs);
      // Uptime = 55000 / 60000 * 100 ≈ 91.7%
      expect(externals[PLAYER1][0].uptimePercent).toBeCloseTo(91.67, 0);
    });
  });

  describe("buff active at encounter start", () => {
    it("should capture externals that were active before encounter started", () => {
      // Buff applied before encounter
      tracker.processEvent(makeEvent({
        timestamp: 500000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Priest",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${POWER_INFUSION_ID},"Power Infusion",0x01,BUFF`,
      }));

      const startTs = 1000000;
      const encounterDurationMs = 60000;
      tracker.onEncounterStart(startTs);

      // Buff removed mid-encounter
      tracker.processEvent(makeEvent({
        timestamp: startTs + 10000,
        eventType: "SPELL_AURA_REMOVED",
        sourceGuid: PLAYER2,
        sourceName: "Priest",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${POWER_INFUSION_ID},"Power Infusion",0x01,BUFF`,
      }));

      const externals = tracker.onEncounterEnd(startTs + encounterDurationMs, encounterDurationMs);
      expect(externals[PLAYER1]).toHaveLength(1);
      // Interval should start at encounter start, not at original apply time
      expect(externals[PLAYER1][0].intervals[0][0]).toBe(startTs);
      expect(externals[PLAYER1][0].intervals[0][1]).toBe(startTs + 10000);
      expect(externals[PLAYER1][0].count).toBe(1);
    });
  });

  describe("lifecycle", () => {
    it("should reset between encounters", () => {
      const startTs1 = 1000000;
      tracker.onEncounterStart(startTs1);
      tracker.processEvent(makeEvent({
        timestamp: startTs1 + 5000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      tracker.onEncounterEnd(startTs1 + 60000, 60000);

      // Second encounter — no externals
      tracker.onEncounterStart(2000000);
      const externals = tracker.onEncounterEnd(2060000, 60000);
      expect(Object.keys(externals)).toHaveLength(0);
    });

    it("should aggregate counts across encounters via getPlayerSummaries", () => {
      // Encounter 1
      tracker.onEncounterStart(1000000);
      tracker.processEvent(makeEvent({
        timestamp: 1005000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      tracker.processEvent(makeEvent({
        timestamp: 1011000,
        eventType: "SPELL_AURA_REMOVED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      tracker.onEncounterEnd(1060000, 60000);

      // Encounter 2 — tricks twice
      tracker.onEncounterStart(2000000);
      tracker.processEvent(makeEvent({
        timestamp: 2005000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      tracker.processEvent(makeEvent({
        timestamp: 2011000,
        eventType: "SPELL_AURA_REMOVED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      tracker.processEvent(makeEvent({
        timestamp: 2020000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      tracker.processEvent(makeEvent({
        timestamp: 2026000,
        eventType: "SPELL_AURA_REMOVED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      tracker.onEncounterEnd(2060000, 60000);

      const totalEncounterDurationMs = 120000; // 2 * 60s
      const summaries = tracker.getPlayerSummaries(totalEncounterDurationMs);
      const player1 = summaries.get(PLAYER1);
      expect(player1).toBeDefined();
      expect(player1!.received).toHaveLength(1);
      expect(player1!.received[0].totalCount).toBe(3);
      expect(player1!.received[0].spellName).toBe("Tricks of the Trade");
      // Total uptime = 6000 + 6000 + 6000 = 18000ms across 120000ms = 15%
      expect(player1!.received[0].uptimePercent).toBeCloseTo(15.0, 1);
    });

    it("should handle forceEnd mid-encounter", () => {
      tracker.onEncounterStart(1000000);
      tracker.processEvent(makeEvent({
        timestamp: 1005000,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER2,
        sourceName: "Rogue",
        destGuid: PLAYER1,
        destName: "Player1",
        rawFields: `${TRICKS_ID},"Tricks of the Trade",0x01,BUFF`,
      }));
      const externals = tracker.forceEnd(1060000, 60000);
      expect(externals).not.toBeNull();
      expect(externals![PLAYER1]).toHaveLength(1);
    });

    it("should return null from forceEnd when not in encounter", () => {
      expect(tracker.forceEnd(0, 0)).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/unit/externals-tracker.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement ExternalsTracker**

Create `src/state/externals-tracker.ts`:

```typescript
// src/state/externals-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import type { ExternalBuffUse, PlayerExternalsSummary, ExternalBuffSummary } from "../types.js";
import { isPlayer } from "../utils/guid.js";
import { getSpellId } from "../pipeline/line-parser.js";
import { EXTERNAL_SPELLS } from "../data/external-data.js";

/** Keyed by "destGuid:spellId:sourceGuid" */
interface ActiveAura {
  spellId: number;
  spellName: string;
  sourceGuid: string;
  sourceName: string;
  destGuid: string;
  startTimestamp: number;
}

/** Internal accumulator for per-encounter tracking. */
interface InternalExternalUse {
  spellId: number;
  spellName: string;
  sourceGuid: string;
  sourceName: string;
  count: number;
  intervals: Array<[number, number]>;
}

/** Per-encounter externals keyed by destPlayerGuid. */
export type EncounterExternals = Record<string, ExternalBuffUse[]>;

const AURA_EVENTS = new Set([
  "SPELL_AURA_APPLIED",
  "SPELL_AURA_REMOVED",
  "SPELL_AURA_REFRESH",
]);

export class ExternalsTracker {
  /** Persistent: currently active external auras. Key: "destGuid:spellId:sourceGuid" */
  private _activeAuras = new Map<string, ActiveAura>();
  private _inEncounter = false;
  private _encounterStartTs = 0;
  /** Per-encounter accumulator. Outer key: destGuid, inner key: "spellId:sourceGuid" */
  private _currentEncounter = new Map<string, Map<string, InternalExternalUse>>();
  private _completedEncounters: EncounterExternals[] = [];

  processEvent(event: LogEvent): void {
    if (!AURA_EVENTS.has(event.eventType)) return;

    // Only track player targets
    if (!isPlayer(event.destGuid)) return;

    // Check if this is an external spell
    const spellIdStr = getSpellId(event);
    if (spellIdStr === null) return;
    const spellInfo = EXTERNAL_SPELLS.get(spellIdStr);
    if (spellInfo === undefined) return;

    // Ignore self-buffs
    if (event.sourceGuid === event.destGuid) return;
    // Ignore if source is not a player (e.g., NPC casts)
    if (!isPlayer(event.sourceGuid)) return;

    const auraKey = `${event.destGuid}:${spellIdStr}:${event.sourceGuid}`;
    const spellId = parseInt(spellIdStr, 10);

    if (event.eventType === "SPELL_AURA_APPLIED") {
      // Close any existing aura (shouldn't happen often, but handle duplicate applies)
      const existing = this._activeAuras.get(auraKey);
      if (existing !== undefined && this._inEncounter) {
        this._closeInterval(existing, event.timestamp);
      }

      // Record new active aura
      this._activeAuras.set(auraKey, {
        spellId,
        spellName: spellInfo.displayName,
        sourceGuid: event.sourceGuid,
        sourceName: event.sourceName,
        destGuid: event.destGuid,
        startTimestamp: event.timestamp,
      });

      // If in encounter, record the application
      if (this._inEncounter) {
        this._recordApplication(event.destGuid, spellIdStr, event.sourceGuid, {
          spellId,
          spellName: spellInfo.displayName,
          sourceGuid: event.sourceGuid,
          sourceName: event.sourceName,
        }, event.timestamp);
      }
    } else if (event.eventType === "SPELL_AURA_REMOVED") {
      const aura = this._activeAuras.get(auraKey);
      if (aura !== undefined) {
        if (this._inEncounter) {
          this._closeInterval(aura, event.timestamp);
        }
        this._activeAuras.delete(auraKey);
      }
    } else if (event.eventType === "SPELL_AURA_REFRESH") {
      // Refresh means the aura is still active — no action needed for intervals.
      // But if there's no active aura tracked (e.g., it was applied before tracking started),
      // we should start tracking it.
      if (!this._activeAuras.has(auraKey)) {
        this._activeAuras.set(auraKey, {
          spellId,
          spellName: spellInfo.displayName,
          sourceGuid: event.sourceGuid,
          sourceName: event.sourceName,
          destGuid: event.destGuid,
          startTimestamp: event.timestamp,
        });
        if (this._inEncounter) {
          this._recordApplication(event.destGuid, spellIdStr, event.sourceGuid, {
            spellId,
            spellName: spellInfo.displayName,
            sourceGuid: event.sourceGuid,
            sourceName: event.sourceName,
          }, event.timestamp);
        }
      }
    }
  }

  onEncounterStart(startTimestamp: number): void {
    this._inEncounter = true;
    this._encounterStartTs = startTimestamp;
    this._currentEncounter.clear();

    // Check for any already-active external auras and record them
    for (const [, aura] of this._activeAuras) {
      const spellIdStr = String(aura.spellId);
      this._recordApplication(aura.destGuid, spellIdStr, aura.sourceGuid, {
        spellId: aura.spellId,
        spellName: aura.spellName,
        sourceGuid: aura.sourceGuid,
        sourceName: aura.sourceName,
      }, startTimestamp);
    }
  }

  onEncounterEnd(endTimestamp: number, durationMs: number): EncounterExternals {
    this._inEncounter = false;

    // Close any open intervals at encounter end
    for (const [, aura] of this._activeAuras) {
      this._closeInterval(aura, endTimestamp);
    }

    // Build result
    const result: EncounterExternals = {};
    for (const [destGuid, spellMap] of this._currentEncounter) {
      const uses: ExternalBuffUse[] = [];
      for (const [, internal] of spellMap) {
        const totalUptimeMs = internal.intervals.reduce(
          (sum, [start, end]) => sum + (end - start), 0,
        );
        uses.push({
          spellId: internal.spellId,
          spellName: internal.spellName,
          sourceGuid: internal.sourceGuid,
          sourceName: internal.sourceName,
          count: internal.count,
          uptimePercent: durationMs > 0
            ? Math.round((totalUptimeMs / durationMs) * 100 * 100) / 100
            : 0,
          intervals: internal.intervals,
        });
      }
      if (uses.length > 0) {
        result[destGuid] = uses;
      }
    }

    this._completedEncounters.push(result);
    this._currentEncounter.clear();
    return result;
  }

  forceEnd(endTimestamp: number, durationMs: number): EncounterExternals | null {
    if (!this._inEncounter) return null;
    return this.onEncounterEnd(endTimestamp, durationMs);
  }

  getPlayerSummaries(totalEncounterDurationMs: number): Map<string, PlayerExternalsSummary> {
    // Aggregate across all completed encounters
    // Key: destGuid -> spellId -> { totalCount, totalUptimeMs, spellName }
    const aggregated = new Map<string, Map<number, { spellName: string; totalCount: number; totalUptimeMs: number }>>();

    for (const encounter of this._completedEncounters) {
      for (const [destGuid, uses] of Object.entries(encounter)) {
        let spellMap = aggregated.get(destGuid);
        if (spellMap === undefined) {
          spellMap = new Map();
          aggregated.set(destGuid, spellMap);
        }
        for (const use of uses) {
          const existing = spellMap.get(use.spellId);
          const uptimeMs = use.intervals.reduce(
            (sum, [start, end]) => sum + (end - start), 0,
          );
          if (existing !== undefined) {
            existing.totalCount += use.count;
            existing.totalUptimeMs += uptimeMs;
          } else {
            spellMap.set(use.spellId, {
              spellName: use.spellName,
              totalCount: use.count,
              totalUptimeMs: uptimeMs,
            });
          }
        }
      }
    }

    const summaries = new Map<string, PlayerExternalsSummary>();
    for (const [destGuid, spellMap] of aggregated) {
      const received: ExternalBuffSummary[] = [];
      for (const [spellId, data] of spellMap) {
        received.push({
          spellId,
          spellName: data.spellName,
          totalCount: data.totalCount,
          uptimePercent: totalEncounterDurationMs > 0
            ? Math.round((data.totalUptimeMs / totalEncounterDurationMs) * 100 * 100) / 100
            : 0,
        });
      }
      // Sort by totalCount descending
      received.sort((a, b) => b.totalCount - a.totalCount);
      summaries.set(destGuid, { received });
    }

    return summaries;
  }

  private _recordApplication(
    destGuid: string,
    spellIdStr: string,
    sourceGuid: string,
    info: { spellId: number; spellName: string; sourceGuid: string; sourceName: string },
    timestamp: number,
  ): void {
    let spellMap = this._currentEncounter.get(destGuid);
    if (spellMap === undefined) {
      spellMap = new Map();
      this._currentEncounter.set(destGuid, spellMap);
    }

    const key = `${spellIdStr}:${sourceGuid}`;
    let use = spellMap.get(key);
    if (use === undefined) {
      use = {
        spellId: info.spellId,
        spellName: info.spellName,
        sourceGuid: info.sourceGuid,
        sourceName: info.sourceName,
        count: 1,
        intervals: [[timestamp, -1]], // -1 = open interval
      };
      spellMap.set(key, use);
    } else {
      use.count++;
      use.intervals.push([timestamp, -1]);
    }
  }

  private _closeInterval(aura: ActiveAura, endTimestamp: number): void {
    const spellMap = this._currentEncounter.get(aura.destGuid);
    if (spellMap === undefined) return;

    const key = `${aura.spellId}:${aura.sourceGuid}`;
    const use = spellMap.get(key);
    if (use === undefined) return;

    // Find the last open interval and close it
    for (let i = use.intervals.length - 1; i >= 0; i--) {
      if (use.intervals[i][1] === -1) {
        use.intervals[i][1] = endTimestamp;
        return;
      }
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm run test -- tests/unit/externals-tracker.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```
git add src/state/externals-tracker.ts tests/unit/externals-tracker.test.ts
git commit -m "feat: implement ExternalsTracker with interval-based uptime tracking"
```

---

### Task 5: Integrate Trackers into State Machine

**Files:**
- Modify: `src/state/state-machine.ts`

**Step 1: Add imports and fields**

Add imports at the top of `state-machine.ts`:

```typescript
import { DeathTracker } from "./death-tracker.js";
import { ExternalsTracker } from "./externals-tracker.js";
```

Add type imports:

```typescript
import type { ..., PlayerDeath, ExternalBuffUse, PlayerExternalsSummary } from "../types.js";
```

Add nullable fields after `_buffUptimeTracker`:

```typescript
private _deathTracker: DeathTracker | null = null;
private _externalsTracker: ExternalsTracker | null = null;
```

In constructor, inside `if (trackConsumables)`:

```typescript
this._deathTracker = new DeathTracker();
this._externalsTracker = new ExternalsTracker();
```

**Step 2: Wire processEvent (step 3)**

After the `_buffUptimeTracker` processEvent call:

```typescript
if (this._deathTracker !== null) {
  this._deathTracker.processEvent(event);
}
if (this._externalsTracker !== null) {
  this._externalsTracker.processEvent(event);
}
```

**Step 3: Wire onEncounterStart (step 5)**

After the `_combatTracker` onEncounterStart call:

```typescript
if (encounterResult.encounterStarted && this._deathTracker !== null) {
  this._deathTracker.onEncounterStart(event.timestamp);
}
if (encounterResult.encounterStarted && this._externalsTracker !== null) {
  this._externalsTracker.onEncounterStart(event.timestamp);
}
```

**Step 4: Wire onEncounterEnd (step 8)**

After the `_buffUptimeTracker` computeUptimeForWindow block, inside the `if (encounterResult.encounterEnded ...)` block:

```typescript
if (this._deathTracker !== null) {
  encounterResult.encounter.deaths = this._deathTracker.onEncounterEnd();
}
if (this._externalsTracker !== null) {
  const durationMs = encounterResult.encounter.duration * 1000;
  const endMs = new Date(encounterResult.encounter.endTime).getTime();
  encounterResult.encounter.externals = this._externalsTracker.onEncounterEnd(endMs, durationMs);
}
```

**Step 5: Wire finalize**

After the `_buffUptimeTracker` block inside the `if (forceResult !== null)` block in `finalize()`:

```typescript
if (this._deathTracker !== null) {
  forceResult.encounter.deaths = this._deathTracker.forceEnd() ?? [];
}
if (this._externalsTracker !== null) {
  const durationMs = forceResult.encounter.duration * 1000;
  const endMs = new Date(forceResult.encounter.endTime).getTime();
  forceResult.encounter.externals = this._externalsTracker.forceEnd(endMs, durationMs) ?? {};
}
```

**Step 6: Add getter methods**

After `getBuffUptimeResults()`:

```typescript
getDeathSummaries(): Map<string, number> | null {
  return this._deathTracker?.getPlayerSummaries() ?? null;
}

getExternalsSummaries(totalEncounterDurationMs: number): Map<string, PlayerExternalsSummary> | null {
  return this._externalsTracker?.getPlayerSummaries(totalEncounterDurationMs) ?? null;
}
```

**Step 7: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: PASS

**Step 8: Commit**

```
git add src/state/state-machine.ts
git commit -m "feat: integrate DeathTracker and ExternalsTracker into state machine"
```

---

### Task 6: Integrate into parser.ts Result Mapping

**Files:**
- Modify: `src/parser.ts`

**Step 1: Add type imports**

Add to the import from `types.js`:

```typescript
import type { ..., PlayerExternalsSummary } from "./types.js";
```

**Step 2: Add death count and externals mapping in result building**

In the result mapping section (around line 202), after the `buffUptimeResults` line:

```typescript
// Get death summaries
const deathSummaries = ctx.stateMachine.getDeathSummaries();

// Get externals summaries
const totalEncounterDurationMs = sortedEncounters.reduce(
  (sum, enc) => sum + enc.duration * 1000, 0,
);
const externalsSummaries = ctx.stateMachine.getExternalsSummaries(totalEncounterDurationMs);
```

Note: `sortedEncounters` is computed before the player list (line 215-220). The externals summaries call must go AFTER `sortedEncounters` is computed. Move these two lines to after line 237 (after the encounter-aggregate buff uptime block).

**Step 3: Add fields to player list construction**

In the player building loop (around line 256-266), add after the `buffUptime` spread:

```typescript
...(deathSummaries?.has(record.guid) ? { deathCount: deathSummaries.get(record.guid) } : {}),
...(externalsSummaries?.has(record.guid) ? { externals: externalsSummaries.get(record.guid) } : {}),
```

**Step 4: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: PASS

**Step 5: Run all tests**

Run: `pnpm run test`
Expected: ALL PASS (existing tests should not be affected)

**Step 6: Commit**

```
git add src/parser.ts
git commit -m "feat: map death count and externals summaries to PlayerInfo in parseLog"
```

---

### Task 7: Build and Run Integration Verification

**Files:** None new.

**Step 1: Build the project**

Run: `pnpm run build`
Expected: SUCCESS

**Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Run all tests**

Run: `pnpm run test`
Expected: ALL PASS

**Step 4: Run integration test with example logs (if available)**

If example log files exist in `tests/example-logs/`, run:

```
npx tsx scripts/parse-log-7.ts
```

Inspect the output `result.json` to verify `deaths` and `externals` fields appear on encounters and players.

**Step 5: Final commit (if any integration fixes were needed)**

```
git add -A
git commit -m "fix: integration adjustments for deaths and externals tracking"
```

---

### Task 8: Update AGENTS.md Documentation

**Files:**
- Modify: `AGENTS.md`

**Step 1: Add Deaths and Externals sections**

Add after the "Buff Uptime Tracking" section:

```markdown
## Deaths Tracking (parseLog only)

Tracks player deaths during encounters with a "death recap" showing the last 10 damage/heal events before each death.

### Implementation
- New `DeathTracker` (`src/state/death-tracker.ts`) uses a rolling circular buffer (size 10) per player.
- Buffer populated by damage events (SWING_DAMAGE, SPELL_DAMAGE, etc.) and healing events (SPELL_HEAL, SPELL_PERIODIC_HEAL) targeting players.
- On `UNIT_DIED` for a player, buffer is snapshotted as recap, killing blow identified as last damage event.
- Healing events stored with negative amounts to distinguish from damage.
- `EncounterSummary.deaths` — `PlayerDeath[]` with recap, killing blow, time into encounter.
- `PlayerInfo.deathCount` — total deaths across all encounters.

## Externals Tracking (parseLog only)

Tracks a curated list of ~17 WotLK external buff spells cast by one player on another during encounters. Records count, uptime %, and individual start/end interval timestamps.

### Categories
- **Raid Cooldowns**: Bloodlust (2825), Heroism (32182)
- **DPS Externals**: Power Infusion (10060), Tricks of the Trade (57934), Hysteria (49016), Focus Magic (54646)
- **Healer Externals**: Innervate (29166)
- **Tank/Utility**: Misdirection (34477), Hand of Salvation (1038), Hand of Freedom (1044)
- **Defensive**: Hand of Sacrifice (6940), Hand of Protection (10278), Pain Suppression (33206), Guardian Spirit (47788), Divine Sacrifice (64205), Divine Guardian (70940), Intervene (3411)

### Implementation
- New `ExternalsTracker` (`src/state/externals-tracker.ts`) uses interval-based tracking via SPELL_AURA_APPLIED/REMOVED/REFRESH.
- Data file: `src/data/external-data.ts` — curated Map of external spell IDs.
- Cross-player only (source != dest). Self-buffs excluded.
- Tracks same spell from different sources separately.
- Buffs active at encounter start are captured with start = encounter start time.
- Open intervals closed at encounter end.
- `EncounterSummary.externals` — `Record<destGuid, ExternalBuffUse[]>` with count, uptimePercent, intervals.
- `PlayerInfo.externals` — `PlayerExternalsSummary` with raid-wide aggregate counts and uptime.
```

**Step 2: Commit**

```
git add AGENTS.md
git commit -m "docs: add deaths and externals tracking documentation to AGENTS.md"
```
