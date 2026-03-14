# Tests

182 tests across 17 files. Run with `pnpm run test` (vitest).

## Structure

### Unit tests (`tests/unit/`)
15 files testing individual modules in isolation:

| File | Tests | Module |
|------|-------|--------|
| `timestamp.test.ts` | Timestamp parsing (M/D format, no year) |
| `guid.test.ts` | GUID type detection (player/NPC/pet/vehicle) |
| `fields.test.ts` | Quote-aware CSV field parsing |
| `line-splitter.test.ts` | Line splitting transform stream |
| `line-parser.test.ts` | Combat log line parsing, `isBuffAura()`, `getSpellId()` |
| `boss-data.test.ts` | Boss NPC ID lookups, multi-boss, coward boss |
| `class-detection.test.ts` | Spell → class mapping |
| `difficulty.test.ts` | Difficulty detection (spell-based + player count) |
| `encounter-tracker.test.ts` | Boss encounter detection (start/end, BUFF/DEBUFF filtering, ignored spells, PARTY_KILL vs UNIT_DIED, multi-boss, coward boss, idle timeout) |
| `raid-separator.test.ts` | Raid segment splitting and Jaccard merging |
| `state-machine.test.ts` | Full state machine integration (class/spec detection, encounter + raid composition) |
| `scanner.test.ts` | `scanLog()` API with mock streams |
| `parser.test.ts` | `parseLog()` API with time-range filtering |
| `consumable-tracker.test.ts` | Consumable tracking (potions, flame cap, engineering, pre-pot, mana potions, multi-encounter) |
| `combat-tracker.test.ts` | Combat stats tracking (damage, healing, absorb tracking, overkill, pet resolution, friendly-fire exclusion, encounter lifecycle) |

### Integration tests (`tests/integration/`)
2 files:
- `scan-examples.test.ts` — scans real example log files from `tests/example-logs/` and validates encounter counts, boss names, and durations against known-good values.
- `parse-combat-stats.test.ts` — validates per-player damage/healing (including absorb healing) on Patchwerk and Razuvious against wow-logs reference numbers (within 2% tolerance). Includes Degustaroxo (Disc Priest) absorb healing validation.

### Example logs (`tests/example-logs/`)
Gitignored. WoW combat log files named `example-log-{1..7}.txt`. Used by integration tests and scripts.

## Conventions

- Tests use vitest (`describe`/`it`/`expect`).
- Unit tests create minimal mock `LogEvent` objects — see existing tests for the pattern.
- Encounter tracker tests use helper functions like `makeEvent()`, `makeBossEvent()` to construct events with specific GUIDs and event types.
- Integration tests are gated on file existence (`fs.existsSync`) so they skip gracefully in CI without example logs.

## Adding tests

When adding a new feature, add unit tests in a new `tests/unit/<module>.test.ts` file. Follow the existing pattern of importing the module directly and testing with mock data. If the feature affects encounter detection or scan results, update `scan-examples.test.ts` expected values.
