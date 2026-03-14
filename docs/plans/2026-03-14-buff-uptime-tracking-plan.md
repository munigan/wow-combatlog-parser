# Flask & Food Buff Uptime Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track flask, elixir, and food buff uptime per player across raid sessions in `parseLog()`, with per-buff breakdown and combined uptime percentages.

**Architecture:** New `BuffUptimeTracker` class using interval-based aura lifecycle tracking. New `buff-data.ts` for spell IDs. Integrated into `CombatLogStateMachine` alongside existing `ConsumableTracker` and `CombatTracker`. Finalized once per raid with time boundaries from `parser.ts`.

**Tech Stack:** TypeScript, vitest for testing, tsup for build.

---

### Task 1: Add Public Types

**Files:**
- Modify: `src/types.ts:51` (after ConsumableType)
- Modify: `src/types.ts:79-88` (PlayerInfo)
- Modify: `src/types.ts:141-146` (ParsedRaid)
- Modify: `src/index.ts:1-20` (type exports)

**Step 1: Add new types to `src/types.ts`**

After line 51 (after `ConsumableType`), add:

```typescript
export type BuffCategory = "flask" | "battle_elixir" | "guardian_elixir" | "food";

export interface BuffBreakdown {
  spellId: number;
  spellName: string;
  category: BuffCategory;
  uptimeMs: number;
  /** Percentage 0-100, relative to total raid time. */
  uptimePercent: number;
}

export interface PlayerBuffUptime {
  /** Percentage 0-100: any flask OR elixir was active. */
  flaskUptimePercent: number;
  /** Percentage 0-100: any food buff was active. */
  foodUptimePercent: number;
  /** Per-buff breakdown, sorted by uptimeMs descending. */
  buffs: BuffBreakdown[];
}
```

Add `buffUptime` to `PlayerInfo` (after `combatStats`):

```typescript
  /** Raid-wide buff uptime data (parseLog only). */
  buffUptime?: PlayerBuffUptime;
```

Add `raidDurationMs` to `ParsedRaid` (after `encounters`):

```typescript
  /** Total raid time in ms (first event to last event), used as uptime denominator. */
  raidDurationMs: number;
```

**Step 2: Update barrel exports in `src/index.ts`**

Add `BuffCategory`, `BuffBreakdown`, `PlayerBuffUptime` to the `export type { ... }` block.

**Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: Should pass (new types are unused so far, `raidDurationMs` will fail since `parser.ts` doesn't emit it yet — that's expected, we fix it in Task 5).

Note: If typecheck fails due to `raidDurationMs` being required but not provided in `parser.ts`, temporarily make it optional (`raidDurationMs?: number`) and make it required in Task 5 when we wire the parser.

**Step 4: Commit**

```bash
git add src/types.ts src/index.ts
git commit -m "feat: add BuffCategory, BuffBreakdown, PlayerBuffUptime types for buff uptime tracking"
```

---

### Task 2: Add Buff Spell Data

**Files:**
- Create: `src/data/buff-data.ts`

**Step 1: Create `src/data/buff-data.ts`**

Follow the same pattern as `consumable-data.ts`: define an internal array, export derived `Map` and `Set` lookups.

