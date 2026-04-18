export const BOSS_DEFAULT_IDLE_MS = 30_000; // 30 seconds

/** Maps NPC ID (6-char uppercase hex from GUID middle bytes) to boss name */
const BOSS_NPC_IDS = new Map<string, string>([
  // Naxxramas
  ["003E54", "Anub'Rekhan"],
  ["003E51", "Grand Widow Faerlina"],
  ["003E50", "Maexxna"],
  ["003E52", "Noth the Plaguebringer"],
  ["003E40", "Heigan the Unclean"],
  ["003E8B", "Loatheb"],
  ["003EBD", "Instructor Razuvious"],
  ["003EBC", "Gothik the Harvester"],
  ["003E9C", "Patchwerk"],
  ["003E3B", "Grobbulus"],
  ["003E3C", "Gluth"],
  ["003E38", "Thaddius"],
  ["003E75", "Sapphiron"],
  ["003E76", "Kel'Thuzad"],
  ["003EBF", "Sir Zeliek"],
  ["003EC0", "Thane Korth'azz"],
  ["007755", "Baron Rivendare"],
  ["003EC1", "Lady Blaumeux"],
  // Obsidian Sanctum
  ["0070BC", "Sartharion"],
  // Eye of Eternity
  ["0070BB", "Malygos"],
  // Vault of Archavon
  ["007995", "Archavon the Stone Watcher"],
  ["0084B9", "Emalon the Storm Watcher"],
  ["0088B5", "Koralon the Flame Watcher"],
  ["009621", "Toravon the Ice Watcher"],
  // Ulduar
  ["008159", "Flame Leviathan"],
  ["00815E", "Ignis the Furnace Master"],
  ["0081A2", "Razorscale"],
  ["00820D", "XT-002 Deconstructor"],
  ["008063", "Steelbreaker"],
  ["00809F", "Runemaster Molgeim"],
  ["008059", "Stormcaller Brundir"],
  ["0080A2", "Kologarn"],
  ["0082EB", "Auriaya"],
  ["00804D", "Hodir"],
  ["008061", "Thorim"],
  ["00808A", "Freya"],
  // Mimiron: all phase NPCs map to the "Mimiron" encounter name.
  // Each phase NPC emits UNIT_DIED when its phase ends; Mimiron himself (008246)
  // emits UNIT_DIED at the end of the kill.
  ["008246", "Mimiron"],
  ["008298", "Mimiron"], // Leviathan Mk II (Phase 1)
  ["008373", "Mimiron"], // VX-001 (Phase 2)
  ["008386", "Mimiron"], // Aerial Command Unit (Phase 3)
  ["0081F7", "General Vezax"],
  ["008208", "Yogg-Saron"],
  ["008067", "Algalon the Observer"],
  // Trial of the Crusader
  ["0087EC", "Gormok the Impaler"],
  ["008938", "Acidmaw"],
  ["0087EF", "Dreadscale"],
  ["0087ED", "Icehowl"],
  ["0087DC", "Lord Jaraxxus"],
  ["0086C1", "Eydis Darkbane"],
  ["0086C0", "Fjola Lightbane"],
  ["008704", "Anub'arak"],
  // Onyxia's Lair
  ["0027C8", "Onyxia"],
  // Icecrown Citadel
  ["008F04", "Lord Marrowgar"],
  ["008FF7", "Lady Deathwhisper"],
  ["0093B5", "Deathbringer Saurfang"],
  ["008F12", "Festergut"],
  ["008F13", "Rotface"],
  ["008F46", "Professor Putricide"],
  ["009452", "Blood Prince Valanar"],
  ["009454", "Blood Prince Keleseth"],
  ["009455", "Blood Prince Taldaram"],
  ["009443", "Blood-Queen Lana'thel"],
  ["008FB5", "Valithria Dreamwalker"],
  ["008FF5", "Sindragosa"],
  ["008EF5", "The Lich King"],
  // Ruby Sanctum
  ["009BA7", "Halion"],
]);

