import type { WowClass } from "../types.js";
import { SPELL_TO_CLASS } from "../data/spell-book.js";

export function detectClass(spellId: string): WowClass | null {
  return SPELL_TO_CLASS.get(spellId) ?? null;
}
