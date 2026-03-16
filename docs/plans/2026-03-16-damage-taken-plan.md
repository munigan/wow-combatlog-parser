# Damage Taken Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-player per-encounter damage taken tracking to `parseLog` by extending the existing `CombatTracker`.

**Architecture:** Extend `CombatTracker` with a parallel damage-taken accumulator (`_currentDamageTaken` map). When a damage event targets a player, accumulate raw amount (no overkill subtraction). Same encounter lifecycle as damage done. Add `damageTaken: number` to `PlayerCombatStats`.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Add `damageTaken` to `PlayerCombatStats` type

**Files:**
- Modify: `src/types.ts:99-101`

**Step 1: Update the type**

In `src/types.ts`, change `PlayerCombatStats`:

```typescript
export interface PlayerCombatStats {
  damage: number;       // useful damage (raw - overkill), excludes friendly fire
  damageTaken: number;  // raw damage taken (no overkill subtraction)
}
```

**Step 2: Run typecheck to see all breakages**

Run: `pnpm run typecheck`
Expected: Type errors in `combat-tracker.ts` where `PlayerCombatStats` objects are created without `damageTaken`. This confirms the type change propagated correctly.

---

### Task 2: Write failing tests for damage taken

**Files:**
- Modify: `tests/unit/combat-tracker.test.ts`

**Step 1: Add damage taken test section**

Add a new `describe("damage taken tracking")` block after the existing `describe("damage tracking")` block (after line 222). Use the same `makeEvent` helper and constants already defined in the file.

```typescript
  describe("damage taken tracking", () => {
    it("tracks SPELL_DAMAGE to a player as raw amount (no overkill subtraction)", () => {
      tracker.onEncounterStart();
      // Boss hits player — rawFields: spellId,spellName,school,amount,overkill,...
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "69055,Bone Slice,0x1,15000,5000,0x1,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      // Raw amount = 15000 (overkill NOT subtracted for damage taken)
      expect(stats[PLAYER1].damageTaken).toBe(15000);
    });

    it("tracks SWING_DAMAGE to a player", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "8000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damageTaken).toBe(8000);
    });

    it("tracks SPELL_PERIODIC_DAMAGE to a player", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_PERIODIC_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "70911,Unbound Plague,0x8,3000,0,0x8,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damageTaken).toBe(3000);
    });

    it("tracks RANGE_DAMAGE to a player", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "RANGE_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "75,Shoot,0x1,2000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damageTaken).toBe(2000);
    });

    it("tracks DAMAGE_SHIELD to a player", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "DAMAGE_SHIELD",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "7294,Retribution Aura,0x2,500,0,0x2,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damageTaken).toBe(500);
    });

    it("does not track damage taken for non-player dest (NPCs)", () => {
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
      const stats = tracker.onEncounterEnd();
      // Boss should have damage done, but no damageTaken
      expect(stats[PLAYER1].damage).toBe(5000);
      expect(stats[BOSS_GUID]).toBeUndefined(); // Boss is not a player
    });

    it("sums damage taken from multiple sources", () => {
      tracker.onEncounterStart();
      // Boss hit
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "69055,Bone Slice,0x1,10000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      // Another hit
      tracker.processEvent(
        makeEvent({
          timestamp: 1001,
          eventType: "SWING_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "5000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damageTaken).toBe(15000);
    });

    it("tracks damage taken and damage done independently", () => {
      tracker.onEncounterStart();
      // Player deals damage to boss
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: PLAYER1,
          destGuid: BOSS_GUID,
          rawFields: "12345,Frostbolt,0x10,5000,200,0x10,0,0,0,nil,nil,nil",
        }),
      );
      // Boss deals damage to player
      tracker.processEvent(
        makeEvent({
          timestamp: 1001,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "69055,Bone Slice,0x1,10000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damage).toBe(4800);       // 5000 - 200 overkill
      expect(stats[PLAYER1].damageTaken).toBe(10000);  // raw, no overkill sub
    });

    it("resets damage taken between encounters", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "69055,Bone Slice,0x1,10000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.onEncounterEnd();

      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 2000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "69055,Bone Slice,0x1,3000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damageTaken).toBe(3000); // not 13000
    });

    it("aggregates damage taken across encounters in summaries", () => {
      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "69055,Bone Slice,0x1,10000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.onEncounterEnd();

      tracker.onEncounterStart();
      tracker.processEvent(
        makeEvent({
          timestamp: 2000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "69055,Bone Slice,0x1,5000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.onEncounterEnd();

      const summaries = tracker.getPlayerSummaries();
      expect(summaries.get(PLAYER1)!.damageTaken).toBe(15000); // 10000 + 5000
    });

    it("ignores damage taken outside an encounter", () => {
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: BOSS_GUID,
          destGuid: PLAYER1,
          rawFields: "69055,Bone Slice,0x1,10000,0,0x1,0,0,0,nil,nil,nil",
        }),
      );
      tracker.onEncounterStart();
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1]).toBeUndefined();
    });

    it("does not count damage from all sources regardless of NPC whitelist", () => {
      // Even with NPC whitelist set, damage taken should count all sources
      const TRASH_GUID = "0xF130009999000001"; // not in any whitelist
      tracker.onEncounterStart("Patchwerk");
      tracker.processEvent(
        makeEvent({
          timestamp: 1000,
          eventType: "SPELL_DAMAGE",
          sourceGuid: TRASH_GUID,
          destGuid: PLAYER1,
          rawFields: "12345,Shadow Bolt,0x20,7000,0,0x20,0,0,0,nil,nil,nil",
        }),
      );
      const stats = tracker.onEncounterEnd();
      expect(stats[PLAYER1].damageTaken).toBe(7000);
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test tests/unit/combat-tracker.test.ts`
Expected: Multiple failures — `PlayerCombatStats` missing `damageTaken` property.

