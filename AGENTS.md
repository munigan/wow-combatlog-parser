# Agent Guidelines

## Project

WoW combat log parser for WotLK 3.3.5. TypeScript library, zero runtime deps, streaming API.

## Key Constraints

- **WotLK 3.3.5 only** — No `ENCOUNTER_START`/`ENCOUNTER_END` events exist. Encounter detection uses GUID-based heuristics (boss NPC IDs, `UNIT_DIED`, idle timeouts).
- **Single stream API** — `ReadableStream<Uint8Array>` input. Must work in browser, Node 18+, Deno, Bun.
- **Two-phase pattern** — `scanLog()` for lightweight raid detection (client-side), `parseLog()` for server-side extraction filtered by time ranges.
- **Constant memory** — Single-pass streaming state machine. Never store all lines.
- **Zero runtime dependencies** — Pure TypeScript, dual ESM/CJS via tsup.

## Build & Test

```bash
pnpm run build       # tsup → dist/
pnpm run test        # vitest (182 tests)
pnpm run typecheck   # tsc --noEmit
```

**Important**: Scripts import from `../dist/index.js` — always run `pnpm run build` before running scan scripts. Example logs live in `tests/example-logs/` (gitignored).

## Project Structure

```
src/
  index.ts              # Barrel exports
  types.ts              # Public interfaces (WowClass, WowSpec, ConsumableType, etc.)
  scanner.ts            # scanLog() implementation
  parser.ts             # parseLog() implementation (with consumable + combat tracking)
  pipeline/
    line-splitter.ts    # TransformStream: bytes → lines
    line-parser.ts      # parseLine(): line → LogEvent, isBuffAura(), getSpellId()
  state/
    state-machine.ts    # Composes tracker + separator + consumable + combat + player detection
    encounter-tracker.ts # Boss encounter detection (kill/wipe/idle/coward)
    raid-separator.ts   # Segment tracking, Jaccard merging
    consumable-tracker.ts # Potion/bomb/flame cap tracking with pre-pot detection
    combat-tracker.ts   # Per-player damage with pet→owner merging
    buff-uptime-tracker.ts # Flask/elixir/food buff uptime tracking
  detection/
    class-detection.ts  # detectClass(spellId) → WowClass
    spec-detection.ts   # detectSpec(spellId, class) → WowSpec
    difficulty.ts       # Spell-based + player count fallback
  data/
    boss-data.ts        # 63 boss NPC IDs, 9 raid instances, idle thresholds
    spell-book.ts       # ~380 class spells, ~90 spec spells
    difficulty-spells.ts # Boss difficulty spell tuples (ICC/ToC)
    consumable-data.ts  # 14 WotLK consumable spell IDs (potions/bombs/flame cap)
    buff-data.ts        # Flask, elixir, and food buff spell IDs (36 total)
  utils/
    timestamp.ts        # WotLK timestamp parsing (M/D HH:MM:SS.mmm, no year)
    guid.ts             # GUID type detection (player/NPC/pet/vehicle)
    fields.ts           # Quote-aware CSV field parsing
tests/
  unit/                 # 15 unit test files
  integration/          # Real log file tests (scan-examples.test.ts, parse-combat-stats.test.ts)
  example-logs/         # WoW combat log files (gitignored, example-log-{1..7}.txt)
scripts/
  scan-all.ts           # Scans all example logs → JSON
  summarize.ts          # Pretty-prints scan results
  parse-log.ts          # Parse a single log file
  parse-log-7.ts        # Scan + parse example-log-7.txt → result.json
  deep-investigate.ts   # Deep encounter timing investigation
docs/plans/             # Design docs and implementation plans
```

## Public API

### `scanLog(stream, options?): Promise<ScanResult>`
Lightweight client-side scan. Detects raids, encounters, players with class/spec. Does NOT track consumables.

### `parseLog(stream, selections, options?): Promise<ParseResult>`
Server-side extraction filtered by time ranges from `scanLog`. Tracks consumables (potions, engineering bombs, flame cap) with pre-pot detection, per-player per-encounter damage stats with pet→owner merging, and flask/elixir/food buff uptime per player.

**Typical flow**: `scanLog` → user picks raids → `parseLog` with `RaidSelection[]` from scan results.

## Encounter Detection Logic

Encounters are detected by observing combat events involving boss NPC GUIDs (extracted from `boss-data.ts`).

