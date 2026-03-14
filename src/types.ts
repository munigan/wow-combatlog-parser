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
  /** Per-buff breakdown, sorted by uptimeMs descending. */
  buffs: BuffBreakdown[];
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
  damage: number;   // useful damage (raw - overkill), excludes friendly fire
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
}

// === Scan API ===

export interface ScanOptions {
  onProgress?: (bytesRead: number, totalBytes?: number) => void;
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
