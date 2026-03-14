// src/state/combat-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import type { PlayerCombatStats } from "../types.js";
import { isPlayer, isPet } from "../utils/guid.js";
import { getSpellId } from "../pipeline/line-parser.js";

/** Damage event types we track. */
const DAMAGE_EVENTS = new Set([
  "SWING_DAMAGE",
  "SPELL_DAMAGE",
  "SPELL_PERIODIC_DAMAGE",
  "RANGE_DAMAGE",
  "DAMAGE_SHIELD",
]);

/** Healing event types we track. */
const HEAL_EVENTS = new Set([
  "SPELL_HEAL",
  "SPELL_PERIODIC_HEAL",
]);

/**
 * Check if unit flags indicate a friendly reaction (bit 0x0010).
 * Used to exclude damage to MC'd NPCs (e.g., Death Knight Understudies on Razuvious).
 */
function isFriendly(flags: string): boolean {
  const n = parseInt(flags, 16);
  return !isNaN(n) && (n & 0x0010) !== 0;
}

/**
 * Spells that indicate a pet↔owner relationship. When we see one of these
 * with a player source and pet dest (or vice versa), we map the pet to the
 * player. Covers pets already summoned before the log started.
 *
 * Sourced from uwu-logs PET_FILTER_SPELLS list — covers Hunter, Warlock, DK,
 * and pet→owner auras.
 */
const PET_FILTER_SPELLS = new Set([
  // Well Fed pet buffs
  43771, 65247,
  // DK → pet
  48743,  // Death Pact
  51328,  // Corpse Explosion
  63560,  // Ghoul Frenzy
  // Warlock → pet
  25228,  // Soul Link
  23720,  // Blessing of the Black Book
  32553,  // Life Tap (energize)
  32554,  // Mana Feed - Drain Mana
  32752,  // Summoning Disorientation
  54181,  // Fel Synergy
  54607,  // Soul Leech Mana
  59092,  // Dark Pact
  70840,  // Devious Minds
  // Health Funnel (all ranks)
  755, 3698, 3699, 3700, 11693, 11694, 11695, 27259, 47856, 16569, 40671, 60829,
  // Pet → warlock auras
  35696,  // Demonic Knowledge
  47283,  // Empowered Imp
  // Sacrifice (all ranks)
  7812, 19438, 19440, 19441, 19442, 19443, 27273, 47985, 47986,
  // Master Demonologist (all pet types)
  23759, 23826, 23827, 23828, 23829, // Imp
  23760, 23841, 23842, 23843, 23844, // Voidwalker
  23761, 23833, 23834, 23835, 23836, // Succubus
  23762, 23837, 23838, 23839, 23840, // Felhunter
  35702, 35703, 35704, 35705, 35706, // Felguard
  // Hunter → pet
  1002,   // Eyes of the Beast
  1539,   // Feed Pet
  19574,  // Bestial Wrath
  19577,  // Intimidation
  34952,  // Go for the Throat R1
  34953,  // Go for the Throat R2
  61669,  // Aspect of the Beast
  68130,  // Greatness (4T9)
  70728,  // Exploit Weakness
  // Mend Pet (all ranks)
  136, 3111, 3661, 3662, 13542, 13543, 13544, 27046, 48989, 48990, 33976,
  // Pet → hunter auras
  53434,  // Call of the Wild
  57475,  // Kindred Spirits
  53412,  // Invigoration
  53517,  // Roar of Recovery
  70893,  // Culling the Herd
  19579,  // Spirit Bond R1
  24529,  // Spirit Bond R2
  // Furious Howl (all ranks)
  24604, 64491, 64492, 64493, 64494, 64495,
]);

/**
 * Known absorb shield spell IDs (all ranks).
 * When these auras are applied/removed, we track the caster so absorbed
 * damage can be attributed as healing.
 */
const ABSORB_SHIELD_SPELLS = new Set([
  // Power Word: Shield (all ranks)
  17, 592, 600, 3747, 6065, 6066, 10898, 10901, 25217, 25218, 48065, 48066,
  // Divine Aegis
  47753,
  // Sacred Shield proc
  58597,
  // Val'anyr proc
  64413,
]);

/** Miss event types that can carry ABSORB as missType. */
const MISS_EVENTS = new Set([
  "SWING_MISSED",
  "SPELL_MISSED",
  "RANGE_MISSED",
  "DAMAGE_SHIELD_MISSED",
]);

/** Tracks a single shield aura on a target. */
interface ShieldEntry {
  casterGuid: string;
  removedAt: number | null;  // ms timestamp when AURA_REMOVED fired, null if active
  appliedAt: number;         // ms timestamp of most recent APPLIED/REFRESH/DOSE
}

/** Per-encounter combat stats keyed by player GUID. */
export type EncounterCombatStats = Record<string, PlayerCombatStats>;

/**
 * Extract a numeric field from a comma-separated rawFields string by index.
 * Counts commas to find the Nth field without splitting.
 * Returns 0 if field is missing, empty, or "nil".
 */
