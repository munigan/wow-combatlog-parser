// src/state/state-machine.ts

import type { LogEvent } from "../pipeline/line-parser.js";
import { getSpellId } from "../pipeline/line-parser.js";
import type { EncounterSummary, WowClass, WowSpec, PlayerCombatStats, PlayerBuffUptime, EncounterBuffUptime, PlayerExternalsSummary } from "../types.js";
import { isPlayer } from "../utils/guid.js";
import { detectClass } from "../detection/class-detection.js";
import { detectSpec } from "../detection/spec-detection.js";
import { detectDifficultyByPlayerCount } from "../detection/difficulty.js";
import { getRaidInstance } from "../data/boss-data.js";
import { EncounterTracker } from "./encounter-tracker.js";
import { RaidSeparator } from "./raid-separator.js";
import type { RaidSegment } from "./raid-separator.js";
import { ConsumableTracker } from "./consumable-tracker.js";
import { CombatTracker } from "./combat-tracker.js";
import { BuffUptimeTracker } from "./buff-uptime-tracker.js";
import { DeathTracker } from "./death-tracker.js";
import { ExternalsTracker } from "./externals-tracker.js";

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
  private _consumableTracker: ConsumableTracker | null = null;
  private _combatTracker: CombatTracker | null = null;
  private _buffUptimeTracker: BuffUptimeTracker | null = null;
  private _deathTracker: DeathTracker | null = null;
  private _externalsTracker: ExternalsTracker | null = null;
  private _lastRaidInstance: string | null = null;
  /** All player GUIDs that actively participated in at least one encounter. */
  private _encounterParticipants = new Set<string>();
  private _pendingEncounter: EncounterSummary | null = null;
  private _pendingParticipants: Set<string> | null = null;

  /**
   * @param trackConsumables If true, enables consumable tracking (parseLog only).
   */
  constructor(trackConsumables = false) {
    if (trackConsumables) {
      this._consumableTracker = new ConsumableTracker();
      this._combatTracker = new CombatTracker();
      this._buffUptimeTracker = new BuffUptimeTracker();
      this._deathTracker = new DeathTracker();
      this._externalsTracker = new ExternalsTracker();
    }
  }

  /**
   * Pop the most recently completed encounter, if any.
   * Returns null if no encounter has completed since the last call.
   * Used by parseLogStream() to yield encounters incrementally.
   */
  popCompletedEncounter(): { encounter: EncounterSummary; participants: Set<string> } | null {
    if (this._pendingEncounter === null) return null;
    const result = {
      encounter: this._pendingEncounter,
      participants: this._pendingParticipants!,
    };
    this._pendingEncounter = null;
    this._pendingParticipants = null;
    return result;
  }

  processEvent(event: LogEvent): void {
    // 1. Track players from source and dest GUIDs
    this._trackPlayer(event.sourceGuid, event.sourceName);
    this._trackPlayer(event.destGuid, event.destName);

    // 2. Detect class/spec from spell usage (only for player sources)
    // Previously excluded SPELL_AURA_REMOVED, but for class-specific spells
    // (which is all we match), the source GUID is reliably the original caster.
    // The spell book itself filters out non-class spells.
    if (isPlayer(event.sourceGuid)) {
      const spellId = getSpellId(event);
      if (spellId !== null) {
        this._detectClassSpec(event.sourceGuid, spellId);
      }
    }

    // 3. Feed event to consumable tracker (before encounter tracker, so aura
    //    state is up-to-date when onEncounterStart is called)
    if (this._consumableTracker !== null) {
      this._consumableTracker.processEvent(event);
    }
    if (this._combatTracker !== null) {
      this._combatTracker.processEvent(event);
    }
    if (this._buffUptimeTracker !== null) {
      this._buffUptimeTracker.processEvent(event);
    }
    if (this._deathTracker !== null) {
      this._deathTracker.processEvent(event);
    }
    if (this._externalsTracker !== null) {
      this._externalsTracker.processEvent(event);
    }

    // 4. Feed event to encounter tracker
    const encounterResult = this._encounterTracker.processEvent(event);

    // 5. Notify consumable tracker of encounter start
    if (encounterResult.encounterStarted && this._consumableTracker !== null) {
      this._consumableTracker.onEncounterStart();
    }
    if (encounterResult.encounterStarted && this._combatTracker !== null) {
      const bossName = this._encounterTracker.getCurrentBossName();
      this._combatTracker.onEncounterStart(bossName);
    }
    if (encounterResult.encounterStarted && this._deathTracker !== null) {
      this._deathTracker.onEncounterStart(event.timestamp);
    }
    if (encounterResult.encounterStarted && this._externalsTracker !== null) {
      this._externalsTracker.onEncounterStart(event.timestamp);
    }

    // 6. Determine raid instance from current boss
    if (this._encounterTracker.isInEncounter()) {
      const bossName = this._encounterTracker.getCurrentBossName();
      if (bossName !== null) {
        const instance = getRaidInstance(bossName);
        if (instance !== null) {
          this._lastRaidInstance = instance;
        }
      }
    }

    // 7. Feed to raid separator — use player GUID if source is a player
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

    // 8. Store completed encounters and their participants
    if (encounterResult.encounterEnded && encounterResult.encounter !== null) {
      // Apply fallback difficulty from player count if not detected
      if (encounterResult.encounter.difficulty === null) {
        encounterResult.encounter.difficulty =
          detectDifficultyByPlayerCount(this._players.size);
      }

      // Collect consumable data for this encounter
      if (this._consumableTracker !== null) {
        encounterResult.encounter.consumables =
          this._consumableTracker.onEncounterEnd();
      }
      if (this._combatTracker !== null) {
        encounterResult.encounter.combatStats =
          this._combatTracker.onEncounterEnd();
      }
      if (this._buffUptimeTracker !== null) {
        const startMs = new Date(encounterResult.encounter.startTime).getTime();
        const endMs = new Date(encounterResult.encounter.endTime).getTime();
        const buffUptime = this._buffUptimeTracker.computeUptimeForWindow(startMs, endMs);
        if (buffUptime.size > 0) {
          const record: Record<string, EncounterBuffUptime> = {};
          for (const [guid, uptime] of buffUptime) {
            record[guid] = uptime;
          }
          encounterResult.encounter.buffUptime = record;
        }
      }
      if (this._deathTracker !== null) {
        encounterResult.encounter.deaths = this._deathTracker.onEncounterEnd();
      }
      if (this._externalsTracker !== null) {
        const durationMs = encounterResult.encounter.duration * 1000;
        const endMs = new Date(encounterResult.encounter.endTime).getTime();
        encounterResult.encounter.externals = this._externalsTracker.onEncounterEnd(endMs, durationMs);
      }

      this._pendingEncounter = encounterResult.encounter;
      this._pendingParticipants = encounterResult.participants;

      this._encounters.push(encounterResult.encounter);

      // Accumulate encounter participants
      if (encounterResult.participants !== null) {
        for (const guid of encounterResult.participants) {
          this._encounterParticipants.add(guid);
        }
      }
    }
  }

  finalize(lastTimestamp: number): void {
    const forceResult = this._encounterTracker.forceEnd(lastTimestamp);
    if (forceResult !== null) {
      if (forceResult.encounter.difficulty === null) {
        forceResult.encounter.difficulty = detectDifficultyByPlayerCount(
          this._players.size,
        );
      }

      // Collect consumable data for force-ended encounter
      if (this._consumableTracker !== null) {
        forceResult.encounter.consumables =
          this._consumableTracker.forceEnd() ?? {};
      }
      if (this._combatTracker !== null) {
        forceResult.encounter.combatStats =
          this._combatTracker.forceEnd() ?? {};
      }
      if (this._buffUptimeTracker !== null) {
        const startMs = new Date(forceResult.encounter.startTime).getTime();
        const endMs = new Date(forceResult.encounter.endTime).getTime();
        const buffUptime = this._buffUptimeTracker.computeUptimeForWindow(startMs, endMs);
        if (buffUptime.size > 0) {
          const record: Record<string, EncounterBuffUptime> = {};
          for (const [guid, uptime] of buffUptime) {
            record[guid] = uptime;
          }
          forceResult.encounter.buffUptime = record;
        }
      }
      if (this._deathTracker !== null) {
        forceResult.encounter.deaths = this._deathTracker.forceEnd() ?? [];
      }
      if (this._externalsTracker !== null) {
        const durationMs = forceResult.encounter.duration * 1000;
        const endMs = new Date(forceResult.encounter.endTime).getTime();
        forceResult.encounter.externals = this._externalsTracker.forceEnd(endMs, durationMs) ?? {};
      }

      this._pendingEncounter = forceResult.encounter;
      this._pendingParticipants = forceResult.participants;

      this._encounters.push(forceResult.encounter);

      for (const guid of forceResult.participants) {
        this._encounterParticipants.add(guid);
      }
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

  /** Returns the set of player GUIDs that participated in at least one encounter. */
  getEncounterParticipants(): Set<string> {
    return this._encounterParticipants;
  }

  getCombatPlayerSummaries(): Map<string, PlayerCombatStats> | null {
    return this._combatTracker?.getPlayerSummaries() ?? null;
  }

  getBuffUptimeResults(raidStartMs: number, raidEndMs: number): Map<string, PlayerBuffUptime> | null {
    return this._buffUptimeTracker?.finalize(raidStartMs, raidEndMs) ?? null;
  }

  getDeathSummaries(): Map<string, number> | null {
    return this._deathTracker?.getPlayerSummaries() ?? null;
  }

  getExternalsSummaries(totalEncounterDurationMs: number): Map<string, PlayerExternalsSummary> | null {
    return this._externalsTracker?.getPlayerSummaries(totalEncounterDurationMs) ?? null;
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
