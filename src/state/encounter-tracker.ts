// src/state/encounter-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import type { EncounterSummary, RaidDifficulty } from "../types.js";
import { isNpc, isVehicle, isPlayer, getNpcId } from "../utils/guid.js";
import { epochToIso } from "../utils/timestamp.js";
import { getSpellId, isBuffAura } from "../pipeline/line-parser.js";
import {
  getBossName,
  getBossIdleThreshold,
  isMultiBoss,
  getMultiBossName,
  getMultiBossNpcIds,
  isCowardBoss,
  getEncounterKillNpcIds,
} from "../data/boss-data.js";
import { detectDifficulty } from "../detection/difficulty.js";

export interface EncounterProcessResult {
  encounterStarted: boolean;
  encounterEnded: boolean;
  encounter: EncounterSummary | null;
  /** Player GUIDs that participated in the ended encounter (only set when encounterEnded=true). */
  participants: Set<string> | null;
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

/**
 * After a boss kill, suppress new encounters for the same boss within this
 * window (ms). Prevents phantom encounters from lingering DoT ticks and
 * aura removals that still reference the dead boss GUID.
 */
const POST_KILL_COOLDOWN_MS = 30_000;

/**
 * Event types that should NEVER trigger a new encounter start, regardless of
 * aura type or spell ID.
 *
 * - Aura removal events: Lingering buffs/debuffs after a boss kill.
 * - Cast events: Pre-pull abilities like Hunter's Mark target the boss NPC via
 *   SPELL_CAST_SUCCESS seconds before the actual pull.
 * - Dose events: Aura stack changes, not meaningful combat starts.
 *
 * Note: SPELL_AURA_APPLIED is handled separately — DEBUFF auras CAN start
 * encounters (e.g., Faerie Fire landing on boss), but BUFF auras cannot.
 * This matches uwu-logs' `get_more_precise_start()` behavior.
 */
const NEVER_START_ENCOUNTER_EVENTS = new Set([
  "SPELL_AURA_REMOVED",
  "SPELL_AURA_REFRESH",
  "SPELL_AURA_REMOVED_DOSE",
  "SPELL_AURA_APPLIED_DOSE",
  "SPELL_CAST_SUCCESS",
  "SPELL_CAST_START",
  // Missed/immune hits don't count as engagement. Yogg-Saron in particular is
  // IMMUNE during early phases — blocking these prevents phantom
  // "encounter started" / idle-timeout-wipe cycles while the raid hits adds.
  "SPELL_MISSED",
  "SWING_MISSED",
  "RANGE_MISSED",
  "DAMAGE_SHIELD_MISSED",
]);

/**
 * Aura-applied event types that need BUFF/DEBUFF discrimination.
 * BUFF auras should not start encounters; DEBUFF auras can.
 */
const AURA_APPLIED_EVENTS = new Set([
  "SPELL_AURA_APPLIED",
]);

/**
 * Spell IDs that should never trigger encounter start detection.
 * These are non-combat abilities that players use before pulls.
 * Matches uwu-logs' IGNORED_SPELL_IDS.
 *
 * - Hunter's Mark (all ranks): ranged marking, often applied minutes before pull
 * - Mind Vision: priest scouting ability
 * - Flare: hunter AoE reveal
 * - Baby Spice: fun item
 * - Soothe Animal: druid utility
 * - Lens: engineering item
 * - Blood Power: ICC mechanic
 */
const IGNORED_ENCOUNTER_SPELL_IDS = new Set([
  // Hunter's Mark (all ranks)
  "1130", "14323", "14324", "14325", "19421", "19422", "19423", "53338",
  // Mind Vision
  "2096", "10909", "45468",
  // Soothe Animal
  "26995",
  // Lens
  "55346", "56190", "56191",
  // Baby Spice
  "60122",
  // Flare
  "1543", "28822", "55798",
  // Blood Power (ICC)
  "72371",
]);

/**
 * Events excluded from player participation tracking during encounters.
 * Pure aura management events don't indicate active combat participation.
 * Note: SPELL_CAST_SUCCESS IS valid for participation (players casting combat
 * spells) — it's only excluded from encounter START detection above.
 */
const NON_PARTICIPANT_EVENTS = new Set([
  "SPELL_AURA_REMOVED",
  "SPELL_AURA_APPLIED",
  "SPELL_AURA_REFRESH",
  "SPELL_AURA_REMOVED_DOSE",
  "SPELL_AURA_APPLIED_DOSE",
]);

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
  /**
   * NPC ids whose UNIT_DIED counts as a kill for the current encounter. A
   * subset of `_bossNpcIds` (engagement NPCs). Deaths outside this set —
   * e.g. adds, intermediate phases, tentacles — keep the encounter alive but
   * don't end it.
   */
  private _killNpcIds: Set<string> = new Set();
  private _isCoward: boolean = false;
  private _consecutiveAuraRemovals: number = 0;
  /** Player GUIDs that appeared in events during the current encounter. */
  private _encounterParticipants: Set<string> = new Set();

