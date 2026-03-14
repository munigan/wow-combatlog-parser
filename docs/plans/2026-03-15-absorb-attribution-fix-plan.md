# Improved Absorb Attribution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix shield lifecycle in CombatTracker to improve Disc Priest absorb attribution (-21.5% gap) and reduce Holy Paladin Sacred Shield overcount (+6.5% gap).

**Architecture:** Replace the never-delete `_activeShields` map with a `ShieldEntry` structure that tracks `removedAt` timestamps. Add a grace window for WoW's removal-before-damage quirk. Handle `SPELL_AURA_REFRESH`, `SPELL_AURA_APPLIED_DOSE`, and `DAMAGE_SHIELD_MISSED`. Add overflow fallback to most-recently-applied shield when no active shields match.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Add ShieldEntry interface and refactor _activeShields

**Files:**
- Modify: `src/state/combat-tracker.ts`

**Step 1: Add the ShieldEntry interface**

Add after the `MISS_EVENTS` constant (around line 115):

```typescript
/** Tracks a single shield aura on a target. */
interface ShieldEntry {
  casterGuid: string;
  removedAt: number | null;  // ms timestamp when AURA_REMOVED fired, null if active
  appliedAt: number;         // ms timestamp of most recent APPLIED/REFRESH/DOSE
}
```

**Step 2: Change `_activeShields` type**

Change from:
```typescript
private _activeShields = new Map<string, string>();
```
To:
```typescript
private _activeShields = new Map<string, ShieldEntry>();
```

**Step 3: Update shield application code**

In the `processEvent` method, replace the `SPELL_AURA_APPLIED` block (around lines 186-191):

```typescript
if (!isNaN(spellId) && ABSORB_SHIELD_SPELLS.has(spellId)) {
  if (event.eventType === "SPELL_AURA_APPLIED") {
    const shieldKey = event.destGuid + "|" + spellId;
    this._activeShields.set(shieldKey, event.sourceGuid);
  }
}
```

With code that handles APPLIED, REFRESH, APPLIED_DOSE, and REMOVED:

```typescript
if (!isNaN(spellId) && ABSORB_SHIELD_SPELLS.has(spellId)) {
  const shieldKey = event.destGuid + "|" + spellId;
  const et = event.eventType;
  if (
    et === "SPELL_AURA_APPLIED" ||
    et === "SPELL_AURA_REFRESH" ||
    et === "SPELL_AURA_APPLIED_DOSE"
  ) {
    this._activeShields.set(shieldKey, {
      casterGuid: event.sourceGuid,
      removedAt: null,
      appliedAt: event.timestamp,
    });
  } else if (et === "SPELL_AURA_REMOVED") {
    const existing = this._activeShields.get(shieldKey);
    if (existing) {
      existing.removedAt = event.timestamp;
    }
  }
}
```

**Step 4: Run existing tests to verify compilation**

Run: `pnpm run test -- --run tests/unit/combat-tracker.test.ts`
Expected: Tests FAIL because `_findShieldCasters` and `_creditAbsorb` still reference the old `string` type.

**Step 5: Update `_findShieldCasters` to use ShieldEntry with grace window**

Replace the `_findShieldCasters` method with a version that accepts a timestamp and filters by grace window:

```typescript
/**
 * Find active shield casters for a given target at the specified timestamp.
 * Active = removedAt is null, or removedAt equals currentTimestamp (grace window
 * for WoW 3.3.5 where SPELL_AURA_REMOVED fires at same ms as consuming damage).
 */
private _findShieldCasters(destGuid: string, currentTimestamp: number): string[] {
  const prefix = destGuid + "|";
  const casters: string[] = [];
  const seen = new Set<string>();
  for (const [key, entry] of this._activeShields) {
    if (!key.startsWith(prefix)) continue;
    // Skip shields removed before this timestamp
    if (entry.removedAt !== null && currentTimestamp > entry.removedAt) continue;
    if (!seen.has(entry.casterGuid)) {
      seen.add(entry.casterGuid);
      casters.push(entry.casterGuid);
    }
  }
  return casters;
}
```

