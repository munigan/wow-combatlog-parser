// src/state/buff-uptime-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import { getSpellId } from "../pipeline/line-parser.js";
import { isPlayer } from "../utils/guid.js";
import { BUFF_SPELLS, FLASK_ELIXIR_SPELL_IDS, FOOD_SPELL_IDS } from "../data/buff-data.js";
import type { PlayerBuffUptime, BuffBreakdown, BuffCategory } from "../types.js";

/** Aura event types we handle. */
const AURA_EVENTS = new Set([
  "SPELL_AURA_APPLIED",
  "SPELL_AURA_REMOVED",
  "SPELL_AURA_REFRESH",
]);

/** Internal state for a single tracked spell on a single player. */
interface SpellEntry {
  spellName: string;
  category: BuffCategory;
  /** Start timestamp of the currently open interval, null if no interval is open. */
  currentStart: number | null;
  /** Completed [start, end] interval pairs. */
  intervals: Array<[number, number]>;
  /** True if the first event for this spell was a remove or refresh (no prior apply). */
  seenWithoutApply: boolean;
}

/**
 * Tracks buff uptime (flasks, elixirs, food) across a raid.
 *
 * Lifecycle:
 * 1. processEvent() called for every event by the state machine.
 * 2. finalize(raidStartMs, raidEndMs) called at end → returns per-player buff uptime data.
 * 3. reset() clears all state for reuse.
 */
export class BuffUptimeTracker {
  /** playerGuid → spellId (string) → SpellEntry */
  private _players = new Map<string, Map<string, SpellEntry>>();

  /**
   * Process a log event for buff tracking.
   * Only handles SPELL_AURA_APPLIED, SPELL_AURA_REMOVED, SPELL_AURA_REFRESH
   * for tracked spell IDs on player dest GUIDs.
   */
  processEvent(event: LogEvent): void {
    if (!AURA_EVENTS.has(event.eventType)) return;

    const spellId = getSpellId(event);
    if (spellId === null) return;

    const info = BUFF_SPELLS.get(spellId);
    if (info === undefined) return;

    const playerGuid = event.destGuid;
    if (!isPlayer(playerGuid)) return;

    let playerSpells = this._players.get(playerGuid);
    if (playerSpells === undefined) {
      playerSpells = new Map();
      this._players.set(playerGuid, playerSpells);
    }

    let entry = playerSpells.get(spellId);

    if (event.eventType === "SPELL_AURA_APPLIED") {
      if (entry === undefined) {
        entry = {
          spellName: info.displayName,
          category: info.category,
          currentStart: event.timestamp,
          intervals: [],
          seenWithoutApply: false,
        };
        playerSpells.set(spellId, entry);
      } else {
        // Duplicate apply — close the current open interval first
        if (entry.currentStart !== null) {
          entry.intervals.push([entry.currentStart, event.timestamp]);
        }
        entry.currentStart = event.timestamp;
      }
    } else if (event.eventType === "SPELL_AURA_REMOVED") {
      if (entry === undefined) {
        // Remove without prior apply — buff was active before log started
        entry = {
          spellName: info.displayName,
          category: info.category,
          currentStart: null,
          intervals: [],
          seenWithoutApply: true,
        };
        // Store a sentinel interval — start will be resolved in finalize()
        // Use -1 as sentinel for "resolve to raidStart"
        entry.intervals.push([-1, event.timestamp]);
        playerSpells.set(spellId, entry);
      } else if (entry.currentStart !== null) {
        // Normal close of open interval
        entry.intervals.push([entry.currentStart, event.timestamp]);
        entry.currentStart = null;
      } else {
        // Remove without open interval — retroactive (should not normally happen
        // after the first one, but handle gracefully)
        entry.intervals.push([-1, event.timestamp]);
        entry.seenWithoutApply = true;
      }
    } else if (event.eventType === "SPELL_AURA_REFRESH") {
      if (entry === undefined) {
        // Refresh with no prior apply — buff was active before log started.
        // Add a retroactive interval from raidStart (sentinel -1) to this
        // refresh, then continue tracking from this point.
        entry = {
          spellName: info.displayName,
          category: info.category,
          currentStart: event.timestamp,
          intervals: [[-1, event.timestamp]],
          seenWithoutApply: true,
        };
        playerSpells.set(spellId, entry);
      } else if (entry.currentStart === null) {
        // Entry exists but no open interval — re-open from this refresh
        entry.currentStart = event.timestamp;
      }
      // If entry already has an open interval, refresh is a no-op
      // (the interval continues uninterrupted).
    }
  }