```typescript
import type { BuffCategory } from "../types.js";

export interface BuffInfo {
  spellId: number;
  displayName: string;
  category: BuffCategory;
}

const BUFF_LIST: BuffInfo[] = [
  // Flasks
  { spellId: 53758, displayName: "Flask of Stoneblood", category: "flask" },
  { spellId: 53755, displayName: "Flask of the Frost Wyrm", category: "flask" },
  { spellId: 53760, displayName: "Flask of Endless Rage", category: "flask" },
  { spellId: 54212, displayName: "Flask of Pure Mojo", category: "flask" },
  { spellId: 62380, displayName: "Lesser Flask of Resistance", category: "flask" },

  // Battle Elixirs
  { spellId: 53748, displayName: "Elixir of Mighty Strength", category: "battle_elixir" },
  { spellId: 60340, displayName: "Elixir of Accuracy", category: "battle_elixir" },
  { spellId: 60344, displayName: "Elixir of Expertise", category: "battle_elixir" },
  { spellId: 60341, displayName: "Elixir of Deadly Strikes", category: "battle_elixir" },
  { spellId: 60346, displayName: "Elixir of Lightning Speed", category: "battle_elixir" },
  { spellId: 53749, displayName: "Guru's Elixir", category: "battle_elixir" },
  { spellId: 53746, displayName: "Wrath Elixir", category: "battle_elixir" },
  { spellId: 28497, displayName: "Elixir of Mighty Agility", category: "battle_elixir" },
  { spellId: 53764, displayName: "Elixir of Mighty Mageblood", category: "battle_elixir" },
  { spellId: 60345, displayName: "Elixir of Armor Piercing", category: "battle_elixir" },
  { spellId: 53747, displayName: "Elixir of Spirit", category: "battle_elixir" },

  // Guardian Elixirs
  { spellId: 60343, displayName: "Elixir of Defense", category: "guardian_elixir" },
  { spellId: 53751, displayName: "Elixir of Mighty Fortitude", category: "guardian_elixir" },
  { spellId: 53763, displayName: "Elixir of Protection", category: "guardian_elixir" },
  { spellId: 53752, displayName: "Elixir of Mighty Thoughts", category: "guardian_elixir" },
  { spellId: 60347, displayName: "Elixir of Mighty Defense", category: "guardian_elixir" },

  // Food Buffs
  { spellId: 57399, displayName: "Well Fed (Fish Feast)", category: "food" },
  { spellId: 57294, displayName: "Well Fed (generic)", category: "food" },
  { spellId: 57111, displayName: "Well Fed (Snapper Extreme)", category: "food" },
  { spellId: 57325, displayName: "Well Fed (Firecracker Salmon)", category: "food" },
  { spellId: 57327, displayName: "Well Fed (Tender Shoveltusk Steak)", category: "food" },
  { spellId: 57329, displayName: "Well Fed (Imperial Manta Steak)", category: "food" },
  { spellId: 57332, displayName: "Well Fed (Mega Mammoth Meal)", category: "food" },
  { spellId: 57334, displayName: "Well Fed (Poached Northern Sculpin)", category: "food" },
  { spellId: 57356, displayName: "Well Fed (Spiced Worm Burger)", category: "food" },
  { spellId: 57358, displayName: "Well Fed (Very Burnt Worg)", category: "food" },
  { spellId: 57360, displayName: "Well Fed (Rhinolicious Wormsteak)", category: "food" },
  { spellId: 57365, displayName: "Well Fed (Blackened Dragonfin)", category: "food" },
  { spellId: 57367, displayName: "Well Fed (Cuttlesteak)", category: "food" },
  { spellId: 57371, displayName: "Well Fed (Dragonfin Filet)", category: "food" },
  { spellId: 57373, displayName: "Well Fed (Great Feast)", category: "food" },
];

/** Map from spell ID (string, matches getSpellId() return) to buff info. */
export const BUFF_SPELLS: Map<string, BuffInfo> = new Map(
  BUFF_LIST.map((b) => [String(b.spellId), b]),
);

/** Set of flask + elixir spell IDs for quick category check. */
export const FLASK_ELIXIR_SPELL_IDS: Set<string> = new Set(
  BUFF_LIST.filter((b) => b.category !== "food").map((b) => String(b.spellId)),
);

/** Set of food buff spell IDs for quick category check. */
export const FOOD_SPELL_IDS: Set<string> = new Set(
  BUFF_LIST.filter((b) => b.category === "food").map((b) => String(b.spellId)),
);
```

**Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/data/buff-data.ts
git commit -m "feat: add WotLK flask, elixir, and food buff spell IDs"
```

---

### Task 3: Write BuffUptimeTracker Unit Tests

**Files:**
- Create: `tests/unit/buff-uptime-tracker.test.ts`

**Step 1: Write the full test file**

Follow the exact pattern from `tests/unit/consumable-tracker.test.ts`: `makeEvent()` helper, player GUID constants, `beforeEach` tracker reset.

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { BuffUptimeTracker } from "../../src/state/buff-uptime-tracker.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";

function makeEvent(
  overrides: Partial<LogEvent> & { timestamp: number; eventType: string },
): LogEvent {
  return {
    date: "3/14",
    time: "20:00:00.000",
    sourceGuid: "0x0000000000000000",
    sourceName: "",
    sourceFlags: "0x0",
    destGuid: "0x0000000000000000",
    destName: "",
    destFlags: "0x0",
    rawFields: "",
    ...overrides,
  };
}

const PLAYER1 = "0x0E00000000000001";
const PLAYER2 = "0x0E00000000000002";

// Flask of Endless Rage = 53760, rawFields for BUFF aura
const FLASK_RAGE_FIELDS = "53760,Flask of Endless Rage,0x1,BUFF";
// Flask of Stoneblood = 53758
const FLASK_STONE_FIELDS = "53758,Flask of Stoneblood,0x1,BUFF";
// Elixir of Mighty Strength = 53748
const ELIXIR_STR_FIELDS = "53748,Elixir of Mighty Strength,0x1,BUFF";
// Well Fed (Fish Feast) = 57399
const FOOD_FEAST_FIELDS = "57399,Well Fed,0x1,BUFF";
// Non-tracked buff (some random spell)
const UNTRACKED_FIELDS = "12345,Random Buff,0x1,BUFF";

let tracker: BuffUptimeTracker;

beforeEach(() => {
  tracker = new BuffUptimeTracker();
});

describe("single flask full uptime", () => {
  it("reports 100% when flask is active for entire raid", () => {
    const raidStart = 1000;
    const raidEnd = 11000; // 10s raid

    tracker.processEvent(makeEvent({
      timestamp: raidStart,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    tracker.processEvent(makeEvent({
      timestamp: raidEnd,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    expect(uptime.flaskUptimePercent).toBeCloseTo(100, 1);
    expect(uptime.foodUptimePercent).toBeCloseTo(0, 1);
    expect(uptime.buffs).toHaveLength(1);
    expect(uptime.buffs[0].spellId).toBe(53760);
    expect(uptime.buffs[0].spellName).toBe("Flask of Endless Rage");
    expect(uptime.buffs[0].category).toBe("flask");
    expect(uptime.buffs[0].uptimePercent).toBeCloseTo(100, 1);
  });
});

describe("single flask partial uptime", () => {
  it("reports correct percentage when flask covers half the raid", () => {
    const raidStart = 1000;
    const raidEnd = 11000; // 10s raid

    // Flask applied at 6000 (halfway), removed at end
    tracker.processEvent(makeEvent({
      timestamp: 6000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    tracker.processEvent(makeEvent({
      timestamp: raidEnd,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    // 5000ms / 10000ms = 50%
    expect(uptime.flaskUptimePercent).toBeCloseTo(50, 1);
    expect(uptime.buffs[0].uptimePercent).toBeCloseTo(50, 1);
  });
});

describe("flask swap", () => {
  it("reports no gap when swapping from one flask to another", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Flask A: 1000-6000
    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));
    tracker.processEvent(makeEvent({
      timestamp: 6000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    // Flask B: 6000-11000
    tracker.processEvent(makeEvent({
      timestamp: 6000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_STONE_FIELDS,
    }));
    tracker.processEvent(makeEvent({
      timestamp: 11000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_STONE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    expect(uptime.flaskUptimePercent).toBeCloseTo(100, 1);
    expect(uptime.buffs).toHaveLength(2);

    // Both should be 50%
    const rage = uptime.buffs.find((b) => b.spellId === 53760)!;
    const stone = uptime.buffs.find((b) => b.spellId === 53758)!;
    expect(rage.uptimePercent).toBeCloseTo(50, 1);
    expect(stone.uptimePercent).toBeCloseTo(50, 1);
  });
});

describe("flask gap", () => {
  it("reflects gap in flaskUptimePercent", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Flask A: 1000-4000 (3s)
    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));
    tracker.processEvent(makeEvent({
      timestamp: 4000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    // Gap: 4000-8000 (4s)

    // Flask B: 8000-11000 (3s)
    tracker.processEvent(makeEvent({
      timestamp: 8000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_STONE_FIELDS,
    }));
    tracker.processEvent(makeEvent({
      timestamp: 11000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_STONE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    // 6000ms / 10000ms = 60%
    expect(uptime.flaskUptimePercent).toBeCloseTo(60, 1);
  });
});

describe("elixir counts as flask uptime", () => {
  it("battle elixir contributes to flaskUptimePercent", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: ELIXIR_STR_FIELDS,
    }));
    tracker.processEvent(makeEvent({
      timestamp: 11000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: ELIXIR_STR_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    expect(uptime.flaskUptimePercent).toBeCloseTo(100, 1);
    expect(uptime.buffs[0].category).toBe("battle_elixir");
  });
});

describe("food buff tracking", () => {
  it("tracks food uptime independently from flask uptime", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Food: full duration
    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FOOD_FEAST_FIELDS,
    }));
    tracker.processEvent(makeEvent({
      timestamp: 11000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FOOD_FEAST_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    expect(uptime.flaskUptimePercent).toBeCloseTo(0, 1);
    expect(uptime.foodUptimePercent).toBeCloseTo(100, 1);
    expect(uptime.buffs[0].category).toBe("food");
  });
});

describe("buff active at log start", () => {
  it("assumes buff active since raidStart when only AURA_REMOVED is seen", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Only remove — no apply seen. Buff must have been active before log started.
    tracker.processEvent(makeEvent({
      timestamp: 6000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    // Active from raidStart(1000) to 6000 = 5000ms / 10000ms = 50%
    expect(uptime.flaskUptimePercent).toBeCloseTo(50, 1);
    expect(uptime.buffs[0].uptimeMs).toBe(5000);
  });
});

describe("buff active at log end", () => {
  it("closes open interval at raidEnd during finalization", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Applied but never removed
    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    expect(uptime.flaskUptimePercent).toBeCloseTo(100, 1);
    expect(uptime.buffs[0].uptimeMs).toBe(10000);
  });
});

describe("SPELL_AURA_REFRESH with no prior apply", () => {
  it("opens interval retroactively from raidStart", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Refresh at 3000, no prior apply — buff was active before log
    tracker.processEvent(makeEvent({
      timestamp: 3000,
      eventType: "SPELL_AURA_REFRESH",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    // Remove at 8000
    tracker.processEvent(makeEvent({
      timestamp: 8000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    // Active from raidStart(1000) to 8000 = 7000ms / 10000ms = 70%
    expect(uptime.flaskUptimePercent).toBeCloseTo(70, 1);
  });
});

describe("duplicate SPELL_AURA_APPLIED", () => {
  it("closes first interval and opens new one", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Apply at 1000
    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    // Duplicate apply at 5000 (without remove)
    tracker.processEvent(makeEvent({
      timestamp: 5000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    // Remove at 11000
    tracker.processEvent(makeEvent({
      timestamp: 11000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    // 1000-5000 (4000ms) + 5000-11000 (6000ms) = 10000ms / 10000ms = 100%
    expect(uptime.flaskUptimePercent).toBeCloseTo(100, 1);
    expect(uptime.buffs[0].uptimeMs).toBe(10000);
  });
});

describe("unknown spell IDs", () => {
  it("ignores non-tracked buff auras", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: UNTRACKED_FIELDS,
    }));

    tracker.processEvent(makeEvent({
      timestamp: 11000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: UNTRACKED_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    expect(result.has(PLAYER1)).toBe(false);
  });
});

describe("interval merge for union", () => {
  it("does not double-count overlapping flask and elixir intervals", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Flask: 1000-8000
    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));
    tracker.processEvent(makeEvent({
      timestamp: 8000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    // Elixir overlapping: 5000-11000
    tracker.processEvent(makeEvent({
      timestamp: 5000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: ELIXIR_STR_FIELDS,
    }));
    tracker.processEvent(makeEvent({
      timestamp: 11000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: ELIXIR_STR_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    // Merged union: 1000-11000 = 10000ms / 10000ms = 100%
    // NOT 7000+6000 = 130%
    expect(uptime.flaskUptimePercent).toBeCloseTo(100, 1);

    // Individual breakdowns can show overlapping values
    expect(uptime.buffs).toHaveLength(2);
  });
});

describe("multiple players", () => {
  it("tracks each player independently", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Player 1: flask full duration
    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    // Player 2: flask half duration
    tracker.processEvent(makeEvent({
      timestamp: 6000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER2,
      rawFields: FLASK_STONE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);

    // Player 1: open interval closed at raidEnd = 100%
    expect(result.get(PLAYER1)!.flaskUptimePercent).toBeCloseTo(100, 1);

    // Player 2: 6000-11000 = 5000ms / 10000ms = 50%
    expect(result.get(PLAYER2)!.flaskUptimePercent).toBeCloseTo(50, 1);
  });
});

describe("non-player GUIDs", () => {
  it("ignores aura events on non-player GUIDs", () => {
    const raidStart = 1000;
    const raidEnd = 11000;
    const NPC_GUID = "0xF130008F14000001"; // NPC GUID

    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: NPC_GUID,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    expect(result.size).toBe(0);
  });
});

describe("buffs sorted by uptimeMs descending", () => {
  it("returns buffs array sorted by uptimeMs descending", () => {
    const raidStart = 1000;
    const raidEnd = 11000;

    // Short flask: 1000-3000 (2s)
    tracker.processEvent(makeEvent({
      timestamp: 1000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_STONE_FIELDS,
    }));
    tracker.processEvent(makeEvent({
      timestamp: 3000,
      eventType: "SPELL_AURA_REMOVED",
      destGuid: PLAYER1,
      rawFields: FLASK_STONE_FIELDS,
    }));

    // Long flask: 3000-11000 (8s)
    tracker.processEvent(makeEvent({
      timestamp: 3000,
      eventType: "SPELL_AURA_APPLIED",
      destGuid: PLAYER1,
      rawFields: FLASK_RAGE_FIELDS,
    }));

    const result = tracker.finalize(raidStart, raidEnd);
    const uptime = result.get(PLAYER1)!;

    // First should be the longer one
    expect(uptime.buffs[0].spellId).toBe(53760); // Endless Rage (8s)
    expect(uptime.buffs[1].spellId).toBe(53758); // Stoneblood (2s)
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/unit/buff-uptime-tracker.test.ts`
Expected: FAIL — `BuffUptimeTracker` module does not exist yet.

