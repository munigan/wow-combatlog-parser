# Data Layer

Static lookup tables for WotLK 3.3.5. No runtime logic — pure data exported as Maps, Sets, and arrays.

## Files

### boss-data.ts
63 boss NPC IDs across 9 raid instances. Key exports:

- `getBossName(npcId)` — Returns boss name or null.
- `getBossIdleThreshold(npcId)` — Seconds of inactivity before a wipe is declared. Defaults to 30s, overridden per-boss (e.g., Thaddius: 60s for transition phase).
- `isMultiBoss(npcId)` / `getMultiBossName(npcId)` / `getMultiBossNpcIds(bossName)` — Multi-boss encounters where ALL bosses must die: Four Horsemen (4), Assembly of Iron (3), Blood Prince Council (3), Twin Val'kyr (2), Northrend Beasts (3).
- `isCowardBoss(npcId)` — Bosses that don't emit `UNIT_DIED` — Kologarn, Hodir, Thorim, Freya, Algalon. Killed via consecutive `SPELL_AURA_REMOVED` events (15+ threshold).
- `getRaidInstance(npcId)` — Maps NPC ID to raid instance name.

**Adding a new boss**: Add entry to `BOSS_NPC_IDS` map. If multi-boss, add to `MULTI_BOSS_ENCOUNTERS`. If coward boss, add to `COWARD_BOSSES`. If custom idle threshold, add to `BOSS_IDLE_THRESHOLDS`.

### spell-book.ts
~380 class spells in `SPELL_TO_CLASS` map, ~90 spec-specific spells in `SPELL_TO_SPEC` map. Used by `class-detection.ts` and `spec-detection.ts`.

**Adding spells**: Add `spellId → WowClass` to `SPELL_TO_CLASS`, and optionally `spellId → WowSpec` to `SPELL_TO_SPEC` for spec-specific spells. Only add spells that are unambiguous indicators of a class/spec.

### consumable-data.ts
15 WotLK consumable spell ID entries across 4 types (Insane Strength Potion: two IDs). Key exports:

- `CONSUMABLE_SPELLS` — `Map<string, ConsumableInfo>` for spell ID lookup.
- `BUFF_CONSUMABLE_SPELL_IDS` — Set of spell IDs with trackable buff auras (used for pre-pot detection).
- `FLAME_CAP_SPELL_ID` — `"28714"`, needs special handling (nil source GUID in `SPELL_CAST_SUCCESS`).

Each entry has: `spellId`, `displayName` (overrides abbreviated log names), `type`, `hasBuff` (whether it can be pre-potted).

**Adding consumables**: Add to `CONSUMABLE_LIST` array. Set `hasBuff: true` only if the consumable applies a buff aura AND pre-pot detection is desired.

### difficulty-spells.ts
Boss-specific spell tuples `[normalSpellId, heroicSpellId]` for ICC and ToC bosses. Used to detect 10H/25H when player-count alone is ambiguous.
