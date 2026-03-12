// src/state/encounter-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import type { EncounterSummary, RaidDifficulty } from "../types.js";
import { isNpc, isVehicle, getNpcId } from "../utils/guid.js";
import { epochToIso } from "../utils/timestamp.js";
import { getSpellId } from "../pipeline/line-parser.js";
import {
  getBossName,
  getBossIdleThreshold,
  isMultiBoss,
  getMultiBossName,
  getMultiBossNpcIds,
  isCowardBoss,
} from "../data/boss-data.js";
import { detectDifficulty } from "../detection/difficulty.js";

export interface EncounterProcessResult {
  encounterStarted: boolean;
  encounterEnded: boolean;
  encounter: EncounterSummary | null;
}

// Combat events that indicate an active boss fight
const COMBAT_EVENT_PREFIXES = [
  "SWING_",
  "RANGE_",
  "SPELL_",
  "DAMAGE_",
  "ENVIRONMENTAL_",
];

function isCombatEvent(eventType: string): boolean {
  if (eventType === "UNIT_DIED" || eventType === "PARTY_KILL") return true;
  for (const prefix of COMBAT_EVENT_PREFIXES) {
    if (eventType.startsWith(prefix)) return true;
  }
  return false;
}

/** Number of consecutive SPELL_AURA_REMOVED events to count as a coward boss kill. */
const COWARD_AURA_REMOVAL_THRESHOLD = 15;

export class EncounterTracker {
  // Active encounter state
  private _bossName: string | null = null;
  private _startTimestamp: number = 0;
  private _lastBossEventTimestamp: number = 0;
  private _idleThreshold: number = 0;
  private _bossNpcIds: Set<string> = new Set();
  private _bossKilled: boolean = false;
  private _difficulty: RaidDifficulty | null = null;
  private _isMultiBoss: boolean = false;
  private _isCoward: boolean = false;
  private _consecutiveAuraRemovals: number = 0;
  private _cowardKillDetected: boolean = false;

  isInEncounter(): boolean {
    return this._bossName !== null;
  }

  getCurrentBossName(): string | null {
    return this._bossName;
  }

  processEvent(event: LogEvent): EncounterProcessResult {
    const result: EncounterProcessResult = {
      encounterStarted: false,
      encounterEnded: false,
      encounter: null,
    };

    if (!isCombatEvent(event.eventType)) return result;

    // Check source and dest GUIDs for boss NPC IDs
    const sourceNpcId = this._extractBossNpcId(event.sourceGuid);
    const destNpcId = this._extractBossNpcId(event.destGuid);
    const bossNpcId = sourceNpcId ?? destNpcId;

    // If we're in an encounter, check for idle timeout first
    if (this._bossName !== null) {
      if (
        event.timestamp - this._lastBossEventTimestamp >
        this._idleThreshold
      ) {
        // Idle timeout → wipe
        const encounter = this._buildEncounter(this._lastBossEventTimestamp);
        this._reset();
        result.encounterEnded = true;
        result.encounter = encounter;

        // After ending, check if this event starts a new encounter
        return this._maybeStartNewEncounter(event, bossNpcId, result);
      }

      // Check if this event involves one of the tracked boss NPCs
      const involvesBoss =
        (sourceNpcId !== null && this._bossNpcIds.has(sourceNpcId)) ||
        (destNpcId !== null && this._bossNpcIds.has(destNpcId));

      if (involvesBoss) {
        this._lastBossEventTimestamp = event.timestamp;

        // Kill detection: UNIT_DIED or PARTY_KILL targeting the boss
        if (
          (event.eventType === "UNIT_DIED" || event.eventType === "PARTY_KILL") &&
          destNpcId !== null &&
          this._bossNpcIds.has(destNpcId)
        ) {
          this._bossKilled = true;

          // For multi-boss, remove this NPC; encounter ends when all are dead
          if (this._isMultiBoss) {
            this._bossNpcIds.delete(destNpcId);
            if (this._bossNpcIds.size > 0) {
              // Still more bosses alive
              return result;
            }
          }

          // Boss killed → end encounter
          const encounter = this._buildEncounter(event.timestamp);
          this._reset();
          result.encounterEnded = true;
          result.encounter = encounter;
          return result;
        }

        // Coward boss detection: consecutive SPELL_AURA_REMOVED events
        if (this._isCoward) {
          if (event.eventType === "SPELL_AURA_REMOVED") {
            this._consecutiveAuraRemovals++;
            if (
              this._consecutiveAuraRemovals >= COWARD_AURA_REMOVAL_THRESHOLD
            ) {
              this._cowardKillDetected = true;
              this._bossKilled = true;
              const encounter = this._buildEncounter(event.timestamp);
              this._reset();
              result.encounterEnded = true;
              result.encounter = encounter;
              return result;
            }
          } else {
            this._consecutiveAuraRemovals = 0;
          }
        }
      }

      // Difficulty detection during encounter
      this._detectDifficulty(event);

      return result;
    }

    // Not in an encounter — check if this event starts one
    return this._maybeStartNewEncounter(event, bossNpcId, result);
  }

