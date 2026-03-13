# Damage & Healing Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-player per-encounter damage and healing tracking to `parseLog()`, with pet→owner merging and friendly fire exclusion.

**Architecture:** Single `CombatTracker` class in `src/state/combat-tracker.ts` following the `ConsumableTracker` pattern. Wired into the state machine behind the existing `trackConsumables` flag. Numbers validated against uwu-logs reference data.

**Tech Stack:** TypeScript, vitest, streaming single-pass architecture

**Design doc:** `docs/plans/2026-03-13-damage-healing-tracking-design.md`

---

### Task 1: Add PlayerCombatStats type and update EncounterSummary/PlayerInfo

**Files:**
- Modify: `src/types.ts:51-93`
- Modify: `src/index.ts:1-19`

**Step 1: Add PlayerCombatStats interface to types.ts**

Add after the `ConsumableSummaryEntry` interface (after line 66):

```ts
export interface PlayerCombatStats {
  damage: number;   // useful damage (raw - overkill), excludes friendly fire
  healing: number;  // effective healing (raw - overheal)
}
```

**Step 2: Add combatStats to EncounterSummary**

Add after the `consumables` field (line 92):

```ts
  /** Per-player combat stats during this encounter (parseLog only). */
  combatStats?: Record<string, PlayerCombatStats>;
```

**Step 3: Add combatStats to PlayerInfo**

Add after the `consumables` field (line 81):

```ts
  /** Raid-wide damage/healing totals (parseLog only). */
  combatStats?: PlayerCombatStats;
```

**Step 4: Export PlayerCombatStats from index.ts**

Add `PlayerCombatStats` to the type export list in `src/index.ts`.

**Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no consumers of the new types yet)

**Step 6: Commit**

```bash
git add src/types.ts src/index.ts
git commit -m "feat: add PlayerCombatStats type to EncounterSummary and PlayerInfo"
```

---

### Task 2: Create CombatTracker with damage tracking (TDD)

**Files:**
- Create: `src/state/combat-tracker.ts`
- Create: `tests/unit/combat-tracker.test.ts`

**Step 1: Write failing tests for basic damage accumulation**

Create `tests/unit/combat-tracker.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { CombatTracker } from "../../src/state/combat-tracker.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";

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

describe("CombatTracker", () => {
  let tracker: CombatTracker;

  beforeEach(() => {
    tracker = new CombatTracker();
  });

  describe("damage tracking", () => {
    it("accumulates SPELL_DAMAGE (useful = amount - overkill)", () => {
      tracker.onEncounterStart();
      // rawFields for SPELL_DAMAGE: spellId,spellName,spellSchool,amount,overkill,school,...
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Dragon's Breath,0x4,5000,200,0x4,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeDefined();
      expect(stats[PLAYER1].damage).toBe(4800); // 5000 - 200
    });

    it("accumulates SWING_DAMAGE (amount at index 0, overkill at index 1)", () => {
      tracker.onEncounterStart();
      // rawFields for SWING_DAMAGE: amount,overkill,school,...
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SWING_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Warrior",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "3000,0,0x1,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(3000);
    });

    it("accumulates SPELL_PERIODIC_DAMAGE", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_PERIODIC_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Warlock",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "172,Corruption,0x20,1500,0,0x20,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(1500);
    });

    it("accumulates RANGE_DAMAGE", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "RANGE_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Hunter",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "75,Auto Shot,0x1,2000,0,0x1,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(2000);
    });

    it("accumulates DAMAGE_SHIELD", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "DAMAGE_SHIELD",
        sourceGuid: PLAYER1,
        sourceName: "Paladin",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "26017,Thorns,0x8,500,0,0x8,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(500);
    });

    it("treats overkill of -1 (nil) as 0", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Dragon's Breath,0x4,5000,-1,0x4,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(5000);
    });

    it("sums damage across multiple events for same player", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Dragon's Breath,0x4,3000,0,0x4,0,0,0,nil,nil,nil",
      }));
      tracker.processEvent(makeEvent({
        timestamp: 1001,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Dragon's Breath,0x4,2000,100,0x4,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(4900); // 3000 + (2000-100)
    });

    it("excludes friendly fire (player-to-player damage)", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: PLAYER2,
        destName: "Warrior",
        rawFields: "31661,Dragon's Breath,0x4,5000,0,0x4,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeUndefined();
    });

    it("ignores damage events outside encounters", () => {
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Dragon's Breath,0x4,5000,0,0x4,0,0,0,nil,nil,nil",
      }));
      tracker.onEncounterStart();
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeUndefined();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/unit/combat-tracker.test.ts`
Expected: FAIL — CombatTracker module doesn't exist

