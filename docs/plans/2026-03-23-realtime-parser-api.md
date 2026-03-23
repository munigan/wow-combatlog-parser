# Realtime Parser API Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `createRealtimeParser()` API to the parser library for line-by-line real-time feeding with encounter callbacks and live stats.

**Architecture:** Wraps the existing `CombatLogStateMachine` (with all trackers enabled) with a line-by-line interface. Uses `parseLine()` to parse raw lines, feeds `LogEvent`s to the state machine, and uses `popCompletedEncounter()` to detect completed encounters and fire callbacks. Adds a `tick()` method for wall-clock idle timeout detection.

**Tech Stack:** TypeScript, vitest (existing test infrastructure)

**Spec:** `../wow-companion/docs/superpowers/specs/2026-03-23-watcher-testing-design.md` (Phase 1)

**Working directory:** `/Users/diegofernandes/www/wow-raid-tools/wow-combatlog-parser`

---

## Critical Implementation Notes

These issues were identified during plan review. The implementer MUST address them:

1. **`tick()` timestamp domain mismatch**: `tick(currentTimeMs)` receives wall-clock time (e.g., `Date.now()`), but the encounter tracker's `_lastBossEventTimestamp` stores log-domain timestamps parsed from combat log lines. To bridge this, the realtime parser must track `lastEventTimestamp` and `wallClockAtLastEvent`. Then `tick()` computes: `const logTimeNow = lastEventTimestamp + (currentTimeMs - wallClockAtLastEvent)` and passes that to the idle timeout check.

2. **`checkIdleTimeout()` must be added to `CombatLogStateMachine`**, not just `EncounterTracker`. The encounter tracker's inline idle check lives in `processEvent()` (lines 172-187). When extracted, the state machine must handle the encounter-end side effects (collecting tracker data, setting `_pendingEncounter`) — same as it does in `processEvent()`. Otherwise `popCompletedEncounter()` won't find encounters ended by `tick()`.

3. **Actual field names** (verify before implementing):
   - `CombatLogStateMachine._lastRaidInstance` (not `_currentRaidInstance`)
   - `CombatTracker._currentEncounter` (a `Map<string, PlayerCombatStats>`, not `_currentEncounterStats`)
   - `EncounterTracker._lastBossEventTimestamp`, `_idleThreshold`, `_bossName`

4. **`checkIdleTimeout` does not exist yet** on `EncounterTracker` — it's inline code in `processEvent()`. It needs to be extracted as a public method.

---

## File Structure

```
src/
  realtime-parser.ts     # NEW — createRealtimeParser() factory + RealtimeParser class
  types.ts               # MODIFY — add new public types
  index.ts               # MODIFY — export new function + types
tests/
  unit/
    realtime-parser.test.ts  # NEW — unit tests
```

---

### Task 1: Add new types to types.ts

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add realtime parser types at the end of types.ts**

Append to `src/types.ts` after the `ParseStreamCallbacks` interface (line 271):

```ts
// === Realtime Parser API ===

export interface RealtimeParserOptions {
	/** Year for timestamp parsing (WoW logs have no year). Defaults to current year. */
	year?: number;
}

export interface EncounterStartInfo {
	bossName: string;
	startTime: number;
	raidInstance: string | null;
}

export interface ActiveEncounterInfo {
	bossName: string;
	startTime: number;
	currentDuration: number;
	playerStats: Map<string, { name: string; damage: number; dps: number }>;
	playerCount: number;
}

export interface RealtimeParser {
	feedLine(line: string): void;
	tick(currentTimeMs: number): void;
	onEncounterStart(cb: (info: EncounterStartInfo) => void): void;
	onEncounterEnd(cb: (encounter: ParsedEncounter) => void): void;
	onPlayerDetected(cb: (player: PlayerInfo) => void): void;
	getActiveEncounter(): ActiveEncounterInfo | null;
	getDetectedPlayers(): Map<string, PlayerInfo>;
	destroy(): void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add realtime parser types"
```

---

### Task 2: Implement createRealtimeParser()

**Files:**
- Create: `src/realtime-parser.ts`

- [ ] **Step 1: Create src/realtime-parser.ts**