function extractFieldInt(rawFields: string, index: number): number {
  let start = 0;
  for (let i = 0; i < index; i++) {
    const comma = rawFields.indexOf(",", start);
    if (comma === -1) return 0;
    start = comma + 1;
  }
  const end = rawFields.indexOf(",", start);
  const field = end === -1 ? rawFields.substring(start) : rawFields.substring(start, end);
  if (field === "" || field === "nil") return 0;
  const n = parseInt(field, 10);
  return isNaN(n) ? 0 : n;
}

export class CombatTracker {
  /** Pet GUID → owner (player) GUID. Persists across encounters. */
  private _petOwners = new Map<string, string>();
  /**
   * Active absorb shields keyed by "destGuid|spellId" → ShieldEntry.
   * Multiple shields can be active on the same target simultaneously
   * (e.g., PW:S + Divine Aegis + Sacred Shield from different casters).
   */
  private _activeShields = new Map<string, ShieldEntry>();
  private _inEncounter = false;
  private _currentEncounter = new Map<string, PlayerCombatStats>();
  private _completedEncounters: EncounterCombatStats[] = [];

  processEvent(event: LogEvent): void {
    // Track pet ownership from SPELL_SUMMON
    if (event.eventType === "SPELL_SUMMON" && isPlayer(event.sourceGuid)) {
      this._petOwners.set(event.destGuid, event.sourceGuid);
      return;
    }

    // Track pet ownership from pet↔owner interaction spells.
    // Matches uwu-logs PET_FILTER_SPELLS approach: any spell from the list
    // involving a player and a pet establishes ownership.
    {
      const spellIdStr = getSpellId(event);
      if (spellIdStr !== null) {
        const spellId = parseInt(spellIdStr, 10);
        if (!isNaN(spellId) && PET_FILTER_SPELLS.has(spellId)) {
          if (isPlayer(event.sourceGuid) && isPet(event.destGuid)) {
            // Player → pet: player owns pet
            this._petOwners.set(event.destGuid, event.sourceGuid);
          } else if (isPet(event.sourceGuid) && isPlayer(event.destGuid)) {
            // Pet → player: pet belongs to player
            this._petOwners.set(event.sourceGuid, event.destGuid);
          }
        }

        // Track absorb shield auras (must persist across encounters).
        // Key by "destGuid|spellId" so multiple shields on the same target
        // are tracked independently.
        //
        // We track APPLIED, REFRESH, APPLIED_DOSE, and REMOVED events.
        // REMOVED marks the shield with a timestamp so the grace window in
        // _findShieldCasters can handle WoW 3.3.5's ordering where
        // SPELL_AURA_REMOVED fires at the same ms as the consuming damage.
        if (!isNaN(spellId) && ABSORB_SHIELD_SPELLS.has(spellId)) {
          const shieldKey = event.destGuid + "|" + spellId;
          const et = event.eventType;
          if (
            et === "SPELL_AURA_APPLIED" ||
            et === "SPELL_AURA_REFRESH" ||
            et === "SPELL_AURA_APPLIED_DOSE"
          ) {
            this._activeShields.set(shieldKey, {
              casterGuid: event.sourceGuid,
              removedAt: null,
              appliedAt: event.timestamp,
            });
          } else if (et === "SPELL_AURA_REMOVED") {
            const existing = this._activeShields.get(shieldKey);
            if (existing) {
              existing.removedAt = event.timestamp;
            }
          }
        }
      }
    }

    if (!this._inEncounter) return;

    const eventType = event.eventType;

    // Handle damage events
    if (DAMAGE_EVENTS.has(eventType)) {
      const isSwing = eventType === "SWING_DAMAGE";

      // Extract partial absorbed amount before friendly fire exclusion.
      // Absorbed damage is healing credited to the shield caster, regardless
      // of whether the direct damage is excluded (e.g., dest is a player).
      const absorbedFieldIndex = isSwing ? 5 : 8;
      const absorbedAmount = extractFieldInt(event.rawFields, absorbedFieldIndex);
      if (absorbedAmount > 0) {
        this._creditAbsorb(event.destGuid, absorbedAmount, event.timestamp);
      }

      // Exclude friendly fire: skip if dest is a player or dest is friendly
      if (isPlayer(event.destGuid)) return;
      if (isFriendly(event.destFlags)) return;

      // Resolve source through pet map
      const sourceGuid = this._petOwners.get(event.sourceGuid) ?? event.sourceGuid;

      // Only count if resolved source is a player
      if (!isPlayer(sourceGuid)) return;

      // Extract amount and overkill
      const amount = extractFieldInt(event.rawFields, isSwing ? 0 : 3);
      const overkill = extractFieldInt(event.rawFields, isSwing ? 1 : 4);

      const useful = amount - Math.max(0, overkill);
      if (useful <= 0) return;

      this._accumulate(sourceGuid, useful, 0);
      return;
    }

    // Handle healing events
    if (HEAL_EVENTS.has(eventType)) {
      // Resolve source through pet map
      const sourceGuid = this._petOwners.get(event.sourceGuid) ?? event.sourceGuid;
      if (!isPlayer(sourceGuid)) return;

      const amount = extractFieldInt(event.rawFields, 3);
      const overheal = extractFieldInt(event.rawFields, 4);

      const effective = amount - overheal;
      if (effective <= 0) return;

      this._accumulate(sourceGuid, 0, effective);
      return;
    }

    // Handle full absorbs from miss events (SWING_MISSED, SPELL_MISSED, RANGE_MISSED)
    if (MISS_EVENTS.has(eventType)) {
      const rawFields = event.rawFields;
      // Check for "ABSORB," in rawFields — full absorb miss type
      const absorbIdx = rawFields.indexOf("ABSORB,");
      if (absorbIdx === -1) return;

      // Extract absorbed amount from after "ABSORB,"
      const amountStr = rawFields.substring(absorbIdx + 7);
      const absorbedAmount = parseInt(amountStr, 10);
      if (isNaN(absorbedAmount) || absorbedAmount <= 0) return;

      // Credit absorb to shield caster(s)
      this._creditAbsorb(event.destGuid, absorbedAmount, event.timestamp);
    }
  }

