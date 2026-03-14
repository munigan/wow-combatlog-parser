// src/data/buff-data.ts

import type { BuffCategory } from "../types.js";

export interface BuffInfo {
  spellId: number;
  displayName: string;
  category: BuffCategory;
}

const BUFF_LIST: BuffInfo[] = [
  // ─── Flasks ─────────────────────────────────────────────────────────
  { spellId: 53758, displayName: "Flask of Stoneblood", category: "flask" },
  { spellId: 53755, displayName: "Flask of the Frost Wyrm", category: "flask" },
  { spellId: 53760, displayName: "Flask of Endless Rage", category: "flask" },
  { spellId: 54212, displayName: "Flask of Pure Mojo", category: "flask" },
  { spellId: 62380, displayName: "Lesser Flask of Resistance", category: "flask" },

  // ─── Battle Elixirs ─────────────────────────────────────────────────
  { spellId: 53748, displayName: "Elixir of Mighty Strength", category: "battle_elixir" },
  { spellId: 60340, displayName: "Elixir of Accuracy", category: "battle_elixir" },
  { spellId: 60344, displayName: "Elixir of Expertise", category: "battle_elixir" },
  { spellId: 60341, displayName: "Elixir of Deadly Strikes", category: "battle_elixir" },
  { spellId: 60346, displayName: "Elixir of Lightning Speed", category: "battle_elixir" },
  { spellId: 53749, displayName: "Guru's Elixir", category: "battle_elixir" },
  { spellId: 53746, displayName: "Wrath Elixir", category: "battle_elixir" },
  { spellId: 28497, displayName: "Elixir of Mighty Agility", category: "battle_elixir" },
  { spellId: 53764, displayName: "Elixir of Mighty Mageblood", category: "battle_elixir" },
  { spellId: 60345, displayName: "Elixir of Armor Piercing", category: "battle_elixir" },
  { spellId: 53747, displayName: "Elixir of Spirit", category: "battle_elixir" },

  // ─── Guardian Elixirs ───────────────────────────────────────────────
  { spellId: 60343, displayName: "Elixir of Defense", category: "guardian_elixir" },
  { spellId: 53751, displayName: "Elixir of Mighty Fortitude", category: "guardian_elixir" },
  { spellId: 53763, displayName: "Elixir of Protection", category: "guardian_elixir" },
  { spellId: 53752, displayName: "Elixir of Mighty Thoughts", category: "guardian_elixir" },
  { spellId: 60347, displayName: "Elixir of Mighty Defense", category: "guardian_elixir" },

  // ─── Food Buffs ─────────────────────────────────────────────────────
  { spellId: 57399, displayName: "Well Fed (Fish Feast)", category: "food" },
  { spellId: 57294, displayName: "Well Fed (generic)", category: "food" },
  { spellId: 57111, displayName: "Well Fed (Snapper Extreme)", category: "food" },
  { spellId: 57325, displayName: "Well Fed (Firecracker Salmon)", category: "food" },
  { spellId: 57327, displayName: "Well Fed (Tender Shoveltusk Steak)", category: "food" },
  { spellId: 57329, displayName: "Well Fed (Imperial Manta Steak)", category: "food" },
  { spellId: 57332, displayName: "Well Fed (Mega Mammoth Meal)", category: "food" },
  { spellId: 57334, displayName: "Well Fed (Poached Northern Sculpin)", category: "food" },
  { spellId: 57356, displayName: "Well Fed (Spiced Worm Burger)", category: "food" },
  { spellId: 57358, displayName: "Well Fed (Very Burnt Worg)", category: "food" },
  { spellId: 57360, displayName: "Well Fed (Rhinolicious Wormsteak)", category: "food" },
  { spellId: 57365, displayName: "Well Fed (Blackened Dragonfin)", category: "food" },
  { spellId: 57367, displayName: "Well Fed (Cuttlesteak)", category: "food" },
  { spellId: 57371, displayName: "Well Fed (Dragonfin Filet)", category: "food" },
  { spellId: 57373, displayName: "Well Fed (Great Feast)", category: "food" },
];

/** Map from spell ID (string, matches getSpellId() return) to buff info. */
export const BUFF_SPELLS: Map<string, BuffInfo> = new Map(
  BUFF_LIST.map((b) => [String(b.spellId), b]),
);

/** Set of flask + elixir spell IDs for quick category check. */
export const FLASK_ELIXIR_SPELL_IDS: Set<string> = new Set(
  BUFF_LIST.filter((b) => b.category !== "food").map((b) => String(b.spellId)),
);

/** Set of food buff spell IDs for quick category check. */
export const FOOD_SPELL_IDS: Set<string> = new Set(
  BUFF_LIST.filter((b) => b.category === "food").map((b) => String(b.spellId)),
);