```ts
import { parseLine } from "./pipeline/line-parser.js";
import { CombatLogStateMachine } from "./state/state-machine.js";
import type {
	ActiveEncounterInfo,
	EncounterPlayer,
	EncounterStartInfo,
	ParsedEncounter,
	PlayerInfo,
	RealtimeParser,
	RealtimeParserOptions,
} from "./types.js";

const MIN_ENCOUNTER_DURATION_S = 10;

export function createRealtimeParser(
	opts?: RealtimeParserOptions,
): RealtimeParser {
	const year = opts?.year ?? new Date().getFullYear();
	const sm = new CombatLogStateMachine(true);

	const encounterStartCbs: Array<(info: EncounterStartInfo) => void> = [];
	const encounterEndCbs: Array<(encounter: ParsedEncounter) => void> = [];
	const playerDetectedCbs: Array<(player: PlayerInfo) => void> = [];

	const knownPlayerGuids = new Set<string>();
	let lastEventTimestamp = 0;
	let encounterStartTime = 0;
	let encounterBossName: string | null = null;
	let encounterRaidInstance: string | null = null;
	let isDestroyed = false;

	function checkForNewPlayers(): void {
		const players = sm.getDetectedPlayers();
		for (const [guid, record] of players) {
			if (!knownPlayerGuids.has(guid)) {
				knownPlayerGuids.add(guid);
				const playerInfo: PlayerInfo = {
					guid: record.guid,
					name: record.name,
					class: record.class,
					spec: record.spec,
				};
				for (const cb of playerDetectedCbs) cb(playerInfo);
			}
		}
	}

	function checkForEncounterStart(): void {
		const tracker = sm.getEncounterTracker();
		if (tracker.isInEncounter() && encounterBossName === null) {
			const bossName = tracker.getCurrentBossName()!;
			encounterBossName = bossName;
			encounterStartTime = lastEventTimestamp;
			encounterRaidInstance = sm.getCurrentRaidInstance();
			const info: EncounterStartInfo = {
				bossName,
				startTime: encounterStartTime,
				raidInstance: encounterRaidInstance,
			};
			for (const cb of encounterStartCbs) cb(info);
		}
	}

	function checkForEncounterEnd(): void {
		const completed = sm.popCompletedEncounter();
		if (completed === null) return;

		const { encounter, participants } = completed;
		if (encounter.duration < MIN_ENCOUNTER_DURATION_S) {
			encounterBossName = null;
			return;
		}

		const players: EncounterPlayer[] = [];
		const detectedPlayers = sm.getDetectedPlayers();
		for (const guid of participants) {
			const record = detectedPlayers.get(guid);
			if (record) {
				players.push({
					guid: record.guid,
					name: record.name,
					class: record.class,
					spec: record.spec,
				});
			}
		}

		const parsed: ParsedEncounter = { ...encounter, players };
		encounterBossName = null;
		for (const cb of encounterEndCbs) cb(parsed);
	}

	return {
		feedLine(line: string): void {
			if (isDestroyed) return;
			const event = parseLine(line, year);
			if (event === null) return;

			lastEventTimestamp = event.timestamp;
			sm.processEvent(event);

			checkForNewPlayers();
			checkForEncounterStart();
			checkForEncounterEnd();
		},

		tick(currentTimeMs: number): void {
			if (isDestroyed) return;
			if (encounterBossName === null) return;

			const tracker = sm.getEncounterTracker();
			tracker.checkIdleTimeout(currentTimeMs);
			checkForEncounterEnd();
		},

		onEncounterStart(cb) {
			encounterStartCbs.push(cb);
		},

		onEncounterEnd(cb) {
			encounterEndCbs.push(cb);
		},

		onPlayerDetected(cb) {
			playerDetectedCbs.push(cb);
		},

		getActiveEncounter(): ActiveEncounterInfo | null {
			if (encounterBossName === null) return null;

			const combatStats = sm.getActiveCombatStats();
			const durationMs = lastEventTimestamp - encounterStartTime;
			const durationS = durationMs / 1000;
			const playerStats = new Map<
				string,
				{ name: string; damage: number; dps: number }
			>();

			if (combatStats) {
				const detectedPlayers = sm.getDetectedPlayers();
				for (const [guid, stats] of combatStats) {
					const record = detectedPlayers.get(guid);
					const name = record?.name ?? guid;
					playerStats.set(guid, {
						name,
						damage: stats.damage,
						dps: durationS > 0 ? Math.round(stats.damage / durationS) : 0,
					});
				}
			}

			return {
				bossName: encounterBossName,
				startTime: encounterStartTime,
				currentDuration: Math.round(durationMs) / 1000,
				playerStats,
				playerCount: playerStats.size,
			};
		},

		getDetectedPlayers(): Map<string, PlayerInfo> {
			const result = new Map<string, PlayerInfo>();
			for (const [guid, record] of sm.getDetectedPlayers()) {
				result.set(guid, {
					guid: record.guid,
					name: record.name,
					class: record.class,
					spec: record.spec,
				});
			}
			return result;
		},

		destroy(): void {
			isDestroyed = true;
			encounterStartCbs.length = 0;
			encounterEndCbs.length = 0;
			playerDetectedCbs.length = 0;
		},
	};
}
```