  onEncounterStart(): void {
    this._inEncounter = true;
    this._currentEncounter.clear();
  }

  onEncounterEnd(): EncounterCombatStats {
    this._inEncounter = false;
    const result: EncounterCombatStats = {};
    for (const [guid, stats] of this._currentEncounter) {
      result[guid] = { ...stats };
    }
    this._completedEncounters.push(result);
    this._currentEncounter.clear();
    return result;
  }

  forceEnd(): EncounterCombatStats | null {
    if (!this._inEncounter) return null;
    return this.onEncounterEnd();
  }

  getPlayerSummaries(): Map<string, PlayerCombatStats> {
    const summaries = new Map<string, PlayerCombatStats>();
    for (const encounter of this._completedEncounters) {
      for (const [guid, stats] of Object.entries(encounter)) {
        const existing = summaries.get(guid);
        if (existing !== undefined) {
          existing.damage += stats.damage;
          existing.healing += stats.healing;
        } else {
          summaries.set(guid, { damage: stats.damage, healing: stats.healing });
        }
      }
    }
    return summaries;
  }

  /**
   * Find active shield casters for a given target at the specified timestamp.
   * Active = removedAt is null, or removedAt equals currentTimestamp (grace window
   * for WoW 3.3.5 where SPELL_AURA_REMOVED fires at same ms as consuming damage).
   */
  private _findShieldCasters(destGuid: string, currentTimestamp: number): string[] {
    const prefix = destGuid + "|";
    const casters: string[] = [];
    const seen = new Set<string>();
    for (const [key, entry] of this._activeShields) {
      if (!key.startsWith(prefix)) continue;
      // Skip shields removed before this timestamp
      if (entry.removedAt !== null && currentTimestamp > entry.removedAt) continue;
      if (!seen.has(entry.casterGuid)) {
        seen.add(entry.casterGuid);
        casters.push(entry.casterGuid);
      }
    }
    return casters;
  }

  /**
   * Credit absorbed damage as healing to the active shield caster(s) on
   * a given target. When multiple casters have shields on the same target,
   * the absorbed amount is split equally among them.
   *
   * If no active shields are found, falls back to the most recently applied
   * shield on the target (overflow fallback — matches uwu-logs behavior
   * where remaining absorb goes to the last known shield).
   */
  private _creditAbsorb(destGuid: string, absorbedAmount: number, currentTimestamp: number): void {
    const casters = this._findShieldCasters(destGuid, currentTimestamp);

    // Overflow fallback: if no active shields, find the most recently applied
    // shield on this target (regardless of removedAt or spell ID) and credit it.
    // This is cross-spell-ID and approximate — e.g., a late PW:S absorb might
    // be attributed to a more recently applied Sacred Shield caster. Acceptable
    // because WotLK 3.3.5 logs don't tell us which shield absorbed the hit.
    if (casters.length === 0) {
      const prefix = destGuid + "|";
      let bestEntry: ShieldEntry | null = null;
      for (const [key, entry] of this._activeShields) {
        if (!key.startsWith(prefix)) continue;
        if (bestEntry === null || entry.appliedAt > bestEntry.appliedAt) {
          bestEntry = entry;
        }
      }
      if (bestEntry !== null) {
        const resolvedCaster = this._petOwners.get(bestEntry.casterGuid) ?? bestEntry.casterGuid;
        if (isPlayer(resolvedCaster)) {
          this._accumulate(resolvedCaster, 0, absorbedAmount);
        }
      }
      return;
    }

    const share = Math.round(absorbedAmount / casters.length);
    for (const caster of casters) {
      const resolvedCaster = this._petOwners.get(caster) ?? caster;
      if (isPlayer(resolvedCaster) && share > 0) {
        this._accumulate(resolvedCaster, 0, share);
      }
    }
  }

  private _accumulate(playerGuid: string, damage: number, healing: number): void {
    const existing = this._currentEncounter.get(playerGuid);
    if (existing !== undefined) {
      existing.damage += damage;
      existing.healing += healing;
    } else {
      this._currentEncounter.set(playerGuid, { damage, healing });
    }
  }
}
