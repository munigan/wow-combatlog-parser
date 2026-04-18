// src/state/consumable-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import { getSpellId } from "../pipeline/line-parser.js";
import { isPlayer } from "../utils/guid.js";
import {
  CONSUMABLE_SPELLS,
  BUFF_CONSUMABLE_SPELL_IDS,
  FLAME_CAP_SPELL_ID,
} from "../data/consumable-data.js";
import type { ConsumableType } from "../data/consumable-data.js";

/** A single consumable usage recorded during (or before) an encounter. */
export interface ConsumableUse {
  spellId: number;
  spellName: string;
  type: ConsumableType;
  prePot: boolean;
  count: number;
}

/** Per-encounter consumable data: playerGuid → list of consumable uses. */
export type EncounterConsumables = Record<string, ConsumableUse[]>;

/** Raid-wide per-player summary: spellId → aggregated usage. */
export interface ConsumableSummaryEntry {
  spellName: string;
  type: ConsumableType;
  totalUses: number;
  prePotCount: number;
}

export type PlayerConsumableSummary = Record<number, ConsumableSummaryEntry>;

/** Internal record with playerGuid attached for building output. */
interface InternalUse {
  playerGuid: string;
  spellId: number;
  spellName: string;
  type: ConsumableType;
  prePot: boolean;
  count: number;
}

/**
 * Tracks consumable usage across encounters.
 *
 * Lifecycle:
 * 1. processEvent() called for every event by the state machine.
 * 2. onEncounterStart() called when an encounter begins.
 * 3. onEncounterEnd() called when an encounter ends → returns consumable data.
 *
 * Raid-wide totals (`getRaidWideSummaries`) include every tracked consumable in
 * the log window — trash, travel, and between boss pulls — not only uses during
 * detected boss encounters. Per-encounter snapshots still only contain uses
 * attributed to that fight (plus pre-pots at pull).
 *
 * Pre-pot detection:
 * - Tracks active buff auras (SPELL_AURA_APPLIED/REMOVED for buff consumables).
 * - When an encounter starts, any player with an active buff consumable aura
 *   is flagged as having pre-potted.
 */
export class ConsumableTracker {
  /**
   * Active buff consumable auras: playerGuid → { spellId, spellName }.
   * Populated from SPELL_AURA_APPLIED, cleared on SPELL_AURA_REMOVED.
   */
  private _activeBuffs = new Map<string, { spellId: string; spellName: string }>();

  /** Whether we're currently inside an encounter. */
  private _inEncounter = false;

  /**
   * Current encounter consumable usage.
   * Key: `${playerGuid}:${spellId}:${pre|mid}`
   */
  private _currentEncounter = new Map<string, InternalUse>();

  /**
   * Full raid-window consumable usage (same key shape as `_currentEncounter`).
   * Never cleared — includes trash and out-of-encounter casts.
   */
  private _raidWide = new Map<string, InternalUse>();

  /** Completed encounter consumable records (one per encounter, in order). */
  private _completedEncounters: EncounterConsumables[] = [];

  /**
   * Process a log event for consumable tracking.
   * Called by the state machine for every event.
   */
  processEvent(event: LogEvent): void {
    const spellId = getSpellId(event);
    if (spellId === null) return;

    // Track buff aura lifecycle (for pre-pot detection)
    if (BUFF_CONSUMABLE_SPELL_IDS.has(spellId)) {
      if (event.eventType === "SPELL_AURA_APPLIED") {
        // For all buff consumables (including Flame Cap with nil source),
        // the dest GUID is the player who gains the buff.
        const playerGuid = event.destGuid;
        if (isPlayer(playerGuid)) {
          const info = CONSUMABLE_SPELLS.get(spellId)!;
          this._activeBuffs.set(playerGuid, {
            spellId,
            spellName: info.displayName,
          });

          // Flame Cap: player from SPELL_AURA_APPLIED dest (SPELL_CAST_SUCCESS has nil source).
          // Mid-fight use: count in both raid-wide and encounter maps. Pre-pull FC is counted
          // at encounter start via active-buff pre-pot (counting it here when !inEncounter would
          // duplicate that).
          if (this._inEncounter && spellId === FLAME_CAP_SPELL_ID) {
            this._recordUsage(
              playerGuid,
              spellId,
              info.displayName,
              info.type,
              false,
              true,
            );
          }
        }
        return;
      }
      if (event.eventType === "SPELL_AURA_REMOVED") {
        const playerGuid = event.destGuid;
        if (isPlayer(playerGuid)) {
          const active = this._activeBuffs.get(playerGuid);
          if (active !== undefined && active.spellId === spellId) {
            this._activeBuffs.delete(playerGuid);
          }
        }
        return;
      }
    }

    // SPELL_CAST_SUCCESS for consumables: always roll into raid-wide totals; encounter
    // snapshot only while a boss encounter is active.
    if (event.eventType !== "SPELL_CAST_SUCCESS") return;

    const info = CONSUMABLE_SPELLS.get(spellId);
    if (info === undefined) return;

    // Flame Cap SPELL_CAST_SUCCESS has nil source — handled via SPELL_AURA_APPLIED above.
    if (spellId === FLAME_CAP_SPELL_ID) return;

    const playerGuid = event.sourceGuid;
    if (!isPlayer(playerGuid)) return;

    this._recordUsage(
      playerGuid,
      spellId,
      info.displayName,
      info.type,
      false,
      this._inEncounter,
    );
  }