  /**
   * Finalize tracking and compute uptime percentages.
   * Closes open intervals at raidEnd, resolves retroactive starts to raidStart.
   * Returns per-player buff uptime data.
   */
  finalize(raidStartMs: number, raidEndMs: number): Map<string, PlayerBuffUptime> {
    const raidDuration = raidEndMs - raidStartMs;
    if (raidDuration <= 0) return new Map();

    const result = new Map<string, PlayerBuffUptime>();

    for (const [playerGuid, playerSpells] of this._players) {
      const buffs: BuffBreakdown[] = [];
      const flaskElixirIntervals: Array<[number, number]> = [];
      const foodIntervals: Array<[number, number]> = [];

      for (const [spellId, entry] of playerSpells) {
        // Close open intervals at raidEnd
        if (entry.currentStart !== null) {
          entry.intervals.push([entry.currentStart, raidEndMs]);
          entry.currentStart = null;
        }

        // Resolve retroactive starts (sentinel -1 → raidStartMs)
        if (entry.seenWithoutApply) {
          for (let i = 0; i < entry.intervals.length; i++) {
            if (entry.intervals[i][0] === -1) {
              entry.intervals[i][0] = raidStartMs;
            }
          }
        }

        // Compute total uptimeMs for this individual buff
        let uptimeMs = 0;
        for (const [start, end] of entry.intervals) {
          uptimeMs += end - start;
        }

        const uptimePercent = Math.round((uptimeMs / raidDuration) * 100 * 100) / 100;

        buffs.push({
          spellId: Number(spellId),
          spellName: entry.spellName,
          category: entry.category,
          uptimeMs,
          uptimePercent,
        });

        // Collect intervals for union calculation
        if (FLASK_ELIXIR_SPELL_IDS.has(spellId)) {
          for (const interval of entry.intervals) {
            flaskElixirIntervals.push(interval);
          }
        } else if (FOOD_SPELL_IDS.has(spellId)) {
          for (const interval of entry.intervals) {
            foodIntervals.push(interval);
          }
        }
      }

      // Sort buffs by uptimeMs descending
      buffs.sort((a, b) => b.uptimeMs - a.uptimeMs);

      // Compute union uptime percentages
      const flaskUptimeMs = computeUnionMs(flaskElixirIntervals);
      const foodUptimeMs = computeUnionMs(foodIntervals);

      const flaskUptimePercent = Math.round((flaskUptimeMs / raidDuration) * 100 * 100) / 100;
      const foodUptimePercent = Math.round((foodUptimeMs / raidDuration) * 100 * 100) / 100;

      result.set(playerGuid, {
        flaskUptimePercent,
        foodUptimePercent,
        buffs,
      });
    }

    return result;
  }

  /** Clear all state for reuse. */
  reset(): void {
    this._players.clear();
  }
}

/**
 * Compute the total covered duration from a set of possibly-overlapping intervals.
 * Uses the standard interval merge algorithm: sort by start, merge overlapping, sum lengths.
 */
function computeUnionMs(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;

  // Sort by start time
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);

  let totalMs = 0;
  let currentStart = sorted[0][0];
  let currentEnd = sorted[0][1];

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    if (start <= currentEnd) {
      // Overlapping — extend current interval
      if (end > currentEnd) {
        currentEnd = end;
      }
    } else {
      // Gap — finalize current interval and start new one
      totalMs += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }

  // Add the last interval
  totalMs += currentEnd - currentStart;

  return totalMs;
}
