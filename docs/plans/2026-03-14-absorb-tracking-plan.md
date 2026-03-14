# Absorb Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Count absorbed damage as healing in CombatTracker, attributing it to the shield caster via aura tracking.

**Architecture:** Add absorb shield state tracking to `CombatTracker`. Track `SPELL_AURA_APPLIED`/`SPELL_AURA_REMOVED` for known absorb spells to maintain target→caster mapping. Extract absorbed amounts from MISS events (full absorb) and damage event suffix fields (partial absorb). Attribute to shield caster as healing via existing `_accumulate()`.

**Tech Stack:** TypeScript, vitest, existing CombatTracker patterns.

---

### Task 1: Add absorb unit tests

**Files:**
- Modify: `tests/unit/combat-tracker.test.ts`

**Step 1: Add tests for full absorb (MISS events)**

Add a new `describe("absorb tracking")` block after the existing `describe("healing tracking")` block in `tests/unit/combat-tracker.test.ts`:

```typescript
describe("absorb tracking", () => {
  it("tracks full absorb from SWING_MISSED with ABSORB", () => {
    // Apply PW:S from PLAYER1 on PLAYER2
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "48066,Power Word: Shield,0x2,BUFF",
      }),
    );

    tracker.onEncounterStart();
    // Boss swings at PLAYER2, fully absorbed
    // SWING_MISSED rawFields: ABSORB,<amount>
    tracker.processEvent(
      makeEvent({
        timestamp: 1000,
        eventType: "SWING_MISSED",
        sourceGuid: BOSS_GUID,
        destGuid: PLAYER2,
        rawFields: "ABSORB,2020",
      }),
    );
    const stats = tracker.onEncounterEnd();
    expect(stats[PLAYER1]).toBeDefined();
    expect(stats[PLAYER1].healing).toBe(2020); // attributed to shield caster
  });

  it("tracks full absorb from SPELL_MISSED with ABSORB", () => {
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "48066,Power Word: Shield,0x2,BUFF",
      }),
    );

    tracker.onEncounterStart();
    // Boss spell fully absorbed
    // SPELL_MISSED rawFields: spellId,spellName,spellSchool,ABSORB,<amount>
    tracker.processEvent(
      makeEvent({
        timestamp: 1000,
        eventType: "SPELL_MISSED",
        sourceGuid: BOSS_GUID,
        destGuid: PLAYER2,
        rawFields: "30091,Flamestrike,0x4,ABSORB,1170",
      }),
    );
    const stats = tracker.onEncounterEnd();
    expect(stats[PLAYER1].healing).toBe(1170);
  });

  it("tracks partial absorb from SWING_DAMAGE absorbed field", () => {
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "48066,Power Word: Shield,0x2,BUFF",
      }),
    );

    tracker.onEncounterStart();
    // SWING_DAMAGE rawFields: amount,overkill,school,resisted,blocked,absorbed,critical,glancing,crushing
    tracker.processEvent(
      makeEvent({
        timestamp: 1000,
        eventType: "SWING_DAMAGE",
        sourceGuid: BOSS_GUID,
        destGuid: PLAYER2,
        destFlags: "0x512",
        rawFields: "1378,0,1,0,2562,705,nil,nil,nil",
      }),
    );
    const stats = tracker.onEncounterEnd();
    // absorbed=705 attributed to PLAYER1, damage to PLAYER2 is excluded (player dest)
    expect(stats[PLAYER1]).toBeDefined();
    expect(stats[PLAYER1].healing).toBe(705);
  });

  it("tracks partial absorb from SPELL_DAMAGE absorbed field", () => {
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "48066,Power Word: Shield,0x2,BUFF",
      }),
    );

    tracker.onEncounterStart();
    // SPELL_DAMAGE rawFields: spellId,spellName,spellSchool,amount,overkill,school,resisted,blocked,absorbed,...
    // absorbed is at index 8
    tracker.processEvent(
      makeEvent({
        timestamp: 1000,
        eventType: "SPELL_DAMAGE",
        sourceGuid: BOSS_GUID,
        destGuid: PLAYER2,
        destFlags: "0x512",
        rawFields: "55323,Shadow Bolt Volley,0x20,3500,0,0x20,0,0,1500,nil,nil,nil",
      }),
    );
    const stats = tracker.onEncounterEnd();
    expect(stats[PLAYER1].healing).toBe(1500);
  });

  it("removes shield tracking on SPELL_AURA_REMOVED", () => {
    // Apply and then remove shield
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "48066,Power Word: Shield,0x2,BUFF",
      }),
    );
    tracker.processEvent(
      makeEvent({
        timestamp: 900,
        eventType: "SPELL_AURA_REMOVED",
        sourceGuid: PLAYER1,
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
        rawFields: "ABSORB,2000",
      }),
    );
    const stats = tracker.onEncounterEnd();
    // No shield tracked → absorb is unattributed → discarded
    expect(stats[PLAYER1]).toBeUndefined();
  });

  it("discards absorb when no shield is tracked on target", () => {
    tracker.onEncounterStart();
    // No shield applied, but absorb happens (shield applied before log started)
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
    expect(stats[PLAYER1]).toBeUndefined();
    expect(stats[PLAYER2]).toBeUndefined();
  });

  it("most recent shield wins when re-applied", () => {
    // PLAYER1 applies PW:S
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "48066,Power Word: Shield,0x2,BUFF",
      }),
    );
    // PLAYER2 self-applies a different absorb (e.g., another priest's PW:S on same target)
    // In practice this would be a different caster - simulate with a second player GUID
    const PLAYER3 = "0x0E00000000000003";
    tracker.processEvent(
      makeEvent({
        timestamp: 850,
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
        rawFields: "ABSORB,2000",
      }),
    );
    const stats = tracker.onEncounterEnd();
    // Most recent shield (PLAYER3) gets credit
    expect(stats[PLAYER1]).toBeUndefined();
    expect(stats[PLAYER3]).toBeDefined();
    expect(stats[PLAYER3].healing).toBe(2000);
  });

  it("tracks Divine Aegis absorbs (spell 47753)", () => {
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
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
        rawFields: "ABSORB,1800",
      }),
    );
    const stats = tracker.onEncounterEnd();
    expect(stats[PLAYER1].healing).toBe(1800);
  });

  it("tracks Sacred Shield absorbs (spell 58597)", () => {
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "58597,Sacred Shield,0x2,BUFF",
      }),
    );

    tracker.onEncounterStart();
    tracker.processEvent(
      makeEvent({
        timestamp: 1000,
        eventType: "SWING_MISSED",
        sourceGuid: BOSS_GUID,
        destGuid: PLAYER2,
        rawFields: "ABSORB,2500",
      }),
    );
    const stats = tracker.onEncounterEnd();
    expect(stats[PLAYER1].healing).toBe(2500);
  });

  it("combines direct healing and absorb healing for same player", () => {
    // PLAYER1 applies shield on PLAYER2
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "48066,Power Word: Shield,0x2,BUFF",
      }),
    );

    tracker.onEncounterStart();
    // Direct heal from PLAYER1
    tracker.processEvent(
      makeEvent({
        timestamp: 1000,
        eventType: "SPELL_HEAL",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "48071,Flash Heal,0x2,5000,0,0,nil",
      }),
    );
    // Absorb on PLAYER2 attributed to PLAYER1
    tracker.processEvent(
      makeEvent({
        timestamp: 1001,
        eventType: "SWING_MISSED",
        sourceGuid: BOSS_GUID,
        destGuid: PLAYER2,
        rawFields: "ABSORB,2000",
      }),
    );
    const stats = tracker.onEncounterEnd();
    expect(stats[PLAYER1].healing).toBe(7000); // 5000 heal + 2000 absorb
  });

  it("absorbs only counted during encounter", () => {
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
        eventType: "SPELL_AURA_APPLIED",
        sourceGuid: PLAYER1,
        destGuid: PLAYER2,
        rawFields: "48066,Power Word: Shield,0x2,BUFF",
      }),
    );

    // Absorb happens OUTSIDE encounter
    tracker.processEvent(
      makeEvent({
        timestamp: 900,
        eventType: "SWING_MISSED",
        sourceGuid: BOSS_GUID,
        destGuid: PLAYER2,
        rawFields: "ABSORB,5000",
      }),
    );

    tracker.onEncounterStart();
    const stats = tracker.onEncounterEnd();
    expect(stats[PLAYER1]).toBeUndefined();
  });

  it("tracks RANGE_MISSED with ABSORB", () => {
    tracker.processEvent(
      makeEvent({
        timestamp: 800,
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
        eventType: "RANGE_MISSED",
        sourceGuid: BOSS_GUID,
        destGuid: PLAYER2,
        rawFields: "12345,Shoot,0x1,ABSORB,900",
      }),
    );
    const stats = tracker.onEncounterEnd();
    expect(stats[PLAYER1].healing).toBe(900);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- --run tests/unit/combat-tracker.test.ts`
