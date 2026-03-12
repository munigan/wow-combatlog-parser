// tests/unit/line-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseLine, getSpellId } from "../../src/pipeline/line-parser.js";

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
      '2/22 15:18:06.300  SWING_DAMAGE,0xF130007E61000002,"Archavon Warder",0xa48,0x0E0000000018667D,"Stranglol",0x512,13337,0,1,0,0,0,nil,nil,nil';
    const event = parseLine(raw, 2026);
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("SWING_DAMAGE");
    expect(event!.sourceName).toBe("Archavon Warder");
    expect(event!.destName).toBe("Stranglol");
  });

  it("returns remaining fields as rawFields", () => {
    const raw =
      '3/5 20:03:31.449  SPELL_CAST_SUCCESS,0x0E000000000A3A18,"Pattz",0x514,0x0E000000000A3A18,"Pattz",0x514,48782,"Holy Light",0x2';
    const event = parseLine(raw, 2026);
    expect(event).not.toBeNull();
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
    expect(parseLine("no  double space here", 2026)).toBeNull();
  });
});

describe("getSpellId", () => {
  it("extracts spell ID from spell events", () => {
    const raw =
      '3/5 20:03:31.449  SPELL_DAMAGE,0x0E000000000A3A18,"Pattz",0x514,0xF130003E9C000001,"Boss",0xa48,49909,"Icy Touch",0x10,1000,0,16';
    const event = parseLine(raw, 2026)!;
    expect(getSpellId(event)).toBe("49909");
  });

  it("returns null for SWING events", () => {
    const raw =
      '2/22 15:18:06.300  SWING_DAMAGE,0xF130007E61000002,"Archavon Warder",0xa48,0x0E0000000018667D,"Stranglol",0x512,13337,0,1,0,0,0,nil,nil,nil';
    const event = parseLine(raw, 2026)!;
    expect(getSpellId(event)).toBeNull();
  });
});
