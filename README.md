# wow-combatlog-parser

Streaming parser for World of Warcraft **WotLK 3.3.5** combat log files. Zero runtime dependencies, dual ESM/CJS, works in browser, Node 18+, Deno, and Bun.

## Install

```bash
pnpm add wow-combatlog-parser
```

## API

Two functions, one streaming pipeline:

### `scanLog(stream, options?)` — Detect raids

Lightweight first pass. Reads the entire log in a single stream and returns detected raids, encounters, and players with class/spec. Does **not** track consumables.

```ts
import { scanLog } from "wow-combatlog-parser";

const stream = file.stream(); // ReadableStream<Uint8Array>
const { raids } = await scanLog(stream, {
  onProgress: (bytes) => console.log(`${bytes} bytes read`),
});

for (const raid of raids) {
  console.log(raid.raidInstance, raid.dates, raid.encounters.length);
}
```

### `parseLog(stream, selections, options?)` — Extract raid details

Second pass filtered by time ranges from `scanLog`. Processes events within selected raids and tracks consumable usage (potions, engineering bombs, flame cap) with pre-pot detection.

```ts
import { parseLog, type RaidSelection } from "wow-combatlog-parser";

const selection: RaidSelection = {
  dates: raid.dates,
  startTime: raid.startTime,
  endTime: raid.endTime,
  timeRanges: raid.timeRanges,
};

const stream = file.stream();
const { raids: parsed } = await parseLog(stream, [selection]);

// Per-encounter consumable usage
for (const encounter of parsed[0].encounters) {
  console.log(encounter.bossName, encounter.consumables);
}

// Raid-wide per-player summary
for (const player of parsed[0].players) {
  console.log(player.name, player.consumables);
}
```

**Typical flow**: `scanLog` → user picks raids → `parseLog` with `RaidSelection[]` from scan results.

## What it detects

- **Raids**: Naxxramas, Obsidian Sanctum, Eye of Eternity, Vault of Archavon, Ulduar, Trial of the Crusader, Onyxia's Lair, Icecrown Citadel, Ruby Sanctum (9 instances, 63 bosses)
- **Encounters**: Kill/wipe detection via `UNIT_DIED` + idle timeout, multi-boss fights (Four Horsemen, Assembly of Iron, Blood Prince Council, Twin Val'kyr, Northrend Beasts), coward bosses (Kologarn, Hodir, Thorim, Freya, Algalon)
- **Players**: GUID-based tracking, class detection (~380 spells), spec detection (~90 spells), per-encounter participation filtering
- **Difficulty**: Spell-based 10N/25N/10H/25H detection with player-count fallback
- **Raid separation**: Time gaps (30min), date changes, instance changes, Jaccard roster similarity (>= 0.5)
- **Consumables** (parseLog only): Potions (Speed, Wild Magic, Indestructible, etc.), Flame Cap, mana/healing potions, engineering bombs — with pre-pot detection via buff aura lifecycle tracking
- **Duration**: Millisecond precision (e.g., `88.573` seconds)

## Types

```ts
interface DetectedRaid {
  raidInstance: string | null;
  dates: string[];
  startTime: string;         // ISO-8601
  endTime: string;           // ISO-8601
  timeRanges: TimeRange[];
  playerCount: number;
  players: PlayerInfo[];
  encounters: EncounterSummary[];
}

interface PlayerInfo {
  guid: string;
  name: string;
  class: WowClass | null;    // "warrior" | "paladin" | ... | "druid"
  spec: WowSpec | null;      // "warrior-arms" | "paladin-holy" | ...
  consumables?: Record<number, ConsumableSummaryEntry>; // parseLog only
}

interface EncounterSummary {
  bossName: string;
  startTime: string;
  endTime: string;
  duration: number;           // seconds (decimal, millisecond precision)
  result: "kill" | "wipe";
  difficulty: RaidDifficulty | null;
  consumables?: Record<string, ConsumableUse[]>; // parseLog only (playerGuid → uses)
}

interface ConsumableUse {
  spellId: number;
  spellName: string;
  type: ConsumableType;       // "potion" | "mana_potion" | "flame_cap" | "engineering"
  prePot: boolean;
  count: number;
}

interface ConsumableSummaryEntry {
  spellName: string;
  type: ConsumableType;
  totalUses: number;
  prePotCount: number;
}
```

## Development

```bash
pnpm install
pnpm run build       # tsup → dist/
pnpm run test        # vitest (138 tests)
pnpm run typecheck   # tsc --noEmit
```

Example logs live in `tests/example-logs/` (gitignored, `example-log-{1..7}.txt`).

### Scripts

```bash
# Always build first — scripts import from dist/
pnpm run build

# Scan all example logs
npx tsx scripts/scan-all.ts | npx tsx scripts/summarize.ts

# Parse a specific log file
npx tsx scripts/parse-log.ts tests/example-logs/example-log-7.txt

# Scan + parse example-log-7 → result.json
npx tsx scripts/parse-log-7.ts
```

## Architecture

Single-pass streaming state machine. Constant memory, no storing all lines.

```
ReadableStream<Uint8Array>
  → TextDecoderStream
  → LineSplitter (TransformStream)
  → parseLine() → LogEvent
  → CombatLogStateMachine
      ├─ EncounterTracker (boss detection, kill/wipe/idle/coward)
      ├─ RaidSeparator (segment tracking, Jaccard merging)
      ├─ ConsumableTracker (potion/bomb/flame cap, pre-pot detection) [parseLog only]
      └─ Player detection (class/spec from spells, participation tracking)
  → groupSegmentsIntoRaids()
  → ScanResult / ParseResult
```

## License

MIT