**Step 3: Write minimal CombatTracker implementation**

Create `src/state/combat-tracker.ts`:

```ts
// src/state/combat-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import type { PlayerCombatStats } from "../types.js";
import { isPlayer } from "../utils/guid.js";

/** Damage event types we track. */
const DAMAGE_EVENTS = new Set([
  "SWING_DAMAGE",
  "SPELL_DAMAGE",
  "SPELL_PERIODIC_DAMAGE",
  "RANGE_DAMAGE",
  "DAMAGE_SHIELD",
]);

/** Healing event types we track. */
const HEAL_EVENTS = new Set([
  "SPELL_HEAL",
  "SPELL_PERIODIC_HEAL",
]);

/** Per-encounter combat stats keyed by player GUID. */
export type EncounterCombatStats = Record<string, PlayerCombatStats>;

/**
 * Extract a numeric field from a comma-separated rawFields string by index.
 * Counts commas to find the Nth field without splitting.
 * Returns 0 if field is missing, empty, or "nil".
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

export class CombatTracker {
  /** Pet GUID → owner (player) GUID. Persists across encounters. */
  private _petOwners = new Map<string, string>();
  private _inEncounter = false;
  private _currentEncounter = new Map<string, PlayerCombatStats>();
  private _completedEncounters: EncounterCombatStats[] = [];

  processEvent(event: LogEvent): void {
    // Track pet ownership from SPELL_SUMMON
    if (event.eventType === "SPELL_SUMMON" && isPlayer(event.sourceGuid)) {
      this._petOwners.set(event.destGuid, event.sourceGuid);
      return;
    }

    if (!this._inEncounter) return;

    const eventType = event.eventType;

    // Handle damage events
    if (DAMAGE_EVENTS.has(eventType)) {
      // Exclude friendly fire: skip if dest is a player
      if (isPlayer(event.destGuid)) return;

      // Resolve source through pet map
      const sourceGuid = this._petOwners.get(event.sourceGuid) ?? event.sourceGuid;

      // Only count if resolved source is a player
      if (!isPlayer(sourceGuid)) return;

      // Extract amount and overkill
      const isSwing = eventType === "SWING_DAMAGE";
      const amount = extractFieldInt(event.rawFields, isSwing ? 0 : 3);
      const overkill = extractFieldInt(event.rawFields, isSwing ? 1 : 4);

      const useful = amount - Math.max(0, overkill);
      if (useful <= 0) return;

      this._accumulate(sourceGuid, useful, 0);
      return;
    }

    // Handle healing events
    if (HEAL_EVENTS.has(eventType)) {
      // Resolve source through pet map
      const sourceGuid = this._petOwners.get(event.sourceGuid) ?? event.sourceGuid;
      if (!isPlayer(sourceGuid)) return;

      const amount = extractFieldInt(event.rawFields, 3);
      const overheal = extractFieldInt(event.rawFields, 4);

      const effective = amount - overheal;
      if (effective <= 0) return;

      this._accumulate(sourceGuid, 0, effective);
    }
  }

  onEncounterStart(): void {
    this._inEncounter = true;
    this._currentEncounter.clear();
  }

  onEncounterEnd(): EncounterCombatStats {
    this._inEncounter = false;
    const result: EncounterCombatStats = {};
    for (const [guid, stats] of this._currentEncounter) {
      result[guid] = { ...stats };
    }
    this._completedEncounters.push(result);
    this._currentEncounter.clear();
    return result;
  }

  forceEnd(): EncounterCombatStats | null {
    if (!this._inEncounter) return null;
    return this.onEncounterEnd();
  }

  getPlayerSummaries(): Map<string, PlayerCombatStats> {
    const summaries = new Map<string, PlayerCombatStats>();
    for (const encounter of this._completedEncounters) {
      for (const [guid, stats] of Object.entries(encounter)) {
        const existing = summaries.get(guid);
        if (existing !== undefined) {
          existing.damage += stats.damage;
          existing.healing += stats.healing;
        } else {
          summaries.set(guid, { damage: stats.damage, healing: stats.healing });
        }
      }
    }
    return summaries;
  }

  private _accumulate(playerGuid: string, damage: number, healing: number): void {
    const existing = this._currentEncounter.get(playerGuid);
    if (existing !== undefined) {
      existing.damage += damage;
      existing.healing += healing;
    } else {
      this._currentEncounter.set(playerGuid, { damage, healing });
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm run test -- tests/unit/combat-tracker.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/state/combat-tracker.ts tests/unit/combat-tracker.test.ts
git commit -m "feat: add CombatTracker with damage tracking and unit tests"
```

