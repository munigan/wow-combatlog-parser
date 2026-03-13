// src/state/combat-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import type { PlayerCombatStats } from "../types.js";
import { isPlayer } from "../utils/guid.js";

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
  private _currentEncounter = new Map<string, PlayerCombatStats>();
  private _completedEncounters: EncounterCombatStats[] = [];

  processEvent(event: LogEvent): void {
    // Track pet ownership from SPELL_SUMMON
    if (event.eventType === "SPELL_SUMMON" && isPlayer(event.sourceGuid)) {
      this._petOwners.set(event.destGuid, event.sourceGuid);
      return;
    }

    if (!this._inEncounter) return;

    const eventType = event.eventType;

    // Handle damage events
    if (DAMAGE_EVENTS.has(eventType)) {
      // Exclude friendly fire: skip if dest is a player
      if (isPlayer(event.destGuid)) return;

      // Resolve source through pet map
      const sourceGuid = this._petOwners.get(event.sourceGuid) ?? event.sourceGuid;

      // Only count if resolved source is a player
      if (!isPlayer(sourceGuid)) return;

      // Extract amount and overkill
      const isSwing = eventType === "SWING_DAMAGE";
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
