# Flask & Food Buff Uptime Tracking Design

**Date:** 2026-03-14
**Scope:** parseLog() only (not scanLog)

## Goal

Track flask, elixir, and food buff uptime per player across the entire raid. Compute a percentage of total raid time each player had any flask/elixir active and any food buff active, plus a per-buff breakdown showing which specific buffs were used and for what portion of the raid.

## Decisions

- **Raid-wide only** — no per-encounter uptime. Single aggregate percentage per player.
- **Total log time denominator** — uptime % = buff active time / (last event - first event). Not encounter-only time.
- **New dedicated tracker** — `BuffUptimeTracker`, separate from `ConsumableTracker`. Different concern (duration vs count).
- **Flasks + elixirs combined** — any flask or any elixir counts toward `flaskUptimePercent`. Players use either 1 flask or 2 elixirs; both strategies are valid.
- **Any elixir counts** — a player with only 1 of 2 elixirs still gets uptime credit. The per-buff breakdown shows exactly which buffs were active; the consumer decides completeness policy.
- **Interval-based tracking** — store apply/remove timestamps as intervals. Flask/elixir/food buffs change rarely (a few times per raid), so interval arrays stay tiny.

## Buff Categories

| Category | Description |
|----------|-------------|
| `flask` | Flask buffs (mutually exclusive with elixirs) |
| `battle_elixir` | Battle elixir buffs |
| `guardian_elixir` | Guardian elixir buffs |
| `food` | Well Fed buffs from food/feasts |

## Tracked Spell IDs

### Flasks (5)

| Spell ID | Name |
|----------|------|
| 53758 | Flask of Stoneblood |
| 53755 | Flask of the Frost Wyrm |
| 53760 | Flask of Endless Rage |
| 54212 | Flask of Pure Mojo |
| 62380 | Lesser Flask of Resistance |

### Battle Elixirs (11)

| Spell ID | Name |
|----------|------|
| 53748 | Elixir of Mighty Strength |
| 60340 | Elixir of Accuracy |
| 60344 | Elixir of Expertise |
| 60341 | Elixir of Deadly Strikes |
| 60346 | Elixir of Lightning Speed |
| 53749 | Guru's Elixir |
| 53746 | Wrath Elixir |
| 28497 | Elixir of Mighty Agility |
| 53764 | Elixir of Mighty Mageblood |
| 60345 | Elixir of Armor Piercing |
| 53747 | Elixir of Spirit |

### Guardian Elixirs (5)

| Spell ID | Name |
|----------|------|
| 60343 | Elixir of Defense |
| 53751 | Elixir of Mighty Fortitude |
| 53763 | Elixir of Protection |
| 53752 | Elixir of Mighty Thoughts |
| 60347 | Elixir of Mighty Defense |

### Food Buffs (15)

| Spell ID | Name |
|----------|------|
| 57399 | Well Fed (Fish Feast) |
| 57294 | Well Fed (generic) |
| 57111 | Well Fed (Snapper Extreme) |
| 57325 | Well Fed (Firecracker Salmon) |
| 57327 | Well Fed (Tender Shoveltusk Steak) |
| 57329 | Well Fed (Imperial Manta Steak) |
| 57332 | Well Fed (Mega Mammoth Meal) |
| 57334 | Well Fed (Poached Northern Sculpin) |
| 57356 | Well Fed (Spiced Worm Burger) |
| 57358 | Well Fed (Very Burnt Worg) |
| 57360 | Well Fed (Rhinolicious Wormsteak) |
| 57365 | Well Fed (Blackened Dragonfin) |
| 57367 | Well Fed (Cuttlesteak) |
| 57371 | Well Fed (Dragonfin Filet) |
| 57373 | Well Fed (Great Feast) |

## Architecture

New file: `src/state/buff-uptime-tracker.ts` — peer to `consumable-tracker.ts` and `combat-tracker.ts`.

New file: `src/data/buff-data.ts` — spell IDs and metadata for flasks, elixirs, and food buffs.

### Internal State

```typescript
// Per-player, per-spell interval tracking
_intervals: Map<string, Map<string, {      // playerGuid → spellId →
  spellName: string;
  category: BuffCategory;
  currentStart: number | null;              // epoch ms when buff was applied, null if inactive
  completedMs: number;                      // accumulated ms from closed intervals
}>>
```

### Event Processing

Only processes 3 event types on player dest GUIDs:

