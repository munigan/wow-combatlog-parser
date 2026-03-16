# Damage Taken Tracking — Design

## Summary

Add per-player damage taken tracking to `parseLog`. Extends the existing `CombatTracker` to accumulate raw incoming damage on players during encounters, stored alongside the existing damage-done stats.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Granularity | Total per player per encounter | Matches damage-done granularity. Per-source/per-spell breakdown deferred (YAGNI). |
| Amount computation | Raw amount (no overkill subtraction) | Matches uwu-logs behavior for damage taken. Raw is more useful for survivability/healing analysis. |
| Environmental damage | Excluded | Matches uwu-logs. Only the 5 standard damage events tracked. |
| Source NPC filtering | None | All damage to players counts regardless of source. Unlike damage done, no whitelist filtering. |
| Implementation approach | Extend CombatTracker | ~30 lines of code, no new files, no state machine changes. |

## Reference

uwu-logs `logs_dmg_heals.py` `parse_both()`: accumulates raw damage taken per player using `TAKEN[tguid] += int(d)` for any `_DAMAGE` event where dest is a player/pet.

## Type Changes

Extend `PlayerCombatStats`:

```typescript
interface PlayerCombatStats {
  damage: number;       // existing: useful damage done (amount - overkill)
  damageTaken: number;  // new: raw damage taken (amount, no overkill subtraction)
}
```

No new types. Same type used per-encounter (`EncounterSummary.combatStats`) and raid-wide (`PlayerInfo.combatStats`).

## CombatTracker Changes

### New state

- `_currentDamageTaken: Map<string, number>` — accumulates raw damage per dest player GUID during current encounter. Mirrors `_currentDamage` for damage done.
- `_completedDamageTaken: Map<string, number>[]` — stores per-encounter snapshots for aggregation.

### processEvent() addition

After the existing damage-done branch, add a damage-taken branch:

```
if isPlayer(destGuid):
  amount = extractFieldInt(rawFields, 0)  // SWING_DAMAGE
       or extractFieldInt(rawFields, 3)  // spell-based
  _currentDamageTaken[destGuid] += amount
```

- **Events**: SWING_DAMAGE, SPELL_DAMAGE, SPELL_PERIODIC_DAMAGE, RANGE_DAMAGE, DAMAGE_SHIELD
- **No ENVIRONMENTAL_DAMAGE**
- **No overkill subtraction** — raw amount only
- **No source filtering** — all sources count
- **No pet merging needed** — dest is always a player GUID

### Lifecycle

- `onEncounterStart()`: Clear `_currentDamageTaken`
- `onEncounterEnd()`: Merge damageTaken into `EncounterCombatStats` result, push snapshot
- `getPlayerSummaries()`: Aggregate damageTaken across completed encounters

## Data Flow

```
LogEvent (SPELL_DAMAGE, etc.)
  → CombatTracker.processEvent()
    → if dest is player: _currentDamageTaken[destGuid] += rawAmount
    → if dest is NOT player (existing): _currentDamage[sourceGuid] += usefulAmount
  → onEncounterEnd()
    → EncounterSummary.combatStats[guid].damageTaken
  → getPlayerSummaries()
    → PlayerInfo.combatStats.damageTaken (sum across encounters)
```

## No State Machine or Parser Changes

`CombatTracker` is already wired into the state machine and parser. Extending `PlayerCombatStats` with `damageTaken` flows through existing collection paths automatically.

## Testing

- Unit: damage taken accumulation for each event type
- Unit: raw amount (no overkill subtraction)
- Unit: only player dest GUIDs counted
- Unit: per-encounter reset and aggregation
- Integration: real log file validation