**Step 3: Commit**

```bash
git add tests/unit/buff-uptime-tracker.test.ts
git commit -m "test: add unit tests for BuffUptimeTracker (red)"
```

---

### Task 4: Implement BuffUptimeTracker

**Files:**
- Create: `src/state/buff-uptime-tracker.ts`

**Step 1: Implement the tracker**

```typescript
import type { LogEvent } from "../pipeline/line-parser.js";
import { getSpellId } from "../pipeline/line-parser.js";
import { isPlayer } from "../utils/guid.js";
import { BUFF_SPELLS, FLASK_ELIXIR_SPELL_IDS, FOOD_SPELL_IDS } from "../data/buff-data.js";
import type { PlayerBuffUptime, BuffBreakdown } from "../types.js";

/** Internal per-spell tracking entry. */
interface SpellEntry {
  spellName: string;
  category: "flask" | "battle_elixir" | "guardian_elixir" | "food";
  currentStart: number | null; // epoch ms when interval opened, null if closed
  completedMs: number;         // accumulated ms from closed intervals
  seenWithoutApply: boolean;   // true if first event was remove/refresh (buff active before log)
}

export class BuffUptimeTracker {
  /** playerGuid → spellId (string) → SpellEntry */
  private _intervals = new Map<string, Map<string, SpellEntry>>();

  processEvent(event: LogEvent): void {
    if (
      event.eventType !== "SPELL_AURA_APPLIED" &&
      event.eventType !== "SPELL_AURA_REMOVED" &&
      event.eventType !== "SPELL_AURA_REFRESH"
    ) {
      return;
    }

    const spellId = getSpellId(event);
    if (spellId === null) return;

    const buffInfo = BUFF_SPELLS.get(spellId);
    if (buffInfo === undefined) return;

    const playerGuid = event.destGuid;
    if (!isPlayer(playerGuid)) return;

    let playerMap = this._intervals.get(playerGuid);
    if (playerMap === undefined) {
      playerMap = new Map();
      this._intervals.set(playerGuid, playerMap);
    }

    let entry = playerMap.get(spellId);

    if (event.eventType === "SPELL_AURA_APPLIED") {
      if (entry !== undefined && entry.currentStart !== null) {
        // Duplicate apply without remove — close the old interval first
        entry.completedMs += event.timestamp - entry.currentStart;
      }
      if (entry === undefined) {
        entry = {
          spellName: buffInfo.displayName,
          category: buffInfo.category,
          currentStart: event.timestamp,
          completedMs: 0,
          seenWithoutApply: false,
        };
        playerMap.set(spellId, entry);
      } else {
        entry.currentStart = event.timestamp;
      }
    } else if (event.eventType === "SPELL_AURA_REMOVED") {
      if (entry !== undefined && entry.currentStart !== null) {
        // Normal close
        entry.completedMs += event.timestamp - entry.currentStart;
        entry.currentStart = null;
      } else if (entry === undefined) {
        // Buff was active before log started — mark for retroactive resolution
        entry = {
          spellName: buffInfo.displayName,
          category: buffInfo.category,
          currentStart: null,
          completedMs: 0, // will be resolved in finalize with raidStartMs
          seenWithoutApply: true,
        };
        // Store the remove timestamp so finalize can compute duration
        // Use a negative completedMs trick: store -(removeTimestamp) temporarily
        entry.completedMs = -event.timestamp;
        playerMap.set(spellId, entry);
      }
      // else: remove for a spell we already closed — ignore
    } else if (event.eventType === "SPELL_AURA_REFRESH") {
      if (entry === undefined) {
        // Buff was active before log started — open retroactively
        entry = {
          spellName: buffInfo.displayName,
          category: buffInfo.category,
          currentStart: null, // will be resolved to raidStartMs in finalize
          completedMs: 0,
          seenWithoutApply: true,
        };
        playerMap.set(spellId, entry);
      }
      // If entry exists and currentStart is set, refresh is a no-op (buff still active)
      // If entry exists and currentStart is null and seenWithoutApply, it was already
      // handled by a prior remove — don't reopen
    }
  }

  /**
   * Finalize tracking and compute uptime results.
   * Must be called once at the end of the raid.
   */
  finalize(
    raidStartMs: number,
    raidEndMs: number,
  ): Map<string, PlayerBuffUptime> {
    const raidDurationMs = raidEndMs - raidStartMs;
    if (raidDurationMs <= 0) return new Map();

    const results = new Map<string, PlayerBuffUptime>();

    for (const [playerGuid, playerMap] of this._intervals) {
      const flaskElixirIntervals: Array<[number, number]> = [];
      const foodIntervals: Array<[number, number]> = [];
      const breakdowns: BuffBreakdown[] = [];

      for (const [spellIdStr, entry] of playerMap) {
        let totalMs = 0;

        if (entry.seenWithoutApply) {
          if (entry.completedMs < 0) {
            // Was removed without ever being applied — active from raidStart to remove time
            const removeTime = -entry.completedMs;
            totalMs = removeTime - raidStartMs;
          } else if (entry.currentStart === null) {
            // Refresh seen but then removed normally — completedMs already correct
            // Actually this case is: refresh with no apply, then no remove. 
            // The refresh handler set seenWithoutApply=true and currentStart=null.
            // Finalize should treat as active from raidStart to raidEnd.
            totalMs = entry.completedMs + (raidEndMs - raidStartMs);
          }
        } else {
          totalMs = entry.completedMs;
        }

        // Close any still-open interval at raidEnd
        if (entry.currentStart !== null) {
          totalMs += raidEndMs - entry.currentStart;
        }

        // Handle seenWithoutApply + refresh (no remove): active from raidStart to raidEnd
        if (entry.seenWithoutApply && entry.currentStart === null && entry.completedMs === 0) {
          totalMs = raidEndMs - raidStartMs;
        }

        // Clamp to raid duration
        totalMs = Math.min(totalMs, raidDurationMs);
        if (totalMs <= 0) continue;

        const uptimePercent = (totalMs / raidDurationMs) * 100;

        breakdowns.push({
          spellId: Number(spellIdStr),
          spellName: entry.spellName,
          category: entry.category,
          uptimeMs: totalMs,
          uptimePercent,
        });

        // Build interval for union calculation
        // We need to reconstruct intervals from the entry for merge
        // For simplicity, we treat each entry as a single merged interval
        // since we only need the union for flask/food uptime
        const intervals = this._reconstructIntervals(entry, raidStartMs, raidEndMs);
        if (FLASK_ELIXIR_SPELL_IDS.has(spellIdStr)) {
          flaskElixirIntervals.push(...intervals);
        } else if (FOOD_SPELL_IDS.has(spellIdStr)) {
          foodIntervals.push(...intervals);
        }
      }

      if (breakdowns.length === 0) continue;

      // Sort by uptimeMs descending
      breakdowns.sort((a, b) => b.uptimeMs - a.uptimeMs);

      const flaskUptimeMs = mergeIntervalsAndSum(flaskElixirIntervals);
      const foodUptimeMs = mergeIntervalsAndSum(foodIntervals);

      results.set(playerGuid, {
        flaskUptimePercent: Math.min((flaskUptimeMs / raidDurationMs) * 100, 100),
        foodUptimePercent: Math.min((foodUptimeMs / raidDurationMs) * 100, 100),
        buffs: breakdowns,
      });
    }

    return results;
  }

  /** Reset state (for multi-raid log files). */
  reset(): void {
    this._intervals.clear();
  }

  /**
   * Reconstruct time intervals from a SpellEntry for union merge.
   * Returns an array of [start, end] tuples.
   */
  private _reconstructIntervals(
    entry: SpellEntry,
    raidStartMs: number,
    raidEndMs: number,
  ): Array<[number, number]> {
    // This is a simplification: since we accumulate completedMs and track
    // currentStart, we approximate by treating total uptime as a contiguous block.
    // For union calculation this works because:
    // - Flask buffs don't overlap with themselves
    // - We only need flask+elixir overlap detection
    // 
    // A more precise approach would store every interval, but flask/food buffs
    // rarely create complex overlapping patterns.
    
    let totalMs = 0;
    let start = raidStartMs;

    if (entry.seenWithoutApply) {
      if (entry.completedMs < 0) {
        const removeTime = -entry.completedMs;
        return [[raidStartMs, removeTime]];
      } else if (entry.currentStart === null && entry.completedMs === 0) {
        return [[raidStartMs, raidEndMs]];
      }
    }

    if (entry.completedMs > 0 && !entry.seenWithoutApply) {
      totalMs += entry.completedMs;
    }

    if (entry.currentStart !== null) {
      return entry.completedMs > 0
        ? [[raidStartMs, raidStartMs + entry.completedMs], [entry.currentStart, raidEndMs]]
        : [[entry.currentStart, raidEndMs]];
    }

    if (totalMs > 0) {
      return [[raidStartMs, raidStartMs + totalMs]];
    }

    return [];
  }
}

/**
 * Merge overlapping intervals and return total covered time.
 * Standard interval merge: sort by start, merge overlaps, sum lengths.
 */
function mergeIntervalsAndSum(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a[0] - b[0]);

  let total = 0;
  let [currentStart, currentEnd] = intervals[0];

  for (let i = 1; i < intervals.length; i++) {
    const [start, end] = intervals[i];
    if (start <= currentEnd) {
      // Overlapping — extend
      currentEnd = Math.max(currentEnd, end);
    } else {
      // Gap — finalize previous
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }

  total += currentEnd - currentStart;
  return total;
}
```

