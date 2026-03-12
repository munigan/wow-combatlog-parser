// tests/unit/timestamp.test.ts
import { describe, it, expect } from "vitest";
import { parseTimestamp, parseTimestampToEpoch } from "../../src/utils/timestamp.js";

describe("parseTimestamp", () => {
  it("parses a standard timestamp", () => {
    const result = parseTimestamp("3/5 20:03:31.449");
    expect(result).toEqual({
      date: "3/5", month: 3, day: 5, hours: 20, minutes: 3, seconds: 31, milliseconds: 449,
    });
  });

  it("parses two-digit month/day", () => {
    const result = parseTimestamp("12/25 08:15:00.000");
    expect(result).toEqual({
      date: "12/25", month: 12, day: 25, hours: 8, minutes: 15, seconds: 0, milliseconds: 0,
    });
  });
});

describe("parseTimestampToEpoch", () => {
  it("converts timestamp to epoch ms using assumed year", () => {
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

  it("creates a valid ISO string", () => {
    const epoch = parseTimestampToEpoch("2/11 18:30:00.000", 2026);
    const iso = new Date(epoch).toISOString();
    expect(iso).toBe("2026-02-11T18:30:00.000Z");
  });
});
