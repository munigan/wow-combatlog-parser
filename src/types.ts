// === Enums ===

export type WowClass =
  | "warrior"
  | "paladin"
  | "hunter"
  | "rogue"
  | "priest"
  | "death-knight"
  | "shaman"
  | "mage"
  | "warlock"
  | "druid";

export type WowSpec =
  | "warrior-arms"
  | "warrior-fury"
  | "warrior-protection"
  | "paladin-holy"
  | "paladin-protection"
  | "paladin-retribution"
  | "hunter-beast-mastery"
  | "hunter-marksmanship"
  | "hunter-survival"
  | "rogue-assassination"
  | "rogue-combat"
  | "rogue-subtlety"
  | "priest-discipline"
  | "priest-holy"
  | "priest-shadow"
  | "death-knight-blood"
  | "death-knight-frost"
  | "death-knight-unholy"
  | "shaman-elemental"
  | "shaman-enhancement"
  | "shaman-restoration"
  | "mage-arcane"
  | "mage-fire"
  | "mage-frost"
  | "warlock-affliction"
  | "warlock-demonology"
  | "warlock-destruction"
  | "druid-balance"
  | "druid-feral"
  | "druid-restoration";

export type RaidDifficulty = "10N" | "10H" | "25N" | "25H";

export type EncounterResult = "kill" | "wipe";

export type ConsumableType = "potion" | "mana_potion" | "flame_cap" | "engineering";

export type BuffCategory = "flask" | "battle_elixir" | "guardian_elixir" | "food";

export interface BuffBreakdown {
  spellId: number;
  spellName: string;
  category: BuffCategory;
  uptimeMs: number;
  /** Percentage 0-100, relative to total raid time. */
  uptimePercent: number;
}

export interface PlayerBuffUptime {
  /** Percentage 0-100: any flask OR elixir was active. */
  flaskUptimePercent: number;
  /** Percentage 0-100: any food buff was active. */
  foodUptimePercent: number;
  /** Percentage 0-100: any flask OR elixir active during boss encounters only. */
  encounterFlaskUptimePercent: number;
  /** Percentage 0-100: any food buff active during boss encounters only. */
  encounterFoodUptimePercent: number;
  /** Per-buff breakdown, sorted by uptimeMs descending. */
  buffs: BuffBreakdown[];
}

export interface EncounterBuffUptime {
  /** Percentage 0-100: any flask OR elixir was active during this encounter. */
  flaskUptimePercent: number;
  /** Percentage 0-100: any food buff was active during this encounter. */
  foodUptimePercent: number;
}

export interface ConsumableUse {
  spellId: number;
  spellName: string;
  type: ConsumableType;
  prePot: boolean;
  count: number;
}

export interface ConsumableSummaryEntry {
  spellName: string;
  type: ConsumableType;
  totalUses: number;
  prePotCount: number;
}

export interface PlayerCombatStats {
  /** Useful damage (amount − overkill) to uwu-style encounter targets only. */
  damage: number;
  /** All hostile NPC damage (same filters as useful except no NPC whitelist). */
  damageTotal: number;
  damageTaken: number; // raw damage taken (no overkill subtraction)
}

// === Deaths ===

export interface DeathRecapEvent {
  timestamp: number;
  sourceGuid: string;
  sourceName: string;
  spellId: number | null;
  spellName: string;
  amount: number;
  eventType: string;
}

export interface PlayerDeath {
  playerGuid: string;
  playerName: string;
  timestamp: number;
  timeIntoEncounter: number;
  killingBlow: DeathRecapEvent | null;
  recap: DeathRecapEvent[];
}

// === Externals ===

export interface ExternalBuffUse {
  spellId: number;
  spellName: string;
  sourceGuid: string;
  sourceName: string;
  count: number;
  uptimePercent: number;
  intervals: Array<[number, number]>;
}

export interface PlayerExternalsSummary {
  received: ExternalBuffSummary[];
}

export interface ExternalBuffSummary {
  spellId: number;
  spellName: string;
  totalCount: number;
  uptimePercent: number;
}

// === Common ===

export interface TimeRange {
  startTime: string; // ISO-8601
  endTime: string; // ISO-8601
}

export interface PlayerInfo {
  guid: string;
  name: string;
  class: WowClass | null;
  spec: WowSpec | null;
  /** Raid-wide consumable summary (parseLog only). */
  consumables?: Record<number, ConsumableSummaryEntry>;
  /** Raid-wide damage totals (parseLog only). */
  combatStats?: PlayerCombatStats;
  /** Raid-wide buff uptime data (parseLog only). */
  buffUptime?: PlayerBuffUptime;
  /** Total deaths across all encounters (parseLog only). */
  deathCount?: number;
  /** External buffs received summary (parseLog only). */
  externals?: PlayerExternalsSummary;
}

