# wow-combatlog-parser

Streaming parser for World of Warcraft **WotLK 3.3.5** combat log files. Zero runtime dependencies, dual ESM/CJS, works in browser, Node 18+, Deno, and Bun.

## Install

```bash
pnpm add wow-combatlog-parser
```

## API

Two functions, one streaming pipeline:

### `scanLog(stream, options?)` — Detect raids

Lightweight first pass. Reads the entire log in a single stream and returns detected raids, encounters, and players with class/spec.

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

Second pass filtered by time ranges from `scanLog`. Only processes events within the selected raids.

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
```

## What it detects

- **Raids**: Naxxramas, Obsidian Sanctum, Eye of Eternity, Vault of Archavon
- **Encounters**: 63 boss NPC IDs, kill/wipe detection, idle timeout, multi-boss fights (Four Horsemen, Thaddius)
- **Players**: GUID-based tracking, class detection (~380 spells), spec detection (~90 spells)
- **Difficulty**: Spell-based 10N/25N/10H/25H detection with player-count fallback
- **Raid separation**: Time gaps, date changes, instance changes, Jaccard roster similarity

## Types

```ts
interface DetectedRaid {
  raidInstance: string | null;
  dates: string[];
  startTime: string;        // ISO-8601
  endTime: string;           // ISO-8601
  timeRanges: TimeRange[];
  playerCount: number;
  players: PlayerInfo[];
  encounters: EncounterSummary[];
}

interface PlayerInfo {
  guid: string;
  name: string;
  class: WowClass | null;   // "warrior" | "paladin" | ... | "druid"
  spec: WowSpec | null;     // "warrior-arms" | "paladin-holy" | ...
}

interface EncounterSummary {
  bossName: string;
  startTime: string;
  endTime: string;
  duration: number;          // seconds
  result: "kill" | "wipe";
  difficulty: RaidDifficulty | null;
}
```

## Development

```bash
pnpm install
pnpm run build       # tsup → dist/
pnpm run test        # vitest
pnpm run typecheck   # tsc --noEmit
```

### Scripts

```bash
# Scan all example logs (requires build first)
pnpm run build && npx tsx scripts/scan-all.ts | npx tsx scripts/summarize.ts
```

## Architecture

Single-pass streaming state machine. Constant memory, no storing all lines.

```
ReadableStream<Uint8Array>
  → TextDecoderStream
  → LineSplitter (TransformStream)
  → parseLine() → LogEvent
  → CombatLogStateMachine
      ├─ EncounterTracker (boss detection, kill/wipe/idle)
      ├─ RaidSeparator (segment tracking, Jaccard merging)
      └─ Player detection (class/spec from spells)
  → groupSegmentsIntoRaids()
  → ScanResult
```

## License

MIT