  /**
   * Force-end the current encounter (e.g., at end of log file).
   * Returns the encounter summary or null if no active encounter.
   */
  forceEnd(lastTimestamp: number): EncounterSummary | null {
    if (this._bossName === null) return null;
    const encounter = this._buildEncounter(lastTimestamp);
    this._reset();
    return encounter;
  }

  // --- Private helpers ---

  private _extractBossNpcId(guid: string): string | null {
    if (!isNpc(guid) && !isVehicle(guid)) return null;
    const npcId = getNpcId(guid);
    const bossName = getBossName(npcId);
    if (bossName === null) return null;
    return npcId;
  }

  private _maybeStartNewEncounter(
    event: LogEvent,
    bossNpcId: string | null,
    result: EncounterProcessResult,
  ): EncounterProcessResult {
    if (bossNpcId === null) return result;

    // Start a new encounter
    if (isMultiBoss(bossNpcId)) {
      const encounterName = getMultiBossName(bossNpcId)!;
      this._bossName = encounterName;
      this._isMultiBoss = true;
      this._bossNpcIds = new Set(getMultiBossNpcIds(encounterName));
      this._idleThreshold = getBossIdleThreshold(encounterName);
    } else {
      const bossName = getBossName(bossNpcId)!;
      this._bossName = bossName;
      this._isMultiBoss = false;
      this._bossNpcIds = new Set([bossNpcId]);
      this._idleThreshold = getBossIdleThreshold(bossName);
    }

    this._startTimestamp = event.timestamp;
    this._lastBossEventTimestamp = event.timestamp;
    this._bossKilled = false;
    this._difficulty = null;
    this._isCoward = isCowardBoss(this._bossName);
    this._consecutiveAuraRemovals = 0;
    this._cowardKillDetected = false;

    // Try detecting difficulty from the first event
    this._detectDifficulty(event);

    result.encounterStarted = true;
    return result;
  }

  private _detectDifficulty(event: LogEvent): void {
    if (this._difficulty !== null || this._bossName === null) return;
    const spellId = getSpellId(event);
    if (spellId === null) return;
    const diff = detectDifficulty(this._bossName, spellId);
    if (diff !== null) {
      this._difficulty = diff;
    }
  }

  private _buildEncounter(endTimestamp: number): EncounterSummary {
    const durationMs = endTimestamp - this._startTimestamp;
    return {
      bossName: this._bossName!,
      startTime: epochToIso(this._startTimestamp),
      endTime: epochToIso(endTimestamp),
      duration: Math.round(durationMs / 1000),
      result: this._bossKilled ? "kill" : "wipe",
      difficulty: this._difficulty,
    };
  }

  private _reset(): void {
    this._bossName = null;
    this._startTimestamp = 0;
    this._lastBossEventTimestamp = 0;
    this._idleThreshold = 0;
    this._bossNpcIds.clear();
    this._bossKilled = false;
    this._difficulty = null;
    this._isMultiBoss = false;
    this._isCoward = false;
    this._consecutiveAuraRemovals = 0;
    this._cowardKillDetected = false;
  }
}
