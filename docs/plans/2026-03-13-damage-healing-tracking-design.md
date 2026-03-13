# Damage & Healing Tracking Design

Date: 2026-03-13

## Goal

Add per-player per-encounter damage and healing tracking to `parseLog()`. Track useful damage (raw minus overkill) and effective healing (raw minus overheal). Merge pet damage/healing into the owner. Exclude friendly fire from damage totals.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Damage metric | Useful only (raw - overkill) | Matches uwu-logs "useful damage" |
| Healing metric | Effective only (raw - overheal) | Matches uwu-logs "heal" column |
| Pet attribution | Merge into owner via SPELL_SUMMON | Both uwu-logs and wow-logs.co.in do this |
| API scope | parseLog only | Keep scanLog lightweight (client-side) |
| Friendly fire | Exclude (player-to-player damage skipped) | Matches uwu-logs behavior |
| DPS/HPS storage | Not stored — derived by consumer | `damage / duration` is trivial to compute |
| Vehicle attribution | Not resolved (v1) | Complex heuristics, acceptable to skip |

## Data Model

### New types in `src/types.ts`

```ts
interface PlayerCombatStats {
  damage: number;   // useful damage (raw - overkill), no friendly fire
  healing: number;  // effective healing (raw - overheal)
}
```

### Existing type changes

```ts
interface EncounterSummary {
  // ... existing fields ...
  combatStats?: Record<string, PlayerCombatStats>;  // parseLog only, playerGuid → stats
}

interface PlayerInfo {
  // ... existing fields ...
  combatStats?: PlayerCombatStats;  // parseLog only, raid-wide totals
}
```

## Event Processing

### Damage events

| Event Type | rawFields layout | Amount index | Overkill index |
|------------|-----------------|--------------|----------------|
| SWING_DAMAGE | `amount,overkill,school,...` | 0 | 1 |
| SPELL_DAMAGE | `spellId,spellName,spellSchool,amount,overkill,...` | 3 | 4 |
| SPELL_PERIODIC_DAMAGE | same as SPELL_DAMAGE | 3 | 4 |
| RANGE_DAMAGE | same as SPELL_DAMAGE | 3 | 4 |
| DAMAGE_SHIELD | same as SPELL_DAMAGE | 3 | 4 |

**Excluded**: DAMAGE_SHIELD_MISSED (miss), DAMAGE_SPLIT (Soul Link redirects), ENVIRONMENTAL_DAMAGE (not in uwu-logs FLAGS).

**Formula**: `useful = parseInt(amount) - max(0, parseInt(overkill))` (overkill can be -1 meaning nil).

**Filter**: Skip if dest GUID is a player (friendly fire).

### Healing events

| Event Type | rawFields layout | Amount index | Overheal index |
|------------|-----------------|--------------|----------------|
| SPELL_HEAL | `spellId,spellName,spellSchool,amount,overheal,...` | 3 | 4 |
| SPELL_PERIODIC_HEAL | same as SPELL_HEAL | 3 | 4 |

**Formula**: `effective = parseInt(amount) - parseInt(overheal)`. Skip if effective <= 0.

### Field extraction

Count commas in rawFields to reach the target index. No `split()` or array allocation. For SWING events, amount is at index 0. For all spell-prefixed events, amount is at index 3.

## Pet Resolution

### SPELL_SUMMON tracking

Maintain a `Map<string, string>` (petGuid → ownerGuid). On every `SPELL_SUMMON` event, record `event.destGuid → event.sourceGuid`. This map persists across encounters.

When processing damage/healing events, resolve the source GUID through the pet map. If the source is a known pet, attribute to the owner instead.

### Coverage

- Warlock pets (Felguard, Imp, etc.) — SPELL_SUMMON on summon
- Hunter pets — SPELL_SUMMON on Call Pet / Revive Pet
- DK ghouls — SPELL_SUMMON for both permanent ghoul and Army of the Dead
- Guardian pets (Fire Elemental, Shadowfiend) — SPELL_SUMMON
- Vehicles — NOT resolved in v1 (complex heuristics)

## Architecture

### New file: `src/state/combat-tracker.ts`

Single `CombatTracker` class following the `ConsumableTracker` pattern.

**State**:
- `_petOwners: Map<string, string>` — persists across encounters
- `_inEncounter: boolean`
- `_currentEncounter: Map<string, PlayerCombatStats>` — running totals
- `_completedEncounters: EncounterCombatStats[]`

**Lifecycle**:
1. `processEvent(event)` — SPELL_SUMMON tracking, damage/healing accumulation during encounters
2. `onEncounterStart()` — clear current encounter
3. `onEncounterEnd()` — finalize and push to completed
4. `getEncounterCombatStats()` — latest encounter data
5. `getPlayerSummaries()` — raid-wide aggregation

### State machine integration

In `state-machine.ts`, gated behind existing `trackConsumables` flag:
- Instantiate `CombatTracker` alongside `ConsumableTracker`
- Call `processEvent()` before encounter tracker (so SPELL_SUMMON is captured early)
- Call lifecycle hooks at encounter start/end
- Attach combat stats to encounter summary

### Parser aggregation

In `parser.ts` finalization loop (same pattern as consumable summaries):
- Per-encounter: attach `combatStats` from tracker
- Per-player: sum damage/healing across all encounters player participated in

## Validation

### Reference data (uwu-logs, example-log-7.txt)

**Patchwerk** (clean tank-and-spank):
- Egaroto: 812,995 useful damage
- Mopex: 766,634 useful damage
- Pattz: 202,437 effective healing
- Kurjin: 252,587 effective healing

**Instructor Razuvious** (overkill divergence):
- Mareshall: 535,352 useful = total (no overkill)
- Mulltilator: 335,539 useful vs 468,439 total (validates overkill subtraction)

### Testing

- Unit tests: `tests/unit/combat-tracker.test.ts` — damage types, overkill/overheal, friendly fire, pet resolution, encounter lifecycle
- Integration test: parseLog on example-log-7, validate Patchwerk/Razuvious against uwu-logs
- Script: update `scripts/parse-log-7.ts` to output combat stats
