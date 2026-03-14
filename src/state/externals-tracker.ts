// src/state/externals-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import { getSpellId } from "../pipeline/line-parser.js";
import { isPlayer } from "../utils/guid.js";
import { EXTERNAL_SPELLS } from "../data/external-data.js";
import type { ExternalBuffUse, PlayerExternalsSummary, ExternalBuffSummary } from "../types.js";

/** Aura event types we handle. */
const AURA_EVENTS = new Set([
  "SPELL_AURA_APPLIED",
  "SPELL_AURA_REMOVED",
  "SPELL_AURA_REFRESH",
]);

/** Per-encounter external usage keyed by destGuid → "spellId:sourceGuid" → data. */
interface InternalExternalUse {
  spellId: number;
  spellName: string;
  sourceGuid: string;
  sourceName: string;
  count: number;
  intervals: Array<[number, number]>;
}

/** Tracks an active aura across encounters. */
interface ActiveAura {
  spellId: string;
  spellName: string;
  sourceGuid: string;
  sourceName: string;
  startTimestamp: number;
}

/** Per-encounter externals: destGuid → ExternalBuffUse[]. */
export type EncounterExternals = Record<string, ExternalBuffUse[]>;

/**
 * Tracks external buff spells cast by one player on another during encounters.
 * Records count, uptime %, and individual start/end interval timestamps per application.
 *
 * Lifecycle:
 * 1. processEvent() called for every event by the state machine.
 * 2. onEncounterStart() called when an encounter begins.
 * 3. onEncounterEnd() called when an encounter ends → returns external buff data.
 * 4. getPlayerSummaries() aggregates across all completed encounters.
 */
export class ExternalsTracker {
  /** Active auras: key = "destGuid:spellId:sourceGuid" → ActiveAura. Persists across encounters. */
  private _activeAuras = new Map<string, ActiveAura>();

  /** Whether we're currently inside an encounter. */
  private _inEncounter = false;

  /** Current encounter data: destGuid → Map<"spellId:sourceGuid", InternalExternalUse>. */
  private _currentEncounter = new Map<string, Map<string, InternalExternalUse>>();

  /** Completed encounter records (one per encounter, in order). */
  private _completedEncounters: EncounterExternals[] = [];

  /**
   * Process a log event for external buff tracking.
   */
  processEvent(event: LogEvent): void {
    if (!AURA_EVENTS.has(event.eventType)) return;

    const spellId = getSpellId(event);
    if (spellId === null) return;

    const info = EXTERNAL_SPELLS.get(spellId);
    if (info === undefined) return;

    const { destGuid, sourceGuid } = event;

    // Only track player targets
    if (!isPlayer(destGuid)) return;

    // Ignore self-buffs
    if (sourceGuid === destGuid) return;

    // Ignore NPC casts
    if (!isPlayer(sourceGuid)) return;

    const auraKey = `${destGuid}:${spellId}:${sourceGuid}`;

    if (event.eventType === "SPELL_AURA_APPLIED") {
      // Close any existing aura with the same key (handle duplicate applies)
      const existing = this._activeAuras.get(auraKey);
      if (existing !== undefined) {
        // Close the previous interval in the current encounter
        if (this._inEncounter) {
          this._closeInterval(destGuid, spellId, sourceGuid, event.timestamp);
        }
      }

      // Store in _activeAuras
      this._activeAuras.set(auraKey, {
        spellId,
        spellName: info.displayName,
        sourceGuid,
        sourceName: event.sourceName,
        startTimestamp: event.timestamp,
      });

      // If in encounter: record the application
      if (this._inEncounter) {
        this._recordApplication(
          destGuid,
          spellId,
          info.displayName,
          sourceGuid,
          event.sourceName,
          event.timestamp,
        );
      }
    } else if (event.eventType === "SPELL_AURA_REMOVED") {
      const existing = this._activeAuras.get(auraKey);
      if (existing !== undefined) {
        // If in encounter: close the last open interval
        if (this._inEncounter) {
          this._closeInterval(destGuid, spellId, sourceGuid, event.timestamp);
        }
        // Remove from active auras
        this._activeAuras.delete(auraKey);
      }
    } else if (event.eventType === "SPELL_AURA_REFRESH") {
      const existing = this._activeAuras.get(auraKey);
      if (existing === undefined) {
        // No existing aura tracked — start tracking (similar to APPLIED)
        this._activeAuras.set(auraKey, {
          spellId,
          spellName: info.displayName,
          sourceGuid,
          sourceName: event.sourceName,
          startTimestamp: event.timestamp,
        });

        if (this._inEncounter) {
          this._recordApplication(
            destGuid,
            spellId,
            info.displayName,
            sourceGuid,
            event.sourceName,
            event.timestamp,
          );
        }
      }
      // If already tracked: no-op (interval continues)
    }
  }

  /**
   * Called when an encounter starts.
   * Checks active auras and records them with start = encounter start time.
   */
  onEncounterStart(startTimestamp: number): void {
    this._inEncounter = true;
    this._currentEncounter.clear();

    // Check _activeAuras for already-active external buffs
    for (const [_key, aura] of this._activeAuras) {
      // Find the destGuid from the key
      const parts = _key.split(":");
      const destGuid = parts[0];

      this._recordApplication(
        destGuid,
        aura.spellId,
        aura.spellName,
        aura.sourceGuid,
        aura.sourceName,
        startTimestamp,
      );
    }
  }

