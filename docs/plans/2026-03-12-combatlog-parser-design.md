# WoW Combat Log Parser Library Design

**Date:** 2026-03-12  
**Status:** Approved

## Purpose

A TypeScript library that parses World of Warcraft WotLK 3.3.5 combat log files via streaming. Used by host applications (like wow-core) on both client-side (browser/web workers) and server-side (Node.js API routes). Replaces all parsing logic currently in wow-core (log-parser.ts, log-scanner.ts, log-scanner.worker.ts, wow-raids.ts).

## Constraints

- **WotLK 3.3.5 only**: No ENCOUNTER_START/END markers exist in these logs. Encounter detection uses GUID-based heuristics.
- **Memory-conscious**: Log files can be 100MB+. The library streams lines and maintains only current state, not all lines in memory.
- **Universal runtime**: Single API accepting `ReadableStream<Uint8Array>`, works in browser, Node 18+, Deno, Bun.
- **Zero dependencies**: Pure TypeScript, no runtime deps.
- **npm package**: Published to npm, installed as a regular dependency.

## Architecture: Streaming State Machine

Single-pass streaming parser built around a state machine that processes lines one at a time. State transitions happen based on time gaps, GUID patterns, and boss detection events.

### Pipeline

```
ReadableStream<Uint8Array>
  → TextDecoderStream (UTF-8)
  → LineSplitter (handles partial chunks, yields complete lines)
  → LineParser (extracts timestamp, event type, fields from raw text)
  → StateMachine (maintains state, detects raids/encounters/players)
  → Result accumulator
```

### Why This Approach

- Constant memory: only keeps current state, not all lines
- Single codebase for both scan and parse modes
- Natural fit for Web Streams API
- Trade-off: can't look backward, but encounter detection works well forward-only (encounters end when you see a time gap or boss death)

## Public API

### scanLog (client-side, lightweight)

```typescript
async function scanLog(
  stream: ReadableStream<Uint8Array>,
  options?: ScanOptions
): Promise<ScanResult>

interface ScanOptions {
  onProgress?: (bytesRead: number, totalBytes?: number) => void
}

interface ScanResult {
  raids: DetectedRaid[]
}

interface DetectedRaid {
  raidInstance: string | null
  dates: string[]
  startTime: string                 // ISO-8601
  endTime: string                   // ISO-8601
  timeRanges: TimeRange[]
  playerCount: number
  players: PlayerInfo[]
  encounters: EncounterSummary[]
}

interface PlayerInfo {
  guid: string
  name: string
  class: WowClass | null
  spec: WowSpec | null
}

interface EncounterSummary {
  bossName: string
  startTime: string                 // ISO-8601
  endTime: string                   // ISO-8601
  duration: number                  // seconds
  result: 'kill' | 'wipe'
  difficulty: RaidDifficulty | null
}
```

### parseLog (server-side, detailed)

```typescript
async function parseLog(
  stream: ReadableStream<Uint8Array>,
  raidSelections: RaidSelection[],
  options?: ParseOptions
): Promise<ParseResult>

interface RaidSelection {
  dates: string[]
  startTime: string
  endTime: string
  timeRanges?: TimeRange[]
}

interface ParseResult {
  raids: ParsedRaid[]
}

interface ParsedRaid {
  raidInstance: string | null
  raidDate: Date
  players: PlayerInfo[]
  encounters: EncounterSummary[]
}
```

`scanLog` detects raids, encounters, and players in a single pass. `parseLog` re-parses within specific time ranges for authoritative extraction (the two-phase approach wow-core uses today).

## Internal Modules

### line-parser.ts

Parses raw log lines into structured `LogEvent` objects. Uses fast string operations: `indexOf` for the double-space separator, positional `split(',', 8)` for the common prefix, and lazy parsing of remaining fields. Handles quoted names containing commas.

```typescript
interface LogEvent {
  timestamp: number      // epoch ms
  date: string           // raw "M/D"
  time: string           // raw "HH:MM:SS.mmm"
  eventType: string
  sourceGuid: string
  sourceName: string
  destGuid: string
  destName: string
  rawFields: string      // unparsed remainder
}
```

### guid.ts

GUID type detection by prefix: `0x0E` = player, `0xF130` = NPC, `0xF140` = pet, `0xF150` = vehicle. Extracts NPC ID from GUID middle bytes for boss lookup.

### state-machine.ts

Three states: `IDLE → IN_RAID → IN_ENCOUNTER`

