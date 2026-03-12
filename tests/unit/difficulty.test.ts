import { describe, it, expect } from "vitest";
import {
  detectDifficulty,
  detectDifficultyByPlayerCount,
} from "../../src/detection/difficulty.js";

describe("detectDifficulty", () => {
  it("detects 10N from Lich King Infest", () =>
    expect(detectDifficulty("The Lich King", "70541")).toBe("10N"));
  it("detects 25H from Lich King Infest", () =>
    expect(detectDifficulty("The Lich King", "73781")).toBe("25H"));
  it("returns null for unknown spell", () =>
    expect(detectDifficulty("The Lich King", "999999")).toBeNull());
  it("returns null for unknown boss", () =>
    expect(detectDifficulty("Unknown Boss", "70541")).toBeNull());
});

describe("detectDifficultyByPlayerCount", () => {
  it("returns 25N for > 10 players", () =>
    expect(detectDifficultyByPlayerCount(25)).toBe("25N"));
  it("returns 10N for <= 10 players", () =>
    expect(detectDifficultyByPlayerCount(10)).toBe("10N"));
  it("returns 10N for exactly 10", () =>
    expect(detectDifficultyByPlayerCount(10)).toBe("10N"));
  it("returns 25N for 11", () =>
    expect(detectDifficultyByPlayerCount(11)).toBe("25N"));
});