---

### Task 3: Add healing and pet resolution tests

**Files:**
- Modify: `tests/unit/combat-tracker.test.ts`

**Step 1: Add healing tests**

Add a new `describe("healing tracking")` block after the damage tracking block:

```ts
  describe("healing tracking", () => {
    it("accumulates SPELL_HEAL (effective = amount - overheal)", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_HEAL",
        sourceGuid: PLAYER1,
        sourceName: "Priest",
        destGuid: PLAYER2,
        destName: "Warrior",
        rawFields: "48782,Holy Light,0x2,10000,3000,0,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].healing).toBe(7000); // 10000 - 3000
    });

    it("accumulates SPELL_PERIODIC_HEAL", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_PERIODIC_HEAL",
        sourceGuid: PLAYER1,
        sourceName: "Druid",
        destGuid: PLAYER2,
        destName: "Warrior",
        rawFields: "774,Rejuvenation,0x8,2000,500,0,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].healing).toBe(1500);
    });

    it("skips 100% overheal (amount == overheal)", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_HEAL",
        sourceGuid: PLAYER1,
        sourceName: "Priest",
        destGuid: PLAYER2,
        destName: "Warrior",
        rawFields: "48782,Holy Light,0x2,8000,8000,0,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeUndefined();
    });

    it("does not exclude heals on players (healing is always player-to-player)", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_HEAL",
        sourceGuid: PLAYER1,
        sourceName: "Priest",
        destGuid: PLAYER2,
        destName: "Warrior",
        rawFields: "48782,Holy Light,0x2,5000,0,0,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].healing).toBe(5000);
    });
  });
```

**Step 2: Add pet resolution tests**

Add a `describe("pet resolution")` block:

```ts
  const PET_GUID = "0xF140001234000001";

  describe("pet resolution", () => {
    it("attributes pet damage to owner via SPELL_SUMMON", () => {
      // Pet is summoned before encounter
      tracker.processEvent(makeEvent({
        timestamp: 500,
        eventType: "SPELL_SUMMON",
        sourceGuid: PLAYER1,
        sourceName: "Warlock",
        destGuid: PET_GUID,
        destName: "Felguard",
        rawFields: "30146,Summon Felguard,0x20",
      }));

      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PET_GUID,
        sourceName: "Felguard",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "47468,Cleave,0x1,3000,0,0x1,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeDefined();
      expect(stats[PLAYER1].damage).toBe(3000);
      expect(stats[PET_GUID]).toBeUndefined(); // pet has no entry
    });

    it("attributes pet healing to owner", () => {
      tracker.processEvent(makeEvent({
        timestamp: 500,
        eventType: "SPELL_SUMMON",
        sourceGuid: PLAYER1,
        sourceName: "Priest",
        destGuid: PET_GUID,
        destName: "Shadowfiend",
        rawFields: "34433,Shadowfiend,0x20",
      }));

      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_HEAL",
        sourceGuid: PET_GUID,
        sourceName: "Shadowfiend",
        destGuid: PLAYER1,
        destName: "Priest",
        rawFields: "34650,Mana Leech,0x20,1000,0,0,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].healing).toBe(1000);
    });

    it("merges pet and owner damage into single entry", () => {
      tracker.processEvent(makeEvent({
        timestamp: 500,
        eventType: "SPELL_SUMMON",
        sourceGuid: PLAYER1,
        sourceName: "Warlock",
        destGuid: PET_GUID,
        destName: "Felguard",
        rawFields: "30146,Summon Felguard,0x20",
      }));

      tracker.onEncounterStart();
      // Owner does damage
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Warlock",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "172,Corruption,0x20,2000,0,0x20,0,0,0,nil,nil,nil",
      }));
      // Pet does damage
      tracker.processEvent(makeEvent({
        timestamp: 1001,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PET_GUID,
        sourceName: "Felguard",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "47468,Cleave,0x1,1500,0,0x1,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(3500); // 2000 + 1500
    });
  });
```