### Start detection
- Combat events (SWING_*, RANGE_*, SPELL_DAMAGE, SPELL_PERIODIC_DAMAGE, SPELL_HEAL, etc.) involving a known boss NPC ID trigger encounter start.
- **BUFF auras are skipped** — only DEBUFF auras can start encounters (matches uwu-logs behavior).
- **Blocked events**: `SPELL_CAST_SUCCESS`, `SPELL_CAST_START`, `SPELL_MISSED`, `SWING_MISSED`, `RANGE_MISSED`, `DAMAGE_SHIELD_MISSED` do NOT start encounters.
- **Ignored spell IDs**: Hunter's Mark (all ranks), Mind Vision, Soothe Animal, Flare, Baby Spice, Blood Power, Lens — see `IGNORED_ENCOUNTER_SPELL_IDS` in encounter-tracker.ts.

### End detection
- **Kill**: `UNIT_DIED` event for the boss NPC (NOT `PARTY_KILL` — uwu-logs compatibility).
- **Wipe**: Idle timeout (no combat events for N seconds, configurable per boss in `boss-data.ts`).
- **Coward bosses**: Kologarn, Hodir, Thorim, Freya, Algalon — killed via consecutive `SPELL_AURA_REMOVED` events (15+ threshold).
- **Multi-boss**: Four Horsemen, Assembly of Iron, Blood Prince Council, Twin Val'kyr, Northrend Beasts — all bosses must die for a kill.

### Post-kill cooldown
30-second window after a kill where events referencing the same boss are ignored (prevents phantom encounters from lingering DoTs/aura removals).

### Duration
Millisecond precision: `Math.round(durationMs) / 1000` (e.g., `88.573` seconds).

### Minimum duration filter
Encounters shorter than 10 seconds are discarded (filters Grobbulus hallway poison phantom encounters).

## Consumable Tracking (parseLog only)

Tracks 14 WotLK consumable spell IDs across 4 categories:
- **Potions** (6): Speed, Wild Magic, Indestructible, Insane Strength, Haste, Nightmares
- **Flame Cap** (1): Special handling — `SPELL_CAST_SUCCESS` has nil source GUID, tracked via `SPELL_AURA_APPLIED` dest
- **Mana/Healing** (4): Runic Mana Potion, Runic Mana Injector, Runic Healing Potion, Runic Healing Injector
- **Engineering** (3): Global Thermal Sapper, Saronite Bomb, Cobalt Frag Bomb

**Pre-pot detection**: Uses buff aura lifecycle tracking. If a player has an active potion buff when an encounter starts, it's a pre-pot. Only buff potions and Flame Cap can be pre-potted. Mana potions are excluded from pre-pot detection.

## Buff Uptime Tracking (parseLog only)

Tracks flask, elixir, and food buff uptime per player across the entire raid. Computes percentage of total raid time (first event to last event) each player had any flask/elixir and any food buff active.

### Categories
- **Flasks** (5): Stoneblood, Frost Wyrm, Endless Rage, Pure Mojo, Lesser Resistance
- **Battle Elixirs** (11): Mighty Strength, Accuracy, Expertise, Deadly Strikes, Lightning Speed, Guru's, Wrath, Mighty Agility, Mighty Mageblood, Armor Piercing, Spirit
- **Guardian Elixirs** (5): Defense, Mighty Fortitude, Protection, Mighty Thoughts, Mighty Defense
- **Food Buffs** (15): Fish Feast + 14 individual food buffs

### Implementation
- New `BuffUptimeTracker` (`src/state/buff-uptime-tracker.ts`) uses interval-based tracking via `SPELL_AURA_APPLIED` / `SPELL_AURA_REMOVED` / `SPELL_AURA_REFRESH` events.
- `flaskUptimePercent`: union of all flask + elixir intervals (merged, no double-counting).
- `foodUptimePercent`: union of all food buff intervals.
- Per-buff breakdown in `BuffBreakdown[]` shows individual buff uptimes.
- Edge cases: buff active at log start (retroactive from raidStartMs), buff active at log end (closed at raidEndMs), duplicate applies, refreshes.
- Data stored on `PlayerInfo.buffUptime` and `ParsedRaid.raidDurationMs`.

### Per-Encounter Uptime
- `EncounterSummary.buffUptime` — per-player `EncounterBuffUptime` (flaskUptimePercent, foodUptimePercent) for each boss encounter.
- `PlayerBuffUptime.encounterFlaskUptimePercent` / `encounterFoodUptimePercent` — raid-wide aggregate computed across all encounter time only (denominator = sum of encounter durations).
- Uses `computeUptimeForWindow()` — a pure query over accumulated intervals that doesn't mutate state. Called at encounter end by the state machine.

## Combat Stats Tracking (parseLog only)

Tracks per-player per-encounter damage done and damage taken via `CombatTracker`. Stored in `EncounterSummary.combatStats` and aggregated in `PlayerInfo.combatStats`.

