# WoW Combat Log Parser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript streaming library that parses WoW WotLK 3.3.5 combat logs, detecting raids, encounters, players (with class/spec), and kill/wipe status.

**Architecture:** Single-pass streaming state machine. `ReadableStream<Uint8Array>` → text decoding → line splitting → event parsing → state machine → structured results. Two exported functions: `scanLog` (client-side, full scan) and `parseLog` (server-side, filtered by time ranges).

**Tech Stack:** TypeScript, tsup (build), vitest (test), Web Streams API. Zero runtime dependencies.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/index.ts`
- Create: `src/types.ts`

**Step 1: Initialize package.json**

```json
{
  "name": "wow-combatlog-parser",
  "version": "0.1.0",
  "description": "Streaming parser for World of Warcraft WotLK 3.3.5 combat logs",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["wow", "warcraft", "combat-log", "parser", "wotlk"],
  "license": "MIT",
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
});
```

**Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
```

**Step 6: Create src/types.ts with all public types**

```typescript
// === Enums ===

export type WowClass =
  | "warrior"
  | "paladin"
  | "hunter"
  | "rogue"
  | "priest"
  | "death-knight"
  | "shaman"
  | "mage"
  | "warlock"
  | "druid";

export type WowSpec =
  | "warrior-arms"
  | "warrior-fury"
  | "warrior-protection"
  | "paladin-holy"
  | "paladin-protection"
  | "paladin-retribution"
  | "hunter-beast-mastery"
  | "hunter-marksmanship"
  | "hunter-survival"
  | "rogue-assassination"
  | "rogue-combat"
  | "rogue-subtlety"
  | "priest-discipline"
  | "priest-holy"
  | "priest-shadow"
  | "death-knight-blood"
  | "death-knight-frost"
  | "death-knight-unholy"
  | "shaman-elemental"
  | "shaman-enhancement"
  | "shaman-restoration"
  | "mage-arcane"
  | "mage-fire"
  | "mage-frost"
  | "warlock-affliction"
  | "warlock-demonology"
  | "warlock-destruction"
  | "druid-balance"
  | "druid-feral"
  | "druid-restoration";

export type RaidDifficulty = "10N" | "10H" | "25N" | "25H";

export type EncounterResult = "kill" | "wipe";

// === Common ===

export interface TimeRange {
  startTime: string; // ISO-8601
  endTime: string; // ISO-8601
}

export interface PlayerInfo {
  guid: string;
  name: string;
  class: WowClass | null;
  spec: WowSpec | null;
}

export interface EncounterSummary {
  bossName: string;
  startTime: string; // ISO-8601
  endTime: string; // ISO-8601
  duration: number; // seconds
  result: EncounterResult;
  difficulty: RaidDifficulty | null;
}

// === Scan API ===

export interface ScanOptions {
  onProgress?: (bytesRead: number, totalBytes?: number) => void;
}

export interface ScanResult {
  raids: DetectedRaid[];
}

export interface DetectedRaid {
  raidInstance: string | null;
  dates: string[];
  startTime: string; // ISO-8601
  endTime: string; // ISO-8601
  timeRanges: TimeRange[];
  playerCount: number;
  players: PlayerInfo[];
  encounters: EncounterSummary[];
}

// === Parse API ===

export interface ParseOptions {
  onProgress?: (bytesRead: number, totalBytes?: number) => void;
}

export interface RaidSelection {
  dates: string[];
  startTime: string; // ISO-8601
  endTime: string; // ISO-8601
  timeRanges?: TimeRange[];
}

export interface ParseResult {
  raids: ParsedRaid[];
}

export interface ParsedRaid {
  raidInstance: string | null;
  raidDate: Date;
  players: PlayerInfo[];
  encounters: EncounterSummary[];
}
```

**Step 7: Create src/index.ts stub**

```typescript
export type {
  WowClass,
  WowSpec,
  RaidDifficulty,
  EncounterResult,
  TimeRange,
  PlayerInfo,
  EncounterSummary,
  ScanOptions,
  ScanResult,
  DetectedRaid,
  ParseOptions,
  RaidSelection,
  ParseResult,
  ParsedRaid,
} from "./types.js";

export { scanLog } from "./scanner.js";
export { parseLog } from "./parser.js";
```

**Step 8: Create placeholder scanner.ts and parser.ts**

`src/scanner.ts`:
```typescript
import type { ScanOptions, ScanResult } from "./types.js";

export async function scanLog(
  stream: ReadableStream<Uint8Array>,
  _options?: ScanOptions,
): Promise<ScanResult> {
  void stream;
  return { raids: [] };
}
```

`src/parser.ts`:
```typescript
import type {
  ParseOptions,
  ParseResult,
  RaidSelection,
} from "./types.js";

export async function parseLog(
  stream: ReadableStream<Uint8Array>,
  _raidSelections: RaidSelection[],
  _options?: ParseOptions,
): Promise<ParseResult> {
  void stream;
  return { raids: [] };
}
```

**Step 9: Install dependencies and verify build**

Run: `pnpm install && pnpm build && pnpm typecheck`
Expected: Clean build with ESM + CJS outputs and type declarations in `dist/`

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold project with types, build config, and placeholder API"
```

---

### Task 2: Timestamp Parsing Utility

**Files:**
- Create: `src/utils/timestamp.ts`
- Create: `tests/unit/timestamp.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { parseTimestamp, parseTimestampToEpoch } from "../../src/utils/timestamp.js";

describe("parseTimestamp", () => {
  it("parses a standard timestamp", () => {
    const result = parseTimestamp("3/5 20:03:31.449");
    expect(result).toEqual({
      date: "3/5",
      month: 3,
      day: 5,
      hours: 20,
      minutes: 3,
      seconds: 31,
      milliseconds: 449,
    });
  });

  it("parses a two-digit month/day timestamp", () => {
    const result = parseTimestamp("12/25 08:15:00.000");
    expect(result).toEqual({
      date: "12/25",
      month: 12,
      day: 25,
      hours: 8,
      minutes: 15,
      seconds: 0,
      milliseconds: 0,
    });
  });
});

