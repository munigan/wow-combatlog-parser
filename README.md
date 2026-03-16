# @munigan/wow-combatlog-parser

Streaming parser for World of Warcraft **WotLK 3.3.5** combat log files. Zero runtime dependencies, dual ESM/CJS, works in browser, Node 18+, Deno, and Bun.

## Install

```bash
pnpm add @munigan/wow-combatlog-parser
```

## API

Three functions, one streaming pipeline:

### `scanLog(stream, options?)` — Detect raids

Lightweight first pass. Reads the entire log in a single stream and returns detected raids, encounters, and players with class/spec. Does **not** track consumables, combat stats, or other detailed data.

```ts
import { scanLog } from "@munigan/wow-combatlog-parser";

const stream = file.stream(); // ReadableStream<Uint8Array> (.txt or .txt.gz)
const { raids } = await scanLog(stream);

for (const raid of raids) {
  console.log(raid.raidInstance, raid.encounters.length, raid.playerCount);
}
```

### `parseLog(stream, selections, options?)` — Extract raid details

Second pass filtered by time ranges from `scanLog`. Tracks consumables, combat stats (damage done/taken), buff uptime, deaths with recap, and external buffs.

```ts
import { parseLog } from "@munigan/wow-combatlog-parser";

const { raids } = await parseLog(file.stream(), [{
  dates: raid.dates,
  startTime: raid.startTime,
  endTime: raid.endTime,
  timeRanges: raid.timeRanges,
}]);

for (const encounter of raids[0].encounters) {
  console.log(encounter.bossName, encounter.combatStats, encounter.deaths);
}
```

### `parseLogStream(stream, selections, callbacks, options?)` — Incremental parsing

Callback-based streaming parse that delivers encounters one at a time. Ideal for saving to a database as you go — async callbacks are awaited (backpressure).

```ts
import { parseLogStream } from "@munigan/wow-combatlog-parser";

await parseLogStream(file.stream(), selections, {
  onEncounter: async (encounter) => {
    await db.encounters.insert(encounter);
  },
  onComplete: async (summary) => {
    await db.raids.update({ raidId, ...summary });
  },
});
```

**Typical flow**: `scanLog` → user picks raids → `parseLog` or `parseLogStream` with `RaidSelection[]`.

## What it extracts

**From `scanLog`** (lightweight, client-side):
- Raid instance, dates, time ranges
- Encounters: boss name, duration (ms precision), kill/wipe, difficulty
- Players: name, class (~380 spells), spec (~90 spells)

**From `parseLog` / `parseLogStream`** (server-side, full extraction):
- Everything above, plus:
- **Combat stats**: per-player damage done (useful) and damage taken (raw), with pet→owner merging and NPC whitelist filtering
- **Consumables**: potions, engineering bombs, Flame Cap — with pre-pot detection
- **Buff uptime**: flask/elixir and food uptime % (raid-wide and per-encounter)
- **Deaths**: death recap with last 10 damage/heal events, killing blow identification
- **Externals**: 16 tracked buffs (Bloodlust, Power Infusion, Tricks, Innervate, Hand of Salvation, etc.) with count and uptime

## Gzip support

Pass `.txt` or `.txt.gz` files — compression is auto-detected via gzip magic bytes. No configuration needed. WoW combat logs compress 12-13x with gzip (591 MB → 48 MB).

## File size limit

All functions accept `maxBytes` option (default: 1 GB decompressed). Exceeding it throws `FileTooLargeError`.

## Supported raids

9 instances, 63 bosses: Naxxramas (15), Obsidian Sanctum (1), Eye of Eternity (1), Vault of Archavon (4), Ulduar (14), Trial of the Crusader (5), Onyxia's Lair (1), Icecrown Citadel (12), Ruby Sanctum (1).

## Architecture

Single-pass streaming state machine. Constant memory — state is bounded by player/encounter count, not file size.

```
ReadableStream<Uint8Array>
  → maybeDecompress (gzip auto-detect)
  → byteCounter (maxBytes enforcement)
  → TextDecoderStream
  → LineSplitter
  → parseLine() → LogEvent
  → CombatLogStateMachine
      ├─ EncounterTracker (boss detection, kill/wipe/idle/coward)
      ├─ RaidSeparator (segment tracking, Jaccard merging)
      ├─ CombatTracker (damage done/taken, pet→owner merging)
      ├─ ConsumableTracker (potions/bombs/flame cap, pre-pot)
      ├─ BuffUptimeTracker (flask/elixir/food intervals)
      ├─ DeathTracker (circular buffer recap)
      ├─ ExternalsTracker (cross-player buff intervals)
      └─ Player detection (class/spec, participation)
  → ScanResult / ParseResult / callbacks
```

## Development

```bash
pnpm install
pnpm run build        # tsup → dist/
pnpm run test         # vitest (260 tests)
pnpm run typecheck    # tsc --noEmit
pnpm run bench <file> # memory/GC profiling
pnpm run bench:micro  # per-function benchmarks
```

## License

MIT