### Damage Done
- **Useful damage** = amount - overkill (overkill of -1 treated as 0)
- **Event types**: SWING_DAMAGE, SPELL_DAMAGE, SPELL_PERIODIC_DAMAGE, RANGE_DAMAGE, DAMAGE_SHIELD
- **Friendly fire excluded**: Damage to players (`isPlayer(destGuid)`) or friendly-flagged targets (`destFlags & 0x0010`) is skipped
- **Field positions**: SWING_DAMAGE: amount at rawFields[0], overkill at [1]. All others: amount at rawFields[3], overkill at [4]

### Damage Taken
- **Raw amount** — no overkill subtraction (amount field only). Matches uwu-logs behavior for damage taken analysis.
- **Event types**: Same 5 as damage done (SWING_DAMAGE, SPELL_DAMAGE, SPELL_PERIODIC_DAMAGE, RANGE_DAMAGE, DAMAGE_SHIELD). No ENVIRONMENTAL_DAMAGE.
- **Player dest only**: Only `isPlayer(destGuid)` targets counted.
- **No source filtering**: All sources count regardless of NPC whitelist.
- Stored on `PlayerCombatStats.damageTaken`, same per-encounter and raid-wide aggregation as damage done.

### Pet→Owner Merging
Pet damage is attributed to the owner player. Three detection methods:
1. **SPELL_SUMMON** — Player summons pet (DK Army, Gargoyle, Warlock demons, etc.)
2. **PET_FILTER_SPELLS** (~90 spells) — Known pet↔owner interaction spells detect ownership bidirectionally. Covers Hunter (Mend Pet, Kill Command, Bestial Wrath), Warlock (Health Funnel, Soul Link, Dark Pact), DK (Ghoul Frenzy, Death Pact), and pet→owner auras (Kindred Spirits, Furious Howl, Call of the Wild). Sourced from uwu-logs.

### Encounter-Valid NPC Whitelist
- `src/data/encounter-npcs.ts` — per-boss whitelist of valid target NPC IDs (6-char hex from GUID).
- Only damage to NPCs in the whitelist counts as encounter damage. Prevents trash pulled from other rooms from inflating DPS.
- Data sourced from uwu-logs (`logs_dmg_useful.py` USEFUL + ALL_GUIDS). Covers all 9 WotLK raids (63 bosses).
- Fallback: if no whitelist defined for an encounter, all non-friendly damage is counted.
- `CombatTracker.onEncounterStart(bossName)` loads the whitelist via `getEncounterValidNpcs()`.

### Validated Numbers (vs wow-logs reference)
- Patchwerk: Egaroto +0.22%, Mopex exact match
- Razuvious: Mareshall exact match
- Lord Marrowgar (ICC, log-9): all 21 players exact match with wow-logs

## Deaths Tracking (parseLog only)

Tracks player deaths during encounters with a "death recap" showing the last 10 damage/heal events before each death.

### Implementation
- New `DeathTracker` (`src/state/death-tracker.ts`) uses a rolling circular buffer (size 10) per player.
- Buffer populated by damage events (SWING_DAMAGE, SPELL_DAMAGE, SPELL_PERIODIC_DAMAGE, RANGE_DAMAGE, DAMAGE_SHIELD, ENVIRONMENTAL_DAMAGE) and healing events (SPELL_HEAL, SPELL_PERIODIC_HEAL) targeting players.
- On `UNIT_DIED` for a player, buffer is snapshotted as recap, killing blow identified as last positive-amount event.
- Healing events stored with negative amounts to distinguish from damage.
- After snapshot, buffer is cleared (player might get battle-rezzed and die again).
- `EncounterSummary.deaths` — `PlayerDeath[]` with recap, killing blow, time into encounter (seconds).
- `PlayerInfo.deathCount` — total deaths across all encounters.

## Externals Tracking (parseLog only)

Tracks a curated list of 17 WotLK external buff spells cast by one player on another during encounters. Records count, uptime %, and individual start/end interval timestamps.

### Categories
- **Raid Cooldowns**: Bloodlust (2825), Heroism (32182)
- **DPS Externals**: Power Infusion (10060), Tricks of the Trade (57934), Hysteria (49016), Focus Magic (54646)
- **Healer Externals**: Innervate (29166)
- **Tank/Utility**: Misdirection (34477), Hand of Salvation (1038), Hand of Freedom (1044)
- **Defensive**: Hand of Sacrifice (6940), Hand of Protection (10278), Pain Suppression (33206), Guardian Spirit (47788), Divine Sacrifice (64205), Divine Guardian (70940), Intervene (3411)

