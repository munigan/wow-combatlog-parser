import type { RaidDifficulty } from "../types.js";
import { DIFFICULTY_SPELLS } from "../data/difficulty-spells.js";

const DIFFICULTY_INDEX: RaidDifficulty[] = ["10N", "10H", "25N", "25H"];

export function detectDifficulty(
  bossName: string,
  spellId: string,
): RaidDifficulty | null {
  const spells = DIFFICULTY_SPELLS.get(bossName);
  if (!spells) return null;
  const idx = spells.indexOf(spellId);
  if (idx === -1) return null;
  return DIFFICULTY_INDEX[idx];
}

export function detectDifficultyByPlayerCount(
  playerCount: number,
): RaidDifficulty {
  return playerCount > 10 ? "25N" : "10N";
}