  /**
   * Tracks recent boss kills: bossName → kill timestamp.
   * Used to suppress phantom encounters from post-kill lingering events.
   */
  private _recentKills = new Map<string, number>();


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
      participants: null,
    };

    if (!isCombatEvent(event.eventType)) return result;

    // Check source and dest GUIDs for boss NPC IDs
    const sourceNpcId = this._extractBossNpcId(event.sourceGuid);
    const destNpcId = this._extractBossNpcId(event.destGuid);
    const bossNpcId = sourceNpcId ?? destNpcId;

    // If we're in an encounter, check for idle timeout first
    if (this._bossName !== null) {
      const idleResult = this.checkIdleTimeout(event.timestamp);
      if (idleResult.encounterEnded) {
        // After ending via idle timeout, check if this event starts a new encounter
        return this._maybeStartNewEncounter(event, bossNpcId, idleResult);
      }

      // Different boss engaged while current encounter is active → end current as wipe.
      // An event referencing a sub-boss (multi-boss) or an alternate NPC (e.g. another
      // Mimiron phase) for the SAME encounter isn't really a different boss — it's
      // either a lingering event after a sub-boss died, or a phase transition.
      // Guard against splitting those into fake encounters.
      const isSameEncounter =
        bossNpcId !== null &&
        ((this._isMultiBoss &&
          isMultiBoss(bossNpcId) &&
          getMultiBossName(bossNpcId) === this._bossName) ||
          (!this._isMultiBoss && getBossName(bossNpcId) === this._bossName));

      if (
        bossNpcId !== null &&
        !this._bossNpcIds.has(bossNpcId) &&
        !isSameEncounter
      ) {
        // Check if this event would start a new encounter (same filters as _maybeStartNewEncounter)
        const wouldStart =
          !NEVER_START_ENCOUNTER_EVENTS.has(event.eventType) &&
          !(AURA_APPLIED_EVENTS.has(event.eventType) && isBuffAura(event)) &&
          !(getSpellId(event) !== null && IGNORED_ENCOUNTER_SPELL_IDS.has(getSpellId(event)!));

        if (wouldStart) {
          const candidateName = isMultiBoss(bossNpcId)
            ? getMultiBossName(bossNpcId)!
            : getBossName(bossNpcId)!;
          const killTime = this._recentKills.get(candidateName);
          const isNotOnCooldown =
            killTime === undefined ||
            event.timestamp - killTime >= POST_KILL_COOLDOWN_MS;

          if (isNotOnCooldown) {
            // End current encounter as wipe, then start the new one
            const encounter = this._buildEncounter(this._lastBossEventTimestamp);
            const participants = this._encounterParticipants;
            this._reset();
            result.encounterEnded = true;
            result.encounter = encounter;
            result.participants = participants;
            return this._maybeStartNewEncounter(event, bossNpcId, result);
          }
        }
      }

      // Track player participation during encounter.
      // Exclude pure aura/buff events — these indicate buff management
      // (e.g., Prayer of Fortitude refreshing on a raid member), not
      // actual combat participation. Casts, damage, healing, deaths
      // etc. count as genuine encounter participation.
      if (!NON_PARTICIPANT_EVENTS.has(event.eventType)) {
        this._trackParticipant(event.sourceGuid);
        this._trackParticipant(event.destGuid);
      }

      // Check if this event involves one of the tracked boss NPCs
      const involvesBoss =
        (sourceNpcId !== null && this._bossNpcIds.has(sourceNpcId)) ||
        (destNpcId !== null && this._bossNpcIds.has(destNpcId));

      if (involvesBoss) {
        this._lastBossEventTimestamp = event.timestamp;

        // Kill detection: UNIT_DIED targeting the boss.
        // PARTY_KILL is NOT used here — it fires 14-60ms before UNIT_DIED and
        // using it produces shorter durations than uwu-logs' reference timings.
        // PARTY_KILL still updates _lastBossEventTimestamp above (keeping the
        // encounter alive) but doesn't end it.
        if (
          event.eventType === "UNIT_DIED" &&
          destNpcId !== null &&
          this._bossNpcIds.has(destNpcId)
        ) {
          // Only NPCs in `_killNpcIds` count towards kill detection. This lets
          // sub-NPCs (tentacles, adds, intermediate phases) die freely during
          // the fight without ending the encounter.
          if (!this._killNpcIds.has(destNpcId)) {
            return result;
          }

          this._killNpcIds.delete(destNpcId);
          if (this._killNpcIds.size > 0) {
            // For "all-dead" encounters (Assembly of Iron etc.), some kill
            // targets are still alive — encounter continues.
            return result;
          }

          this._bossKilled = true;

          // Encounter ends here (final kill target has died).
          const encounter = this._buildEncounter(event.timestamp);
          const participants = this._encounterParticipants;
          this._recentKills.set(encounter.bossName, event.timestamp);
          this._reset();
          result.encounterEnded = true;
          result.encounter = encounter;
          result.participants = participants;
          return result;
        }

        // Coward boss detection: consecutive SPELL_AURA_REMOVED events
        if (this._isCoward) {
          if (event.eventType === "SPELL_AURA_REMOVED") {
            this._consecutiveAuraRemovals++;
            if (
              this._consecutiveAuraRemovals >= COWARD_AURA_REMOVAL_THRESHOLD
            ) {
              this._bossKilled = true;
              const encounter = this._buildEncounter(event.timestamp);
              const participants = this._encounterParticipants;
              this._recentKills.set(encounter.bossName, event.timestamp);
              this._reset();
              result.encounterEnded = true;
              result.encounter = encounter;
              result.participants = participants;
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
   * Returns the encounter summary and participants, or null if no active encounter.
   */
  forceEnd(lastTimestamp: number): { encounter: EncounterSummary; participants: Set<string> } | null {
    if (this._bossName === null) return null;
    const encounter = this._buildEncounter(lastTimestamp);
    const participants = this._encounterParticipants;
    this._reset();
    return { encounter, participants };
  }

  /**
   * Check if the current encounter has timed out due to inactivity.
   * Can be called externally (e.g., from tick()) with a log-domain timestamp.
   */
  checkIdleTimeout(currentTimestamp: number): EncounterProcessResult {
    const result: EncounterProcessResult = {
      encounterStarted: false,
      encounterEnded: false,
      encounter: null,
      participants: null,
    };

    if (this._bossName === null) return result;

    if (currentTimestamp - this._lastBossEventTimestamp > this._idleThreshold) {
      const encounter = this._buildEncounter(this._lastBossEventTimestamp);
      const participants = this._encounterParticipants;
      this._reset();
      result.encounterEnded = true;
      result.encounter = encounter;
      result.participants = participants;
    }

    return result;
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

    // Never start encounters from these event types
    if (NEVER_START_ENCOUNTER_EVENTS.has(event.eventType)) return result;

    // For aura-applied events: BUFF auras don't start encounters, DEBUFF auras can
    if (AURA_APPLIED_EVENTS.has(event.eventType) && isBuffAura(event)) return result;

    // Filter out non-combat spells (Hunter's Mark, Mind Vision, Flare, etc.)
    const spellId = getSpellId(event);
    if (spellId !== null && IGNORED_ENCOUNTER_SPELL_IDS.has(spellId)) return result;

    // Resolve boss name for cooldown check
    const candidateName = isMultiBoss(bossNpcId)
      ? getMultiBossName(bossNpcId)!
      : getBossName(bossNpcId)!;

    // Post-kill cooldown: suppress re-detection of recently killed bosses
    const killTime = this._recentKills.get(candidateName);
    if (
      killTime !== undefined &&
      event.timestamp - killTime < POST_KILL_COOLDOWN_MS
    ) {
      return result;
    }

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

    // Kill-marking NPCs: honor any per-encounter override, otherwise default to
    // the full engagement set (single-boss: the one NPC; multi-boss: every
    // sub-boss must die).
    const killOverride = getEncounterKillNpcIds(this._bossName);
    this._killNpcIds = killOverride !== null
      ? new Set(killOverride)
      : new Set(this._bossNpcIds);

    this._startTimestamp = event.timestamp;
    this._lastBossEventTimestamp = event.timestamp;
    this._bossKilled = false;
    this._difficulty = null;
    this._isCoward = isCowardBoss(this._bossName);
    this._consecutiveAuraRemovals = 0;

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
      duration: Math.round(durationMs) / 1000,
      result: this._bossKilled ? "kill" : "wipe",
      difficulty: this._difficulty,
    };
  }

  private _trackParticipant(guid: string): void {
    if (isPlayer(guid)) {
      this._encounterParticipants.add(guid);
    }
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
    this._killNpcIds.clear();
    this._isCoward = false;
    this._consecutiveAuraRemovals = 0;
    this._encounterParticipants = new Set();
  }
}
