import { describe, it, expect } from "vitest";
import {
  getBossName,
  getRaidInstance,
  getBossIdleThreshold,
  isMultiBoss,
  getMultiBossName,
  getMultiBossNpcIds,
  isCowardBoss,
  BOSS_DEFAULT_IDLE_MS,
} from "../../src/data/boss-data.js";

describe("boss-data", () => {
  it("looks up boss name by NPC ID", () => {
    expect(getBossName("003E9C")).toBe("Patchwerk");
    expect(getBossName("003E75")).toBe("Sapphiron");
    expect(getBossName("0070BC")).toBe("Sartharion");
    expect(getBossName("FFFFFF")).toBeNull();
  });

  it("looks up raid instance by boss name", () => {
    expect(getRaidInstance("Patchwerk")).toBe("Naxxramas");
    expect(getRaidInstance("Sartharion")).toBe("Obsidian Sanctum");
    expect(getRaidInstance("Malygos")).toBe("Eye of Eternity");
    expect(getRaidInstance("The Lich King")).toBe("Icecrown Citadel");
    expect(getRaidInstance("Unknown Boss")).toBeNull();
  });

  it("returns per-boss idle thresholds", () => {
    expect(getBossIdleThreshold("The Lich King")).toBe(120000);
    expect(getBossIdleThreshold("Mimiron")).toBe(60000);
    expect(getBossIdleThreshold("Patchwerk")).toBe(BOSS_DEFAULT_IDLE_MS);
  });

  it("identifies multi-boss encounter NPCs", () => {
    expect(isMultiBoss("009452")).toBe(true); // Blood Prince Valanar
    expect(isMultiBoss("003E9C")).toBe(false); // Patchwerk
  });

  it("maps multi-boss NPCs to encounter name", () => {
    expect(getMultiBossName("009452")).toBe("Blood Prince Council");
    expect(getMultiBossName("009454")).toBe("Blood Prince Council");
    expect(getMultiBossName("009455")).toBe("Blood Prince Council");
  });

  it("gets all NPC IDs for a multi-boss encounter", () => {
    const ids = getMultiBossNpcIds("Blood Prince Council");
    expect(ids).toContain("009452");
    expect(ids).toContain("009454");
    expect(ids).toContain("009455");
    expect(ids.length).toBe(3);
  });

  it("identifies coward bosses", () => {
    expect(isCowardBoss("Kologarn")).toBe(true);
    expect(isCowardBoss("Hodir")).toBe(true);
    expect(isCowardBoss("Patchwerk")).toBe(false);
  });
});
