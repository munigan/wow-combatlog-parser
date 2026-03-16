// src/state/combat-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import type { PlayerCombatStats } from "../types.js";
import { isPlayer, isPet, getNpcId } from "../utils/guid.js";
import { getSpellId } from "../pipeline/line-parser.js";
import { getEncounterValidNpcs } from "../data/encounter-npcs.js";

/** Damage event types we track. */
const DAMAGE_EVENTS = new Set([
  "SWING_DAMAGE",
  "SPELL_DAMAGE",
  "SPELL_PERIODIC_DAMAGE",
  "RANGE_DAMAGE",
  "DAMAGE_SHIELD",
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
  private _inEncounter = false;
  /** Valid NPC IDs for current encounter. Null = count all damage (fallback). */
  private _validNpcs: Set<string> | null = null;
  private _currentEncounter = new Map<string, PlayerCombatStats>();
  private _currentDamageTaken = new Map<string, number>();
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
      }
    }

    if (!this._inEncounter) return;

    const eventType = event.eventType;

    // Handle damage events
    if (DAMAGE_EVENTS.has(eventType)) {
      const isSwing = eventType === "SWING_DAMAGE";

      if (isPlayer(event.destGuid)) {
        // Damage TO a player → damage taken (raw amount, no overkill subtraction)
        const amount = extractFieldInt(event.rawFields, isSwing ? 0 : 3);
        if (amount > 0) {
          const existing = this._currentDamageTaken.get(event.destGuid) ?? 0;
          this._currentDamageTaken.set(event.destGuid, existing + amount);
        }
        return; // Still skip damage-done for player targets (friendly fire exclusion)
      }

      // Damage-done tracking (existing logic, unchanged)
      if (isFriendly(event.destFlags)) return;

      // If encounter has a valid NPC whitelist, only count damage to those NPCs.
      // This prevents damage to trash pulled from other rooms from inflating DPS.
      if (this._validNpcs !== null) {
        const destNpcId = getNpcId(event.destGuid);
        if (!this._validNpcs.has(destNpcId)) return;
      }

      // Resolve source through pet map
      const sourceGuid = this._petOwners.get(event.sourceGuid) ?? event.sourceGuid;

      // Only count if resolved source is a player
      if (!isPlayer(sourceGuid)) return;

      // Extract amount and overkill
      const amount = extractFieldInt(event.rawFields, isSwing ? 0 : 3);
      const overkill = extractFieldInt(event.rawFields, isSwing ? 1 : 4);

      const useful = amount - Math.max(0, overkill);
      if (useful <= 0) return;

      this._accumulate(sourceGuid, useful);
    }
  }

  onEncounterStart(bossName: string | null): void {
    this._inEncounter = true;
    this._validNpcs = bossName !== null ? getEncounterValidNpcs(bossName) : null;
    this._currentEncounter.clear();
    this._currentDamageTaken.clear();
  }

  onEncounterEnd(): EncounterCombatStats {
    this._inEncounter = false;
    const result: EncounterCombatStats = {};

    // Collect all player GUIDs from both damage done and damage taken
    const allGuids = new Set<string>();
    for (const guid of this._currentEncounter.keys()) allGuids.add(guid);
    for (const guid of this._currentDamageTaken.keys()) allGuids.add(guid);

    for (const guid of allGuids) {
      const damageDone = this._currentEncounter.get(guid)?.damage ?? 0;
      const damageTaken = this._currentDamageTaken.get(guid) ?? 0;
      result[guid] = { damage: damageDone, damageTaken };
    }

    this._completedEncounters.push(result);
    this._currentEncounter.clear();
    this._currentDamageTaken.clear();
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
          existing.damageTaken += stats.damageTaken;
        } else {
          summaries.set(guid, { damage: stats.damage, damageTaken: stats.damageTaken });
        }
      }
    }
    return summaries;
  }

  private _accumulate(playerGuid: string, damage: number): void {
    const existing = this._currentEncounter.get(playerGuid);
    if (existing !== undefined) {
      existing.damage += damage;
    } else {
      this._currentEncounter.set(playerGuid, { damage, damageTaken: 0 });
    }
  }
}
