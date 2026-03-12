// tests/unit/guid.test.ts
import { describe, it, expect } from "vitest";
import { isPlayer, isNpc, isPet, isVehicle, getNpcId, isNullGuid } from "../../src/utils/guid.js";

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
    expect(getNpcId(npcGuid)).toBe("003E9C");
    expect(getNpcId(vehicleGuid)).toBe("0075D1");
  });

  it("detects null GUID", () => {
    expect(isNullGuid(nullGuid)).toBe(true);
    expect(isNullGuid(playerGuid)).toBe(false);
  });
});