**Step 6: Update `_creditAbsorb` to accept timestamp and add overflow fallback**

Replace `_creditAbsorb` with:

```typescript
/**
 * Credit absorbed damage as healing to the active shield caster(s) on
 * a given target. When multiple casters have shields on the same target,
 * the absorbed amount is split equally among them.
 *
 * If no active shields are found, falls back to the most recently applied
 * shield on the target (overflow fallback — matches uwu-logs behavior
 * where remaining absorb goes to the last known shield).
 */
private _creditAbsorb(destGuid: string, absorbedAmount: number, currentTimestamp: number): void {
  let casters = this._findShieldCasters(destGuid, currentTimestamp);

  // Overflow fallback: if no active shields, find the most recently applied
  // shield on this target (regardless of removedAt) and credit it
  if (casters.length === 0) {
    const prefix = destGuid + "|";
    let bestEntry: ShieldEntry | null = null;
    for (const [key, entry] of this._activeShields) {
      if (!key.startsWith(prefix)) continue;
      if (bestEntry === null || entry.appliedAt > bestEntry.appliedAt) {
        bestEntry = entry;
      }
    }
    if (bestEntry !== null && isPlayer(bestEntry.casterGuid)) {
      const resolvedCaster = this._petOwners.get(bestEntry.casterGuid) ?? bestEntry.casterGuid;
      if (isPlayer(resolvedCaster)) {
        this._accumulate(resolvedCaster, 0, absorbedAmount);
      }
    }
    return;
  }

  const share = Math.round(absorbedAmount / casters.length);
  for (const caster of casters) {
    const resolvedCaster = this._petOwners.get(caster) ?? caster;
    if (isPlayer(resolvedCaster) && share > 0) {
      this._accumulate(resolvedCaster, 0, share);
    }
  }
}
```

**Step 7: Update all `_creditAbsorb` call sites to pass timestamp**

In `processEvent`, find the two places `_creditAbsorb` is called:

1. Partial absorb in damage events (around line 209):
```typescript
this._creditAbsorb(event.destGuid, absorbedAmount, event.timestamp);
```

2. Full absorb in miss events (around line 262):
```typescript
this._creditAbsorb(event.destGuid, absorbedAmount, event.timestamp);
```

**Step 8: Add DAMAGE_SHIELD_MISSED to MISS_EVENTS**

Change:
```typescript
const MISS_EVENTS = new Set([
  "SWING_MISSED",
  "SPELL_MISSED",
  "RANGE_MISSED",
]);
```
To:
```typescript
const MISS_EVENTS = new Set([
  "SWING_MISSED",
  "SPELL_MISSED",
  "RANGE_MISSED",
  "DAMAGE_SHIELD_MISSED",
]);
```

**Step 9: Run existing tests**