  /**
   * Called when an encounter starts.
   * Checks active buffs for pre-pot detection.
   */
  onEncounterStart(): void {
    this._inEncounter = true;
    this._currentEncounter.clear();

    // Check active buffs → pre-pots
    for (const [playerGuid, buff] of this._activeBuffs) {
      const info = CONSUMABLE_SPELLS.get(buff.spellId);
      if (info === undefined) continue;
      this._recordUsage(playerGuid, buff.spellId, info.displayName, info.type, true, true);
    }
  }

  /**
   * Called when an encounter ends.
   * Returns the consumable data for this encounter and resets state.
   */
  onEncounterEnd(): EncounterConsumables {
    this._inEncounter = false;

    const result: EncounterConsumables = {};
    for (const use of this._currentEncounter.values()) {
      if (result[use.playerGuid] === undefined) result[use.playerGuid] = [];
      result[use.playerGuid].push({
        spellId: use.spellId,
        spellName: use.spellName,
        type: use.type,
        prePot: use.prePot,
        count: use.count,
      });
    }

    this._completedEncounters.push(result);
    this._currentEncounter.clear();
    return result;
  }

  /** Get all completed encounter consumable records. */
  getCompletedEncounters(): EncounterConsumables[] {
    return this._completedEncounters;
  }

  /**
   * Aggregated consumables for the full parsed time span (all players), including
   * uses outside boss encounters.
   */
  getRaidWideSummaries(): Map<string, PlayerConsumableSummary> {
    const byPlayer = new Map<string, PlayerConsumableSummary>();
    for (const use of this._raidWide.values()) {
      let summary = byPlayer.get(use.playerGuid);
      if (summary === undefined) {
        summary = {};
        byPlayer.set(use.playerGuid, summary);
      }
      const existing = summary[use.spellId];
      if (existing !== undefined) {
        existing.totalUses += use.count;
        if (use.prePot) existing.prePotCount += use.count;
      } else {
        summary[use.spellId] = {
          spellName: use.spellName,
          type: use.type,
          totalUses: use.count,
          prePotCount: use.prePot ? use.count : 0,
        };
      }
    }
    return byPlayer;
  }

  /** Force-end the current encounter (e.g., end of log). */
  forceEnd(): EncounterConsumables | null {
    if (!this._inEncounter) return null;
    return this.onEncounterEnd();
  }

  // --- Private helpers ---

  private _recordUsage(
    playerGuid: string,
    spellId: string,
    spellName: string,
    type: ConsumableType,
    prePot: boolean,
    includeInEncounter: boolean,
  ): void {
    const key = `${playerGuid}:${spellId}:${prePot ? "pre" : "mid"}`;
    this._incrementUseMap(this._raidWide, key, playerGuid, spellId, spellName, type, prePot);
    if (includeInEncounter) {
      this._incrementUseMap(this._currentEncounter, key, playerGuid, spellId, spellName, type, prePot);
    }
  }

  private _incrementUseMap(
    map: Map<string, InternalUse>,
    key: string,
    playerGuid: string,
    spellId: string,
    spellName: string,
    type: ConsumableType,
    prePot: boolean,
  ): void {
    const existing = map.get(key);
    if (existing !== undefined) {
      existing.count++;
    } else {
      map.set(key, {
        playerGuid,
        spellId: Number(spellId),
        spellName,
        type,
        prePot,
        count: 1,
      });
    }
  }
}