**Important implementation note:** The `_reconstructIntervals` method is an approximation. Since we accumulate `completedMs` rather than storing every `[start, end]` pair, we can't perfectly reconstruct the original intervals. However, for flask/food buffs this is fine because:
- A given spell (e.g., Flask of Endless Rage) never overlaps with itself
- The only overlap case is between *different* flask/elixir spells, which the merge handles correctly

If tests reveal issues with the approximation, switch to storing actual `[start, end]` arrays per entry instead of just `completedMs`. The memory cost is negligible for flask/food buffs.

**Step 2: Run tests**

Run: `pnpm run test -- tests/unit/buff-uptime-tracker.test.ts`
Expected: All tests PASS. If any fail, debug and fix the implementation until all pass.

**Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/state/buff-uptime-tracker.ts
git commit -m "feat: implement BuffUptimeTracker with interval-based uptime tracking"
```

---

### Task 5: Wire into StateMachine and Parser

**Files:**
- Modify: `src/state/state-machine.ts:14-15` (imports), `29-30` (fields), `38-43` (constructor), `63-68` (processEvent), `135-160` (finalize), `179-181` (add getter)
- Modify: `src/parser.ts:1-8` (imports), `78` (add firstTimestamps), `133-134` (track first), `150-237` (finalize + build results)

**Step 1: Add BuffUptimeTracker to StateMachine**

In `src/state/state-machine.ts`:

Add import after line 15:
```typescript
import { BuffUptimeTracker } from "./buff-uptime-tracker.js";
```

Add field after `_combatTracker` (around line 30):
```typescript
private _buffUptimeTracker: BuffUptimeTracker | null = null;
```

In constructor (lines 38-43), add after `_combatTracker` creation:
```typescript
this._buffUptimeTracker = new BuffUptimeTracker();
```

In `processEvent()`, after the combat tracker feed (after line 68), add:
```typescript
if (this._buffUptimeTracker !== null) {
  this._buffUptimeTracker.processEvent(event);
}
```

Add a new public method after `getCombatPlayerSummaries()` (after line 181):
```typescript
getBuffUptimeResults(raidStartMs: number, raidEndMs: number): Map<string, PlayerBuffUptime> | null {
  return this._buffUptimeTracker?.finalize(raidStartMs, raidEndMs) ?? null;
}
```

Add import for `PlayerBuffUptime` type in the types import line (line 5).

**Step 2: Wire parser to emit buffUptime and raidDurationMs**

In `src/parser.ts`:

Track first timestamps. After line 78 (`const lastTimestamps = ...`), add:
```typescript
const firstTimestamps = new Array<number>(contexts.length).fill(0);
```

In the event loop (around line 133-134), after `lastTimestamps[i] = event.timestamp;`, add:
```typescript
if (firstTimestamps[i] === 0) {
  firstTimestamps[i] = event.timestamp;
}
```

In the finalize block (around lines 150-237), after getting `combatSummaries` (line 199), add:
```typescript
// Get buff uptime results
const raidStartMs = firstTimestamps[i];
const raidEndMs = lastTimestamps[i];
const raidDurationMs = raidEndMs - raidStartMs;
const buffUptimeResults = ctx.stateMachine.getBuffUptimeResults(raidStartMs, raidEndMs);
```

When building player entries (around lines 207-216), add `buffUptime`:
```typescript
const buffUptime = buffUptimeResults?.get(record.guid);
players.push({
  guid: record.guid,
  name: record.name,
  class: record.class,
  spec: record.spec,
  ...(consumables !== undefined && Object.keys(consumables).length > 0
    ? { consumables }
    : {}),
  ...(combat !== undefined ? { combatStats: combat } : {}),
  ...(buffUptime !== undefined ? { buffUptime } : {}),
});
```

Add `raidDurationMs` to the return object (around line 231):
```typescript
return {
  raidInstance,
  raidDate,
  players,
  encounters: sortedEncounters,
  raidDurationMs,
};
```

Add `PlayerBuffUptime` to the imports if not already imported (for the `getBuffUptimeResults` return type in state-machine).

**Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS — `raidDurationMs` is now provided, all types aligned.

**Step 4: Run all tests**

Run: `pnpm run test`
Expected: All tests PASS (existing + new buff uptime tests).

**Step 5: Commit**

```bash
git add src/state/state-machine.ts src/parser.ts
git commit -m "feat: wire BuffUptimeTracker into state machine and parser output"
```

---

### Task 6: Integration Test

**Files:**
- Modify: `tests/integration/parse-combat-stats.test.ts` (or create a new `tests/integration/parse-buff-uptime.test.ts`)

**Step 1: Build the project**

Run: `pnpm run build`
Expected: PASS (integration tests import from `dist/`)

**Step 2: Add integration test**

Create `tests/integration/parse-buff-uptime.test.ts` following the exact pattern from `parse-combat-stats.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scanLog, parseLog } from "../../dist/index.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function fileToStream(path: string): ReadableStream<Uint8Array> {
  const content = readFileSync(path);
  return new ReadableStream({
    start(controller) {
      const chunkSize = 64 * 1024;
      for (let i = 0; i < content.length; i += chunkSize) {
        controller.enqueue(content.subarray(i, i + chunkSize));
      }
      controller.close();
    },
  });
}