- **`SPELL_AURA_APPLIED`** — If spellId is in `BUFF_SPELLS`, open an interval: set `currentStart = event.timestamp`. If an interval is already open for the same player+spell (duplicate apply without remove), close the old one first and open fresh.
- **`SPELL_AURA_REMOVED`** — If spellId is in `BUFF_SPELLS` and an interval is open, close it: `completedMs += (event.timestamp - currentStart)`, set `currentStart = null`. If no interval is open (buff was active before log started), assume active since `raidStartMs` and record `completedMs = event.timestamp - raidStartMs`.
- **`SPELL_AURA_REFRESH`** — If no open interval exists (buff was active before log started), open retroactively from `raidStartMs`. Otherwise no action needed — the buff is still active.

### Edge Cases

**Buff active at log start** — No `SPELL_AURA_APPLIED` seen. First observed via `SPELL_AURA_REMOVED` or `SPELL_AURA_REFRESH`. Retroactively assume active since `raidStartMs`.

**Buff active at log end** — `SPELL_AURA_APPLIED` with no corresponding remove. Closed at `raidEndMs` during finalization.

**Duplicate SPELL_AURA_APPLIED** — Two applies without a remove. Close the first interval, open a new one.

**Note on raidStartMs for retroactive intervals:** The tracker needs to know `raidStartMs` to handle the "buff active at log start" edge case. This is passed during finalization. For `SPELL_AURA_REMOVED` / `SPELL_AURA_REFRESH` events with no open interval, the event is deferred — we record that the buff was seen as "already active" and resolve the start time during finalization.

### Finalization

`finalize(raidStartMs: number, raidEndMs: number): Map<string, PlayerBuffUptime>`

1. For any "already active" entries (seen via remove/refresh with no prior apply), set their interval start to `raidStartMs`.
2. Close any still-open intervals at `raidEndMs`.
3. For each player, compute per-buff `uptimeMs` and `uptimePercent`.
4. Compute `flaskUptimePercent`: merge all flask + elixir intervals into a union (sort by start, merge overlaps), sum merged lengths / `raidDurationMs`.
5. Compute `foodUptimePercent`: same merge approach for food intervals.

### Interval Merge for Union

For `flaskUptimePercent`, individual flask/elixir uptimes can't be summed — a swap from Flask A to Flask B with no gap would double-count. Instead:

1. Collect all `[start, end]` pairs from all flask + elixir entries for this player
2. Sort by start time
3. Merge overlapping/adjacent intervals
4. Sum merged lengths → flask uptime ms

Same for `foodUptimePercent` with food intervals.

## Type Changes

```typescript
// New types in src/types.ts
export type BuffCategory = "flask" | "battle_elixir" | "guardian_elixir" | "food";

export interface BuffBreakdown {
  spellId: number;
  spellName: string;
  category: BuffCategory;
  uptimeMs: number;
  uptimePercent: number;     // 0-100
}

export interface PlayerBuffUptime {
  flaskUptimePercent: number;   // 0-100, any flask OR elixir active
  foodUptimePercent: number;    // 0-100, any food buff active
  buffs: BuffBreakdown[];       // per-buff breakdown, sorted by uptimeMs desc
}

// Added to PlayerInfo
buffUptime?: PlayerBuffUptime;  // parseLog only

// Added to ParsedRaid
raidDurationMs: number;         // first event to last event, uptime denominator
```

## StateMachine Integration

```typescript
constructor(trackConsumables = false) {
  if (trackConsumables) {
    this._consumableTracker = new ConsumableTracker();
    this._combatTracker = new CombatTracker();
    this._buffUptimeTracker = new BuffUptimeTracker();  // NEW
  }
}
```

The tracker receives every event via `processEvent()`. It only acts on aura events for tracked spell IDs — everything else is ignored. No encounter start/end hooks needed.

Finalization is called once per raid segment with the segment's time boundaries.

## Output

`ParsedRaid.players[].buffUptime` — raid-wide uptime data per player.

`ParsedRaid.raidDurationMs` — total raid time used as the uptime denominator.

No per-encounter output. No data on `EncounterSummary`.

## Testing

### Unit Tests (`tests/unit/buff-uptime-tracker.test.ts`)

1. Single flask, full uptime → 100%
2. Single flask, partial uptime → correct percentage
3. Flask swap (A removed, B applied) → `flaskUptimePercent` shows no gap, `buffs` shows both
4. Flask gap → `flaskUptimePercent` reflects the gap
5. Elixir counts toward flask uptime
6. Food buff tracking independent from flask
7. Buff active at log start (no apply, only remove) → retroactive from raid start
8. Buff active at log end (apply, no remove) → closed at raid end
9. SPELL_AURA_REFRESH with no prior apply → retroactive from raid start
10. Duplicate SPELL_AURA_APPLIED → closes first, opens new
11. Unknown spell IDs ignored
12. Interval merge: overlapping flask+elixir intervals don't double-count

### Integration Tests

Parse real example log files, verify `buffUptime` populated on `PlayerInfo` and `raidDurationMs` on `ParsedRaid`.
