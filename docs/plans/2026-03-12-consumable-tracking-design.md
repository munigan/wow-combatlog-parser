# Consumable Tracking Design

**Date:** 2026-03-12
**Scope:** parseLog() only (not scanLog)

## Goal

Track consumable usage per player per encounter during `parseLog()`. Consumables include potions, mana potions, Flame Cap, and engineering bombs. Excludes flasks and food. Detect pre-pots (potions used before the pull) via buff aura tracking.

## Consumable Categories

| Type | Spell IDs | Detection Method |
|------|-----------|-----------------|
| `potion` | 53908 (Speed), 53909 (Wild Magic), 53762 (Indestructible), 28494 (Insane Strength), 28507 (Haste Potion) | `SPELL_CAST_SUCCESS` source + aura tracking for pre-pot |
| `flame_cap` | 28714 (Flame Cap) | `SPELL_AURA_APPLIED` dest (source GUID is nil in WotLK) |
| `mana_potion` | 43186 (Runic Mana Potion), 67490 (Runic Mana Injector), 33448 (Runic Healing Potion) | `SPELL_CAST_SUCCESS` source, no pre-pot detection |
| `engineering` | 56488 (Global Thermal Sapper), 56350 (Saronite Bomb), 67890 (Cobalt Frag Bomb) | `SPELL_CAST_SUCCESS` source, no pre-pot detection |

## Pre-pot Detection

Instead of a time-window heuristic, detect pre-pots by tracking active potion buffs:

1. On `SPELL_AURA_APPLIED` for a potion/flame_cap spell → record `{playerGuid, spellId, spellName}` in `activeBuffs` map
2. On `SPELL_AURA_REMOVED` for a potion/flame_cap spell → remove from `activeBuffs`
3. When encounter **starts** → any player in `activeBuffs` with a tracked buff = pre-pot for that encounter
4. `SPELL_CAST_SUCCESS` during encounter = regular (mid-fight) usage

Only applies to `potion` and `flame_cap` types. Mana potions and engineering items have no pre-pot concept.

## Flame Cap Special Handling

WotLK quirk: `SPELL_CAST_SUCCESS` for Flame Cap (28714) has nil source GUID. Track via `SPELL_AURA_APPLIED` destination instead.

## Architecture

New file: `src/state/consumable-tracker.ts` — peer to `encounter-tracker.ts`.

Composed by `state-machine.ts` alongside existing trackers. Receives events from the state machine, maintains per-encounter state, produces consumable data when encounters complete.

## Type Changes

```typescript
type ConsumableType = 'potion' | 'mana_potion' | 'flame_cap' | 'engineering'

interface ConsumableUse {
  spellId: number
  spellName: string
  type: ConsumableType
  prePot: boolean
  count: number
}

// Added to EncounterSummary
consumables: Record<string, ConsumableUse[]>  // keyed by playerGuid

// Added to PlayerInfo (in ParsedRaid context)
consumables: Record<number, {                 // keyed by spellId
  spellName: string
  type: ConsumableType
  totalUses: number
  prePotCount: number
}>
```

## Output

- `ParsedRaid.encounters[].consumables` — per-encounter, per-player consumable usage
- `ParsedRaid.players[].consumables` — raid-wide summary aggregated across all encounters
