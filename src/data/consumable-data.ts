// src/data/consumable-data.ts

/**
 * Consumable types tracked during encounters.
 * Excludes flasks and food (per design).
 */
export type ConsumableType = "potion" | "mana_potion" | "flame_cap" | "engineering";

export interface ConsumableInfo {
  spellId: number;
  /** Display name for output (overrides log spell name for clarity). */
  displayName: string;
  type: ConsumableType;
  /**
   * Whether this consumable applies a buff aura and can be pre-potted.
   * Pre-pot detection uses SPELL_AURA_APPLIED/REMOVED tracking.
   */
  hasBuff: boolean;
}

/**
 * Maps spell ID (as string, matching getSpellId() return) to consumable info.
 *
 * WotLK 3.3.5 consumables — potions, flame cap, engineering bombs.
 * Spell names in logs are often abbreviated (e.g., "Speed" for Potion of Speed).
 */
const CONSUMABLE_LIST: ConsumableInfo[] = [
  // ─── Buff Potions (shared 1-min cooldown, pre-pottable) ─────────────
  { spellId: 53908, displayName: "Potion of Speed", type: "potion", hasBuff: true },
  { spellId: 53909, displayName: "Potion of Wild Magic", type: "potion", hasBuff: true },
  { spellId: 53762, displayName: "Indestructible Potion", type: "potion", hasBuff: true },
  // Insane Strength: logs may use 28494 (buff) and/or 28550 (item trigger / cast line).
  { spellId: 28494, displayName: "Insane Strength Potion", type: "potion", hasBuff: true },
  { spellId: 28550, displayName: "Insane Strength Potion", type: "potion", hasBuff: true },
  { spellId: 28507, displayName: "Haste Potion", type: "potion", hasBuff: true },
  { spellId: 53753, displayName: "Potion of Nightmares", type: "potion", hasBuff: true },

  // ─── Flame Cap (WotLK quirk: SPELL_CAST_SUCCESS has nil source) ─────
  { spellId: 28714, displayName: "Flame Cap", type: "flame_cap", hasBuff: true },

  // ─── Mana/Healing Potions (no pre-pot, no buff aura) ────────────────
  { spellId: 43186, displayName: "Runic Mana Potion", type: "mana_potion", hasBuff: false },
  { spellId: 67490, displayName: "Runic Mana Injector", type: "mana_potion", hasBuff: false },
  { spellId: 33448, displayName: "Runic Healing Potion", type: "mana_potion", hasBuff: false },
  { spellId: 67489, displayName: "Runic Healing Injector", type: "mana_potion", hasBuff: false },

  // ─── Engineering Bombs (no pre-pot) ─────────────────────────────────
  { spellId: 56488, displayName: "Global Thermal Sapper Charge", type: "engineering", hasBuff: false },
  { spellId: 56350, displayName: "Saronite Bomb", type: "engineering", hasBuff: false },
  { spellId: 67890, displayName: "Cobalt Frag Bomb", type: "engineering", hasBuff: false },
];

/** Spell ID → ConsumableInfo lookup. */
export const CONSUMABLE_SPELLS = new Map<string, ConsumableInfo>(
  CONSUMABLE_LIST.map((c) => [String(c.spellId), c]),
);

/** Set of spell IDs that have trackable buff auras (for pre-pot detection). */
export const BUFF_CONSUMABLE_SPELL_IDS = new Set<string>(
  CONSUMABLE_LIST.filter((c) => c.hasBuff).map((c) => String(c.spellId)),
);

/** Flame Cap spell ID — needs special SPELL_AURA_APPLIED handling (nil source). */
export const FLAME_CAP_SPELL_ID = "28714";
