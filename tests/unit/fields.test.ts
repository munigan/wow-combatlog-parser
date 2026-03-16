// tests/unit/fields.test.ts
import { describe, it, expect } from "vitest";
import { parseFields, parseFieldsPartial, stripQuotes } from "../../src/utils/fields.js";

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

describe("parseFieldsPartial", () => {
  it("returns first N fields and the rest as a string", () => {
    const input = 'SPELL_DAMAGE,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2';
    const result = parseFieldsPartial(input, 7);
    expect(result.fields).toHaveLength(7);
    expect(result.fields[0]).toBe("SPELL_DAMAGE");
    expect(result.fields[1]).toBe("0x0E000000000A3A18");
    expect(result.fields[2]).toBe("Pattz");
    expect(result.fields[6]).toBe("0x514");
    expect(result.rest).toBe('48782,"Holy Light",0x2');
  });

  it("returns empty rest when exactly N fields exist", () => {
    const input = 'UNIT_DIED,0x0000000000000000,nil,0x80000000,0xF130003F6C0003DE,"Eye Stalk",0xa48';
    const result = parseFieldsPartial(input, 7);
    expect(result.fields).toHaveLength(7);
    expect(result.rest).toBe("");
  });

  it("returns empty rest when fewer than N fields exist", () => {
    const input = "A,B,C";
    const result = parseFieldsPartial(input, 7);
    expect(result.fields).toHaveLength(3);
    expect(result.rest).toBe("");
  });

  it("handles quoted fields with commas", () => {
    const input = 'SPELL_HEAL,0x0E000000000A3A18,"Player, the Great",0x514,0x0E000000000A3A18,"Target",0x514,48782,"Holy Light",0x2';
    const result = parseFieldsPartial(input, 7);
    expect(result.fields[2]).toBe("Player, the Great");
    expect(result.fields).toHaveLength(7);
    expect(result.rest).toBe('48782,"Holy Light",0x2');
  });

  it("produces same first 7 fields as parseFields", () => {
    const input = 'SPELL_DAMAGE,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2,5000,200,0x10';
    const fullFields = parseFields(input);
    const partial = parseFieldsPartial(input, 7);
    for (let i = 0; i < 7; i++) {
      expect(partial.fields[i]).toBe(fullFields[i]);
    }
    // rest is the raw unparsed remainder (quotes preserved), not re-joined stripped fields
    expect(partial.rest).toBe('48782,"Holy Light",0x2,5000,200,0x10');
  });
});
