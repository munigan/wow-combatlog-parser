// src/state/death-tracker.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import type { DeathRecapEvent, PlayerDeath } from "../types.js";
import { isPlayer } from "../utils/guid.js";
import { getSpellId } from "../pipeline/line-parser.js";

/** Damage event types that go into the death recap buffer. */
const DAMAGE_EVENTS = new Set([
  "SWING_DAMAGE",
  "SPELL_DAMAGE",
  "SPELL_PERIODIC_DAMAGE",
  "RANGE_DAMAGE",
  "DAMAGE_SHIELD",
  "ENVIRONMENTAL_DAMAGE",
]);

/** Healing event types that go into the death recap buffer (stored as negative). */
const HEAL_EVENTS = new Set([
  "SPELL_HEAL",
  "SPELL_PERIODIC_HEAL",
]);

/** Maximum events in the per-player rolling buffer. */
const BUFFER_SIZE = 10;

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

/**
 * Extract a string field from a comma-separated rawFields string by index.
 * Counts commas to find the Nth field without splitting.
 * Strips surrounding quotes if present.
 */
function extractFieldStr(rawFields: string, index: number): string {
  let start = 0;
  for (let i = 0; i < index; i++) {
    const comma = rawFields.indexOf(",", start);
    if (comma === -1) return "";
    start = comma + 1;
  }
  const end = rawFields.indexOf(",", start);
  let field = end === -1 ? rawFields.substring(start) : rawFields.substring(start, end);
  // Strip quotes
  if (field.length >= 2 && field.charCodeAt(0) === 34 /* " */ && field.charCodeAt(field.length - 1) === 34) {
    field = field.substring(1, field.length - 1);
  }
  return field;
}

/** Circular buffer for per-player death recap events. */
class CircularBuffer {
  private _buf: DeathRecapEvent[] = new Array(BUFFER_SIZE);
  private _head = 0; // next write position
  private _count = 0;

  push(event: DeathRecapEvent): void {
    this._buf[this._head] = event;
    this._head = (this._head + 1) % BUFFER_SIZE;
    if (this._count < BUFFER_SIZE) this._count++;
  }

  /** Snapshot buffer contents in chronological order, then clear. */
  drain(): DeathRecapEvent[] {
    if (this._count === 0) return [];
    const result: DeathRecapEvent[] = new Array(this._count);
    const start = (this._head - this._count + BUFFER_SIZE) % BUFFER_SIZE;
    for (let i = 0; i < this._count; i++) {
      result[i] = this._buf[(start + i) % BUFFER_SIZE];
    }
    this._head = 0;
    this._count = 0;
    return result;
  }

  clear(): void {
    this._head = 0;
    this._count = 0;
  }
}

export class DeathTracker {
  private _inEncounter = false;
  private _encounterStartMs = 0;
  /** Per-player rolling buffers. Keyed by player GUID. */
  private _buffers = new Map<string, CircularBuffer>();
  /** Deaths recorded in the current encounter. */
  private _currentDeaths: PlayerDeath[] = [];
  /** Completed encounter death lists (for aggregate summaries). */
  private _completedEncounters: PlayerDeath[][] = [];