Expected: All new absorb tests FAIL (absorb tracking not implemented yet). Existing 26 tests still pass.

**Step 3: Commit**

```bash
git add tests/unit/combat-tracker.test.ts
git commit -m "test: add absorb tracking unit tests (red phase)"
```

---

### Task 2: Implement absorb tracking in CombatTracker

**Files:**
- Modify: `src/state/combat-tracker.ts`

**Step 1: Add ABSORB_SHIELD_SPELLS constant**

Add after the `PET_FILTER_SPELLS` constant (around line 92):

```typescript
/**
 * Known absorb shield spell IDs in WotLK 3.3.5. When these auras are applied,
 * we track the caster so absorbed damage can be attributed as healing.
 */
const ABSORB_SHIELD_SPELLS = new Set([
  // Power Word: Shield (all ranks)
  17, 592, 600, 3747, 6065, 6066, 10898, 10901, 25217, 25218, 48065, 48066,
  // Divine Aegis (Disc Priest passive)
  47753,
  // Sacred Shield absorb proc (Holy Paladin)
  58597,
  // Val'anyr — Protection of Ancient Kings
  64413,
]);
```

**Step 2: Add MISS event types set**

Add after `HEAL_EVENTS`:

```typescript
/** Miss event types that can carry ABSORB. */
const MISS_EVENTS = new Set([
  "SWING_MISSED",
  "SPELL_MISSED",
  "RANGE_MISSED",
]);
```