---

### Task 3: Implement damage taken in CombatTracker

**Files:**
- Modify: `src/state/combat-tracker.ts`

**Step 1: Add damage taken accumulator state**

Add after line 118 (`_completedEncounters`):

```typescript
  private _currentDamageTaken = new Map<string, number>();
  private _completedDamageTaken: Map<string, number>[] = [];
```

**Step 2: Add damage taken accumulation in processEvent**

Inside `processEvent()`, after the damage-done block (after line 179), add a damage-taken branch. The key insight: the existing code returns early at line 155 if `isPlayer(event.destGuid)` — we need to restructure so that damage-to-player is accumulated for damage taken BEFORE the early return. Restructure the damage event handling:

Replace the block from line 151 to line 179:

```typescript
    if (DAMAGE_EVENTS.has(eventType)) {
      const isSwing = eventType === "SWING_DAMAGE";

      if (isPlayer(event.destGuid)) {
        // Damage TO a player → damage taken (raw amount, no overkill subtraction)
        const amount = extractFieldInt(event.rawFields, isSwing ? 0 : 3);
        if (amount > 0) {
          const existing = this._currentDamageTaken.get(event.destGuid) ?? 0;
          this._currentDamageTaken.set(event.destGuid, existing + amount);
        }
        return; // Still skip damage-done for player targets (friendly fire exclusion)
      }

      // Damage-done tracking (existing logic, unchanged)
      if (isFriendly(event.destFlags)) return;

      if (this._validNpcs !== null) {
        const destNpcId = getNpcId(event.destGuid);
        if (!this._validNpcs.has(destNpcId)) return;
      }

      const sourceGuid = this._petOwners.get(event.sourceGuid) ?? event.sourceGuid;
      if (!isPlayer(sourceGuid)) return;

      const amount = extractFieldInt(event.rawFields, isSwing ? 0 : 3);
      const overkill = extractFieldInt(event.rawFields, isSwing ? 1 : 4);
      const useful = amount - Math.max(0, overkill);
      if (useful <= 0) return;

      this._accumulate(sourceGuid, useful);
    }
```

**Step 3: Clear damage taken on encounter start**

In `onEncounterStart()` (line 182), add after `this._currentEncounter.clear()`:

