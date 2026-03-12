import type { WowClass, WowSpec } from "../types.js";
import { SPELL_TO_SPEC } from "../data/spell-book.js";

export function detectSpec(spellId: string, playerClass: WowClass): WowSpec | null {
  const spec = SPELL_TO_SPEC.get(spellId) ?? null;
  if (spec === null) return null;
  if (!spec.startsWith(playerClass)) return null;
  return spec;
}