**Step 3: Add _activeShields state**

Add to the CombatTracker class, after `_petOwners`:

```typescript
/** Target GUID → shield caster GUID. Most recent shield wins. Persists across encounters. */
private _activeShields = new Map<string, string>();
```

**Step 4: Add absorb processing to processEvent()**

In the `processEvent()` method, add shield aura tracking right after the pet ownership tracking block (after the `PET_FILTER_SPELLS` block, before the `if (!this._inEncounter) return;` line):

```typescript
// Track absorb shield auras (PW:S, Divine Aegis, Sacred Shield, Val'anyr)
if (event.eventType === "SPELL_AURA_APPLIED" || event.eventType === "SPELL_AURA_REMOVED") {
  const spellIdStr = getSpellId(event);
  if (spellIdStr !== null) {
    const spellId = parseInt(spellIdStr, 10);
    if (!isNaN(spellId) && ABSORB_SHIELD_SPELLS.has(spellId)) {
      if (event.eventType === "SPELL_AURA_APPLIED") {
        this._activeShields.set(event.destGuid, event.sourceGuid);
      } else {
        this._activeShields.delete(event.destGuid);
      }
    }
  }
}
```

Then, after the existing healing block (after the `HEAL_EVENTS` handling), add absorb extraction:

```typescript
// Handle full absorbs from MISS events (SWING_MISSED, SPELL_MISSED, RANGE_MISSED)
if (MISS_EVENTS.has(eventType)) {
  // Check if rawFields contains ABSORB
  const rawFields = event.rawFields;
  const absorbIdx = rawFields.indexOf("ABSORB,");
  if (absorbIdx === -1) return;

  // Extract absorbed amount (last field after "ABSORB,")
  const amountStr = rawFields.substring(absorbIdx + 7);
  const absorbed = parseInt(amountStr, 10);
  if (isNaN(absorbed) || absorbed <= 0) return;

  // Attribute to shield caster
  const casterGuid = this._activeShields.get(event.destGuid);
  if (casterGuid === undefined) return; // unattributed → discard

  // Resolve through pet map (shield caster could theoretically be a pet, unlikely)
  const resolvedGuid = this._petOwners.get(casterGuid) ?? casterGuid;
  if (!isPlayer(resolvedGuid)) return;

  this._accumulate(resolvedGuid, 0, absorbed);
  return;
}

// Handle partial absorbs from damage events (absorbed field in damage suffix)
if (DAMAGE_EVENTS.has(eventType)) {
  // ... existing damage tracking code is already here ...
  // After the existing damage handling, also extract absorbed amount
}
```

**Important**: The partial absorb extraction needs to be integrated into the existing damage handling block. Restructure the DAMAGE_EVENTS block to also extract the absorbed field:

Replace the existing damage handling block with:

