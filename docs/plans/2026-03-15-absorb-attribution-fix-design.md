# Improved Absorb Attribution Design

Date: 2026-03-15
Status: Approved
References: `docs/plans/2026-03-15-validation-investigation.md`, uwu-logs `logs_absorbs.py`

## Problem

The 3-way validation investigation revealed two absorb attribution issues:

1. **Disc Priest PW:S undercount (-21.5% vs uwu-logs)** — Stale shield entries in `_activeShields` are never removed, causing the equal-split logic to dilute absorb attribution across all shields ever seen on a target (including long-consumed ones). Over the course of a fight, a target accumulates entries for PW:S, Divine Aegis, Sacred Shield, and Val'anyr, and each absorb is split equally among all of them regardless of which shield actually absorbed the hit.

2. **Holy Paladin Sacred Shield overcount (+6.5% vs uwu-logs)** — A consequence of the same stale entry problem. Sacred Shield entries persist even after consumption, receiving an equal share of absorbs that were likely handled by PW:S or another shield.

## Root Causes (ranked by impact)

| # | Issue | Est. Impact | Current Behavior |
|---|-------|-------------|------------------|
| 1 | Stale shield entries dilute equal split | ~10-15% | Never delete from `_activeShields` — entries accumulate forever |
| 2 | Missing `SPELL_AURA_REFRESH` handling | ~2-3% | Divine Aegis refreshes and shield reapplications not tracked |
| 3 | Missing `SPELL_AURA_APPLIED_DOSE` handling | ~1-2% | Divine Aegis stacking events not tracked |
| 4 | No overflow fallback attribution | ~1-2% | When `_findShieldCasters` returns empty, absorb is silently dropped |
| 5 | `DAMAGE_SHIELD_MISSED` not in `MISS_EVENTS` | <1% | Rare but real full-absorb events missed |

## uwu-logs Reference Analysis

Studied uwu-logs `logs_absorbs.py` to understand their approach:

- **Shield keying**: By spell ID only (one shield per spell type per target). Last-writer-wins when a new caster applies the same shield spell.
- **Removal handling**: `transient` flag + 0.5s grace window. Shields marked transient on `SPELL_AURA_REMOVED`, cleaned up if >0.5s elapsed.
- **No equal split**: Priority-ordered waterfall with estimated remaining shield values.
- **REFRESH/DOSE**: Fully handled — updates timestamp, preserves remaining value.
- **Fallback**: Remaining absorb overflow goes to last non-ignored shield. If no shields exist at all, absorb is dropped (same cold-start problem as us).
- **Pre-log shields**: uwu-logs also cannot attribute absorbs from shields applied before logging started. Both parsers drop those.

**Key insight**: The -21.5% gap is NOT from pre-log shields (uwu-logs drops those too). It's from our stale entries diluting attribution and missing aura event types.

## Design

### 1. Shield Entry Structure

Replace `Map<string, string>` with a richer entry:

```typescript
interface ShieldEntry {
  casterGuid: string;
  removedAt: number | null;  // ms timestamp when AURA_REMOVED fired, null if active
  appliedAt: number;         // ms timestamp of most recent APPLIED/REFRESH/DOSE
}

// _activeShields: Map<string, ShieldEntry>  (key: "destGuid|spellId")
```

### 2. Aura Event Handling

Track shields on all relevant aura events (currently only `SPELL_AURA_APPLIED`):

| Event | Action |
|-------|--------|
| `SPELL_AURA_APPLIED` | Create or overwrite entry. Set `casterGuid`, `appliedAt`, `removedAt = null` |
| `SPELL_AURA_REFRESH` | Update `casterGuid` (may change for stacking shields), `appliedAt`. Set `removedAt = null` |
| `SPELL_AURA_APPLIED_DOSE` | Same as REFRESH — update caster and timestamp |
| `SPELL_AURA_REMOVED` | Set `removedAt = event.timestamp`. Do NOT delete the entry |

### 3. Shield Lookup with Grace Window

`_findShieldCasters(destGuid, currentTimestamp)`:

1. Iterate all entries matching `destGuid|*`
2. **Active shields** (`removedAt === null`): always included
3. **Recently removed shields** (`removedAt !== null && currentTimestamp <= removedAt`): included (grace window — handles WoW's removal-before-damage quirk where AURA_REMOVED fires at the same ms timestamp as the damage event)
4. **Stale shields** (`removedAt !== null && currentTimestamp > removedAt`): excluded

Returns unique caster GUIDs from eligible shields. If multiple casters, split equally (same as now, but far fewer stale entries means more accurate splits).

### 4. Overflow Fallback

When `_findShieldCasters` returns empty (no active or grace-window shields):

1. Find the shield entry for this target with the **most recent `appliedAt`** timestamp
2. If found and the caster is a player, credit the full absorb to that caster
3. If truly nothing exists, drop the absorb (same as uwu-logs)

This handles the case where all shields on a target were removed >0ms ago but absorb damage still arrives referencing that target. uwu-logs handles this with `_filtered_shit.popitem()`.

### 5. Pass Timestamp to Attribution

`_creditAbsorb` needs the current event's timestamp to evaluate the grace window. Change signature:

```typescript
private _creditAbsorb(destGuid: string, absorbedAmount: number, timestamp: number): void
```

`processEvent` already has `event.timestamp` available. Thread it through to `_creditAbsorb` calls.

### 6. Add DAMAGE_SHIELD_MISSED

Add `"DAMAGE_SHIELD_MISSED"` to the `MISS_EVENTS` set.

### 7. What We're NOT Doing

- **No priority-based consumption order** — Would require 100+ spell IDs and WoW internal shield priority knowledge. Equal split with proper lifecycle is sufficient.
- **No remaining-value simulation** — WoW doesn't log shield amounts. uwu-logs estimates from observed absorbs; adds complexity for marginal gains.
- **No Divine Aegis auto-creation from heals** — Would require Disc Priest spec detection integration and heal-to-shield conversion logic.
- **No Val'anyr proc tracking from heals** — Same complexity concern.

These would each improve accuracy incrementally but the complexity cost doesn't justify the marginal improvement. The lifecycle fix addresses the largest contributor to the gap.

## Expected Impact

- **Disc Priest**: -21.5% → estimated -5% to -10% vs uwu-logs (can't fully close because uwu-logs uses remaining-value simulation and priority ordering)
- **Holy Paladin**: +6.5% → estimated +1% to +3% vs uwu-logs (stale Sacred Shield entries no longer dilute other shields)
- **Direct healing**: No change (already +0.00% vs uwu-logs)

## Files Modified

- `src/state/combat-tracker.ts` — Shield entry structure, aura event handling, grace window, overflow fallback, DAMAGE_SHIELD_MISSED
- `tests/unit/combat-tracker.test.ts` — New tests for removal grace window, REFRESH/DOSE, overflow fallback, DAMAGE_SHIELD_MISSED
- `tests/integration/parse-combat-stats.test.ts` — Verify integration with real log data (if numbers change)

## Validation

After implementation, re-run `npx tsx scripts/compare-wow-logs.ts` to measure the improvement against both wow-logs and uwu-logs reference data.