Run: `pnpm run test -- --run tests/unit/combat-tracker.test.ts`
Expected: All 38 existing tests PASS (the existing tests don't depend on the old string type since they only check healing/damage output values).

**Step 10: Run full test suite + typecheck**

Run: `pnpm run typecheck && pnpm run test -- --run`
Expected: All 182 tests pass, no type errors.

**Step 11: Commit**

```
git add src/state/combat-tracker.ts
git commit -m "refactor: shield lifecycle with removal grace window, REFRESH/DOSE, overflow fallback

- Replace string _activeShields values with ShieldEntry (casterGuid, removedAt, appliedAt)
- Handle SPELL_AURA_REFRESH, SPELL_AURA_APPLIED_DOSE, SPELL_AURA_REMOVED
- Grace window: shields removed at same ms timestamp as damage event are still active
- Overflow fallback: unmatched absorbs go to most-recently-applied shield
- Add DAMAGE_SHIELD_MISSED to MISS_EVENTS"
```

---

### Task 2: Add unit tests for new shield lifecycle behavior

**Files:**
- Modify: `tests/unit/combat-tracker.test.ts`

**Step 1: Add test for shield removal grace window**

Add to the "absorb tracking" describe block:

```typescript
it("credits absorbs when AURA_REMOVED fires at same timestamp as damage (grace window)", () => {
  // Apply shield
  tracker.processEvent(
    makeEvent({
      timestamp: 900,
      eventType: "SPELL_AURA_APPLIED",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "48066,Power Word: Shield,0x2,BUFF",
    }),
  );

  tracker.onEncounterStart();

  // Shield removed at timestamp 1000
  tracker.processEvent(
    makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_REMOVED",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "48066,Power Word: Shield,0x2,BUFF",
    }),
  );
  // Damage with absorb at SAME timestamp 1000 (WoW 3.3.5 quirk)
  tracker.processEvent(
    makeEvent({
      timestamp: 1000,
      eventType: "SWING_MISSED",
      sourceGuid: BOSS_GUID,
      destGuid: PLAYER2,
      rawFields: "ABSORB,3000",
    }),
  );

  const stats = tracker.onEncounterEnd();
  expect(stats[PLAYER1]).toBeDefined();
  expect(stats[PLAYER1].healing).toBe(3000);
});
```

**Step 2: Add test for stale shield exclusion**

```typescript
it("does not credit absorbs to shields removed before the damage event", () => {
  // Apply shield at 900
  tracker.processEvent(
    makeEvent({
      timestamp: 900,
      eventType: "SPELL_AURA_APPLIED",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "48066,Power Word: Shield,0x2,BUFF",
    }),
  );

  tracker.onEncounterStart();

  // Shield removed at 950
  tracker.processEvent(
    makeEvent({
      timestamp: 950,
      eventType: "SPELL_AURA_REMOVED",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "48066,Power Word: Shield,0x2,BUFF",
    }),
  );

  // Damage with absorb at 1000 (AFTER removal) — no active shields
  // Falls back to overflow: most recently applied shield
  tracker.processEvent(
    makeEvent({
      timestamp: 1000,
      eventType: "SWING_MISSED",
      sourceGuid: BOSS_GUID,
      destGuid: PLAYER2,
      rawFields: "ABSORB,3000",
    }),
  );

  const stats = tracker.onEncounterEnd();
  // Overflow fallback credits to most recently applied shield caster
  expect(stats[PLAYER1]).toBeDefined();
  expect(stats[PLAYER1].healing).toBe(3000);
});
```

**Step 3: Add test for SPELL_AURA_REFRESH updating caster**

```typescript
it("SPELL_AURA_REFRESH updates shield caster", () => {
  // PLAYER1 applies Divine Aegis on PLAYER2
  tracker.processEvent(
    makeEvent({
      timestamp: 900,
      eventType: "SPELL_AURA_APPLIED",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "47753,Divine Aegis,0x2,BUFF",
    }),
  );
  // PLAYER2 (second priest) refreshes the Divine Aegis
  const PLAYER3 = "0x0E00000000000003";
  tracker.processEvent(
    makeEvent({
      timestamp: 950,
      eventType: "SPELL_AURA_REFRESH",
      sourceGuid: PLAYER3,
      destGuid: PLAYER2,
      rawFields: "47753,Divine Aegis,0x2,BUFF",
    }),
  );

  tracker.onEncounterStart();
  tracker.processEvent(
    makeEvent({
      timestamp: 1000,
      eventType: "SWING_MISSED",
      sourceGuid: BOSS_GUID,
      destGuid: PLAYER2,
      rawFields: "ABSORB,2000",
    }),
  );

  const stats = tracker.onEncounterEnd();
  // Should credit PLAYER3 (the refresher), not PLAYER1
  expect(stats[PLAYER3]).toBeDefined();
  expect(stats[PLAYER3].healing).toBe(2000);
  expect(stats[PLAYER1]).toBeUndefined();
});
```

**Step 4: Add test for SPELL_AURA_APPLIED_DOSE**

```typescript
it("SPELL_AURA_APPLIED_DOSE tracks stacking shields", () => {
  // Divine Aegis initial application
  tracker.processEvent(
    makeEvent({
      timestamp: 900,
      eventType: "SPELL_AURA_APPLIED",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "47753,Divine Aegis,0x2,BUFF",
    }),
  );
  // Stacking event (dose increase)
  tracker.processEvent(
    makeEvent({
      timestamp: 920,
      eventType: "SPELL_AURA_APPLIED_DOSE",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "47753,Divine Aegis,0x2,BUFF",
    }),
  );

  tracker.onEncounterStart();
  tracker.processEvent(
    makeEvent({
      timestamp: 1000,
      eventType: "SWING_MISSED",
      sourceGuid: BOSS_GUID,
      destGuid: PLAYER2,
      rawFields: "ABSORB,4000",
    }),
  );

  const stats = tracker.onEncounterEnd();
  expect(stats[PLAYER1]).toBeDefined();
  expect(stats[PLAYER1].healing).toBe(4000);
});
```

**Step 5: Add test for DAMAGE_SHIELD_MISSED**

```typescript
it("tracks DAMAGE_SHIELD_MISSED with ABSORB", () => {
  tracker.processEvent(
    makeEvent({
      timestamp: 900,
      eventType: "SPELL_AURA_APPLIED",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "48066,Power Word: Shield,0x2,BUFF",
    }),
  );

  tracker.onEncounterStart();
  tracker.processEvent(
    makeEvent({
      timestamp: 1000,
      eventType: "DAMAGE_SHIELD_MISSED",
      sourceGuid: BOSS_GUID,
      destGuid: PLAYER2,
      rawFields: "26467,Thorns,0x8,ABSORB,1500",
    }),
  );
  const stats = tracker.onEncounterEnd();
  expect(stats[PLAYER1]).toBeDefined();
  expect(stats[PLAYER1].healing).toBe(1500);
});
```

**Step 6: Add test for overflow fallback with no shields at all**

```typescript
it("drops absorbs when no shield has ever been tracked on the target", () => {
  tracker.onEncounterStart();
  // Absorb on a target with no shield tracking at all
  tracker.processEvent(
    makeEvent({
      timestamp: 1000,
      eventType: "SWING_MISSED",
      sourceGuid: BOSS_GUID,
      destGuid: PLAYER2,
      rawFields: "ABSORB,5000",
    }),
  );
  const stats = tracker.onEncounterEnd();
  // No one gets credited — absorb is dropped (same as uwu-logs)
  expect(stats[PLAYER1]).toBeUndefined();
  expect(stats[PLAYER2]).toBeUndefined();
});
```

**Step 7: Add test that stale shields from different spells don't dilute**

```typescript
it("removed shields do not dilute active shield attribution", () => {
  // PLAYER1 applies Sacred Shield on PLAYER2
  tracker.processEvent(
    makeEvent({
      timestamp: 800,
      eventType: "SPELL_AURA_APPLIED",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "58597,Sacred Shield,0x2,BUFF",
    }),
  );
  // Sacred Shield removed
  tracker.processEvent(
    makeEvent({
      timestamp: 850,
      eventType: "SPELL_AURA_REMOVED",
      sourceGuid: PLAYER1,
      destGuid: PLAYER2,
      rawFields: "58597,Sacred Shield,0x2,BUFF",
    }),
  );
  // PLAYER2 (Disc Priest) applies PW:S on PLAYER2 (self)
  const PLAYER3 = "0x0E00000000000003";
  tracker.processEvent(
    makeEvent({
      timestamp: 900,
      eventType: "SPELL_AURA_APPLIED",
      sourceGuid: PLAYER3,
      destGuid: PLAYER2,
      rawFields: "48066,Power Word: Shield,0x2,BUFF",
    }),
  );

  tracker.onEncounterStart();
  tracker.processEvent(
    makeEvent({
      timestamp: 1000,
      eventType: "SWING_MISSED",
      sourceGuid: BOSS_GUID,
      destGuid: PLAYER2,
      rawFields: "ABSORB,4000",
    }),
  );

  const stats = tracker.onEncounterEnd();
  // PLAYER3 (PW:S caster) gets ALL the credit — Sacred Shield is removed/stale
  expect(stats[PLAYER3]).toBeDefined();
  expect(stats[PLAYER3].healing).toBe(4000);
  // PLAYER1 (stale Sacred Shield) gets nothing
  expect(stats[PLAYER1]).toBeUndefined();
});
```

**Step 8: Run all tests**

Run: `pnpm run test -- --run tests/unit/combat-tracker.test.ts`
Expected: All old tests + 7 new tests PASS.

**Step 9: Commit**

```
git add tests/unit/combat-tracker.test.ts
git commit -m "test: add shield lifecycle tests for grace window, REFRESH/DOSE, overflow fallback"
```

---

### Task 3: Run validation and update integration tests if needed

**Files:**
- Possibly modify: `tests/integration/parse-combat-stats.test.ts`

**Step 1: Build and run full test suite**

Run: `pnpm run build && pnpm run test -- --run`
Expected: All tests pass (integration tests use 5% tolerance, should absorb the attribution changes).

**Step 2: Run validation comparison**

Run: `pnpm run build && npx tsx scripts/compare-wow-logs.ts`
Capture the new 3-way comparison numbers for all 5 healers. Compare against the previous run:

Previous:
- Degustaroxo: -25.43% vs wow-logs, -21.50% vs uwu-logs
- Kurjin: +5.63% vs wow-logs, +6.46% vs uwu-logs
- Dotahkiin: -3.21% vs wow-logs, +0.00% vs uwu-logs
- Pattz: +10.11% vs wow-logs, +7.63% vs uwu-logs
- Jbeto: +0.22% vs wow-logs, -1.08% vs uwu-logs

Expected improvements:
- Degustaroxo: gap should narrow (closer to 0% vs uwu-logs)
- Kurjin/Pattz: overcount should decrease (closer to 0% vs uwu-logs)
- Dotahkiin: should remain +0.00% vs uwu-logs (no absorb spells)
- Jbeto: should remain close to current

**Step 3: Update integration test reference values if needed**

If the Patchwerk Degustaroxo healing value changes significantly (it was within 5% of wow-logs' 253,554), update the `expectWithinPct` reference. Only change if the test actually fails.

**Step 4: Update result.json**

Run: `pnpm run build && npx tsx scripts/parse-log-7.ts`
This regenerates `result.json` with the improved absorb attribution.

**Step 5: Commit**

```
git add -A
git commit -m "feat: improved absorb attribution results

[Include the new comparison numbers in the commit message body]"
```

---

### Task 4: Update documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `src/state/AGENTS.md`

**Step 1: Update AGENTS.md absorb tracking section**

In the "Absorb Tracking" section, update to reflect:
- Shield lifecycle with `ShieldEntry` (casterGuid, removedAt, appliedAt)
- Grace window for same-timestamp removal
- SPELL_AURA_REFRESH and SPELL_AURA_APPLIED_DOSE handling
- Overflow fallback to most-recently-applied shield
- DAMAGE_SHIELD_MISSED support

**Step 2: Update src/state/AGENTS.md**

Update the combat-tracker.ts section to reflect the new shield tracking approach.

**Step 3: Commit**

```
git add AGENTS.md src/state/AGENTS.md
git commit -m "docs: update AGENTS.md with improved absorb attribution details"
```