**Important:** This implementation requires two new methods on the existing classes:

1. `CombatLogStateMachine.getEncounterTracker()` — returns the internal `EncounterTracker` instance (needed for `tick()` to call `checkIdleTimeout`)
2. `CombatLogStateMachine.getCurrentRaidInstance()` — returns the current raid instance string
3. `CombatLogStateMachine.getActiveCombatStats()` — returns running combat stats during an encounter (from `CombatTracker`)
4. `EncounterTracker.checkIdleTimeout(currentTimeMs)` — extracted from `processEvent()` to be callable independently

These will be added in Task 3.

- [ ] **Step 2: Commit**

```bash
git add src/realtime-parser.ts
git commit -m "feat: implement createRealtimeParser()"
```

---

### Task 3: Add required internal accessors

**Files:**
- Modify: `src/state/state-machine.ts`
- Modify: `src/state/encounter-tracker.ts`

- [ ] **Step 1: Add `getEncounterTracker()`, `getCurrentRaidInstance()`, `getActiveCombatStats()` to CombatLogStateMachine**

Add these public methods to the `CombatLogStateMachine` class:

```ts
getEncounterTracker(): EncounterTracker {
	return this._encounterTracker;
}

getCurrentRaidInstance(): string | null {
	return this._currentRaidInstance;
}

getActiveCombatStats(): Map<string, PlayerCombatStats> | null {
	if (!this._combatTracker) return null;
	return this._combatTracker.getActiveStats();
}
```

Note: `_currentRaidInstance` is already tracked internally by the state machine (set when encounter starts from `getRaidInstance(npcId)`). If it's not already stored as a field, add it.

- [ ] **Step 2: Add `getActiveStats()` to CombatTracker**

In `src/state/combat-tracker.ts`, add a method that returns the current per-player damage accumulator during an active encounter (not the completed encounters list):

```ts
getActiveStats(): Map<string, PlayerCombatStats> {
	const result = new Map<string, PlayerCombatStats>();
	for (const [guid, stats] of this._currentEncounterStats) {
		result.set(guid, { damage: stats.damage, damageTaken: stats.damageTaken });
	}
	return result;
}
```

The exact field name may differ — check what the combat tracker uses internally for the current-encounter accumulator.

- [ ] **Step 3: Extract `checkIdleTimeout()` on EncounterTracker**

In `src/state/encounter-tracker.ts`, the idle timeout check currently lives inside `processEvent()`. Extract it to a public method so `tick()` can call it:

```ts
checkIdleTimeout(currentTimeMs: number): EncounterProcessResult {
	if (!this._inEncounter) {
		return { encounterStarted: false, encounterEnded: false, encounter: null, participants: null };
	}

	if (currentTimeMs - this._lastBossEventTimestamp > this._idleThreshold) {
		// End encounter as wipe
		return this._endEncounter(this._lastBossEventTimestamp, "wipe");
	}

	return { encounterStarted: false, encounterEnded: false, encounter: null, participants: null };
}
```

Then update `processEvent()` to call `this.checkIdleTimeout(event.timestamp)` where the inline idle check was.

**Important:** The exact internal field names (`_inEncounter`, `_lastBossEventTimestamp`, `_idleThreshold`, `_endEncounter`) need to be verified against the actual source. Read the file before implementing.

- [ ] **Step 4: Run existing tests to confirm no regressions**

```bash
pnpm run test
```

Expected: All 260+ existing tests pass. The internal refactoring (extracting `checkIdleTimeout`) should not change behavior.

- [ ] **Step 5: Commit**

```bash
git add src/state/state-machine.ts src/state/encounter-tracker.ts src/state/combat-tracker.ts
git commit -m "refactor: expose internal accessors for realtime parser"
```

---

### Task 4: Export from barrel

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add exports to src/index.ts**

Add to the type export block:

```ts
export type {
	// ... existing exports ...
	RealtimeParserOptions,
	RealtimeParser,
	EncounterStartInfo,
	ActiveEncounterInfo,
} from "./types.js";
```

Add to the function exports:

```ts
export { createRealtimeParser } from "./realtime-parser.js";
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: export createRealtimeParser from barrel"
```

---

### Task 5: Unit tests for createRealtimeParser

**Files:**
- Create: `tests/unit/realtime-parser.test.ts`

- [ ] **Step 1: Create the test file**

