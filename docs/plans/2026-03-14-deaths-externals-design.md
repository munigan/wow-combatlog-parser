# Deaths Tracking & Externals Tracking Design

**Date:** 2026-03-14
**Scope:** parseLog() only (not scanLog)

## Goal

Add two new trackers to parseLog:

1. **DeathTracker** — Track player deaths during encounters, including a "death recap" showing the last 10 damage/heal events before each death. Identifies the killing blow spell.
2. **ExternalsTracker** — Track a curated list of external buff spells cast by one player on another during encounters. Records count, uptime %, and individual start/end interval timestamps per application.

Both features are required to display the "Deaths" and "Externals" pages shown by wow-logs.

## Feature 1: Deaths Tracker

### Decisions

- **parseLog only** — deaths are not tracked during scanLog.
- **Encounter-scoped** — deaths are only recorded during active encounters. Deaths between encounters are ignored.
- **Rolling buffer of 10** — per-player circular buffer holding the last 10 incoming damage and healing events. Snapshotted on UNIT_DIED.
- **Killing blow** — the last damage event in the recap before death. If no damage events in the buffer, killing blow is null (mysterious death).
- **Raid-wide aggregate** — only death count per player (not full recaps aggregated).

### Tracked Events

**Buffer population (during encounters):**
- `SWING_DAMAGE` — where dest is a player
- `SPELL_DAMAGE`, `SPELL_PERIODIC_DAMAGE`, `RANGE_DAMAGE`, `DAMAGE_SHIELD` — where dest is a player
- `ENVIRONMENTAL_DAMAGE` — where dest is a player
- `SPELL_HEAL`, `SPELL_PERIODIC_HEAL` — where dest is a player (shown as negative amounts in recap)

**Death detection:**
- `UNIT_DIED` — where dest is a player GUID

### Data Structures

```typescript
interface DeathRecapEvent {
  timestamp: number;          // epoch ms
  sourceGuid: string;
  sourceName: string;
  spellId: number | null;     // null for SWING/ENVIRONMENTAL
  spellName: string;          // "Melee" for SWING, "Environmental" for ENVIRONMENTAL, spell name otherwise
  amount: number;             // positive = damage, negative = healing
  eventType: string;          // original event type (for UI to distinguish damage vs heal)
}

interface PlayerDeath {
  playerGuid: string;
  playerName: string;
  timestamp: number;          // epoch ms
  timeIntoEncounter: number;  // seconds since encounter start (decimal, ms precision)
  killingBlow: DeathRecapEvent | null;
  recap: DeathRecapEvent[];   // last 10 events before death, chronological order
}
```

**On EncounterSummary:** `deaths?: PlayerDeath[]`
**On PlayerInfo:** `deathCount?: number`

### Field Extraction

For damage events, amount is extracted from `rawFields` using the same `extractFieldInt` approach as CombatTracker:
- `SWING_DAMAGE`: amount at rawFields[0]
- `SPELL_DAMAGE` / `SPELL_PERIODIC_DAMAGE` / `RANGE_DAMAGE` / `DAMAGE_SHIELD`: amount at rawFields[3]
- `ENVIRONMENTAL_DAMAGE`: amount at rawFields[1]
- `SPELL_HEAL` / `SPELL_PERIODIC_HEAL`: amount at rawFields[3] (effective = amount - overhealing at [4], but for recap we store raw amount as negative to indicate healing)

For healing events, `amount` is stored as negative to distinguish from damage in the recap.

### Tracker Lifecycle

| Method | Behavior |
|--------|----------|
| `processEvent(event)` | During encounters: push damage/heal events to rolling buffer per player. On UNIT_DIED: snapshot buffer, record death. |
| `onEncounterStart(startTimestamp)` | Clear all buffers and current encounter deaths. Record start time. |
| `onEncounterEnd()` | Return `PlayerDeath[]`. Push to completed list. Clear state. |
| `forceEnd()` | If in encounter, return current deaths. |
| `getPlayerSummaries()` | Return `Map<guid, number>` — death count per player across all encounters. |