/** Maps boss name to raid instance name */
const BOSS_TO_RAID = new Map<string, string>([
  // Naxxramas
  ["Anub'Rekhan", "Naxxramas"],
  ["Grand Widow Faerlina", "Naxxramas"],
  ["Maexxna", "Naxxramas"],
  ["Noth the Plaguebringer", "Naxxramas"],
  ["Heigan the Unclean", "Naxxramas"],
  ["Loatheb", "Naxxramas"],
  ["Instructor Razuvious", "Naxxramas"],
  ["Gothik the Harvester", "Naxxramas"],
  ["Patchwerk", "Naxxramas"],
  ["Grobbulus", "Naxxramas"],
  ["Gluth", "Naxxramas"],
  ["Thaddius", "Naxxramas"],
  ["Sapphiron", "Naxxramas"],
  ["Kel'Thuzad", "Naxxramas"],
  ["Four Horsemen", "Naxxramas"],
  ["Sir Zeliek", "Naxxramas"],
  ["Thane Korth'azz", "Naxxramas"],
  ["Baron Rivendare", "Naxxramas"],
  ["Lady Blaumeux", "Naxxramas"],
  // Obsidian Sanctum
  ["Sartharion", "Obsidian Sanctum"],
  // Eye of Eternity
  ["Malygos", "Eye of Eternity"],
  // Vault of Archavon
  ["Archavon the Stone Watcher", "Vault of Archavon"],
  ["Emalon the Storm Watcher", "Vault of Archavon"],
  ["Koralon the Flame Watcher", "Vault of Archavon"],
  ["Toravon the Ice Watcher", "Vault of Archavon"],
  // Ulduar
  ["Flame Leviathan", "Ulduar"],
  ["Ignis the Furnace Master", "Ulduar"],
  ["Razorscale", "Ulduar"],
  ["XT-002 Deconstructor", "Ulduar"],
  ["Assembly of Iron", "Ulduar"],
  ["Steelbreaker", "Ulduar"],
  ["Runemaster Molgeim", "Ulduar"],
  ["Stormcaller Brundir", "Ulduar"],
  ["Kologarn", "Ulduar"],
  ["Auriaya", "Ulduar"],
  ["Hodir", "Ulduar"],
  ["Thorim", "Ulduar"],
  ["Freya", "Ulduar"],
  ["Mimiron", "Ulduar"],
  ["General Vezax", "Ulduar"],
  ["Yogg-Saron", "Ulduar"],
  ["Algalon the Observer", "Ulduar"],
  // Trial of the Crusader
  ["Northrend Beasts", "Trial of the Crusader"],
  ["Gormok the Impaler", "Trial of the Crusader"],
  ["Acidmaw", "Trial of the Crusader"],
  ["Dreadscale", "Trial of the Crusader"],
  ["Icehowl", "Trial of the Crusader"],
  ["Lord Jaraxxus", "Trial of the Crusader"],
  ["Faction Champions", "Trial of the Crusader"],
  ["Twin Val'kyr", "Trial of the Crusader"],
  ["Eydis Darkbane", "Trial of the Crusader"],
  ["Fjola Lightbane", "Trial of the Crusader"],
  ["Anub'arak", "Trial of the Crusader"],
  // Onyxia's Lair
  ["Onyxia", "Onyxia's Lair"],
  // Icecrown Citadel
  ["Lord Marrowgar", "Icecrown Citadel"],
  ["Lady Deathwhisper", "Icecrown Citadel"],
  ["Deathbringer Saurfang", "Icecrown Citadel"],
  ["Festergut", "Icecrown Citadel"],
  ["Rotface", "Icecrown Citadel"],
  ["Professor Putricide", "Icecrown Citadel"],
  ["Blood Prince Council", "Icecrown Citadel"],
  ["Blood Prince Valanar", "Icecrown Citadel"],
  ["Blood Prince Keleseth", "Icecrown Citadel"],
  ["Blood Prince Taldaram", "Icecrown Citadel"],
  ["Blood-Queen Lana'thel", "Icecrown Citadel"],
  ["Valithria Dreamwalker", "Icecrown Citadel"],
  ["Sindragosa", "Icecrown Citadel"],
  ["The Lich King", "Icecrown Citadel"],
  // Ruby Sanctum
  ["Halion", "Ruby Sanctum"],
]);

