import { describe, it, expect } from "vitest";
import { detectClass } from "../../src/detection/class-detection.js";
import { detectSpec } from "../../src/detection/spec-detection.js";

describe("detectClass", () => {
  it("detects Paladin from Holy Light", () =>
    expect(detectClass("48782")).toBe("paladin"));
  it("detects Death Knight from Icy Touch", () =>
    expect(detectClass("49909")).toBe("death-knight"));
  it("detects Warrior from Heroic Strike", () =>
    expect(detectClass("78")).toBe("warrior"));
  it("detects Mage from Fireball", () =>
    expect(detectClass("42833")).toBe("mage"));
  it("returns null for unknown spells", () =>
    expect(detectClass("999999")).toBeNull());
});

describe("detectSpec", () => {
  it("detects Retribution Paladin from Divine Storm", () =>
    expect(detectSpec("53385", "paladin")).toBe("paladin-retribution"));
  it("detects Holy Paladin from Holy Shock", () =>
    expect(detectSpec("48825", "paladin")).toBe("paladin-holy"));
  it("detects Unholy DK from Scourge Strike", () =>
    expect(detectSpec("55271", "death-knight")).toBe("death-knight-unholy"));
  it("returns null for non-spec-defining spells", () =>
    expect(detectSpec("48782", "paladin")).toBeNull());
  it("returns null for wrong class", () =>
    expect(detectSpec("53385", "warrior")).toBeNull());
});