- `IDLE → IN_RAID`: First combat event
- `IN_RAID → IN_ENCOUNTER`: Boss GUID detected in event source/target
- `IN_ENCOUNTER → IN_RAID`: Boss dies (UNIT_DIED/PARTY_KILL) or time gap exceeds boss-specific idle threshold
- `IN_RAID → IDLE`: Time gap > 30 minutes or date change (raid segment finalized)

### raid-separator.ts

Splits the stream into raid sessions:

1. Date change → always new segment
2. Time gap > 30 minutes on same date → potential new segment
3. Boss from different raid instance → forced segment break
4. Post-stream: merge adjacent segments with Jaccard roster similarity >= 0.5 and same raid instance
5. Group segments across dates by raid instance + roster overlap

### encounter-tracker.ts

Detects encounter boundaries within a raid:

1. **Start**: First event involving a boss NPC GUID (trimming pre-pull buff events)
2. **End**: Boss death event, or time gap exceeding the boss-specific idle threshold (default 30s; Lich King/Halion/Anub'arak: 120s; Mimiron/Yogg: 60s)
3. **Kill detection**: UNIT_DIED or PARTY_KILL for the boss GUID. "Coward" bosses (Kologarn, Hodir, etc.) detected by 15+ consecutive SPELL_AURA_REMOVED events
4. **Difficulty**: Matched from boss-specific spell IDs seen during the encounter. Fallback: player count (>10 = 25-man)
5. **Multi-boss**: Blood Prince Council and similar encounters map multiple NPC GUIDs to one encounter name

### class-detection.ts & spec-detection.ts

Static maps ported from uwu-logs:
- `SPELL_TO_CLASS`: ~200 spell IDs → class (first match during scan is final)
- `SPELL_TO_SPEC`: ~300 talent-specific spell IDs → spec

Detection runs inline during the streaming pass. When a player casts a class/spec-defining spell, their class/spec is set.

### boss-data.ts

Static data:
- `BOSS_NPC_IDS`: NPC ID (GUID middle bytes) → boss name (~200 entries covering all WotLK raids)
- `BOSS_TO_RAID`: Boss name → raid instance name
- `BOSS_IDLE_THRESHOLDS`: Per-boss encounter idle thresholds
- `MULTI_BOSS_MAP`: Multi-NPC encounters → single encounter name
- `DIFFICULTY_SPELLS`: Boss-specific spell IDs identifying 10N/10H/25N/25H

## Project Structure

```
wow-combatlog-parser/
├── src/
│   ├── index.ts              # Public API exports
│   ├── scanner.ts            # scanLog implementation
│   ├── parser.ts             # parseLog implementation
│   ├── pipeline/
│   │   ├── line-splitter.ts  # TransformStream: chunks → complete lines
│   │   └── line-parser.ts    # Raw line → LogEvent
│   ├── state/
│   │   ├── state-machine.ts  # Core state machine
│   │   ├── raid-separator.ts # Raid segment tracking/merging
│   │   └── encounter-tracker.ts
│   ├── detection/
│   │   ├── class-detection.ts
│   │   ├── spec-detection.ts
│   │   └── difficulty.ts
│   ├── data/
│   │   ├── boss-data.ts
│   │   ├── spell-book.ts
│   │   └── difficulty-spells.ts
│   ├── utils/
│   │   ├── guid.ts
│   │   ├── timestamp.ts
│   │   └── fields.ts
│   └── types.ts
├── tests/
│   ├── unit/
│   └── integration/
├── example-logs/
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## Build & Packaging

- **Build**: tsup, producing ESM + CJS with type declarations
- **Target**: ES2022
- **Exports**: Dual `"import"` / `"require"` in package.json
- **Dependencies**: None (zero runtime deps)

## Testing

- **Unit tests** (vitest): Line parser, GUID utils, timestamp parser, field splitter, class/spec detection, state machine transitions
- **Integration tests**: Feed example log files through scanLog/parseLog, assert expected raids, encounters, players
- **Test fixtures**: Hand-crafted log snippets for edge cases (multi-boss, interleaved raids, wipe detection, date rollover, coward bosses)

## Future Extensions (Not in v1)

- Per-encounter DPS/HPS/damage-taken aggregation
- Per-spell damage/healing breakdowns
- Absorb reconstruction
- Consumable/enchant tracking
- Death log extraction
- Pet-to-owner attribution
- Support for modern WoW log formats (ENCOUNTER_START/END)