### Edge Cases

- **Same player dies multiple times** — each death is a separate `PlayerDeath` entry. Buffer resets after snapshotting.
- **Player dies with no damage in buffer** — recap is empty, killingBlow is null (mysterious death). This matches wow-logs "Unknown Mysterious Death" display.
- **Overkill** — not subtracted for recap purposes. The raw damage amount is shown.

---

## Feature 2: Externals Tracker

### Decisions

- **parseLog only** — externals are not tracked during scanLog.
- **Curated spell list** — only track specific known external buff spell IDs. No noise from raid auras, totems, etc.
- **Cross-player only** — only record when `sourceGuid != destGuid`. Self-buffs are excluded (e.g., a shaman casting Bloodlust counts on all recipients except themselves).
- **Count + uptime % + intervals** — per spell per recipient: how many times applied, uptime % relative to encounter duration, and individual [start, end] interval timestamps.
- **Interval-based** — use SPELL_AURA_APPLIED / SPELL_AURA_REMOVED to track start/end. Same pattern as BuffUptimeTracker.

### Tracked Events

- `SPELL_AURA_APPLIED` — where spellId is in external spells list and sourceGuid != destGuid
- `SPELL_AURA_REMOVED` — where spellId is in external spells list (to close intervals)
- `SPELL_AURA_REFRESH` — where spellId is in external spells list (to handle refreshes)

### Curated Spell List

New file: `src/data/external-data.ts`

| Spell ID | Name | Category |
|----------|------|----------|
| 2825 | Bloodlust | raid_cooldown |
| 32182 | Heroism | raid_cooldown |
| 10060 | Power Infusion | dps_external |
| 29166 | Innervate | healer_external |
| 57934 | Tricks of the Trade | dps_external |
| 57933 | Tricks of the Trade (aura on target) | dps_external |
| 34477 | Misdirection | tank_external |
| 35079 | Misdirection (aura on target) | tank_external |
| 1038 | Hand of Salvation | tank_external |
| 6940 | Hand of Sacrifice | defensive |
| 10278 | Hand of Protection | defensive |
| 1044 | Hand of Freedom | utility |
| 33206 | Pain Suppression | defensive |
| 47788 | Guardian Spirit | defensive |
| 49016 | Unholy Frenzy / Hysteria | dps_external |
| 54646 | Focus Magic | dps_external |
| 64205 | Divine Sacrifice | defensive |
| 70940 | Divine Guardian | defensive |
| 3411 | Intervene | defensive |
| 53601 | Sacred Shield (external) | defensive |
| 48066 | Power Word: Shield (rank 14) | defensive |
| 14751 | Inner Focus (if cast on other, but typically self) | healer_external |

Note: The exact list will be refined during implementation. Some spells like Power Word: Shield may need special handling (high frequency, always cross-player). The category field is informational only — it helps the UI group externals but doesn't affect tracking logic.

### Data Structures

```typescript
interface ExternalBuffUse {
  spellId: number;
  spellName: string;
  sourceGuid: string;
  sourceName: string;
  count: number;                            // number of applications
  uptimePercent: number;                    // 0-100, relative to encounter duration
  intervals: Array<[number, number]>;       // [startMs, endMs] pairs
}

type EncounterExternals = Record<string, ExternalBuffUse[]>;  // keyed by destPlayerGuid

interface PlayerExternalsSummary {
  received: ExternalBuffSummary[];
}

interface ExternalBuffSummary {
  spellId: number;
  spellName: string;
  totalCount: number;                       // total applications across all encounters
  uptimePercent: number;                    // 0-100, relative to total encounter time
}
```

**On EncounterSummary:** `externals?: EncounterExternals`
**On PlayerInfo:** `externals?: PlayerExternalsSummary`

### Tracker Internal State