**Step 3: Add multi-encounter and raid summary tests**

```ts
  describe("encounter lifecycle", () => {
    it("resets between encounters", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Fireball,0x4,5000,0,0x4,0,0,0,nil,nil,nil",
      }));
      tracker.onEncounterEnd();

      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 2000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Fireball,0x4,3000,0,0x4,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(3000); // only second encounter
    });

    it("aggregates raid-wide summaries across encounters", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Fireball,0x4,5000,0,0x4,0,0,0,nil,nil,nil",
      }));
      tracker.processEvent(makeEvent({
        timestamp: 1001,
        eventType: "SPELL_HEAL",
        sourceGuid: PLAYER2,
        sourceName: "Priest",
        destGuid: PLAYER1,
        destName: "Mage",
        rawFields: "48782,Holy Light,0x2,3000,1000,0,nil",
      }));
      tracker.onEncounterEnd();

      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 2000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Fireball,0x4,4000,0,0x4,0,0,0,nil,nil,nil",
      }));
      tracker.processEvent(makeEvent({
        timestamp: 2001,
        eventType: "SPELL_HEAL",
        sourceGuid: PLAYER2,
        sourceName: "Priest",
        destGuid: PLAYER1,
        destName: "Mage",
        rawFields: "48782,Holy Light,0x2,2000,0,0,nil",
      }));
      tracker.onEncounterEnd();

      const summaries = tracker.getPlayerSummaries();
      expect(summaries.get(PLAYER1)!.damage).toBe(9000); // 5000 + 4000
      expect(summaries.get(PLAYER2)!.healing).toBe(4000); // 2000 + 2000
    });

    it("forceEnd returns null when not in encounter", () => {
      expect(tracker.forceEnd()).toBeNull();
    });

    it("forceEnd finalizes when in encounter", () => {
      tracker.onEncounterStart();
      tracker.processEvent(makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: PLAYER1,
        sourceName: "Mage",
        destGuid: BOSS_GUID,
        destName: "Boss",
        rawFields: "31661,Fireball,0x4,5000,0,0x4,0,0,0,nil,nil,nil",
      }));
      const stats = tracker.forceEnd();
      expect(stats).not.toBeNull();
      expect(stats![PLAYER1].damage).toBe(5000);
    });
  });
```

**Step 2: Run all tests**

Run: `pnpm run test -- tests/unit/combat-tracker.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add tests/unit/combat-tracker.test.ts
git commit -m "test: add healing, pet resolution, and lifecycle tests for CombatTracker"
```

---

### Task 4: Wire CombatTracker into state machine

**Files:**
- Modify: `src/state/state-machine.ts:1-143`

**Step 1: Import CombatTracker**

Add after the ConsumableTracker import (line 14):

```ts
import { CombatTracker } from "./combat-tracker.js";
```

**Step 2: Add CombatTracker field**

Add after `_consumableTracker` declaration (line 28):

```ts
  private _combatTracker: CombatTracker | null = null;
```

**Step 3: Instantiate in constructor**

In the constructor (line 37-39), add alongside ConsumableTracker:

```ts
    if (trackConsumables) {
      this._consumableTracker = new ConsumableTracker();
      this._combatTracker = new CombatTracker();
    }
```