/** Per-boss idle thresholds (ms). Bosses not listed use BOSS_DEFAULT_IDLE_MS. */
const BOSS_IDLE_THRESHOLDS = new Map<string, number>([
  // Long intermission/phase transition bosses
  ["The Lich King", 120_000],
  ["Halion", 120_000],
  ["Anub'arak", 120_000],
  ["Mimiron", 60_000],
  ["Yogg-Saron", 60_000],
  ["Thorim", 60_000],
  ["Kologarn", 60_000],
  ["Malygos", 60_000],
  ["Kel'Thuzad", 60_000],
  ["Razorscale", 60_000],
  ["Northrend Beasts", 60_000],
  ["Gormok the Impaler", 60_000],
  ["Acidmaw", 60_000],
  ["Dreadscale", 60_000],
  ["Icehowl", 60_000],
]);

/** Multi-boss encounter NPC IDs → encounter name */
const MULTI_BOSS_IDS = new Map<string, string>([
  // Four Horsemen
  ["003EBF", "Four Horsemen"],
  ["003EC0", "Four Horsemen"],
  ["007755", "Four Horsemen"],
  ["003EC1", "Four Horsemen"],
  // Assembly of Iron
  ["008063", "Assembly of Iron"],
  ["00809F", "Assembly of Iron"],
  ["008059", "Assembly of Iron"],
  // Blood Prince Council
  ["009452", "Blood Prince Council"],
  ["009454", "Blood Prince Council"],
  ["009455", "Blood Prince Council"],
  // Twin Val'kyr
  ["0086C1", "Twin Val'kyr"],
  ["0086C0", "Twin Val'kyr"],
  // Northrend Beasts
  ["0087EC", "Northrend Beasts"],
  ["008938", "Northrend Beasts"],
  ["0087EF", "Northrend Beasts"],
  ["0087ED", "Northrend Beasts"],
  // Mimiron — phase NPCs are killed sequentially; a true kill requires all four
  // to die. On wipes, the encounter ends via idle timeout (60s).
  ["008298", "Mimiron"], // Leviathan Mk II
  ["008373", "Mimiron"], // VX-001
  ["008386", "Mimiron"], // Aerial Command Unit
  ["008246", "Mimiron"], // Mimiron (final phase cockpit)
]);

/** "Coward" bosses that don't die — they surrender/despawn. Detection uses aura removals. */
export const COWARD_BOSSES = new Set([
  "Kologarn",
  "Hodir",
  "Thorim",
  "Freya",
  "Algalon the Observer",
]);

// === Public API ===

export function getBossName(npcId: string): string | null {
  return BOSS_NPC_IDS.get(npcId) ?? null;
}

export function getRaidInstance(bossName: string): string | null {
  return BOSS_TO_RAID.get(bossName) ?? null;
}

export function getBossIdleThreshold(bossName: string): number {
  return BOSS_IDLE_THRESHOLDS.get(bossName) ?? BOSS_DEFAULT_IDLE_MS;
}

export function isMultiBoss(npcId: string): boolean {
  return MULTI_BOSS_IDS.has(npcId);
}

export function getMultiBossName(npcId: string): string | null {
  return MULTI_BOSS_IDS.get(npcId) ?? null;
}

/**
 * Get all NPC IDs that belong to a multi-boss encounter by encounter name.
 */
export function getMultiBossNpcIds(encounterName: string): string[] {
  const ids: string[] = [];
  for (const [npcId, name] of MULTI_BOSS_IDS) {
    if (name === encounterName) ids.push(npcId);
  }
  return ids;
}

/**
 * Check if a boss name is a "coward" boss (doesn't die, surrenders).
 */
export function isCowardBoss(bossName: string): boolean {
  return COWARD_BOSSES.has(bossName);
}
