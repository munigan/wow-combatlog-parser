// src/state/state-machine.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import { getSpellId } from "../pipeline/line-parser.js";
import type { EncounterSummary, WowClass, WowSpec } from "../types.js";
import { isPlayer } from "../utils/guid.js";
import { detectClass } from "../detection/class-detection.js";
import { detectSpec } from "../detection/spec-detection.js";
import { detectDifficultyByPlayerCount } from "../detection/difficulty.js";
import { getRaidInstance } from "../data/boss-data.js";
import { EncounterTracker } from "./encounter-tracker.js";
import { RaidSeparator } from "./raid-separator.js";
import type { RaidSegment } from "./raid-separator.js";

export interface PlayerRecord {
  guid: string;
  name: string;
  class: WowClass | null;
  spec: WowSpec | null;
}

export class CombatLogStateMachine {
  private _players = new Map<string, PlayerRecord>();
  private _encounters: EncounterSummary[] = [];
  private _encounterTracker = new EncounterTracker();
  private _raidSeparator = new RaidSeparator();
  private _lastRaidInstance: string | null = null;

  processEvent(event: LogEvent): void {
    // 1. Track players from source and dest GUIDs
    this._trackPlayer(event.sourceGuid, event.sourceName);
    this._trackPlayer(event.destGuid, event.destName);

    // 2. Detect class/spec from spell usage (only for player sources)
    // Exclude SPELL_AURA_REMOVED — the source GUID on aura removal may not
    // reliably indicate who owns the ability (e.g., buffs cast by others).
    if (
      isPlayer(event.sourceGuid) &&
      event.eventType !== "SPELL_AURA_REMOVED"
    ) {
      const spellId = getSpellId(event);
      if (spellId !== null) {
        this._detectClassSpec(event.sourceGuid, spellId);
      }
    }

    // 3. Feed event to encounter tracker
    const encounterResult = this._encounterTracker.processEvent(event);

    // 4. Determine raid instance from current boss
    if (this._encounterTracker.isInEncounter()) {
      const bossName = this._encounterTracker.getCurrentBossName();
      if (bossName !== null) {
        const instance = getRaidInstance(bossName);
        if (instance !== null) {
          this._lastRaidInstance = instance;
        }
      }
    }

    // 5. Feed to raid separator — use player GUID if source is a player
    const playerGuid = isPlayer(event.sourceGuid)
      ? event.sourceGuid
      : isPlayer(event.destGuid)
        ? event.destGuid
        : null;

    this._raidSeparator.processTimestamp(
      event.timestamp,
      event.date,
      playerGuid,
      this._lastRaidInstance,
    );

    // 6. Store completed encounters
    if (encounterResult.encounterEnded && encounterResult.encounter !== null) {
      // Apply fallback difficulty from player count if not detected
      if (encounterResult.encounter.difficulty === null) {
        encounterResult.encounter.difficulty =
          detectDifficultyByPlayerCount(this._players.size);
      }
      this._encounters.push(encounterResult.encounter);
    }
  }

  finalize(lastTimestamp: number): void {
    const encounter = this._encounterTracker.forceEnd(lastTimestamp);
    if (encounter !== null) {
      if (encounter.difficulty === null) {
        encounter.difficulty = detectDifficultyByPlayerCount(
          this._players.size,
        );
      }
      this._encounters.push(encounter);
    }
  }

  getDetectedPlayers(): Map<string, PlayerRecord> {
    return this._players;
  }

  getEncounters(): EncounterSummary[] {
    return this._encounters;
  }

  getRaidSegments(): RaidSegment[] {
    return this._raidSeparator.finalize();
  }

  // --- Private helpers ---

  private _trackPlayer(guid: string, name: string): void {
    if (!isPlayer(guid) || name === "") return;
    if (!this._players.has(guid)) {
      this._players.set(guid, {
        guid,
        name,
        class: null,
        spec: null,
      });
    }
  }

  private _detectClassSpec(playerGuid: string, spellId: string): void {
    const player = this._players.get(playerGuid);
    if (player === undefined) return;

    // Detect class if not yet known
    if (player.class === null) {
      const cls = detectClass(spellId);
      if (cls !== null) {
        player.class = cls;
      }
    }

    // Detect spec if class is known but spec isn't
    if (player.class !== null && player.spec === null) {
      const spec = detectSpec(spellId, player.class);
      if (spec !== null) {
        player.spec = spec;
      }
    }
  }
}
