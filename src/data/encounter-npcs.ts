// src/data/encounter-npcs.ts
//
// Encounter-valid NPC IDs per boss encounter.
// Only damage to these NPCs counts as "useful" encounter damage.
// Sourced from uwu-logs (logs_dmg_useful.py USEFUL + ALL_GUIDS dictionaries).
//
// Keys are boss encounter names (matching boss-data.ts names).
// Values are Sets of 6-char uppercase hex NPC IDs (extracted from GUID middle bytes).
//
// If an encounter is NOT in this map, all non-friendly damage is counted (fallback).

/** Maps boss encounter name → Set of valid NPC IDs (6-char hex from GUID). */
const ENCOUNTER_VALID_NPCS_DATA: Record<string, Record<string, string>> = {
  // === Naxxramas ===
  "Anub'Rekhan": {
    "003E54": "Anub'Rekhan",
    "0040BD": "Crypt Guard",
  },
  "Grand Widow Faerlina": {
    "003E51": "Grand Widow Faerlina",
    "004079": "Naxxramas Follower",
    "00407A": "Naxxramas Worshipper",
  },
  "Maexxna": {
    "003E50": "Maexxna",
    "004066": "Web Wrap",
    "00429F": "Maexxna Spiderling",
  },
  "Noth the Plaguebringer": {
    "003E52": "Noth the Plaguebringer",
    "004257": "Plagued Champion",
    "004255": "Plagued Guardian",
    "004258": "Plagued Warrior",
  },
  "Heigan the Unclean": {
    "003E40": "Heigan the Unclean",
  },
  "Loatheb": {
    "003E8B": "Loatheb",
    "003F9E": "Spore",
  },
  "Instructor Razuvious": {
    "003EBD": "Instructor Razuvious",
    "0041A3": "Death Knight Understudy",
  },
  "Gothik the Harvester": {
    "003EBC": "Gothik the Harvester",
  },
  "Four Horsemen": {
    "003EBF": "Sir Zeliek",
    "003EC0": "Thane Korth'azz",
    "007755": "Baron Rivendare",
    "003EC1": "Lady Blaumeux",
  },
  "Patchwerk": {
    "003E9C": "Patchwerk",
  },
  "Grobbulus": {
    "003E3B": "Grobbulus",
    "003FA2": "Fallout Slime",
  },
  "Gluth": {
    "003E3C": "Gluth",
    "003FE8": "Zombie Chow",
  },
  "Thaddius": {
    "003E38": "Thaddius",
    "003E39": "Feugen",
    "003E3A": "Stalagg",
  },
  "Sapphiron": {
    "003E75": "Sapphiron",
  },
  "Kel'Thuzad": {
    "003E76": "Kel'Thuzad",
    "00402C": "Unstoppable Abomination",
    "00402D": "Soul Weaver",
    "004039": "Guardian of Icecrown",
  },

  // === Obsidian Sanctum ===
  "Sartharion": {
    "0070BC": "Sartharion",
    "0076F4": "Tenebron",
    "0076F3": "Shadron",
    "0076F1": "Vesperon",
    "0077B3": "Lava Blaze",
    "0079EE": "Sartharion Twilight Whelp",
    "0079F2": "Acolyte of Shadron",
    "0079F3": "Acolyte of Vesperon",
  },

  // === Eye of Eternity ===
  "Malygos": {
    "0070BB": "Malygos",
    "007584": "Power Spark",
  },

  // === Vault of Archavon ===
  "Archavon the Stone Watcher": {
    "007995": "Archavon the Stone Watcher",
  },
  "Emalon the Storm Watcher": {
    "0084B9": "Emalon the Storm Watcher",
    "0084C9": "Tempest Minion",
  },
  "Koralon the Flame Watcher": {
    "0088B5": "Koralon the Flame Watcher",
  },
  "Toravon the Ice Watcher": {
    "009621": "Toravon the Ice Watcher",
    "009638": "Frozen Orb",
  },

  // === Ulduar ===
  // Note: Flame Leviathan is vehicle-based, no standard NPC whitelist needed.
  "Ignis the Furnace Master": {
    "00815E": "Ignis the Furnace Master",
    "008161": "Iron Construct",
  },
  "Razorscale": {
    "0081A2": "Razorscale",
    "00826C": "Dark Rune Guardian",
    "0082AD": "Dark Rune Watcher",
    "008436": "Dark Rune Sentinel",
  },
  "XT-002 Deconstructor": {
    "00820D": "XT-002 Deconstructor",
    "008231": "Heart of the Deconstructor",
    "0084D4": "Life Spark",
    "008242": "XE-321 Boombot",
    "008240": "XM-024 Pummeller",
    "00823F": "XS-013 Scrapbot",
  },
  "Assembly of Iron": {
    "008059": "Stormcaller Brundir",
    "00809F": "Runemaster Molgeim",
    "008063": "Steelbreaker",
  },
  "Kologarn": {
    "0080A2": "Kologarn",
    "0080A5": "Left Arm",
    "0080A6": "Right Arm",
    "0083E8": "Rubble",
  },
  "Auriaya": {
    "0082EB": "Auriaya",
    "0084F3": "Feral Defender",
    "0084DE": "Sanctum Sentry",
    "0084F2": "Swarming Guardian",
  },
  "Hodir": {
    "00804D": "Hodir",
    "0080AA": "Flash Freeze",
  },
  "Thorim": {
    "008061": "Thorim",
    "008068": "Runic Colossus",
    "00806A": "Iron Ring Guard",
    "00806B": "Iron Honor Guard",
    "008156": "Dark Rune Acolyte",
    "008069": "Ancient Rune Giant",
  },
  "Freya": {
    "00808A": "Freya",
    "0081B3": "Ancient Conservator",
    "0081B2": "Ancient Water Spirit",
    "008096": "Detonating Lasher",
    "0081CC": "Eonar's Gift",
    "008094": "Snaplasher",
    "008097": "Storm Lasher",
    "008190": "Strengthened Iron Roots",
  },
  "Mimiron": {
    "008246": "Mimiron",
    "008298": "Leviathan Mk II",
    "008373": "VX-001",
    "008386": "Aerial Command Unit",
    "008509": "Assault Bot",
    "00843F": "Junk Bot",
    "00842C": "Bomb Bot",
    "008563": "Emergency Fire Bot",
  },
  "General Vezax": {
    "0081F7": "General Vezax",
    "0082F4": "Saronite Animus",
  },
  "Yogg-Saron": {
    "008208": "Yogg-Saron",
    "008462": "Brain of Yogg-Saron",
    "008170": "Guardian of Yogg-Saron",
    "0084C1": "Corruptor Tentacle",
    "0084BF": "Constrictor Tentacle",
    "0084AE": "Crusher Tentacle",
    "008497": "Portal Adds",
    "00831F": "Influence Tentacle",
    "0084C4": "Immortal Guardian",
    "0083B4": "Ruby Consort",
    "0083B7": "Emerald Consort",
    "008299": "Suit of Armor",
  },
  "Algalon the Observer": {
    "008067": "Algalon the Observer",
    "0080BB": "Collapsing Star",
    "008531": "Unleashed Dark Matter",
    "00811C": "Living Constellation",
    "008141": "Dark Matter",
  },

  // === Trial of the Crusader ===
  "Northrend Beasts": {
    "0087EC": "Gormok the Impaler",
    "0087EF": "Dreadscale",
    "008948": "Acidmaw",
    "0087ED": "Icehowl",
    "0087F0": "Snobold Vassal",
  },
  "Gormok the Impaler": {
    "0087EC": "Gormok the Impaler",
    "0087F0": "Snobold Vassal",
  },
  "Acidmaw": {
    "008948": "Acidmaw",
    "0087EF": "Dreadscale",
  },
  "Dreadscale": {
    "008948": "Acidmaw",
    "0087EF": "Dreadscale",
  },
  "Icehowl": {
    "0087ED": "Icehowl",
  },
  "Lord Jaraxxus": {
    "0087DC": "Lord Jaraxxus",
    "0087FD": "Infernal Volcano",
    "008809": "Nether Portal",
    "00880A": "Mistress of Pain",
    "0087FF": "Felflame Infernal",
  },
  // Faction Champions: no whitelist — all PvP targets are valid.
  "Twin Val'kyr": {
    "0086C0": "Eydis Darkbane",
    "0086C1": "Fjola Lightbane",
  },
  "Eydis Darkbane": {
    "0086C0": "Eydis Darkbane",
    "0086C1": "Fjola Lightbane",
  },
  "Fjola Lightbane": {
    "0086C0": "Eydis Darkbane",
    "0086C1": "Fjola Lightbane",
  },
  "Anub'arak": {
    "008704": "Anub'arak",
    "00872D": "Swarm Scarab",
    "00872F": "Nerubian Burrower",
    "00872E": "Frost Sphere",
  },

  // === Onyxia's Lair ===
  "Onyxia": {
    "0027C8": "Onyxia",
    "002BFE": "Onyxian Whelp",
    "008ED1": "Onyxian Lair Guard",
  },

  // === Icecrown Citadel ===
  "Lord Marrowgar": {
    "008F04": "Lord Marrowgar",
    "008F0B": "Bone Spike",
    "009738": "Bone Spike",
    "009737": "Bone Spike",
  },
  "Lady Deathwhisper": {
    "008FF7": "Lady Deathwhisper",
    "009402": "Cult Fanatic",
    "00943D": "Cult Adherent",
    "009655": "Darnavan",
  },
  "Deathbringer Saurfang": {
    "0093B5": "Deathbringer Saurfang",
    "00966C": "Blood Beast",
  },
  "Festergut": {
    "008F12": "Festergut",
  },
  "Rotface": {
    "008F13": "Rotface",
    "009023": "Big Ooze",
    "009021": "Little Ooze",
  },
  "Professor Putricide": {
    "008F46": "Professor Putricide",
    "0092BA": "Gas Cloud",
    "009341": "Volatile Ooze",
  },
  "Blood Prince Council": {
    "009452": "Prince Valanar",
    "009455": "Prince Taldaram",
    "009454": "Prince Keleseth",
    "0095E1": "Dark Nucleus",
    "009636": "Kinetic Bomb",
  },
  "Blood-Queen Lana'thel": {
    "009443": "Blood-Queen Lana'thel",
  },
  "Valithria Dreamwalker": {
    "008FB5": "Valithria Dreamwalker",
    "008FB7": "Blazing Skeleton",
    "009413": "Rot Worm",
    "0093E7": "Suppresser",
    "0093EC": "Risen Archmage",
    "0093FE": "Gluttonous Abomination",
    "00942E": "Blistering Zombie",
  },
  "Sindragosa": {
    "008FF5": "Sindragosa",
    "009074": "Ice Tomb",
  },
  "The Lich King": {
    "008F01": "Val'kyr Shadowguard",
    "008EF5": "The Lich King",
    "008F5D": "Raging Spirit",
    "008F19": "Ice Sphere",
    "009916": "Wicked Spirit",
    "00933F": "Drudge Ghoul",
    "009342": "Shambling Horror",
    "0093A7": "Vile Spirit",
  },

  // === Ruby Sanctum ===
  "Halion": {
    "009BB7": "Halion",
    "009CCE": "Halion",
    "009EE9": "Living Inferno",
    "009EEB": "Living Ember",
  },
  "Baltharus the Warborn": {
    "009B47": "Baltharus the Warborn",
    "009BDB": "Baltharus the Copyborn",
  },
  "Saviana Ragefire": {
    "009B43": "Saviana Ragefire",
  },
  "General Zarithrian": {
    "009B42": "General Zarithrian",
    "009B86": "Onyx Flamecaller",
  },
};

/** Pre-built Map<bossName, Set<npcId>> for O(1) lookups. */
export const ENCOUNTER_VALID_NPCS = new Map<string, Set<string>>(
  Object.entries(ENCOUNTER_VALID_NPCS_DATA).map(([boss, npcs]) => [
    boss,
    new Set(Object.keys(npcs)),
  ]),
);

/**
 * Get the set of valid NPC IDs for a boss encounter.
 * Returns null if no whitelist is defined (fallback to counting all damage).
 */
export function getEncounterValidNpcs(bossName: string): Set<string> | null {
  return ENCOUNTER_VALID_NPCS.get(bossName) ?? null;
}