Create `tests/unit/realtime-parser.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createRealtimeParser } from "../../src/realtime-parser.js";
import type {
	ActiveEncounterInfo,
	EncounterStartInfo,
	ParsedEncounter,
	PlayerInfo,
} from "../../src/types.js";

// Patchwerk: NPC ID 003E9C, Naxxramas
const PATCHWERK_GUID = "0xF130003E9C000001";
const PLAYER1_GUID = "0x0E00000000000001";
const PLAYER2_GUID = "0x0E00000000000002";

function makeSpellDamageLine(
	date: string,
	time: string,
	sourceGuid: string,
	sourceName: string,
	destGuid: string,
	destName: string,
	spellId: number,
	spellName: string,
	damage: number,
): string {
	return `${date} ${time}  SPELL_DAMAGE,${sourceGuid},"${sourceName}",0x512,${destGuid},"${destName}",0xa48,${spellId},"${spellName}",0x1,${damage},0,0x1,0,0,0,nil,nil,nil`;
}

function makeUnitDiedLine(
	date: string,
	time: string,
	destGuid: string,
	destName: string,
): string {
	return `${date} ${time}  UNIT_DIED,0x0000000000000000,nil,0x80000000,${destGuid},"${destName}",0x10a48`;
}

describe("createRealtimeParser", () => {
	it("fires onEncounterStart when damage hits a boss", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const startCb = vi.fn<[EncounterStartInfo]>();
		parser.onEncounterStart(startCb);

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		expect(startCb).toHaveBeenCalledOnce();
		expect(startCb.mock.calls[0][0].bossName).toBe("Patchwerk");
	});

	it("fires onEncounterEnd on UNIT_DIED with stats", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const endCb = vi.fn<[ParsedEncounter]>();
		parser.onEncounterEnd(endCb);

		// Start encounter
		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		// More damage over 60 seconds
		for (let i = 1; i <= 59; i++) {
			const seconds = String(i).padStart(2, "0");
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:00:${seconds}.000`,
					PLAYER1_GUID,
					"Warrior",
					PATCHWERK_GUID,
					"Patchwerk",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}

		// Kill
		parser.feedLine(
			makeUnitDiedLine("3/5", "20:01:00.000", PATCHWERK_GUID, "Patchwerk"),
		);

		expect(endCb).toHaveBeenCalledOnce();
		const encounter = endCb.mock.calls[0][0];
		expect(encounter.bossName).toBe("Patchwerk");
		expect(encounter.result).toBe("kill");
		expect(encounter.duration).toBeCloseTo(60, 0);
		expect(encounter.players.length).toBeGreaterThan(0);
	});

	it("returns live stats via getActiveEncounter()", () => {
		const parser = createRealtimeParser({ year: 2024 });

		expect(parser.getActiveEncounter()).toBeNull();

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:10.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		const active = parser.getActiveEncounter();
		expect(active).not.toBeNull();
		expect(active!.bossName).toBe("Patchwerk");
		expect(active!.currentDuration).toBeCloseTo(10, 0);
		expect(active!.playerCount).toBeGreaterThan(0);
	});

	it("fires onPlayerDetected for new players", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const playerCb = vi.fn<[PlayerInfo]>();
		parser.onPlayerDetected(playerCb);

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		expect(playerCb).toHaveBeenCalled();
		expect(playerCb.mock.calls[0][0].name).toBe("Warrior");
	});

	it("detects wipe via tick() idle timeout", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const endCb = vi.fn<[ParsedEncounter]>();
		parser.onEncounterEnd(endCb);

		// Start encounter with enough events to pass 10s minimum duration
		for (let i = 0; i <= 15; i++) {
			const seconds = String(i).padStart(2, "0");
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:00:${seconds}.000`,
					PLAYER1_GUID,
					"Warrior",
					PATCHWERK_GUID,
					"Patchwerk",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}

		expect(endCb).not.toHaveBeenCalled();

		// Simulate 31 seconds of inactivity via tick (Patchwerk idle threshold is 30s)
		const lastEventMs = new Date(2024, 2, 5, 20, 0, 15).getTime();
		parser.tick(lastEventMs + 31_000);

		expect(endCb).toHaveBeenCalledOnce();
		expect(endCb.mock.calls[0][0].result).toBe("wipe");
	});

	it("tick() is a no-op with no active encounter", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const endCb = vi.fn<[ParsedEncounter]>();
		parser.onEncounterEnd(endCb);

		parser.tick(Date.now());
		expect(endCb).not.toHaveBeenCalled();
	});

	it("handles multi-encounter sequences", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const startCb = vi.fn<[EncounterStartInfo]>();
		const endCb = vi.fn<[ParsedEncounter]>();
		parser.onEncounterStart(startCb);
		parser.onEncounterEnd(endCb);

		const GROBBULUS_GUID = "0xF130003E3B000001";

		// Encounter 1: Patchwerk kill (20 seconds)
		for (let i = 0; i <= 20; i++) {
			const seconds = String(i).padStart(2, "0");
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:00:${seconds}.000`,
					PLAYER1_GUID,
					"Warrior",
					PATCHWERK_GUID,
					"Patchwerk",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}
		parser.feedLine(
			makeUnitDiedLine("3/5", "20:00:20.000", PATCHWERK_GUID, "Patchwerk"),
		);

		// Encounter 2: Grobbulus kill (15 seconds, after 2 min gap)
		for (let i = 0; i <= 15; i++) {
			const seconds = String(i).padStart(2, "0");
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:02:${seconds}.000`,
					PLAYER1_GUID,
					"Warrior",
					GROBBULUS_GUID,
					"Grobbulus",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}
		parser.feedLine(
			makeUnitDiedLine("3/5", "20:02:15.000", GROBBULUS_GUID, "Grobbulus"),
		);

		expect(startCb).toHaveBeenCalledTimes(2);
		expect(endCb).toHaveBeenCalledTimes(2);
		expect(endCb.mock.calls[0][0].bossName).toBe("Patchwerk");
		expect(endCb.mock.calls[1][0].bossName).toBe("Grobbulus");
	});

	it("filters encounters shorter than 10 seconds", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const endCb = vi.fn<[ParsedEncounter]>();
		parser.onEncounterEnd(endCb);

		// 5 second encounter — should be filtered
		for (let i = 0; i <= 5; i++) {
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:00:0${i}.000`,
					PLAYER1_GUID,
					"Warrior",
					PATCHWERK_GUID,
					"Patchwerk",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}
		parser.feedLine(
			makeUnitDiedLine("3/5", "20:00:05.000", PATCHWERK_GUID, "Patchwerk"),
		);

		expect(endCb).not.toHaveBeenCalled();
	});

	it("destroy() prevents further processing", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const startCb = vi.fn<[EncounterStartInfo]>();
		parser.onEncounterStart(startCb);

		parser.destroy();

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		expect(startCb).not.toHaveBeenCalled();
	});

	it("ignores malformed lines", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const startCb = vi.fn<[EncounterStartInfo]>();
		parser.onEncounterStart(startCb);

		parser.feedLine("this is not a valid combat log line");
		parser.feedLine("");
		parser.feedLine("   ");

		expect(startCb).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm run build && pnpm run test -- tests/unit/realtime-parser.test.ts
```

Expected: All tests pass. If any fail, fix the implementation in `src/realtime-parser.ts` or the internal accessor methods.

- [ ] **Step 3: Run all tests to confirm no regressions**

```bash
pnpm run test
```

Expected: All 260+ existing tests pass plus the new realtime parser tests.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/realtime-parser.test.ts
git commit -m "test: add unit tests for createRealtimeParser"
```

---

### Task 6: Version bump and publish

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version to 0.2.0**

In `package.json`, change `"version": "0.1.1"` to `"version": "0.2.0"`.

- [ ] **Step 2: Run full verification**

```bash
pnpm run typecheck && pnpm run build && pnpm run test
```

Expected: All pass.

- [ ] **Step 3: Commit, tag, and push**

```bash
git add package.json
git commit -m "chore: release v0.2.0"
git tag v0.2.0
git push && git push --tags
```

The CI publish workflow (`.github/workflows/publish.yml`) will handle npm publish automatically on tag push.

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add realtime parser to the Public API section**

After the `parseLogStream` section in `CLAUDE.md`, add:

```markdown
### `createRealtimeParser(options?): RealtimeParser`
Real-time line-by-line parser for the companion overlay app. Feed raw combat log lines via `feedLine(line)`, receive encounter callbacks. Call `tick(currentTimeMs)` on a 1-second interval for wipe detection (idle timeout) when no new lines arrive.

Returns a `RealtimeParser` with:
- `feedLine(line)` — parse one raw line
- `tick(currentTimeMs)` — check idle timeout without a new line
- `onEncounterStart(cb)` / `onEncounterEnd(cb)` / `onPlayerDetected(cb)` — register callbacks
- `getActiveEncounter()` — live stats during a fight (boss name, duration, per-player DPS)
- `getDetectedPlayers()` — all players seen so far
- `destroy()` — cleanup
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add createRealtimeParser to CLAUDE.md"
git push
```