export interface EncounterSummary {
  bossName: string;
  startTime: string; // ISO-8601
  endTime: string; // ISO-8601
  duration: number; // seconds (decimal, millisecond precision)
  result: EncounterResult;
  difficulty: RaidDifficulty | null;
  /** Per-player consumable usage during this encounter (parseLog only). */
  consumables?: Record<string, ConsumableUse[]>;
  /** Per-player combat stats during this encounter (parseLog only). */
  combatStats?: Record<string, PlayerCombatStats>;
  /** Per-player buff uptime during this encounter (parseLog only). */
  buffUptime?: Record<string, EncounterBuffUptime>;
  /** Player deaths during this encounter (parseLog only). */
  deaths?: PlayerDeath[];
  /** External buffs cast on players during this encounter (parseLog only). */
  externals?: Record<string, ExternalBuffUse[]>;
}

// === Scan API ===

export interface ScanOptions {
  onProgress?: (bytesRead: number, totalBytes?: number) => void;
  /** Maximum decompressed file size in bytes. Default: 1 GB. */
  maxBytes?: number;
}

export interface ScanResult {
  raids: DetectedRaid[];
}

export interface DetectedRaid {
  raidInstance: string | null;
  dates: string[];
  startTime: string; // ISO-8601
  endTime: string; // ISO-8601
  timeRanges: TimeRange[];
  playerCount: number;
  players: PlayerInfo[];
  encounters: EncounterSummary[];
}

// === Parse API ===

export interface ParseOptions {
  onProgress?: (bytesRead: number, totalBytes?: number) => void;
  /** Maximum decompressed file size in bytes. Default: 1 GB. */
  maxBytes?: number;
}

export interface RaidSelection {
  dates: string[];
  startTime: string; // ISO-8601
  endTime: string; // ISO-8601
  timeRanges?: TimeRange[];
}

export interface ParseResult {
  raids: ParsedRaid[];
}

export interface ParsedRaid {
  raidInstance: string | null;
  raidDate: Date;
  players: PlayerInfo[];
  encounters: EncounterSummary[];
  /** Total raid time in ms (first event to last event), used as uptime denominator. */
  raidDurationMs: number;
}

// === Stream Parse API ===

/** Player info scoped to a single encounter. */
export interface EncounterPlayer {
  guid: string;
  name: string;
  class: WowClass | null;
  spec: WowSpec | null;
}

/** A fully-parsed encounter yielded incrementally by parseLogStream(). */
export interface ParsedEncounter extends EncounterSummary {
  players: EncounterPlayer[];
}

/** Summary returned after parseLogStream() completes. */
export interface ParseStreamSummary {
  raidInstance: string | null;
  raidDate: Date;
  raidDurationMs: number;
  players: PlayerInfo[];
}

/** Callbacks for parseLogStream() incremental processing. */
export interface ParseStreamCallbacks {
  /** Called after each boss encounter completes. Awaited if async (backpressure). */
  onEncounter: (encounter: ParsedEncounter) => void | Promise<void>;
  /** Called after the entire stream is processed with raid-wide aggregates. Awaited if async. */
  onComplete: (summary: ParseStreamSummary) => void | Promise<void>;
}

// === Realtime Parser API ===

export interface RealtimeParserOptions {
  /** Year for timestamp parsing (WoW logs have no year). Defaults to current year. */
  year?: number;
}

export interface EncounterStartInfo {
  bossName: string;
  startTime: number;
  raidInstance: string | null;
}

export interface ActiveEncounterInfo {
  bossName: string;
  startTime: number;
  currentDuration: number;
  playerStats: Map<
    string,
    {
      name: string;
      damage: number;
      damageTotal: number;
      dps: number;
      dpsTotal: number;
    }
  >;
  playerCount: number;
}

export interface RealtimeParser {
  feedLine(line: string): void;
  tick(currentTimeMs: number): void;
  onEncounterStart(cb: (info: EncounterStartInfo) => void): void;
  onEncounterEnd(cb: (encounter: ParsedEncounter) => void): void;
  onPlayerDetected(cb: (player: PlayerInfo) => void): void;
  getActiveEncounter(): ActiveEncounterInfo | null;
  getDetectedPlayers(): Map<string, PlayerInfo>;
  destroy(): void;
}
