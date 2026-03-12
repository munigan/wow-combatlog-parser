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
pnpm run test        # vitest (114 tests)
pnpm run typecheck   # tsc --noEmit
```

**Important**: Scripts import from `../dist/index.js` — always run `pnpm run build` before running scan scripts. Example logs live in `tests/example-logs/` (gitignored).

## Project Structure

```
src/
  index.ts              # Barrel exports
  types.ts              # Public interfaces
  scanner.ts            # scanLog() implementation
  parser.ts             # parseLog() implementation
  pipeline/
    line-splitter.ts    # TransformStream: bytes → lines
    line-parser.ts      # parseLine(): line → LogEvent
  state/
    state-machine.ts    # Composes tracker + separator + player detection
    encounter-tracker.ts # Boss encounter detection (kill/wipe/idle/coward)
    raid-separator.ts   # Segment tracking, Jaccard merging
  detection/
    class-detection.ts  # detectClass(spellId)
    spec-detection.ts   # detectSpec(spellId, class)
    difficulty.ts       # Spell-based + player count fallback
  data/
    boss-data.ts        # 63 boss NPC IDs, raid instance mappings, idle thresholds
    spell-book.ts       # ~380 class spells, ~90 spec spells
    difficulty-spells.ts # Boss difficulty spell tuples
  utils/
    timestamp.ts        # WotLK timestamp parsing (M/D HH:MM:SS.mmm, no year)
    guid.ts             # GUID type detection (player/NPC/pet/vehicle)
    fields.ts           # Quote-aware CSV field parsing
tests/
  unit/                 # 13 unit test files
  integration/          # Real log file tests
  example-logs/         # WoW combat log files (gitignored, example-log-{1..6}.txt)
scripts/
  scan-all.ts           # Scans all example logs → JSON
  summarize.ts          # Pretty-prints scan results
docs/plans/             # Design doc and implementation plan
```

## Known WotLK Quirks

- **No year in timestamps** — Format is `M/D HH:MM:SS.mmm`. Year is inferred.
- **Grobbulus hallway poison** — Triggers 6s phantom encounters. Filtered by 10s minimum duration.
- **Post-kill lingering events** — DoT ticks, aura removals reference dead boss GUIDs. Handled by 30s post-kill cooldown + aura event filtering.
- **`SPELL_AURA_REMOVED` source GUIDs** — Unreliable for class detection. Excluded.
- **Multi-raid log files** — Multiple raids concatenated with no separators. Split by time gaps, date changes, instance changes, and roster similarity.

## Consumer

This library is consumed by `~/www/wow-core` (Next.js app). It replaces `log-parser.ts`, `log-scanner.ts`, `log-scanner.worker.ts`, and `wow-raids.ts` in that project.