**Step 4: Call processEvent**

After the consumable tracker processEvent call (line 60-62), add:

```ts
    if (this._combatTracker !== null) {
      this._combatTracker.processEvent(event);
    }
```

**Step 5: Call onEncounterStart**

After the consumable tracker onEncounterStart call (line 68-70), add:

```ts
    if (encounterResult.encounterStarted && this._combatTracker !== null) {
      this._combatTracker.onEncounterStart();
    }
```

**Step 6: Call onEncounterEnd and attach combatStats**

After the consumable tracker onEncounterEnd call (line 106-109), add:

```ts
      if (this._combatTracker !== null) {
        encounterResult.encounter.combatStats =
          this._combatTracker.onEncounterEnd();
      }
```

**Step 7: Handle forceEnd in finalize()**

After the consumable tracker forceEnd call (line 131-134), add:

```ts
      if (this._combatTracker !== null) {
        forceResult.encounter.combatStats =
          this._combatTracker.forceEnd() ?? {};
      }
```

**Step 8: Add getter for combat tracker summaries**

Add a new public method after `getEncounterParticipants()`:

```ts
  getCombatPlayerSummaries(): Map<string, PlayerCombatStats> | null {
    return this._combatTracker?.getPlayerSummaries() ?? null;
  }
```

Remember to import `PlayerCombatStats` from types at the top.

**Step 9: Run all tests**

Run: `pnpm run test`
Expected: ALL PASS (existing tests still work, no behavioral change yet)

**Step 10: Commit**

```bash
git add src/state/state-machine.ts
git commit -m "feat: wire CombatTracker into state machine alongside ConsumableTracker"
```

---

### Task 5: Aggregate combat stats in parser.ts

**Files:**
- Modify: `src/parser.ts:1-244`

**Step 1: Import PlayerCombatStats type**

Add `PlayerCombatStats` to the import at line 1-8:

```ts
import type {
  ParseOptions,
  ParseResult,
  ParsedRaid,
  RaidSelection,
  PlayerInfo,
  ConsumableSummaryEntry,
  PlayerCombatStats,
} from "./types.js";
```

**Step 2: Build per-player combat stat summaries**

After the consumable summary loop (after line 196), add:

```ts
    // Build per-player combat stat summaries from encounter data
    const combatSummaries = ctx.stateMachine.getCombatPlayerSummaries();
```

**Step 3: Attach combatStats to PlayerInfo**

In the player list building loop (around line 199-212), modify to include combat stats:

```ts
    const players: PlayerInfo[] = [];
    for (const record of playerMap.values()) {
      if (!encounterParticipants.has(record.guid)) continue;
      const consumables = playerConsumableSummaries.get(record.guid);
      const combat = combatSummaries?.get(record.guid);
      players.push({
        guid: record.guid,
        name: record.name,
        class: record.class,
        spec: record.spec,
        ...(consumables !== undefined && Object.keys(consumables).length > 0
          ? { consumables }
          : {}),
        ...(combat !== undefined ? { combatStats: combat } : {}),
      });
    }
```

**Step 4: Run all tests**

Run: `pnpm run test`
Expected: ALL PASS

**Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/parser.ts
git commit -m "feat: aggregate per-player combat stats in parseLog results"
```

---

### Task 6: Update parse-log-7 script and validate against uwu-logs

**Files:**
- Modify: `scripts/parse-log-7.ts`

**Step 1: Build first**

Run: `pnpm run build`

**Step 2: Run parse-log-7 script**

Run: `npx tsx scripts/parse-log-7.ts`

The script already outputs to `result.json`. The combat stats should now appear on encounter summaries and player info objects automatically since `parseLog` is being called.

**Step 3: Validate Patchwerk numbers against uwu-logs reference**

Inspect `result.json` for the Patchwerk encounter. Check these players:

| Player | Expected (uwu-logs) | Field |
|--------|---------------------|-------|
| Egaroto | 812,995 | damage |
| Mopex | 766,634 | damage |
| Pattz | 202,437 | healing |
| Kurjin | 252,587 | healing |

Numbers should be within 1-2% due to encounter timing differences. If they're off by more, investigate field extraction or pet resolution.

**Step 4: Validate Razuvious overkill subtraction**

| Player | Expected useful | Expected total (if we tracked it) |
|--------|----------------|-----------------------------------|
| Mareshall | 535,352 | 535,352 (no overkill) |
| Mulltilator | 335,539 | 468,439 |

Mareshall's damage should equal the expected useful value. Mulltilator's damage should be ~335k (not ~468k), confirming overkill subtraction works.

**Step 5: Commit if script changes were needed**

```bash
git add scripts/parse-log-7.ts result.json
git commit -m "chore: update parse-log-7 output with combat stats"
```

---

### Task 7: Add integration test for combat stats

**Files:**
- Modify or create: `tests/integration/parse-combat-stats.test.ts`

**Step 1: Write integration test**

Create a test that runs `parseLog` on example-log-7 and validates Patchwerk combat stats against uwu-logs numbers. Gate on file existence.

```ts
import { describe, it, expect } from "vitest";
import { existsSync, createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanLog, parseLog } from "../../dist/index.js";
import type { RaidSelection } from "../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG7_PATH = join(__dirname, "../example-logs/example-log-7.txt");

function fileToStream(path: string): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(path);
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
  });
}

describe.skipIf(!existsSync(LOG7_PATH))("combat stats integration (example-log-7)", () => {
  it("validates Patchwerk damage/healing against uwu-logs", async () => {
    // First scan to get raid selections
    const scanResult = await scanLog(fileToStream(LOG7_PATH));
    const raid = scanResult.raids[0];
    const selection: RaidSelection = {
      dates: raid.dates,
      startTime: raid.startTime,
      endTime: raid.endTime,
      timeRanges: raid.timeRanges,
    };

    // Parse with combat tracking
    const parseResult = await parseLog(fileToStream(LOG7_PATH), [selection]);
    const parsed = parseResult.raids[0];

    // Find Patchwerk encounter
    const patchwerk = parsed.encounters.find((e) => e.bossName === "Patchwerk");
    expect(patchwerk).toBeDefined();
    expect(patchwerk!.combatStats).toBeDefined();

    // Find player GUIDs by name
    const findGuid = (name: string) => parsed.players.find((p) => p.name === name)?.guid;

    const egarotoGuid = findGuid("Egaroto");
    const mopexGuid = findGuid("Mopex");

    // Validate damage within 2% tolerance (encounter timing differences)
    if (egarotoGuid && patchwerk!.combatStats![egarotoGuid]) {
      const actual = patchwerk!.combatStats![egarotoGuid].damage;
      expect(actual).toBeGreaterThan(812995 * 0.98);
      expect(actual).toBeLessThan(812995 * 1.02);
    }

    if (mopexGuid && patchwerk!.combatStats![mopexGuid]) {
      const actual = patchwerk!.combatStats![mopexGuid].damage;
      expect(actual).toBeGreaterThan(766634 * 0.98);
      expect(actual).toBeLessThan(766634 * 1.02);
    }
  }, 30000); // 30s timeout for file parsing
});
```

**Step 2: Build and run integration test**

Run: `pnpm run build && pnpm run test -- tests/integration/parse-combat-stats.test.ts`
Expected: PASS (or SKIP if example-log-7 doesn't exist)

**Step 3: Commit**

```bash
git add tests/integration/parse-combat-stats.test.ts
git commit -m "test: add integration test validating combat stats against uwu-logs reference"
```

---

### Task 8: Final validation and cleanup

**Step 1: Run full test suite**

Run: `pnpm run test`
Expected: ALL PASS (now ~155+ tests)

**Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Run build**

Run: `pnpm run build`
Expected: PASS

**Step 4: Update AGENTS.md and src/state/AGENTS.md**

Add `combat-tracker.ts` to the project structure in root `AGENTS.md` and update `src/state/AGENTS.md` with CombatTracker documentation.

**Step 5: Final commit**

```bash
git add -A
git commit -m "docs: update AGENTS.md with combat tracker documentation"
```