```typescript
    this._currentDamageTaken.clear();
```

**Step 4: Include damage taken in encounter end result**

In `onEncounterEnd()` (line 188), update the result building to include damageTaken:

Replace the result-building loop:

```typescript
  onEncounterEnd(): EncounterCombatStats {
    this._inEncounter = false;
    const result: EncounterCombatStats = {};

    // Collect all player GUIDs from both damage done and damage taken
    const allGuids = new Set<string>();
    for (const guid of this._currentEncounter.keys()) allGuids.add(guid);
    for (const guid of this._currentDamageTaken.keys()) allGuids.add(guid);

    for (const guid of allGuids) {
      const damageDone = this._currentEncounter.get(guid)?.damage ?? 0;
      const damageTaken = this._currentDamageTaken.get(guid) ?? 0;
      result[guid] = { damage: damageDone, damageTaken };
    }

    this._completedEncounters.push(result);
    this._completedDamageTaken.push(new Map(this._currentDamageTaken));
    this._currentEncounter.clear();
    this._currentDamageTaken.clear();
    return result;
  }
```

**Step 5: Update getPlayerSummaries to aggregate damageTaken**

Replace `getPlayerSummaries()`:

```typescript
  getPlayerSummaries(): Map<string, PlayerCombatStats> {
    const summaries = new Map<string, PlayerCombatStats>();
    for (const encounter of this._completedEncounters) {
      for (const [guid, stats] of Object.entries(encounter)) {
        const existing = summaries.get(guid);
        if (existing !== undefined) {
          existing.damage += stats.damage;
          existing.damageTaken += stats.damageTaken;
        } else {
          summaries.set(guid, { damage: stats.damage, damageTaken: stats.damageTaken });
        }
      }
    }
    return summaries;
  }
```

**Step 6: Update _accumulate to include damageTaken default**

Update `_accumulate()` so new `PlayerCombatStats` objects include `damageTaken: 0`:

```typescript
  private _accumulate(playerGuid: string, damage: number): void {
    const existing = this._currentEncounter.get(playerGuid);
    if (existing !== undefined) {
      existing.damage += damage;
    } else {
      this._currentEncounter.set(playerGuid, { damage, damageTaken: 0 });
    }
  }
```

**Step 7: Run tests**

Run: `pnpm run test tests/unit/combat-tracker.test.ts`
Expected: All tests pass, including the new damage taken tests.

**Step 8: Run full test suite and typecheck**

Run: `pnpm run test && pnpm run typecheck`
Expected: All 182+ tests pass, no type errors.

**Step 9: Commit**

```bash
git add src/types.ts src/state/combat-tracker.ts tests/unit/combat-tracker.test.ts
git commit -m "feat: add per-player damage taken tracking to CombatTracker"
```

---

### Task 4: Update AGENTS.md documentation

**Files:**
- Modify: `AGENTS.md`

**Step 1: Update the PlayerCombatStats documentation**

In the "Combat Stats Tracking" section, update the description of `PlayerCombatStats` to mention `damageTaken`. Add a "Damage Taken" subsection:

```markdown
### Damage Taken
- **Raw amount** — no overkill subtraction (amount field only). Matches uwu-logs behavior.
- **Event types**: Same 5 as damage done (SWING_DAMAGE, SPELL_DAMAGE, SPELL_PERIODIC_DAMAGE, RANGE_DAMAGE, DAMAGE_SHIELD). No ENVIRONMENTAL_DAMAGE.
- **Player dest only**: Only `isPlayer(destGuid)` targets counted.
- **No source filtering**: All sources count regardless of NPC whitelist.
- Stored on `PlayerCombatStats.damageTaken`, same per-encounter and raid-wide aggregation as damage done.
```

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add damage taken tracking to AGENTS.md"
```

---

### Task 5: Build and verify

**Step 1: Build**

Run: `pnpm run build`
Expected: Clean build, no errors.

**Step 2: Full test suite**

Run: `pnpm run test`
Expected: All tests pass.

**Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: No type errors.