describe("parseTimestampToEpoch", () => {
  it("converts timestamp to epoch milliseconds using assumed year", () => {
    const epoch = parseTimestampToEpoch("3/5 20:03:31.449", 2026);
    const date = new Date(epoch);
    expect(date.getUTCFullYear()).toBe(2026);
    expect(date.getUTCMonth()).toBe(2); // March = 2
    expect(date.getUTCDate()).toBe(5);
    expect(date.getUTCHours()).toBe(20);
    expect(date.getUTCMinutes()).toBe(3);
    expect(date.getUTCSeconds()).toBe(31);
    expect(date.getUTCMilliseconds()).toBe(449);
  });

  it("creates an ISO string", () => {
    const epoch = parseTimestampToEpoch("2/11 18:30:00.000", 2026);
    const iso = new Date(epoch).toISOString();
    expect(iso).toBe("2026-02-11T18:30:00.000Z");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/timestamp.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
export interface ParsedTimestamp {
  date: string; // raw "M/D"
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

/**
 * Parse a WoW combat log timestamp string "M/D HH:MM:SS.mmm"
 * into its components. Uses fast string slicing, no regex.
 */
export function parseTimestamp(raw: string): ParsedTimestamp {
  const slashIdx = raw.indexOf("/");
  const spaceIdx = raw.indexOf(" ", slashIdx);

  const month = parseInt(raw.substring(0, slashIdx), 10);
  const day = parseInt(raw.substring(slashIdx + 1, spaceIdx), 10);

  // Time portion starts after the space: "HH:MM:SS.mmm"
  const timeStart = spaceIdx + 1;
  const hours = parseInt(raw.substring(timeStart, timeStart + 2), 10);
  const minutes = parseInt(raw.substring(timeStart + 3, timeStart + 5), 10);
  const seconds = parseInt(raw.substring(timeStart + 6, timeStart + 8), 10);
  const milliseconds = parseInt(raw.substring(timeStart + 9, timeStart + 12), 10);

  return {
    date: raw.substring(0, spaceIdx),
    month,
    day,
    hours,
    minutes,
    seconds,
    milliseconds,
  };
}

/**
 * Convert a raw timestamp string to epoch milliseconds (UTC).
 * WoW logs don't include the year, so it must be provided.
 */
export function parseTimestampToEpoch(raw: string, year: number): number {
  const ts = parseTimestamp(raw);
  return Date.UTC(
    year,
    ts.month - 1,
    ts.day,
    ts.hours,
    ts.minutes,
    ts.seconds,
    ts.milliseconds,
  );
}

/**
 * Convert epoch milliseconds to ISO-8601 string.
 */
export function epochToIso(epoch: number): string {
  return new Date(epoch).toISOString();
}

/**
 * Compute time difference in milliseconds between two raw timestamp strings.
 * Uses only the time portion (ignores date for same-day comparisons).
 */
export function timeDiffMs(rawA: string, rawB: string): number {
  const a = parseTimestamp(rawA);
  const b = parseTimestamp(rawB);
  const msA =
    a.hours * 3600000 + a.minutes * 60000 + a.seconds * 1000 + a.milliseconds;
  const msB =
    b.hours * 3600000 + b.minutes * 60000 + b.seconds * 1000 + b.milliseconds;
  return msB - msA;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/timestamp.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/timestamp.ts tests/unit/timestamp.test.ts
git commit -m "feat: add timestamp parsing utilities"
```

---

### Task 3: GUID Utilities

**Files:**
- Create: `src/utils/guid.ts`
- Create: `tests/unit/guid.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { isPlayer, isNpc, isPet, isVehicle, getNpcId } from "../../src/utils/guid.js";

describe("GUID utilities", () => {
  const playerGuid = "0x0E000000000A3A18";
  const npcGuid = "0xF130003E9C000338";
  const petGuid = "0xF1400CC095000003";
  const vehicleGuid = "0xF1500075D100003F";
  const nullGuid = "0x0000000000000000";

  it("detects player GUIDs", () => {
    expect(isPlayer(playerGuid)).toBe(true);
    expect(isPlayer(npcGuid)).toBe(false);
    expect(isPlayer(nullGuid)).toBe(false);
  });

  it("detects NPC GUIDs", () => {
    expect(isNpc(npcGuid)).toBe(true);
    expect(isNpc(playerGuid)).toBe(false);
  });

  it("detects pet GUIDs", () => {
    expect(isPet(petGuid)).toBe(true);
    expect(isPet(npcGuid)).toBe(false);
  });

  it("detects vehicle GUIDs", () => {
    expect(isVehicle(vehicleGuid)).toBe(true);
    expect(isVehicle(npcGuid)).toBe(false);
  });

  it("extracts NPC ID from GUID", () => {
    // GUID format: 0xF130NNNNNN?????? where NNNNNN is NPC ID
    // 0xF130003E9C000338 -> NPC ID is "003E9C"
    expect(getNpcId(npcGuid)).toBe("003E9C");
    // 0xF1500075D100003F -> NPC ID is "0075D1"
    expect(getNpcId(vehicleGuid)).toBe("0075D1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/guid.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
/**
 * Player GUIDs start with "0x0E" (but NOT "0x0000" which is null target).
 */
export function isPlayer(guid: string): boolean {
  return guid.startsWith("0x0E");
}

/**
 * NPC/creature GUIDs start with "0xF130".
 */
export function isNpc(guid: string): boolean {
  return guid.startsWith("0xF130");
}

/**
 * Pet GUIDs start with "0xF140".
 */
export function isPet(guid: string): boolean {
  return guid.startsWith("0xF140");
}

/**
 * Vehicle GUIDs start with "0xF150".
 */
export function isVehicle(guid: string): boolean {
  return guid.startsWith("0xF150");
}

/**
 * Extract the NPC ID (6 hex chars) from a creature/NPC/vehicle GUID.
 * GUID format: 0xF1X0NNNNNNSSSSSS where X=type, N=NPC ID, S=spawn ID
 * Position: chars 6-12 (0-indexed) after "0xF1X0"
 */
export function getNpcId(guid: string): string {
  return guid.substring(6, 12).toUpperCase();
}

/**
 * Check if a GUID is the null/empty GUID.
 */
export function isNullGuid(guid: string): boolean {
  return guid === "0x0000000000000000";
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/guid.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/guid.ts tests/unit/guid.test.ts
git commit -m "feat: add GUID type detection utilities"
```

---

### Task 4: Quote-Aware Field Parser

**Files:**
- Create: `src/utils/fields.ts`
- Create: `tests/unit/fields.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { parseFields, stripQuotes } from "../../src/utils/fields.js";

describe("stripQuotes", () => {
  it("removes surrounding double quotes", () => {
    expect(stripQuotes('"Pattz"')).toBe("Pattz");
  });

  it("returns unquoted strings as-is", () => {
    expect(stripQuotes("0x514")).toBe("0x514");
  });

  it("handles nil", () => {
    expect(stripQuotes("nil")).toBe("nil");
  });
});

describe("parseFields", () => {
  it("parses a simple comma-separated line", () => {
    const input =
      'SPELL_DAMAGE,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2';
    const fields = parseFields(input);
    expect(fields[0]).toBe("SPELL_DAMAGE");
    expect(fields[1]).toBe("0x0E000000000A3A18");
    expect(fields[2]).toBe("Pattz");
    expect(fields[3]).toBe("0x514");
    expect(fields[7]).toBe("48782");
    expect(fields[8]).toBe("Holy Light");
  });

  it("handles names with commas inside quotes", () => {
    const input =
      'SPELL_HEAL,0x0E000000000A3A18,"Player, the Great",0x514,0x0E000000000A3A18,"Target",0x514';
    const fields = parseFields(input);
    expect(fields[2]).toBe("Player, the Great");
    expect(fields[3]).toBe("0x514");
    expect(fields[5]).toBe("Target");
  });

  it("handles empty input", () => {
    const fields = parseFields("");
    expect(fields).toEqual([""]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/fields.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
/**
 * Remove surrounding double quotes from a string, if present.
 */
export function stripQuotes(s: string): string {
  if (s.length >= 2 && s.charCodeAt(0) === 34 && s.charCodeAt(s.length - 1) === 34) {
    return s.substring(1, s.length - 1);
  }
  return s;
}

/**
 * Parse a comma-separated field list, respecting double-quoted strings
 * that may contain commas. Quotes are stripped from the results.
 *
 * This is a hot-path function -- uses charCodeAt for speed.
 */
export function parseFields(input: string): string[] {
  const fields: string[] = [];
  const len = input.length;
  let i = 0;

  while (i <= len) {
    if (i === len) {
      fields.push("");
      break;
    }

    // Check if field starts with a quote
    if (input.charCodeAt(i) === 34) {
      // 34 = '"'
      // Find closing quote
      const closeQuote = input.indexOf('"', i + 1);
      if (closeQuote === -1) {
        // Malformed: no closing quote, take rest of string
        fields.push(input.substring(i + 1));
        break;
      }
      fields.push(input.substring(i + 1, closeQuote));
      // Skip past closing quote and the comma after it
      i = closeQuote + 2;
    } else {
      // Unquoted field: find next comma
      const comma = input.indexOf(",", i);
      if (comma === -1) {
        fields.push(input.substring(i));
        break;
      }
      fields.push(input.substring(i, comma));
      i = comma + 1;
    }
  }

  return fields;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/fields.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/fields.ts tests/unit/fields.test.ts
git commit -m "feat: add quote-aware CSV field parser"
```

---

### Task 5: Line Splitter Transform Stream

**Files:**
- Create: `src/pipeline/line-splitter.ts`
- Create: `tests/unit/line-splitter.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { createLineSplitter } from "../../src/pipeline/line-splitter.js";

function makeStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collectLines(stream: ReadableStream<string>): Promise<string[]> {
  const lines: string[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lines.push(value);
  }
  return lines;
}

describe("createLineSplitter", () => {
  it("splits complete lines from a single chunk", async () => {
    const input = makeStream(["line1\nline2\nline3\n"]);
    const lines = await collectLines(input.pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });

  it("handles lines split across chunks", async () => {
    const input = makeStream(["li", "ne1\nlin", "e2\n"]);
    const lines = await collectLines(input.pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2"]);
  });

  it("handles last line without trailing newline", async () => {
    const input = makeStream(["line1\nline2"]);
    const lines = await collectLines(input.pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2"]);
  });

  it("handles \\r\\n line endings", async () => {
    const input = makeStream(["line1\r\nline2\r\n"]);
    const lines = await collectLines(input.pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2"]);
  });

  it("skips empty lines", async () => {
    const input = makeStream(["line1\n\nline2\n"]);
    const lines = await collectLines(input.pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/line-splitter.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
/**
 * Creates a TransformStream that splits a text stream into individual lines.
 * Handles partial lines across chunks, \n and \r\n endings, and skips empty lines.
 */
export function createLineSplitter(): TransformStream<string, string> {
  let buffer = "";

  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk;

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.substring(0, newlineIdx);
        buffer = buffer.substring(newlineIdx + 1);

        // Strip \r if present
        if (line.endsWith("\r")) {
          line = line.substring(0, line.length - 1);
        }

        // Skip empty lines
        if (line.length > 0) {
          controller.enqueue(line);
        }
      }
    },

    flush(controller) {
      // Emit any remaining content as the last line
      if (buffer.length > 0) {
        const line = buffer.endsWith("\r")
          ? buffer.substring(0, buffer.length - 1)
          : buffer;
        if (line.length > 0) {
          controller.enqueue(line);
        }
      }
    },
  });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/line-splitter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pipeline/line-splitter.ts tests/unit/line-splitter.test.ts
git commit -m "feat: add line splitter transform stream"
```

---

### Task 6: Line Parser

**Files:**
- Create: `src/pipeline/line-parser.ts`
- Create: `tests/unit/line-parser.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { parseLine } from "../../src/pipeline/line-parser.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";

describe("parseLine", () => {
  it("parses a SPELL_HEAL event", () => {
    const raw =
      '3/5 20:03:31.449  SPELL_HEAL,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2,11073,11073,0,nil';
    const event = parseLine(raw, 2026);
    expect(event).not.toBeNull();
    expect(event!.date).toBe("3/5");
    expect(event!.eventType).toBe("SPELL_HEAL");
    expect(event!.sourceGuid).toBe("0x0E000000000A3A18");
    expect(event!.sourceName).toBe("Pattz");
    expect(event!.destGuid).toBe("0x0E000000000A3A18");
    expect(event!.destName).toBe("Pattz");
  });

  it("parses a UNIT_DIED event with null source", () => {
    const raw =
      '2/24 20:07:05.669  UNIT_DIED,0x0000000000000000,nil,0x80000000,0xF130003F6C0003DE,"Eye Stalk",0xa48';
    const event = parseLine(raw, 2026);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("UNIT_DIED");
    expect(event!.sourceGuid).toBe("0x0000000000000000");
    expect(event!.sourceName).toBe("nil");
    expect(event!.destGuid).toBe("0xF130003F6C0003DE");
    expect(event!.destName).toBe("Eye Stalk");
  });

  it("parses a SWING_DAMAGE event (no spell info)", () => {
    const raw =
      "2/22 15:18:06.300  SWING_DAMAGE,0xF130007E61000002,\"Archavon Warder\",0xa48,0x0E0000000018667D,\"Stranglol\",0x512,13337,0,1,0,0,0,nil,nil,nil";
    const event = parseLine(raw, 2026);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("SWING_DAMAGE");
    expect(event!.sourceName).toBe("Archavon Warder");
    expect(event!.destName).toBe("Stranglol");
  });

  it("returns the remaining fields as rawFields", () => {
    const raw =
      '3/5 20:03:31.449  SPELL_CAST_SUCCESS,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2';
    const event = parseLine(raw, 2026);
    expect(event).not.toBeNull();
    // rawFields should contain everything after destFlags
    expect(event!.rawFields).toContain("48782");
    expect(event!.rawFields).toContain("Holy Light");
  });

  it("produces a valid epoch timestamp", () => {
    const raw =
      '3/5 20:03:31.449  SPELL_HEAL,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2,11073,11073,0,nil';
    const event = parseLine(raw, 2026);
    expect(event).not.toBeNull();
    const date = new Date(event!.timestamp);
    expect(date.getUTCMonth()).toBe(2); // March
    expect(date.getUTCDate()).toBe(5);
    expect(date.getUTCHours()).toBe(20);
  });

  it("returns null for malformed lines", () => {
    expect(parseLine("", 2026)).toBeNull();
    expect(parseLine("garbage data", 2026)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/line-parser.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import { parseTimestampToEpoch } from "../utils/timestamp.js";
import { parseFields } from "../utils/fields.js";

export interface LogEvent {
  /** Epoch milliseconds (UTC) */
  timestamp: number;
  /** Raw date string, e.g. "3/5" */
  date: string;
  /** Raw time string, e.g. "20:03:31.449" */
  time: string;
  /** Event type, e.g. "SPELL_DAMAGE" */
  eventType: string;
  /** Source unit GUID */
  sourceGuid: string;
  /** Source unit name (quotes stripped) */
  sourceName: string;
  /** Source unit flags (hex string) */
  sourceFlags: string;
  /** Destination unit GUID */
  destGuid: string;
  /** Destination unit name (quotes stripped) */
  destName: string;
  /** Destination unit flags (hex string) */
  destFlags: string;
  /** Remaining unparsed fields after the common prefix (comma-joined) */
  rawFields: string;
}

/**
 * Parse a raw WoW combat log line into a structured LogEvent.
 * Returns null if the line is malformed.
 *
 * Line format: "M/D HH:MM:SS.mmm  EVENT_TYPE,field1,field2,..."
 * The timestamp and event data are separated by two spaces.
 */
export function parseLine(raw: string, year: number): LogEvent | null {
  // Find the double-space separator between timestamp and event data
  const separatorIdx = raw.indexOf("  ");
  if (separatorIdx === -1 || separatorIdx < 5) return null;

  const timestampRaw = raw.substring(0, separatorIdx);
  const eventData = raw.substring(separatorIdx + 2);

  if (eventData.length === 0) return null;

  // Parse timestamp
  const spaceIdx = timestampRaw.indexOf(" ");
  if (spaceIdx === -1) return null;

  const date = timestampRaw.substring(0, spaceIdx);
  const time = timestampRaw.substring(spaceIdx + 1);

  let timestamp: number;
  try {
    timestamp = parseTimestampToEpoch(timestampRaw, year);
  } catch {
    return null;
  }

  // Parse the event fields with quote-aware parsing
  const fields = parseFields(eventData);

  // We need at least 7 fields: eventType, srcGUID, srcName, srcFlags, dstGUID, dstName, dstFlags
  if (fields.length < 7) return null;

  const eventType = fields[0];
  const sourceGuid = fields[1];
  const sourceName = fields[2];
  const sourceFlags = fields[3];
  const destGuid = fields[4];
  const destName = fields[5];
  const destFlags = fields[6];

  // Everything after the 7th field is rawFields
  // Reconstruct from fields array to preserve parsed values
  const rawFields = fields.length > 7 ? fields.slice(7).join(",") : "";

  return {
    timestamp,
    date,
    time,
    eventType,
    sourceGuid,
    sourceName,
    sourceFlags,
    destGuid,
    destName,
    destFlags,
    rawFields,
  };
}

/**
 * Extract spell ID from rawFields.
 * For spell events, the first field in rawFields is the spell ID.
 * For SWING events, there is no spell ID.
 */
export function getSpellId(event: LogEvent): string | null {
  if (event.eventType.startsWith("SWING_") || event.eventType === "ENVIRONMENTAL_DAMAGE") {
    return null;
  }
  if (event.rawFields.length === 0) return null;
  const commaIdx = event.rawFields.indexOf(",");
  return commaIdx === -1 ? event.rawFields : event.rawFields.substring(0, commaIdx);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/line-parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pipeline/line-parser.ts tests/unit/line-parser.test.ts
git commit -m "feat: add combat log line parser"
```

---

### Task 7: Boss Data & Raid Instance Mapping

**Files:**
- Create: `src/data/boss-data.ts`
- Create: `tests/unit/boss-data.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  getBossName,
  getRaidInstance,
  getBossIdleThreshold,
  isMultiBoss,
  getMultiBossName,
  BOSS_DEFAULT_IDLE_MS,
} from "../../src/data/boss-data.js";

describe("boss-data", () => {
  it("looks up boss name by NPC ID", () => {
    expect(getBossName("003E9C")).toBe("Patchwerk");
    expect(getBossName("003EBD")).toBe("Sapphiron");
    expect(getBossName("FFFFFF")).toBeNull();
  });

  it("looks up raid instance by boss name", () => {
    expect(getRaidInstance("Patchwerk")).toBe("Naxxramas");
    expect(getRaidInstance("Sartharion")).toBe("Obsidian Sanctum");
    expect(getRaidInstance("Malygos")).toBe("Eye of Eternity");
    expect(getRaidInstance("Unknown Boss")).toBeNull();
  });

  it("returns per-boss idle thresholds", () => {
    // Lich King has a long intermission, so 120s
    expect(getBossIdleThreshold("The Lich King")).toBe(120000);
    // Default for most bosses is 30s
    expect(getBossIdleThreshold("Patchwerk")).toBe(BOSS_DEFAULT_IDLE_MS);
  });

  it("identifies multi-boss encounter NPCs", () => {
    // Blood Prince Council has 3 NPCs
    expect(isMultiBoss("009616")).toBe(true); // Valanar
    expect(isMultiBoss("003E9C")).toBe(false); // Patchwerk
  });

  it("maps multi-boss NPCs to the encounter name", () => {
    expect(getMultiBossName("009616")).toBe("Blood Prince Council");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/boss-data.test.ts`
Expected: FAIL

**Step 3: Write implementation**

Create `src/data/boss-data.ts` with all WotLK boss NPC IDs. The data should be ported from wow-core's `wow-raids.ts` (boss-to-raid mappings) and expanded with NPC IDs extracted from the example log GUIDs, plus uwu-logs' `BOSSES_GUIDS` dict. The NPC ID is extracted from the GUID middle bytes (positions 6-12 of the hex GUID).

The file should contain:
- `BOSS_NPC_IDS`: `Map<string, string>` mapping NPC hex ID → boss name (all WotLK raid bosses)
- `BOSS_TO_RAID`: `Map<string, string>` mapping boss name → raid instance name
- `BOSS_IDLE_THRESHOLDS`: `Map<string, number>` for bosses with non-default idle times
- `MULTI_BOSS_MAP`: `Map<string, string>` mapping sub-boss NPC IDs → encounter name
- Helper functions: `getBossName`, `getRaidInstance`, `getBossIdleThreshold`, `isMultiBoss`, `getMultiBossName`
- `BOSS_DEFAULT_IDLE_MS = 30_000`

Boss NPCs to include (extract NPC IDs from GUID middle bytes):

**Naxxramas**: Anub'Rekhan, Grand Widow Faerlina, Maexxna, Noth the Plaguebringer, Heigan the Unclean, Loatheb, Instructor Razuvious, Gothik the Harvester, Patchwerk, Grobbulus, Gluth, Thaddius, Sapphiron, Kel'Thuzad, Four Horsemen (Sir Zeliek, Thane Korth'azz, Baron Rivendare, Lady Blaumeux)

**Obsidian Sanctum**: Sartharion

**Eye of Eternity**: Malygos

**Vault of Archavon**: Archavon the Stone Watcher, Emalon the Storm Watcher, Koralon the Flame Watcher, Toravon the Ice Watcher

**Ulduar**: Flame Leviathan, Ignis the Furnace Master, Razorscale, XT-002 Deconstructor, Assembly of Iron (Steelbreaker, Runemaster Molgeim, Stormcaller Brundir), Kologarn, Auriaya, Hodir, Thorim, Freya, Mimiron, General Vezax, Yogg-Saron, Algalon the Observer

**Trial of the Crusader**: Northrend Beasts (Gormok, Acidmaw, Dreadscale, Icehowl), Lord Jaraxxus, Faction Champions, Twin Val'kyr (Fjola, Eydis), Anub'arak

**Onyxia's Lair**: Onyxia

**Icecrown Citadel**: Lord Marrowgar, Lady Deathwhisper, Gunship Battle, Deathbringer Saurfang, Festergut, Rotface, Professor Putricide, Blood Prince Council (Valanar, Keleseth, Taldaram), Blood-Queen Lana'thel, Valithria Dreamwalker, Sindragosa, The Lich King

**Ruby Sanctum**: Halion

The NPC IDs should be sourced from uwu-logs' `c_bosses.py` `BOSSES_GUIDS` dictionary and cross-referenced with the example log files. Use uppercase hex for consistency.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/boss-data.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/data/boss-data.ts tests/unit/boss-data.test.ts
git commit -m "feat: add WotLK boss NPC data and raid instance mappings"
```

---

### Task 8: Class & Spec Detection Data

**Files:**
- Create: `src/data/spell-book.ts`
- Create: `src/detection/class-detection.ts`
- Create: `src/detection/spec-detection.ts`
- Create: `tests/unit/class-detection.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { detectClass } from "../../src/detection/class-detection.js";
import { detectSpec } from "../../src/detection/spec-detection.js";

describe("detectClass", () => {
  it("detects Paladin from Holy Light", () => {
    expect(detectClass("48782")).toBe("paladin");
  });

  it("detects Death Knight from Icy Touch", () => {
    expect(detectClass("49909")).toBe("death-knight");
  });

  it("returns null for unknown spell IDs", () => {
    expect(detectClass("999999")).toBeNull();
  });
});

describe("detectSpec", () => {
  it("detects Retribution Paladin from Divine Storm", () => {
    expect(detectSpec("53385", "paladin")).toBe("paladin-retribution");
  });

  it("detects Holy Paladin from Holy Shock", () => {
    expect(detectSpec("48825", "paladin")).toBe("paladin-holy");
  });

  it("returns null for non-spec-defining spells", () => {
    expect(detectSpec("48782", "paladin")).toBeNull();
  });

  it("returns null for wrong class", () => {
    expect(detectSpec("53385", "warrior")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/class-detection.test.ts`
Expected: FAIL

**Step 3: Write spell-book.ts**

Create `src/data/spell-book.ts` with:
- `SPELL_TO_CLASS`: `Map<string, WowClass>` — maps ~200 spell IDs to class. Source from uwu-logs' `SPELL_BOOK` and `c_spells.py`.
- `SPELL_TO_SPEC`: `Map<string, WowSpec>` — maps ~300 talent-specific spell IDs to spec. Source from uwu-logs' `SPELL_BOOK_SPEC`.

Common spells to include per class (just spell IDs, the actual values come from uwu-logs data):
- **Warrior**: Heroic Strike, Thunder Clap, Shield Slam, Mortal Strike, Bloodthirst
- **Paladin**: Holy Light, Flash of Light, Holy Shock, Avenger's Shield, Divine Storm, Hammer of the Righteous
- **Hunter**: Aimed Shot, Multi-Shot, Chimera Shot, Kill Command, Explosive Shot
- **Rogue**: Sinister Strike, Mutilate, Killing Spree, Shadow Dance
- **Priest**: Flash Heal, Power Word: Shield, Mind Blast, Shadow Word: Pain, Penance
- **Death Knight**: Icy Touch, Death Strike, Scourge Strike, Heart Strike, Howling Blast
- **Shaman**: Lightning Bolt, Chain Heal, Lava Lash, Thunderstorm
- **Mage**: Fireball, Frostbolt, Arcane Blast, Arcane Missiles
- **Warlock**: Shadow Bolt, Incinerate, Haunt, Metamorphosis
- **Druid**: Rejuvenation, Swiftmend, Starfire, Mangle, Lifebloom

**Step 4: Write detection modules**

`src/detection/class-detection.ts`:
```typescript
import type { WowClass } from "../types.js";
import { SPELL_TO_CLASS } from "../data/spell-book.js";

export function detectClass(spellId: string): WowClass | null {
  return SPELL_TO_CLASS.get(spellId) ?? null;
}
```

`src/detection/spec-detection.ts`:
```typescript
import type { WowClass, WowSpec } from "../types.js";
import { SPELL_TO_SPEC } from "../data/spell-book.js";

export function detectSpec(spellId: string, playerClass: WowClass): WowSpec | null {
  const spec = SPELL_TO_SPEC.get(spellId) ?? null;
  if (spec === null) return null;
  // Verify the spec belongs to the player's class
  if (!spec.startsWith(playerClass)) return null;
  return spec;
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm test -- tests/unit/class-detection.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/data/spell-book.ts src/detection/class-detection.ts src/detection/spec-detection.ts tests/unit/class-detection.test.ts
git commit -m "feat: add class and spec detection from spell IDs"
```

---

### Task 9: Difficulty Detection

**Files:**
- Create: `src/data/difficulty-spells.ts`
- Create: `src/detection/difficulty.ts`
- Create: `tests/unit/difficulty.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { detectDifficulty, detectDifficultyByPlayerCount } from "../../src/detection/difficulty.js";

describe("detectDifficulty", () => {
  it("detects difficulty from a boss-specific spell ID", () => {
    // Lich King's Infest spell IDs per difficulty
    // 10N, 10H, 25N, 25H
    const result = detectDifficulty("The Lich King", "70541");
    expect(result).toBe("10N");
  });

  it("returns null for unknown spells", () => {
    const result = detectDifficulty("The Lich King", "999999");
    expect(result).toBeNull();
  });
});

describe("detectDifficultyByPlayerCount", () => {
  it("returns 25N for > 10 players", () => {
    expect(detectDifficultyByPlayerCount(25)).toBe("25N");
  });

  it("returns 10N for <= 10 players", () => {
    expect(detectDifficultyByPlayerCount(10)).toBe("10N");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/difficulty.test.ts`
Expected: FAIL

**Step 3: Write implementation**

`src/data/difficulty-spells.ts`: Contains `DIFFICULTY_SPELLS` — a `Map<string, [string, string, string, string]>` mapping boss name → tuple of 4 spell IDs (10N, 10H, 25N, 25H). Source from uwu-logs' difficulty detection module.

`src/detection/difficulty.ts`:
```typescript
import type { RaidDifficulty } from "../types.js";
import { DIFFICULTY_SPELLS } from "../data/difficulty-spells.js";

const DIFFICULTY_INDEX: RaidDifficulty[] = ["10N", "10H", "25N", "25H"];

export function detectDifficulty(bossName: string, spellId: string): RaidDifficulty | null {
  const spells = DIFFICULTY_SPELLS.get(bossName);
  if (!spells) return null;
  const idx = spells.indexOf(spellId);
  if (idx === -1) return null;
  return DIFFICULTY_INDEX[idx];
}

export function detectDifficultyByPlayerCount(playerCount: number): RaidDifficulty {
  return playerCount > 10 ? "25N" : "10N";
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/difficulty.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/data/difficulty-spells.ts src/detection/difficulty.ts tests/unit/difficulty.test.ts
git commit -m "feat: add encounter difficulty detection"
```

---

### Task 10: Encounter Tracker

**Files:**
- Create: `src/state/encounter-tracker.ts`
- Create: `tests/unit/encounter-tracker.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { EncounterTracker } from "../../src/state/encounter-tracker.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";

function makeEvent(overrides: Partial<LogEvent>): LogEvent {
  return {
    timestamp: 0,
    date: "3/5",
    time: "20:00:00.000",
    eventType: "SPELL_DAMAGE",
    sourceGuid: "0x0E000000000A3A18",
    sourceName: "Player",
    sourceFlags: "0x514",
    destGuid: "0xF130003E9C000001",
    destName: "Patchwerk",
    destFlags: "0xa48",
    rawFields: "49909,Icy Touch,0x10,1000,0,16,0,0,0,nil,nil,nil",
    ...overrides,
  };
}

describe("EncounterTracker", () => {
  it("starts an encounter when a boss GUID is first seen", () => {
    const tracker = new EncounterTracker();
    const event = makeEvent({
      timestamp: 1000,
      destGuid: "0xF130003E9C000001", // Patchwerk NPC ID = 003E9C
    });

    const result = tracker.processEvent(event);
    expect(result.encounterStarted).toBe(true);
    expect(tracker.isInEncounter()).toBe(true);
    expect(tracker.getCurrentBossName()).toBe("Patchwerk");
  });

  it("ends an encounter on UNIT_DIED for the boss (kill)", () => {
    const tracker = new EncounterTracker();

    // Start encounter
    tracker.processEvent(
      makeEvent({ timestamp: 1000, destGuid: "0xF130003E9C000001" }),
    );

    // Boss dies
    const result = tracker.processEvent(
      makeEvent({
        timestamp: 60000,
        eventType: "UNIT_DIED",
        sourceGuid: "0x0000000000000000",
        sourceName: "nil",
        destGuid: "0xF130003E9C000001",
        destName: "Patchwerk",
      }),
    );

    expect(result.encounterEnded).toBe(true);
    expect(result.encounter).not.toBeNull();
    expect(result.encounter!.bossName).toBe("Patchwerk");
    expect(result.encounter!.result).toBe("kill");
    expect(result.encounter!.duration).toBeCloseTo(59, 0); // ~59 seconds
    expect(tracker.isInEncounter()).toBe(false);
  });

  it("ends an encounter on idle timeout (wipe)", () => {
    const tracker = new EncounterTracker();

    // Start encounter
    tracker.processEvent(
      makeEvent({ timestamp: 1000, destGuid: "0xF130003E9C000001" }),
    );

    // Activity
    tracker.processEvent(
      makeEvent({ timestamp: 5000, destGuid: "0xF130003E9C000001" }),
    );

    // Long gap — event not targeting boss, 35s later (exceeds 30s default idle)
    const result = tracker.processEvent(
      makeEvent({
        timestamp: 40000,
        destGuid: "0x0E000000000A3A18",
        destName: "SomePlayer",
      }),
    );

    expect(result.encounterEnded).toBe(true);
    expect(result.encounter!.result).toBe("wipe");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/encounter-tracker.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import type { LogEvent } from "../pipeline/line-parser.js";
import type { EncounterSummary, RaidDifficulty } from "../types.js";
import { getNpcId, isNpc, isVehicle } from "../utils/guid.js";
import { epochToIso } from "../utils/timestamp.js";
import { getBossName, getBossIdleThreshold, getMultiBossName, isMultiBoss, getRaidInstance } from "../data/boss-data.js";
import { getSpellId } from "../pipeline/line-parser.js";
import { detectDifficulty, detectDifficultyByPlayerCount } from "../detection/difficulty.js";

export interface EncounterProcessResult {
  encounterStarted: boolean;
  encounterEnded: boolean;
  encounter: EncounterSummary | null;
}

export class EncounterTracker {
  private activeBossName: string | null = null;
  private activeBossNpcIds: Set<string> = new Set();
  private encounterStartTime = 0;
  private lastBossEventTime = 0;
  private bossIdleThreshold = 0;
  private bossDied = false;
  private detectedDifficulty: RaidDifficulty | null = null;
  private encounterPlayerGuids: Set<string> = new Set();

  isInEncounter(): boolean {
    return this.activeBossName !== null;
  }

  getCurrentBossName(): string | null {
    return this.activeBossName;
  }

  /**
   * Process a single log event and return whether an encounter
   * started or ended as a result.
   */
  processEvent(event: LogEvent): EncounterProcessResult {
    const result: EncounterProcessResult = {
      encounterStarted: false,
      encounterEnded: false,
      encounter: null,
    };

    // Check if source or dest is a boss NPC
    const sourceBoss = this.identifyBoss(event.sourceGuid);
    const destBoss = this.identifyBoss(event.destGuid);
    const bossInEvent = destBoss ?? sourceBoss;
    const isBossEvent = bossInEvent !== null;

    if (this.isInEncounter()) {
      // Check if current event involves the active boss
      const involvesActiveBoss =
        isBossEvent && (
          this.activeBossNpcIds.has(getNpcId(event.sourceGuid)) ||
          this.activeBossNpcIds.has(getNpcId(event.destGuid))
        );

      // Check for boss death
      if (
        involvesActiveBoss &&
        (event.eventType === "UNIT_DIED" || event.eventType === "PARTY_KILL")
      ) {
        const deadNpcId = event.eventType === "UNIT_DIED"
          ? getNpcId(event.destGuid)
          : getNpcId(event.destGuid);

        if (this.activeBossNpcIds.has(deadNpcId)) {
          this.bossDied = true;
          // Finalize immediately on boss death
          result.encounterEnded = true;
          result.encounter = this.finalizeEncounter(event.timestamp);
          return result;
        }
      }

      // Check idle timeout
      if (involvesActiveBoss) {
        this.lastBossEventTime = event.timestamp;
      } else if (
        event.timestamp - this.lastBossEventTime > this.bossIdleThreshold
      ) {
        // Idle timeout — encounter ended (wipe)
        result.encounterEnded = true;
        result.encounter = this.finalizeEncounter(this.lastBossEventTime);

        // The current event might start a new encounter
        if (isBossEvent) {
          this.startEncounter(bossInEvent!, event.timestamp);
          result.encounterStarted = true;
        }
        return result;
      }

      // Try to detect difficulty from spell IDs during encounter
      if (this.detectedDifficulty === null) {
        const spellId = getSpellId(event);
        if (spellId) {
          this.detectedDifficulty =
            detectDifficulty(this.activeBossName!, spellId);
        }
      }

      // Track players in encounter
      if (event.sourceGuid.startsWith("0x0E")) {
        this.encounterPlayerGuids.add(event.sourceGuid);
      }
    } else {
      // Not in encounter — check if this event starts one
      if (isBossEvent && this.isCombatEvent(event.eventType)) {
        this.startEncounter(bossInEvent!, event.timestamp);
        result.encounterStarted = true;
      }
    }

    return result;
  }

  /**
   * Force-close any active encounter (called when raid segment ends).
   */
  forceEnd(lastTimestamp: number): EncounterSummary | null {
    if (!this.isInEncounter()) return null;
    return this.finalizeEncounter(lastTimestamp);
  }

  private identifyBoss(guid: string): string | null {
    if (!isNpc(guid) && !isVehicle(guid)) return null;
    const npcId = getNpcId(guid);

    // Check multi-boss first
    if (isMultiBoss(npcId)) {
      return getMultiBossName(npcId);
    }

    return getBossName(npcId);
  }

  private startEncounter(bossName: string, timestamp: number): void {
    this.activeBossName = bossName;
    this.encounterStartTime = timestamp;
    this.lastBossEventTime = timestamp;
    this.bossIdleThreshold = getBossIdleThreshold(bossName);
    this.bossDied = false;
    this.detectedDifficulty = null;
    this.encounterPlayerGuids = new Set();
    this.activeBossNpcIds = this.collectBossNpcIds(bossName);
  }

  private collectBossNpcIds(bossName: string): Set<string> {
    // For multi-boss encounters, collect all sub-boss NPC IDs
    // For single-boss, just the one NPC ID
    // This is populated as we see NPCs during the encounter
    // Start with an empty set; we'll add NPC IDs as we see them
    return new Set();
  }

  private finalizeEncounter(endTimestamp: number): EncounterSummary {
    const duration = (endTimestamp - this.encounterStartTime) / 1000;
    const difficulty =
      this.detectedDifficulty ??
      detectDifficultyByPlayerCount(this.encounterPlayerGuids.size);

    const encounter: EncounterSummary = {
      bossName: this.activeBossName!,
      startTime: epochToIso(this.encounterStartTime),
      endTime: epochToIso(endTimestamp),
      duration: Math.round(duration),
      result: this.bossDied ? "kill" : "wipe",
      difficulty,
    };

    // Reset state
    this.activeBossName = null;
    this.activeBossNpcIds.clear();
    this.encounterStartTime = 0;
    this.lastBossEventTime = 0;
    this.bossDied = false;
    this.detectedDifficulty = null;
    this.encounterPlayerGuids.clear();

    return encounter;
  }

  private isCombatEvent(eventType: string): boolean {
    return (
      eventType.includes("DAMAGE") ||
      eventType.includes("HEAL") ||
      eventType === "SPELL_CAST_SUCCESS" ||
      eventType === "SPELL_CAST_START" ||
      eventType === "SWING_MISSED" ||
      eventType === "SPELL_MISSED" ||
      eventType === "RANGE_DAMAGE" ||
      eventType === "RANGE_MISSED"
    );
  }
}
```

Note: The `collectBossNpcIds` method needs refinement during implementation — the encounter tracker should populate NPC IDs from the boss data module. This is a known simplification in the plan; the implementation should use the boss data to pre-populate all NPC IDs that belong to the same encounter.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/encounter-tracker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/state/encounter-tracker.ts tests/unit/encounter-tracker.test.ts
git commit -m "feat: add encounter tracker with kill/wipe detection"
```

---

### Task 11: Raid Separator

**Files:**
- Create: `src/state/raid-separator.ts`
- Create: `tests/unit/raid-separator.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { RaidSeparator, type RaidSegment } from "../../src/state/raid-separator.js";

describe("RaidSeparator", () => {
  it("creates a segment from the first event", () => {
    const separator = new RaidSeparator();
    const result = separator.processTimestamp(
      1000,
      "3/5",
      "0x0E000000000A3A18",
      null, // no boss NPC
    );
    expect(result.newSegment).toBe(false); // first event creates initial segment
    expect(separator.getCurrentSegment()).not.toBeNull();
  });

  it("splits on date change", () => {
    const separator = new RaidSeparator();
    separator.processTimestamp(1000, "3/5", "0x0E000000000A3A18", null);
    const result = separator.processTimestamp(
      86400000 + 1000,
      "3/6",
      "0x0E000000000A3A18",
      null,
    );
    expect(result.newSegment).toBe(true);
  });

  it("splits on 30+ minute time gap within same date", () => {
    const separator = new RaidSeparator();
    separator.processTimestamp(1000, "3/5", "0x0E000000000A3A18", null);
    // 31 minutes later
    const result = separator.processTimestamp(
      1000 + 31 * 60 * 1000,
      "3/5",
      "0x0E000000000A3A18",
      null,
    );
    expect(result.newSegment).toBe(true);
  });

  it("does NOT split on small time gaps", () => {
    const separator = new RaidSeparator();
    separator.processTimestamp(1000, "3/5", "0x0E000000000A3A18", null);
    // 5 minutes later
    const result = separator.processTimestamp(
      1000 + 5 * 60 * 1000,
      "3/5",
      "0x0E000000000A3A18",
      null,
    );
    expect(result.newSegment).toBe(false);
  });

  it("splits when boss from different raid instance appears", () => {
    const separator = new RaidSeparator();
    separator.processTimestamp(1000, "3/5", "0x0E000000000A3A18", "Naxxramas");
    // Same time, but different instance
    const result = separator.processTimestamp(
      1000 + 5 * 60 * 1000,
      "3/5",
      "0x0E000000000A3A18",
      "Obsidian Sanctum",
    );
    expect(result.newSegment).toBe(true);
  });

  it("finalizes all segments on finish", () => {
    const separator = new RaidSeparator();
    separator.processTimestamp(1000, "3/5", "0x0E000000000A3A18", null);
    separator.processTimestamp(2000, "3/5", "0x0E000000000B3B19", null);
    separator.processTimestamp(
      86400000 + 1000,
      "3/6",
      "0x0E000000000A3A18",
      null,
    );

    const segments = separator.finalize();
    expect(segments.length).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/raid-separator.test.ts`
Expected: FAIL

**Step 3: Write implementation**

```typescript
import { epochToIso } from "../utils/timestamp.js";

const SEGMENT_GAP_MS = 30 * 60 * 1000; // 30 minutes

export interface RaidSegment {
  date: string;
  firstTimestamp: number; // epoch ms
  lastTimestamp: number; // epoch ms
  playerGuids: Set<string>;
  raidInstance: string | null;
}

export interface SegmentProcessResult {
  newSegment: boolean;
  completedSegment: RaidSegment | null;
}

export class RaidSeparator {
  private segments: RaidSegment[] = [];
  private currentSegment: RaidSegment | null = null;

  getCurrentSegment(): RaidSegment | null {
    return this.currentSegment;
  }

  /**
   * Process a timestamp from a log event. Returns whether a new segment was created.
   */
  processTimestamp(
    timestamp: number,
    date: string,
    playerGuid: string | null,
    raidInstance: string | null,
  ): SegmentProcessResult {
    const result: SegmentProcessResult = {
      newSegment: false,
      completedSegment: null,
    };

    if (this.currentSegment === null) {
      // First event — create initial segment
      this.currentSegment = this.createSegment(date, timestamp, raidInstance);
      if (playerGuid) this.currentSegment.playerGuids.add(playerGuid);
      return result;
    }

    // Check for segment break conditions
    const dateChanged = date !== this.currentSegment.date;
    const timeGap = timestamp - this.currentSegment.lastTimestamp;
    const bigGap = timeGap > SEGMENT_GAP_MS;
    const instanceChanged =
      raidInstance !== null &&
      this.currentSegment.raidInstance !== null &&
      raidInstance !== this.currentSegment.raidInstance;

    if (dateChanged || bigGap || instanceChanged) {
      // Finalize current segment
      result.completedSegment = this.currentSegment;
      this.segments.push(this.currentSegment);

      // Start new segment
      this.currentSegment = this.createSegment(date, timestamp, raidInstance);
      result.newSegment = true;
    } else {
      // Update current segment
      this.currentSegment.lastTimestamp = timestamp;
      if (raidInstance && !this.currentSegment.raidInstance) {
        this.currentSegment.raidInstance = raidInstance;
      }
    }

    if (playerGuid) {
      this.currentSegment.playerGuids.add(playerGuid);
    }

    return result;
  }

  /**
   * Finalize and return all segments. Merges adjacent segments with high roster overlap.
   */
  finalize(): RaidSegment[] {
    if (this.currentSegment) {
      this.segments.push(this.currentSegment);
      this.currentSegment = null;
    }
    return this.mergeSegments(this.segments);
  }

  private createSegment(
    date: string,
    timestamp: number,
    raidInstance: string | null,
  ): RaidSegment {
    return {
      date,
      firstTimestamp: timestamp,
      lastTimestamp: timestamp,
      playerGuids: new Set(),
      raidInstance,
    };
  }

  /**
   * Merge adjacent segments that have high roster overlap and same raid instance.
   */
  private mergeSegments(segments: RaidSegment[]): RaidSegment[] {
    if (segments.length <= 1) return segments;

    const merged: RaidSegment[] = [segments[0]];

    for (let i = 1; i < segments.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = segments[i];

      const sameDate = prev.date === curr.date;
      const sameInstance =
        prev.raidInstance === null ||
        curr.raidInstance === null ||
        prev.raidInstance === curr.raidInstance;
      const highOverlap = sameDate && sameInstance && this.jaccardSimilarity(prev.playerGuids, curr.playerGuids) >= 0.5;

      if (highOverlap) {
        // Merge into prev
        prev.lastTimestamp = curr.lastTimestamp;
        for (const guid of curr.playerGuids) {
          prev.playerGuids.add(guid);
        }
        if (curr.raidInstance) {
          prev.raidInstance = curr.raidInstance;
        }
      } else {
        merged.push(curr);
      }
    }

    return merged;
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/raid-separator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/state/raid-separator.ts tests/unit/raid-separator.test.ts
git commit -m "feat: add raid separator with segment merging"
```

---

### Task 12: State Machine

**Files:**
- Create: `src/state/state-machine.ts`
- Create: `tests/unit/state-machine.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { CombatLogStateMachine } from "../../src/state/state-machine.js";
import type { LogEvent } from "../../src/pipeline/line-parser.js";

function makeEvent(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: 0,
    date: "3/5",
    time: "20:00:00.000",
    eventType: "SPELL_DAMAGE",
    sourceGuid: "0x0E000000000A3A18",
    sourceName: "TestPlayer",
    sourceFlags: "0x514",
    destGuid: "0xF130003E9C000001",
    destName: "Patchwerk",
    destFlags: "0xa48",
    rawFields: "49909,Icy Touch,0x10,1000,0,16,0,0,0,nil,nil,nil",
    ...overrides,
  };
}

describe("CombatLogStateMachine", () => {
  it("detects a player from an event", () => {
    const sm = new CombatLogStateMachine();
    sm.processEvent(makeEvent());
    const players = sm.getDetectedPlayers();
    expect(players.size).toBe(1);
    expect(players.get("0x0E000000000A3A18")?.name).toBe("TestPlayer");
  });

  it("detects a class from spell usage", () => {
    const sm = new CombatLogStateMachine();
    // 49909 = Icy Touch = Death Knight
    sm.processEvent(
      makeEvent({
        rawFields: "49909,Icy Touch,0x10,1000,0,16,0,0,0,nil,nil,nil",
        eventType: "SPELL_DAMAGE",
      }),
    );
    const player = sm.getDetectedPlayers().get("0x0E000000000A3A18");
    expect(player?.class).toBe("death-knight");
  });

  it("produces encounters after processing events", () => {
    const sm = new CombatLogStateMachine();

    // Encounter start
    sm.processEvent(makeEvent({ timestamp: 1000 }));
    sm.processEvent(makeEvent({ timestamp: 5000 }));

    // Boss dies
    sm.processEvent(
      makeEvent({
        timestamp: 60000,
        eventType: "UNIT_DIED",
        sourceGuid: "0x0000000000000000",
        sourceName: "nil",
        destGuid: "0xF130003E9C000001",
        destName: "Patchwerk",
      }),
    );

    const encounters = sm.getEncounters();
    expect(encounters.length).toBe(1);
    expect(encounters[0].bossName).toBe("Patchwerk");
    expect(encounters[0].result).toBe("kill");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/state-machine.test.ts`
Expected: FAIL

**Step 3: Write implementation**

The state machine composes `EncounterTracker` and `RaidSeparator`, plus player tracking and class/spec detection. It processes `LogEvent`s one at a time and accumulates results.

```typescript
import type { LogEvent } from "../pipeline/line-parser.js";
import type { EncounterSummary, PlayerInfo, WowClass, WowSpec } from "../types.js";
import { isPlayer } from "../utils/guid.js";
import { getSpellId } from "../pipeline/line-parser.js";
import { EncounterTracker } from "./encounter-tracker.js";
import { RaidSeparator, type RaidSegment } from "./raid-separator.js";
import { detectClass } from "../detection/class-detection.js";
import { detectSpec } from "../detection/spec-detection.js";
import { getRaidInstance } from "../data/boss-data.js";

interface PlayerRecord {
  guid: string;
  name: string;
  class: WowClass | null;
  spec: WowSpec | null;
}

export class CombatLogStateMachine {
  private encounterTracker = new EncounterTracker();
  private raidSeparator = new RaidSeparator();
  private players = new Map<string, PlayerRecord>();
  private encounters: EncounterSummary[] = [];
  private currentRaidInstance: string | null = null;

  processEvent(event: LogEvent): void {
    // 1. Track players
    this.trackPlayer(event);

    // 2. Detect class/spec from spell usage
    this.detectClassSpec(event);

    // 3. Determine raid instance from boss events
    const raidInstance = this.detectRaidInstance(event);
    if (raidInstance) {
      this.currentRaidInstance = raidInstance;
    }

    // 4. Feed to raid separator
    const sourcePlayerGuid = isPlayer(event.sourceGuid)
      ? event.sourceGuid
      : null;
    this.raidSeparator.processTimestamp(
      event.timestamp,
      event.date,
      sourcePlayerGuid,
      this.currentRaidInstance,
    );

    // 5. Feed to encounter tracker
    const encounterResult = this.encounterTracker.processEvent(event);
    if (encounterResult.encounterEnded && encounterResult.encounter) {
      this.encounters.push(encounterResult.encounter);
    }
  }

  /**
   * Finalize processing — flush any active encounter and segments.
   */
  finalize(lastTimestamp: number): void {
    const activeEncounter = this.encounterTracker.forceEnd(lastTimestamp);
    if (activeEncounter) {
      this.encounters.push(activeEncounter);
    }
  }

  getDetectedPlayers(): Map<string, PlayerRecord> {
    return this.players;
  }

  getEncounters(): EncounterSummary[] {
    return this.encounters;
  }

  getRaidSegments(): RaidSegment[] {
    return this.raidSeparator.finalize();
  }

  private trackPlayer(event: LogEvent): void {
    if (isPlayer(event.sourceGuid) && !this.players.has(event.sourceGuid)) {
      this.players.set(event.sourceGuid, {
        guid: event.sourceGuid,
        name: event.sourceName,
        class: null,
        spec: null,
      });
    }
    if (isPlayer(event.destGuid) && !this.players.has(event.destGuid)) {
      this.players.set(event.destGuid, {
        guid: event.destGuid,
        name: event.destName,
        class: null,
        spec: null,
      });
    }
  }

  private detectClassSpec(event: LogEvent): void {
    if (!isPlayer(event.sourceGuid)) return;
    const player = this.players.get(event.sourceGuid);
    if (!player) return;

    const spellId = getSpellId(event);
    if (!spellId) return;

    // Detect class if not already known
    if (player.class === null) {
      player.class = detectClass(spellId);
    }

    // Detect spec if class is known but spec is not
    if (player.class !== null && player.spec === null) {
      player.spec = detectSpec(spellId, player.class);
    }
  }

  private detectRaidInstance(event: LogEvent): string | null {
    const bossName = this.encounterTracker.getCurrentBossName();
    if (bossName) {
      return getRaidInstance(bossName);
    }
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/state-machine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/state/state-machine.ts tests/unit/state-machine.test.ts
git commit -m "feat: add core state machine composing encounter tracker, raid separator, and player detection"
```

---

### Task 13: scanLog Implementation

**Files:**
- Modify: `src/scanner.ts`
- Create: `tests/unit/scanner.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { scanLog } from "../../src/scanner.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function fileToStream(path: string): ReadableStream<Uint8Array> {
  const content = readFileSync(path);
  return new ReadableStream({
    start(controller) {
      // Feed in chunks to simulate streaming
      const chunkSize = 64 * 1024;
      for (let i = 0; i < content.length; i += chunkSize) {
        controller.enqueue(content.subarray(i, i + chunkSize));
      }
      controller.close();
    },
  });
}

describe("scanLog", () => {
  it("detects raids from a single-raid log file", async () => {
    const stream = fileToStream(
      join(__dirname, "../../example-logs/WoWCombatLog3.txt"),
    );
    const result = await scanLog(stream);

    expect(result.raids.length).toBeGreaterThanOrEqual(1);

    // WoWCombatLog3.txt is from 2/22, Vault of Archavon
    const raid = result.raids[0];
    expect(raid.dates).toContain("2/22");
    expect(raid.playerCount).toBeGreaterThan(0);
    expect(raid.players.length).toBeGreaterThan(0);
  });

  it("detects multiple raids from a multi-raid log file", async () => {
    const stream = fileToStream(
      join(__dirname, "../../example-logs/example-multiple-raids.txt"),
    );
    const result = await scanLog(stream);

    // This file has 7 different dates with multiple raid instances
    expect(result.raids.length).toBeGreaterThan(1);
  });

  it("detects encounters within raids", async () => {
    const stream = fileToStream(
      join(__dirname, "../../example-logs/WoWCombatLog3.txt"),
    );
    const result = await scanLog(stream);

    const raid = result.raids[0];
    expect(raid.encounters.length).toBeGreaterThan(0);

    // Each encounter should have required fields
    for (const encounter of raid.encounters) {
      expect(encounter.bossName).toBeTruthy();
      expect(encounter.startTime).toBeTruthy();
      expect(encounter.endTime).toBeTruthy();
      expect(encounter.duration).toBeGreaterThan(0);
      expect(["kill", "wipe"]).toContain(encounter.result);
    }
  });

  it("reports progress", async () => {
    const stream = fileToStream(
      join(__dirname, "../../example-logs/WoWCombatLog3.txt"),
    );
    const progressCalls: number[] = [];

    await scanLog(stream, {
      onProgress: (bytesRead) => progressCalls.push(bytesRead),
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    // Last progress call should be the total bytes
    expect(progressCalls[progressCalls.length - 1]).toBeGreaterThan(0);
  });

  it("detects player classes", async () => {
    const stream = fileToStream(
      join(__dirname, "../../example-logs/WoWCombatLog3.txt"),
    );
    const result = await scanLog(stream);

    const raid = result.raids[0];
    const playersWithClass = raid.players.filter((p) => p.class !== null);
    // Most players should have a detected class
    expect(playersWithClass.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/scanner.test.ts`
Expected: FAIL (stub returns empty result)

**Step 3: Write implementation**

Replace the stub `scanner.ts` with the full implementation that:
1. Creates the streaming pipeline: `stream → TextDecoderStream → LineSplitter`
2. Reads lines one by one, parsing each with `parseLine`
3. Feeds events into `CombatLogStateMachine`
4. After stream ends, calls `finalize()` on the state machine
5. Groups segments into `DetectedRaid[]` by combining encounter data, player data, and segment boundaries
6. Reports progress via `onProgress` callback (count bytes from `TextDecoder` input)

The year should be inferred from the current date (`new Date().getFullYear()`), matching wow-core's behavior.

Segment-to-raid grouping logic:
- Each segment from `RaidSeparator.finalize()` becomes a `DetectedRaid`
- Cross-date segments with the same `raidInstance` and high player overlap are merged into one `DetectedRaid` with multiple `dates` and `timeRanges`
- Each raid's `encounters` are the subset of encounters whose timestamps fall within the raid's time ranges
- Each raid's `players` are filtered to those whose GUIDs appear in the segment's player set

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/scanner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/scanner.ts tests/unit/scanner.test.ts
git commit -m "feat: implement scanLog with streaming pipeline"
```

---

### Task 14: parseLog Implementation

**Files:**
- Modify: `src/parser.ts`
- Create: `tests/unit/parser.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { scanLog } from "../../src/scanner.js";
import { parseLog } from "../../src/parser.js";
import { readFileSync } from "node:fs";
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

describe("parseLog", () => {
  it("parses a specific raid selection", async () => {
    // First scan to get raid boundaries
    const scanStream = fileToStream(
      join(__dirname, "../../example-logs/WoWCombatLog3.txt"),
    );
    const scanResult = await scanLog(scanStream);
    const firstRaid = scanResult.raids[0];

    // Now parse with the detected time ranges
    const parseStream = fileToStream(
      join(__dirname, "../../example-logs/WoWCombatLog3.txt"),
    );
    const parseResult = await parseLog(parseStream, [
      {
        dates: firstRaid.dates,
        startTime: firstRaid.startTime,
        endTime: firstRaid.endTime,
        timeRanges: firstRaid.timeRanges,
      },
    ]);

    expect(parseResult.raids.length).toBe(1);
    expect(parseResult.raids[0].players.length).toBeGreaterThan(0);
    expect(parseResult.raids[0].raidDate).toBeInstanceOf(Date);
  });

  it("parses multiple raid selections", async () => {
    const scanStream = fileToStream(
      join(__dirname, "../../example-logs/example-multiple-raids.txt"),
    );
    const scanResult = await scanLog(scanStream);

    // Select first two raids
    const selections = scanResult.raids.slice(0, 2).map((r) => ({
      dates: r.dates,
      startTime: r.startTime,
      endTime: r.endTime,
      timeRanges: r.timeRanges,
    }));

    const parseStream = fileToStream(
      join(__dirname, "../../example-logs/example-multiple-raids.txt"),
    );
    const parseResult = await parseLog(parseStream, selections);

    expect(parseResult.raids.length).toBe(2);
    // Each raid should have players
    for (const raid of parseResult.raids) {
      expect(raid.players.length).toBeGreaterThan(0);
    }
  });

  it("filters players to only those in the selected time range", async () => {
    const scanStream = fileToStream(
      join(__dirname, "../../example-logs/example-multiple-raids.txt"),
    );
    const scanResult = await scanLog(scanStream);

    if (scanResult.raids.length >= 2) {
      const raid1 = scanResult.raids[0];
      const raid2 = scanResult.raids[1];

      // Parse just raid 1
      const parseStream = fileToStream(
        join(__dirname, "../../example-logs/example-multiple-raids.txt"),
      );
      const parseResult = await parseLog(parseStream, [
        {
          dates: raid1.dates,
          startTime: raid1.startTime,
          endTime: raid1.endTime,
          timeRanges: raid1.timeRanges,
        },
      ]);

      // Player count should match (approximately) the scan result
      expect(parseResult.raids[0].players.length).toBeCloseTo(
        raid1.playerCount,
        -1, // within 10
      );
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/parser.test.ts`
Expected: FAIL (stub returns empty result)

**Step 3: Write implementation**

Replace the stub `parser.ts` with the full implementation that:
1. Pre-processes `RaidSelection[]` into a fast-lookup structure: a `Set<string>` of relevant dates, and for each date, an array of `{ start: number, end: number }` time windows (converted from ISO-8601 to epoch ms)
2. Creates the streaming pipeline (same as scanLog)
3. For each line, checks if its timestamp falls within any selection's time windows
4. If yes, feeds the event into a per-selection state machine
5. After stream ends, finalizes each state machine and builds `ParsedRaid[]`

This is similar to wow-core's `parseLogStreamMulti` but using the state machine instead of just tracking player GUIDs.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/parser.ts tests/unit/parser.test.ts
git commit -m "feat: implement parseLog with time-range filtering"
```

---

### Task 15: Integration Tests with Example Logs

**Files:**
- Create: `tests/integration/scan-examples.test.ts`

**Step 1: Write comprehensive integration tests**

```typescript
import { describe, it, expect } from "vitest";
import { scanLog } from "../../src/index.js";
import { readFileSync } from "node:fs";
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

const LOGS_DIR = join(__dirname, "../../example-logs");

describe("integration: scan example logs", () => {
  it("WoWCombatLog3.txt - Vault of Archavon single raid", async () => {
    const stream = fileToStream(join(LOGS_DIR, "WoWCombatLog3.txt"));
    const result = await scanLog(stream);

    expect(result.raids.length).toBeGreaterThanOrEqual(1);
    const raid = result.raids[0];
    expect(raid.dates).toContain("2/22");
    expect(raid.encounters.length).toBeGreaterThan(0);

    // Should detect Archavon
    const bossNames = raid.encounters.map((e) => e.bossName);
    expect(bossNames).toContain("Archavon the Stone Watcher");
  });

  it("WoWCombatLog.txt - Naxxramas raid", async () => {
    const stream = fileToStream(join(LOGS_DIR, "WoWCombatLog.txt"));
    const result = await scanLog(stream);

    expect(result.raids.length).toBeGreaterThanOrEqual(1);
    const naxxRaid = result.raids.find(
      (r) => r.raidInstance === "Naxxramas",
    );
    expect(naxxRaid).toBeDefined();
    expect(naxxRaid!.playerCount).toBeGreaterThan(5);
  });

  it("example-multiple-raids.txt - multiple raids across dates", async () => {
    const stream = fileToStream(
      join(LOGS_DIR, "example-multiple-raids.txt"),
    );
    const result = await scanLog(stream);

    // Should detect multiple raids across 7 dates
    expect(result.raids.length).toBeGreaterThan(3);

    // Should have raids from different instances
    const instances = new Set(
      result.raids.map((r) => r.raidInstance).filter(Boolean),
    );
    expect(instances.size).toBeGreaterThanOrEqual(1);

    // All encounters should have valid durations
    for (const raid of result.raids) {
      for (const enc of raid.encounters) {
        expect(enc.duration).toBeGreaterThan(0);
        expect(enc.duration).toBeLessThan(3600); // no encounter > 1 hour
      }
    }
  }, 30000); // 30s timeout for large file

  it("produces valid ISO timestamps", async () => {
    const stream = fileToStream(join(LOGS_DIR, "WoWCombatLog3.txt"));
    const result = await scanLog(stream);

    for (const raid of result.raids) {
      expect(new Date(raid.startTime).getTime()).not.toBeNaN();
      expect(new Date(raid.endTime).getTime()).not.toBeNaN();

      for (const enc of raid.encounters) {
        expect(new Date(enc.startTime).getTime()).not.toBeNaN();
        expect(new Date(enc.endTime).getTime()).not.toBeNaN();
      }
    }
  });

  it("encounters are sorted chronologically within each raid", async () => {
    const stream = fileToStream(join(LOGS_DIR, "WoWCombatLog.txt"));
    const result = await scanLog(stream);

    for (const raid of result.raids) {
      for (let i = 1; i < raid.encounters.length; i++) {
        const prevStart = new Date(raid.encounters[i - 1].startTime).getTime();
        const currStart = new Date(raid.encounters[i].startTime).getTime();
        expect(currStart).toBeGreaterThanOrEqual(prevStart);
      }
    }
  });
});
```

**Step 2: Run tests**

Run: `pnpm test -- tests/integration/scan-examples.test.ts`
Expected: PASS (if all previous tasks are correct)

If any tests fail, debug and fix the underlying modules. The integration tests may reveal edge cases in the encounter tracker, raid separator, or boss data that need adjustment.

**Step 3: Commit**

```bash
git add tests/integration/scan-examples.test.ts
git commit -m "test: add integration tests with example combat logs"
```

---

### Task 16: Export Cleanup & Final Build Verification

**Files:**
- Modify: `src/index.ts` (ensure all public types and functions are exported)
- Modify: `package.json` (verify exports field)

**Step 1: Verify index.ts exports everything needed**

Ensure `src/index.ts` exports:
- `scanLog` and `parseLog` functions
- All public types from `types.ts`
- No internal types or implementation details

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Run build**

Run: `pnpm build`
Expected: Clean build with `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/index.d.cts`

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: finalize exports and verify build"
```

---

## Task Summary

| Task | Description | Est. Complexity |
|------|-------------|-----------------|
| 1 | Project scaffolding | Low |
| 2 | Timestamp parsing utility | Low |
| 3 | GUID utilities | Low |
| 4 | Quote-aware field parser | Low |
| 5 | Line splitter transform stream | Low |
| 6 | Line parser | Medium |
| 7 | Boss data & raid instance mapping | Medium (data entry) |
| 8 | Class & spec detection data | Medium (data entry) |
| 9 | Difficulty detection | Low |
| 10 | Encounter tracker | High |
| 11 | Raid separator | Medium |
| 12 | State machine | High |
| 13 | scanLog implementation | High |
| 14 | parseLog implementation | Medium |
| 15 | Integration tests | Medium |
| 16 | Export cleanup & final build | Low |

Tasks 1-9 are independently implementable utilities and data modules. Tasks 10-12 build the core state engine. Tasks 13-14 wire everything together. Tasks 15-16 validate and finalize.