### Implementation
- New `ExternalsTracker` (`src/state/externals-tracker.ts`) uses interval-based tracking via SPELL_AURA_APPLIED/REMOVED/REFRESH.
- Data file: `src/data/external-data.ts` — curated Map of external spell IDs.
- Cross-player only (source != dest). Self-buffs excluded.
- Tracks same spell from different sources separately.
- Buffs active at encounter start captured with start = encounter start time.
- Open intervals closed at encounter end.
- `EncounterSummary.externals` — `Record<destGuid, ExternalBuffUse[]>` with count, uptimePercent, intervals.
- `PlayerInfo.externals` — `PlayerExternalsSummary` with raid-wide aggregate counts and uptime.

## Player Participation

Both `scanLog` and `parseLog` filter player lists to only include players who actually participated in each encounter. Participation is determined by combat events — aura-only events (`SPELL_AURA_APPLIED`, `SPELL_AURA_REMOVED`, `SPELL_AURA_REFRESH`) do not count as participation.

## Known WotLK Quirks

- **No year in timestamps** — Format is `M/D HH:MM:SS.mmm`. Year is inferred.
- **Grobbulus hallway poison** — Triggers 6s phantom encounters. Filtered by 10s minimum duration.
- **Post-kill lingering events** — DoT ticks, aura removals reference dead boss GUIDs. Handled by 30s post-kill cooldown + aura event filtering.
- **`SPELL_AURA_REMOVED` source GUIDs** — Unreliable for class detection. Excluded.
- **Multi-raid log files** — Multiple raids concatenated with no separators. Split by time gaps (30min), date changes, instance changes, and Jaccard roster similarity (>= 0.5).
- **Flame Cap nil source GUID** — `SPELL_CAST_SUCCESS` for Flame Cap (28714) has nil source. Player identified via `SPELL_AURA_APPLIED` dest instead.
- **Abbreviated potion names** — Logs show "Speed" not "Potion of Speed". We use explicit `displayName` in consumable-data.ts.

## uwu-logs Reference

Encounter timing was aligned with [uwu-logs](https://github.com/Ridepad/uwu-logs) (`logs_fight_separator.py`). Key decisions:

- **Kill event**: `UNIT_DIED` only (not `PARTY_KILL` which fires 14-60ms earlier)
- **Start trim**: Leading lines ending with `,BUFF` are skipped (DEBUFF auras CAN start encounters)
- **FLAGS set**: UNIT_DIED, SWING_DAMAGE, SPELL_DAMAGE, SPELL_PERIODIC_DAMAGE, RANGE_DAMAGE, DAMAGE_SHIELD, SPELL_HEAL, SPELL_PERIODIC_HEAL, SPELL_AURA_APPLIED, SPELL_AURA_REMOVED
- **Known remaining delta**: SPELL_MISSED can start encounters in our parser but not in uwu-logs (deferred fix, affects Faerlina +0.344s, Grobbulus +0.205s)

## Supported Raids (9 instances, 63 bosses)

Naxxramas (15), Obsidian Sanctum (1), Eye of Eternity (1), Vault of Archavon (4), Ulduar (14), Trial of the Crusader (5), Onyxia's Lair (1), Icecrown Citadel (12), Ruby Sanctum (1).

## Gzip Support

Both `scanLog` and `parseLog` (and `parseLogStream`) auto-detect gzip-compressed input. If the first two bytes are the gzip magic bytes (`0x1f 0x8b`), the stream is piped through `DecompressionStream('gzip')` before parsing. No configuration needed — pass `.txt` or `.txt.gz` files and it works.

Compression ratios for WoW combat logs: 12-13x with gzip (591 MB → 48 MB).

## File Size Limit

All parse functions accept `maxBytes` option (default: 1 GB / 1,073,741,824 bytes). The limit applies to decompressed bytes. Exceeding it throws `FileTooLargeError`.

## Streaming Parse API (parseLogStream)

`parseLogStream(stream, selections, options)` is an AsyncGenerator that yields `ParsedEncounter` objects as each boss encounter completes. Returns `ParseStreamSummary` with raid-wide aggregates when done.

Consumer usage for incremental DB persistence:
```typescript
const gen = parseLogStream(file.stream(), selections);
for await (const encounter of gen) {
  await db.encounters.insert(encounter);  // save each encounter immediately
}
```

Memory stays bounded: each encounter's data is yielded, saved, and GC'd.

## Consumer

This library is consumed by `~/www/wow-core` (Next.js app). It replaces `log-parser.ts`, `log-scanner.ts`, `log-scanner.worker.ts`, and `wow-raids.ts` in that project.