```typescript
// Handle damage events
if (DAMAGE_EVENTS.has(eventType)) {
  const isSwing = eventType === "SWING_DAMAGE";

  // --- Extract and attribute absorbed amount (partial absorbs) ---
  const absorbedFieldIndex = isSwing ? 5 : 8;
  const absorbedAmount = extractFieldInt(event.rawFields, absorbedFieldIndex);
  if (absorbedAmount > 0) {
    const casterGuid = this._activeShields.get(event.destGuid);
    if (casterGuid !== undefined) {
      const resolvedCaster = this._petOwners.get(casterGuid) ?? casterGuid;
      if (isPlayer(resolvedCaster)) {
        this._accumulate(resolvedCaster, 0, absorbedAmount);
      }
    }
  }

  // --- Existing damage tracking (unchanged) ---
  // Exclude friendly fire: skip if dest is a player or dest is friendly
  if (isPlayer(event.destGuid)) return;
  if (isFriendly(event.destFlags)) return;

  // Resolve source through pet map
  const sourceGuid = this._petOwners.get(event.sourceGuid) ?? event.sourceGuid;

  // Only count if resolved source is a player
  if (!isPlayer(sourceGuid)) return;

  // Extract amount and overkill
  const amount = extractFieldInt(event.rawFields, isSwing ? 0 : 3);
  const overkill = extractFieldInt(event.rawFields, isSwing ? 1 : 4);

  const useful = amount - Math.max(0, overkill);
  if (useful <= 0) return;

  this._accumulate(sourceGuid, useful, 0);
  return;
}
```

**Step 5: Run tests**

Run: `pnpm run test -- --run tests/unit/combat-tracker.test.ts`
Expected: All 26 existing tests + all new absorb tests PASS.

**Step 6: Run full test suite + typecheck**

Run: `pnpm run test -- --run && pnpm run typecheck`
Expected: All tests pass, no type errors.

**Step 7: Commit**

```bash
git add src/state/combat-tracker.ts
git commit -m "feat: track absorbed damage as healing in CombatTracker"
```

---

### Task 3: Update integration test with absorb validation

**Files:**
- Modify: `tests/integration/parse-combat-stats.test.ts`

**Step 1: Add Patchwerk Degustaroxo healing test**

Add after the existing Razuvious damage test:

```typescript
// --- Patchwerk healing (absorb validation) ---

it("Patchwerk: Degustaroxo healing within 5% of wow-logs (253,554)", () => {
  const guid = patchwerk.players.get("Degustaroxo");
  expect(guid).toBeDefined();
  const stats = patchwerk.combatStats[guid!];
  expect(stats).toBeDefined();
  // wow-logs.co.in shows 253,554 (includes PW:S absorbs)
  // Use 5% tolerance — absorb attribution heuristic may not be perfect
  expectWithinPct(stats.healing, 253_554, 5);
});
```

**Step 2: Add Patchwerk non-shield healer test (regression)**

```typescript
it("Patchwerk: Kurjin healing within 5% of wow-logs (263,387)", () => {
  const guid = patchwerk.players.get("Kurjin");
  expect(guid).toBeDefined();
  const stats = patchwerk.combatStats[guid!];
  expect(stats).toBeDefined();
  // Holy Paladin — mostly direct heals, some Sacred Shield absorbs
  expectWithinPct(stats.healing, 263_387, 5);
});
```

**Step 3: Verify existing damage tests still pass**

Run: `pnpm run build && pnpm run test -- --run tests/integration/parse-combat-stats.test.ts`
Expected: All tests pass (existing damage tests unchanged, new healing tests validate absorb tracking).

**Step 4: Commit**

```bash
git add tests/integration/parse-combat-stats.test.ts
git commit -m "test: add integration tests validating absorb healing against wow-logs"
```

---

### Task 4: Regenerate result.json and validate numbers

**Files:**
- Run: `scripts/parse-log-7.ts`

**Step 1: Build and regenerate result.json**

Run: `pnpm run build && npx tsx scripts/parse-log-7.ts`

**Step 2: Validate Degustaroxo Patchwerk healing**

Check: `cat result.json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'Degustaroxo: {s.get(\"healing\",0):,}') for e in d[0]['encounters'] if 'Patchwerk' in e['bossName'] for n,s in e.get('combatStats',{}).items() if n=='Degustaroxo']"`

Expected: Healing should be ~253,554 (within 5% of wow-logs.co.in).

**Step 3: Validate existing damage numbers unchanged**

Check Gluth damage numbers are still exact matches (absorb changes must not affect damage tracking).

---

### Task 5: Update documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `src/state/AGENTS.md`
- Modify: `tests/AGENTS.md`

**Step 1: Update AGENTS.md**

Add absorb tracking to the Combat Stats Tracking section. Update the healing description to mention absorbs. Update test count.

**Step 2: Update src/state/AGENTS.md**

Add absorb tracking details to the CombatTracker documentation section.

**Step 3: Update tests/AGENTS.md**

Update combat-tracker.test.ts description to include absorb tests. Update test count.

**Step 4: Commit**

```bash
git add AGENTS.md src/state/AGENTS.md tests/AGENTS.md
git commit -m "docs: update AGENTS.md files with absorb tracking documentation"
```
