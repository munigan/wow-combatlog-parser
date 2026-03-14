# Absorb Tracking as Healing — Design

## Problem

Our parser tracks only `SPELL_HEAL` and `SPELL_PERIODIC_HEAL` events as healing. WotLK Disc Priests (and to a lesser extent Holy Paladins) contribute significant healing through absorb shields (Power Word: Shield, Divine Aegis, Sacred Shield). Without absorb tracking, Degustaroxo (Disc Priest) shows 680k healing across 15 Naxxramas bosses while wow-logs.co.in shows 3.1M — a 78% gap, almost entirely from PW:S absorbs.

## Decision

Merge absorbed damage into the existing `healing` field in `PlayerCombatStats`. No type changes needed.

## Data Sources

WotLK 3.3.5 logs report absorbed damage in two places (there is no `SPELL_ABSORBED` event — that was added in Cataclysm):

### 1. Full absorbs — MISS events with ABSORB missType

When an attack is completely absorbed (0 damage dealt):

```
SWING_MISSED,...,destGuid,destName,destFlags,ABSORB,<absorbed>
SPELL_MISSED,...,destGuid,destName,destFlags,spellId,spellName,school,ABSORB,<absorbed>
RANGE_MISSED,...,destGuid,destName,destFlags,spellId,spellName,school,ABSORB,<absorbed>
```

The absorbed amount is the last field.

### 2. Partial absorbs — absorbed field in damage events

When an attack is partially absorbed (some damage gets through):

- **SWING_DAMAGE** rawFields: `amount,overkill,school,resisted,blocked,absorbed,...` — absorbed at index 5
- **SPELL_DAMAGE/SPELL_PERIODIC_DAMAGE/RANGE_DAMAGE/DAMAGE_SHIELD** rawFields: `spellId,name,school,amount,overkill,school,resisted,blocked,absorbed,...` — absorbed at index 8

## Shield Attribution

### Tracked absorb spells

| Spell | IDs |
|-------|-----|
| Power Word: Shield | 17, 592, 600, 3747, 6065, 6066, 10898, 10901, 25217, 25218, 48065, 48066 |
| Divine Aegis | 47753 |
| Sacred Shield (absorb proc) | 58597 |
| Val'anyr (Protection of Ancient Kings) | 64413 |

### Shield state tracking

Maintain `_activeShields: Map<string, {casterGuid, spellId}>` keyed by target GUID. Updated from `SPELL_AURA_APPLIED` (set) and `SPELL_AURA_REMOVED` (delete) for absorb spell IDs. Persists across encounters (like `_petOwners`).

### Multi-shield heuristic

When a target has shields from multiple casters, the most recently applied shield wins. WotLK actually consumes oldest-first, but this is a reasonable simplification that covers the common case. A single `Map` entry per target (overwritten on each new shield application) implements this naturally.

### Unattributed absorbs

If no shield is tracked on the target (e.g., shield was applied before logging started), the absorbed amount is discarded. Only count what we can accurately attribute.

## Implementation Scope

All changes are within `combat-tracker.ts`:

1. **New constant**: `ABSORB_SHIELD_SPELLS: Set<number>` — ~16 spell IDs
2. **New state**: `_activeShields` map (target → caster)
3. **processEvent additions**:
   - Track SPELL_AURA_APPLIED/REMOVED for absorb spells
   - Extract absorbed amounts from MISS events (ABSORB missType)
   - Extract absorbed field from damage events (index 5/8)
   - Look up shield caster, accumulate as healing via existing `_accumulate()`
4. **New helpers**: `extractAbsorbedFromMiss()`, `extractAbsorbedFromDamage()`

### What doesn't change

- `PlayerCombatStats` interface
- `state-machine.ts`, `parser.ts`
- Damage tracking, pet ownership, encounter lifecycle

## Validation

- Degustaroxo (Disc Priest) on Patchwerk: 111,565 → ~253,554 (wow-logs.co.in target)
- Non-shield healers (Kurjin, Dotahkiin): should remain within ~4% of current values
- Gluth damage: should remain at exact match (absorb changes don't affect damage)
