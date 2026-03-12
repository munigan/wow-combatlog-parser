// tests/unit/fields.test.ts
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
  it("parses a combat log event line", () => {
    const input = 'SPELL_DAMAGE,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2';
    const fields = parseFields(input);
    expect(fields[0]).toBe("SPELL_DAMAGE");
    expect(fields[1]).toBe("0x0E000000000A3A18");
    expect(fields[2]).toBe("Pattz");
    expect(fields[3]).toBe("0x514");
    expect(fields[7]).toBe("48782");
    expect(fields[8]).toBe("Holy Light");
  });

  it("handles names with commas inside quotes", () => {
    const input = 'SPELL_HEAL,0x0E000000000A3A18,"Player, the Great",0x514,0x0E000000000A3A18,"Target",0x514';
    const fields = parseFields(input);
    expect(fields[2]).toBe("Player, the Great");
    expect(fields[3]).toBe("0x514");
    expect(fields[5]).toBe("Target");
  });

  it("handles empty input", () => {
    expect(parseFields("")).toEqual([""]);
  });
});