const LOG7_PATH = join(import.meta.dirname, "../example-logs/example-log-7.txt");

describe.skipIf(!existsSync(LOG7_PATH))("buff uptime integration", () => {
  it("should populate buffUptime on players and raidDurationMs on raid", async () => {
    // Scan first
    const scanResult = await scanLog(fileToStream(LOG7_PATH));
    expect(scanResult.raids.length).toBeGreaterThan(0);

    const raid = scanResult.raids[0];

    // Parse
    const parseResult = await parseLog(fileToStream(LOG7_PATH), [
      {
        dates: raid.dates,
        startTime: raid.startTime,
        endTime: raid.endTime,
        timeRanges: raid.timeRanges,
      },
    ]);

    expect(parseResult.raids.length).toBeGreaterThan(0);
    const parsedRaid = parseResult.raids[0];

    // raidDurationMs should be positive
    expect(parsedRaid.raidDurationMs).toBeGreaterThan(0);

    // At least some players should have buffUptime data
    const playersWithBuffs = parsedRaid.players.filter((p) => p.buffUptime !== undefined);
    expect(playersWithBuffs.length).toBeGreaterThan(0);

    // Check structure of buffUptime
    for (const player of playersWithBuffs) {
      const bu = player.buffUptime!;
      expect(bu.flaskUptimePercent).toBeGreaterThanOrEqual(0);
      expect(bu.flaskUptimePercent).toBeLessThanOrEqual(100);
      expect(bu.foodUptimePercent).toBeGreaterThanOrEqual(0);
      expect(bu.foodUptimePercent).toBeLessThanOrEqual(100);
      expect(Array.isArray(bu.buffs)).toBe(true);

      for (const buff of bu.buffs) {
        expect(buff.spellId).toBeGreaterThan(0);
        expect(buff.spellName.length).toBeGreaterThan(0);
        expect(["flask", "battle_elixir", "guardian_elixir", "food"]).toContain(buff.category);
        expect(buff.uptimeMs).toBeGreaterThan(0);
        expect(buff.uptimePercent).toBeGreaterThan(0);
        expect(buff.uptimePercent).toBeLessThanOrEqual(100);
      }

      // Buffs should be sorted by uptimeMs descending
      for (let j = 1; j < bu.buffs.length; j++) {
        expect(bu.buffs[j - 1].uptimeMs).toBeGreaterThanOrEqual(bu.buffs[j].uptimeMs);
      }
    }
  });
});
```

**Step 3: Run integration tests**

Run: `pnpm run test -- tests/integration/parse-buff-uptime.test.ts`
Expected: PASS (or SKIP if example log is not present)

**Step 4: Run full test suite**

Run: `pnpm run test`
Expected: All tests PASS

**Step 5: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add tests/integration/parse-buff-uptime.test.ts
git commit -m "test: add buff uptime integration test"
```

---

### Task 7: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

**Step 1: Add buff uptime section to AGENTS.md**

Add a new section after "## Consumable Tracking (parseLog only)":

```markdown
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
```

Also update the "## Public API" section's `parseLog` description to mention buff uptime tracking.

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add buff uptime tracking section to AGENTS.md"
```
