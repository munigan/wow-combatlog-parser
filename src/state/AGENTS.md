# State Machine Layer

Streaming state management. All modules process one `LogEvent` at a time — no buffering.

## Files

### state-machine.ts
`CombatLogStateMachine` — the central coordinator. Composes:
- `EncounterTracker` — boss encounter detection
- `RaidSeparator` — raid segment boundaries
- `ConsumableTracker` — consumable usage (opt-in via `trackConsumables` constructor flag, used by `parseLog` only)
- `CombatTracker` — per-player damage/healing (opt-in, same flag as ConsumableTracker)

**Event flow**: For each `LogEvent`, the state machine:
1. Detects player class/spec from spell IDs
2. Feeds the event to `ConsumableTracker` and `CombatTracker`
3. Feeds the event to `EncounterTracker`
4. If an encounter started/ended, notifies `RaidSeparator`, `ConsumableTracker`, and `CombatTracker`
5. Tracks encounter participants (combat events only — aura events excluded)

Constructor accepts `trackConsumables: boolean` to enable the heavier tracking path (consumables + combat stats).

### encounter-tracker.ts
`EncounterTracker` — detects boss encounters from combat events.

**Key constants**:
- `IGNORED_ENCOUNTER_SPELL_IDS` — Spells that don't start encounters (Hunter's Mark, Mind Vision, Flare, etc.)
- `NON_PARTICIPANT_EVENTS` — `Set<string>` of aura events that don't count as player participation
- `COWARD_AURA_REMOVAL_THRESHOLD = 15` — consecutive removals needed for coward boss kill
- `POST_KILL_COOLDOWN_MS = 30000` — ignore events for same boss after kill

**State**: Tracks current encounter (boss name, start time, NPC IDs seen), per-boss kill cooldowns, multi-boss death progress, coward boss aura removal counts, idle timeout tracking, difficulty spell detection.

**Modifying encounter detection**: The `processEvent()` method contains the core logic. Start detection filters are at the top (blocked event types, ignored spells, BUFF aura skip). End detection is split across `handleUnitDied()`, `handleCowardBoss()`, and the idle timeout check in `checkIdleTimeout()`.

### raid-separator.ts
`RaidSeparator` — splits multi-raid log files into segments.

Segments break on: date changes, 30-minute time gaps, raid instance changes. Adjacent segments merge via Jaccard roster similarity (threshold >= 0.5). The 4-hour max group gap prevents cross-day merging.

### consumable-tracker.ts
`ConsumableTracker` — tracks potion, flame cap, and engineering bomb usage.

**Lifecycle**:
1. `processEvent()` — called for every event. Tracks `SPELL_AURA_APPLIED`/`SPELL_AURA_REMOVED` for buff potions (pre-pot detection). Records consumable uses during active encounters.
2. `onEncounterStart()` — checks for active buffs → marks as pre-pot.
3. `onEncounterEnd()` — finalizes encounter consumable data, resets per-encounter state.
4. `getEncounterConsumables()` — returns per-player consumable usage for the last encounter.
5. `getPlayerSummaries()` — returns raid-wide per-player aggregated stats.

**Flame Cap special handling**: `SPELL_CAST_SUCCESS` for Flame Cap (28714) has a nil source GUID. The tracker identifies the player via `SPELL_AURA_APPLIED` dest GUID instead.

**Pre-pot detection**: Maintains `activeBuffs` map (playerGuid+spellId → true). When an encounter starts, any active buff potions are recorded as pre-pots. Only `hasBuff: true` consumables qualify. Mana potions are excluded.

### combat-tracker.ts
`CombatTracker` — tracks per-player per-encounter damage (useful) and healing (effective) with pet→owner merging.

**Lifecycle** (same pattern as ConsumableTracker):
1. `processEvent()` — called for every event. Tracks pet ownership (SPELL_SUMMON + PET_FILTER_SPELLS). During encounters, accumulates damage/healing per player.
2. `onEncounterStart()` — resets per-encounter accumulators.
3. `onEncounterEnd()` — finalizes encounter stats, stores in completed encounters list.
4. `forceEnd()` — handles encounters interrupted by log end.
5. `getPlayerSummaries()` — returns raid-wide per-player aggregated damage/healing.

**Damage calculation**: Useful damage = amount - overkill. Overkill of -1 (nil in WoW logs) treated as 0 via `Math.max(0, overkill)`. Friendly fire excluded via `isPlayer(destGuid)` and `isFriendly(destFlags)` checks.

**Healing calculation**: Effective healing = amount - overheal. 100% overheal events (effective ≤ 0) are silently skipped.

**Pet ownership detection** (persists across encounters):
1. `SPELL_SUMMON` — Player summons pet → direct mapping.
2. `PET_FILTER_SPELLS` (~90 spells from uwu-logs) — Bidirectional: if player is source and pet is dest (or vice versa), establish ownership. Covers Hunter (Mend Pet, Bestial Wrath, Kill Command), Warlock (Health Funnel, Soul Link, Dark Pact), DK (Ghoul Frenzy, Death Pact), and pet→owner auras (Kindred Spirits, Furious Howl, Call of the Wild).

**Field extraction**: Uses `extractFieldInt(rawFields, index)` — counts commas to find the Nth field without splitting. Safe because `parseFields()` already stripped quotes from rawFields. SWING_DAMAGE: amount at index 0, overkill at 1. Spell events: amount at index 3, overkill/overheal at 4.
