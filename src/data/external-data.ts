// src/data/external-data.ts

export interface ExternalSpellInfo {
  spellId: number;
  displayName: string;
}

/**
 * Curated list of WotLK external buff spells tracked for the Externals page.
 * Only cross-player applications (source != dest) are recorded.
 */
const EXTERNAL_SPELL_LIST: ExternalSpellInfo[] = [
  // Raid-wide cooldowns
  { spellId: 2825, displayName: "Bloodlust" },
  { spellId: 32182, displayName: "Heroism" },

  // DPS externals
  { spellId: 10060, displayName: "Power Infusion" },
  // Tricks of the Trade: 57934 is the cast/self-buff on the rogue.
  // 57933 is the actual buff aura applied to the recipient (cross-player).
  { spellId: 57933, displayName: "Tricks of the Trade" },
  { spellId: 49016, displayName: "Hysteria" },
  { spellId: 54646, displayName: "Focus Magic" },

  // Healer externals
  { spellId: 29166, displayName: "Innervate" },

  // Tank/utility externals
  // Note: Misdirection (34477/35079) excluded — both auras are on the caster (self), not the tank.
  { spellId: 1038, displayName: "Hand of Salvation" },
  { spellId: 1044, displayName: "Hand of Freedom" },

  // Defensive externals
  { spellId: 6940, displayName: "Hand of Sacrifice" },
  { spellId: 10278, displayName: "Hand of Protection" },
  { spellId: 33206, displayName: "Pain Suppression" },
  { spellId: 47788, displayName: "Guardian Spirit" },
  { spellId: 64205, displayName: "Divine Sacrifice" },
  { spellId: 70940, displayName: "Divine Guardian" },
  { spellId: 3411, displayName: "Intervene" },
];

/** Map of spellId (as string) → ExternalSpellInfo for O(1) lookup. */
export const EXTERNAL_SPELLS = new Map<string, ExternalSpellInfo>(
  EXTERNAL_SPELL_LIST.map((s) => [String(s.spellId), s]),
);