  /**
   * Called when an encounter ends.
   * Closes open intervals, computes uptime, returns encounter externals.
   */
  onEncounterEnd(endTimestamp: number, durationMs: number): EncounterExternals {
    this._inEncounter = false;

    // Close any open intervals at encounter end
    for (const [, spellMap] of this._currentEncounter) {
      for (const [, use] of spellMap) {
        const lastInterval = use.intervals[use.intervals.length - 1];
        if (lastInterval !== undefined && lastInterval[1] === -1) {
          lastInterval[1] = endTimestamp;
        }
      }
    }

    // Build result with uptimePercent
    const result: EncounterExternals = {};
    for (const [destGuid, spellMap] of this._currentEncounter) {
      const uses: ExternalBuffUse[] = [];
      for (const use of spellMap.values()) {
        // Compute uptimePercent
        let totalMs = 0;
        for (const [start, end] of use.intervals) {
          totalMs += end - start;
        }
        const uptimePercent = durationMs > 0
          ? Math.round((totalMs / durationMs) * 100 * 100) / 100
          : 0;

        uses.push({
          spellId: use.spellId,
          spellName: use.spellName,
          sourceGuid: use.sourceGuid,
          sourceName: use.sourceName,
          count: use.count,
          uptimePercent,
          intervals: use.intervals,
        });
      }
      if (uses.length > 0) {
        result[destGuid] = uses;
      }
    }

    this._completedEncounters.push(result);
    this._currentEncounter.clear();
    return result;
  }

  /**
   * Force-end the current encounter (e.g., end of log).
   */
  forceEnd(endTimestamp: number, durationMs: number): EncounterExternals | null {
    if (!this._inEncounter) return null;
    return this.onEncounterEnd(endTimestamp, durationMs);
  }

  /**
   * Aggregate across all completed encounters per destGuid per spellId.
   * Returns per-player summaries sorted by totalCount descending.
   */
  getPlayerSummaries(totalEncounterDurationMs: number): Map<string, PlayerExternalsSummary> {
    // destGuid → spellId → { totalCount, totalUptimeMs, spellName }
    const agg = new Map<string, Map<number, { spellName: string; totalCount: number; totalUptimeMs: number }>>();

    for (const encounter of this._completedEncounters) {
      for (const [destGuid, uses] of Object.entries(encounter)) {
        let playerAgg = agg.get(destGuid);
        if (playerAgg === undefined) {
          playerAgg = new Map();
          agg.set(destGuid, playerAgg);
        }

        for (const use of uses) {
          let spellAgg = playerAgg.get(use.spellId);
          if (spellAgg === undefined) {
            spellAgg = { spellName: use.spellName, totalCount: 0, totalUptimeMs: 0 };
            playerAgg.set(use.spellId, spellAgg);
          }
          spellAgg.totalCount += use.count;
          for (const [start, end] of use.intervals) {
            spellAgg.totalUptimeMs += end - start;
          }
        }
      }
    }

    const result = new Map<string, PlayerExternalsSummary>();
    for (const [destGuid, playerAgg] of agg) {
      const received: ExternalBuffSummary[] = [];
      for (const [spellId, data] of playerAgg) {
        const uptimePercent = totalEncounterDurationMs > 0
          ? Math.round((data.totalUptimeMs / totalEncounterDurationMs) * 100 * 100) / 100
          : 0;
        received.push({
          spellId,
          spellName: data.spellName,
          totalCount: data.totalCount,
          uptimePercent,
        });
      }
      // Sort by totalCount descending
      received.sort((a, b) => b.totalCount - a.totalCount);
      result.set(destGuid, { received });
    }

    return result;
  }

  // --- Private helpers ---

  /**
   * Record a new application of an external buff in the current encounter.
   * Opens a new interval [timestamp, -1].
   */
  private _recordApplication(
    destGuid: string,
    spellId: string,
    spellName: string,
    sourceGuid: string,
    sourceName: string,
    timestamp: number,
  ): void {
    let destMap = this._currentEncounter.get(destGuid);
    if (destMap === undefined) {
      destMap = new Map();
      this._currentEncounter.set(destGuid, destMap);
    }

    const useKey = `${spellId}:${sourceGuid}`;
    let use = destMap.get(useKey);
    if (use === undefined) {
      use = {
        spellId: Number(spellId),
        spellName,
        sourceGuid,
        sourceName,
        count: 0,
        intervals: [],
      };
      destMap.set(useKey, use);
    }

    use.count++;
    use.intervals.push([timestamp, -1]);
  }

  /**
   * Close the last open interval for a given aura in the current encounter.
   */
  private _closeInterval(
    destGuid: string,
    spellId: string,
    sourceGuid: string,
    timestamp: number,
  ): void {
    const destMap = this._currentEncounter.get(destGuid);
    if (destMap === undefined) return;

    const useKey = `${spellId}:${sourceGuid}`;
    const use = destMap.get(useKey);
    if (use === undefined) return;

    // Find the last interval with end === -1
    for (let i = use.intervals.length - 1; i >= 0; i--) {
      if (use.intervals[i][1] === -1) {
        use.intervals[i][1] = timestamp;
        break;
      }
    }
  }
}