```typescript
// Persistent across encounters (tracks currently active auras)
private _activeAuras = new Map<string, ActiveAura>();  // key: "destGuid:spellId:sourceGuid"

interface ActiveAura {
  spellId: number;
  spellName: string;
  sourceGuid: string;
  sourceName: string;
  destGuid: string;
  startTimestamp: number;
}

// Per-encounter accumulator
private _currentEncounter = new Map<string, Map<string, InternalExternalUse>>();
// outer key: destGuid, inner key: "spellId:sourceGuid"

interface InternalExternalUse {
  spellId: number;
  spellName: string;
  sourceGuid: string;
  sourceName: string;
  count: number;
  intervals: Array<[number, number]>;
}
```

### Uptime Calculation

At encounter end:
1. Close any open intervals at encounter end timestamp
2. For each `ExternalBuffUse`, compute: `uptimePercent = (sum of interval durations / encounterDurationMs) * 100`
3. Cap at 100% (in case of overlapping intervals from the same spell from different sources — though this is rare)

For raid-wide aggregate (`PlayerExternalsSummary`):
- Sum counts across encounters per spellId
- uptimePercent denominator = sum of all encounter durations (same approach as `encounterFlaskUptimePercent`)

### Tracker Lifecycle

| Method | Behavior |
|--------|----------|
| `processEvent(event)` | Always: track AURA_APPLIED/REMOVED/REFRESH for external spells. During encounters: record to per-encounter accumulator. |
| `onEncounterStart(startTimestamp)` | Clear per-encounter accumulator. Check _activeAuras for any already-active externals and record them with start = encounter start. |
| `onEncounterEnd(endTimestamp, durationMs)` | Close open intervals. Compute uptimePercent. Return EncounterExternals. Push to completed list. |
| `forceEnd(endTimestamp, durationMs)` | If in encounter, call onEncounterEnd. |
| `getPlayerSummaries(totalEncounterDurationMs)` | Aggregate across all encounters. Return Map<guid, PlayerExternalsSummary>. |

### Edge Cases

- **Bloodlust affects entire raid** — one SPELL_AURA_APPLIED per recipient. Each is recorded as a separate entry with the shaman as source.
- **Tricks of the Trade** — may have two spell IDs (cast and aura). We track the aura spell ID that appears on the recipient.
- **Buff active at encounter start** — if the aura was applied before the encounter started, we record it with start = encounter start time (similar to BuffUptimeTracker retroactive handling).
- **Buff still active at encounter end** — interval is closed at encounter end time.
- **Same external from different sources** — tracked separately (different sourceGuid), so you can see who gave Tricks to whom.

---

## Integration in State Machine

Both trackers follow the established pattern:

1. Add nullable fields in `CombatLogStateMachine`:
   - `private _deathTracker: DeathTracker | null = null`
   - `private _externalsTracker: ExternalsTracker | null = null`

2. Instantiate in constructor when `trackConsumables = true` (the parseLog path).

3. Call `processEvent()` in step 3 (before encounter tracker). Order: consumable → combat → buffUptime → **death → externals**.

4. Call `onEncounterStart()` in step 5.

5. Call `onEncounterEnd()` in step 8:
   - `encounter.deaths = deathTracker.onEncounterEnd()`
   - `encounter.externals = externalsTracker.onEncounterEnd(endTimestamp, durationMs)`

6. Call `forceEnd()` in `finalize()`.

7. Add getter methods for raid-wide aggregation.

8. In `parser.ts`, map results to `PlayerInfo.deathCount` and `PlayerInfo.externals`.

## New Files

- `src/state/death-tracker.ts` — DeathTracker class
- `src/state/externals-tracker.ts` — ExternalsTracker class
- `src/data/external-data.ts` — Curated external spell list

## Modified Files

- `src/types.ts` — Add new interfaces and optional fields
- `src/state/state-machine.ts` — Compose new trackers
- `src/parser.ts` — Map results to PlayerInfo
- `src/index.ts` — Export new types
- `tests/unit/death-tracker.test.ts` — Unit tests
- `tests/unit/externals-tracker.test.ts` — Unit tests