  processEvent(event: LogEvent): void {
    if (!this._inEncounter) return;

    const eventType = event.eventType;

    // Handle UNIT_DIED for players
    if (eventType === "UNIT_DIED") {
      if (!isPlayer(event.destGuid)) return;

      const playerGuid = event.destGuid;
      const buffer = this._buffers.get(playerGuid);
      const recap = buffer ? buffer.drain() : [];

      // Killing blow = last damage event (positive amount) in recap
      let killingBlow: DeathRecapEvent | null = null;
      for (let i = recap.length - 1; i >= 0; i--) {
        if (recap[i].amount > 0) {
          killingBlow = recap[i];
          break;
        }
      }

      // Filter out Feign Death: if no damage events in recap, this is a hunter
      // using Feign Death which triggers UNIT_DIED in WotLK 3.3.5 logs.
      // A real death always has at least one damage event in the buffer.
      const hasDamage = recap.some((e) => e.amount > 0);
      if (!hasDamage) return;

      this._currentDeaths.push({
        playerGuid,
        playerName: event.destName,
        timestamp: event.timestamp,
        timeIntoEncounter: Math.round(event.timestamp - this._encounterStartMs) / 1000,
        killingBlow,
        recap,
      });
      return;
    }

    // Buffer damage events targeting a player
    if (DAMAGE_EVENTS.has(eventType)) {
      if (!isPlayer(event.destGuid)) return;

      const isSwing = eventType === "SWING_DAMAGE";
      const isEnvironmental = eventType === "ENVIRONMENTAL_DAMAGE";

      let spellId: number | null = null;
      let spellName: string;
      let amount: number;

      if (isSwing) {
        spellName = "Melee";
        amount = extractFieldInt(event.rawFields, 0);
      } else if (isEnvironmental) {
        spellName = "Environmental";
        amount = extractFieldInt(event.rawFields, 1);
      } else {
        const spellIdStr = getSpellId(event);
        spellId = spellIdStr !== null ? parseInt(spellIdStr, 10) : null;
        if (spellId !== null && isNaN(spellId)) spellId = null;
        spellName = extractFieldStr(event.rawFields, 1);
        amount = extractFieldInt(event.rawFields, 3);
      }

      const recapEvent: DeathRecapEvent = {
        timestamp: event.timestamp,
        sourceGuid: event.sourceGuid,
        sourceName: event.sourceName,
        spellId,
        spellName,
        amount,
        eventType,
      };

      this._getOrCreateBuffer(event.destGuid).push(recapEvent);
      return;
    }

    // Buffer healing events targeting a player (stored as negative amount)
    if (HEAL_EVENTS.has(eventType)) {
      if (!isPlayer(event.destGuid)) return;

      const spellIdStr = getSpellId(event);
      let spellId: number | null = spellIdStr !== null ? parseInt(spellIdStr, 10) : null;
      if (spellId !== null && isNaN(spellId)) spellId = null;
      const spellName = extractFieldStr(event.rawFields, 1);
      const amount = extractFieldInt(event.rawFields, 3);

      const recapEvent: DeathRecapEvent = {
        timestamp: event.timestamp,
        sourceGuid: event.sourceGuid,
        sourceName: event.sourceName,
        spellId,
        spellName,
        amount: -amount, // negative for healing
        eventType,
      };

      this._getOrCreateBuffer(event.destGuid).push(recapEvent);
    }
  }

  onEncounterStart(startTimestamp: number): void {
    this._inEncounter = true;
    this._encounterStartMs = startTimestamp;
    this._currentDeaths = [];
    this._buffers.clear();
  }

  onEncounterEnd(): PlayerDeath[] {
    this._inEncounter = false;
    const result = this._currentDeaths;
    this._completedEncounters.push(result);
    this._currentDeaths = [];
    this._buffers.clear();
    return result;
  }

  forceEnd(): PlayerDeath[] | null {
    if (!this._inEncounter) return null;
    return this.onEncounterEnd();
  }

  /** Returns aggregate death count per player GUID across all completed encounters. */
  getPlayerSummaries(): Map<string, number> {
    const summaries = new Map<string, number>();
    for (const deaths of this._completedEncounters) {
      for (const death of deaths) {
        const current = summaries.get(death.playerGuid) ?? 0;
        summaries.set(death.playerGuid, current + 1);
      }
    }
    return summaries;
  }

  private _getOrCreateBuffer(playerGuid: string): CircularBuffer {
    let buf = this._buffers.get(playerGuid);
    if (buf === undefined) {
      buf = new CircularBuffer();
      this._buffers.set(playerGuid, buf);
    }
    return buf;
  }
}
