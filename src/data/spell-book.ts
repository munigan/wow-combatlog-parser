import type { WowClass, WowSpec } from "../types.js";

/** Maps spell ID (as string) to WowClass */
export const SPELL_TO_CLASS = new Map<string, WowClass>([
  // Warrior
  ["78", "warrior"], // Heroic Strike
  ["47502", "warrior"], // Thunder Clap
  ["47486", "warrior"], // Mortal Strike
  ["23881", "warrior"], // Bloodthirst
  ["47488", "warrior"], // Shield Slam
  ["47498", "warrior"], // Devastate
  ["1680", "warrior"], // Whirlwind
  ["47471", "warrior"], // Execute
  ["47475", "warrior"], // Slam
  ["47465", "warrior"], // Rend
  ["2565", "warrior"], // Shield Block
  ["47520", "warrior"], // Cleave
  ["34428", "warrior"], // Victory Rush
  ["46924", "warrior"], // Bladestorm
  ["46968", "warrior"], // Shockwave

  // Paladin
  ["48782", "paladin"], // Holy Light
  ["48785", "paladin"], // Flash of Light
  ["48825", "paladin"], // Holy Shock
  ["48827", "paladin"], // Avenger's Shield
  ["53385", "paladin"], // Divine Storm
  ["53595", "paladin"], // Hammer of the Righteous
  ["20271", "paladin"], // Judgement of Light
  ["48819", "paladin"], // Consecration
  ["48801", "paladin"], // Exorcism
  ["48806", "paladin"], // Hammer of Wrath
  ["642", "paladin"], // Divine Shield
  ["1044", "paladin"], // Hand of Freedom
  ["53563", "paladin"], // Beacon of Light

  // Hunter
  ["49050", "hunter"], // Aimed Shot
  ["49048", "hunter"], // Multi-Shot
  ["53209", "hunter"], // Chimera Shot
  ["34026", "hunter"], // Kill Command
  ["60053", "hunter"], // Explosive Shot
  ["49052", "hunter"], // Steady Shot
  ["49001", "hunter"], // Serpent Sting
  ["61006", "hunter"], // Kill Shot
  ["49045", "hunter"], // Arcane Shot
  ["3045", "hunter"], // Rapid Fire
  ["63672", "hunter"], // Black Arrow
  ["19574", "hunter"], // Bestial Wrath

  // Rogue
  ["48638", "rogue"], // Sinister Strike
  ["48666", "rogue"], // Mutilate
  ["51690", "rogue"], // Killing Spree
  ["6774", "rogue"], // Slice and Dice
  ["48668", "rogue"], // Eviscerate
  ["48672", "rogue"], // Rupture
  ["51723", "rogue"], // Fan of Knives
  ["57934", "rogue"], // Tricks of the Trade
  ["51713", "rogue"], // Shadow Dance
  ["57993", "rogue"], // Envenom
  ["48657", "rogue"], // Backstab
  ["48676", "rogue"], // Garrote
  ["51662", "rogue"], // Hunger for Blood
  ["13750", "rogue"], // Adrenaline Rush

  // Priest
  ["48071", "priest"], // Flash Heal
  ["48063", "priest"], // Greater Heal
  ["48066", "priest"], // Power Word: Shield
  ["48125", "priest"], // Shadow Word: Pain
  ["48127", "priest"], // Mind Blast
  ["53007", "priest"], // Penance
  ["48089", "priest"], // Circle of Healing
  ["48113", "priest"], // Prayer of Mending
  ["48158", "priest"], // Shadow Word: Death
  ["48160", "priest"], // Vampiric Touch
  ["48156", "priest"], // Mind Flay
  ["48300", "priest"], // Devouring Plague
  ["33206", "priest"], // Pain Suppression
  ["47788", "priest"], // Guardian Spirit
  ["15473", "priest"], // Shadowform

  // Death Knight
  ["49909", "death-knight"], // Icy Touch
  ["49924", "death-knight"], // Death Strike
  ["55271", "death-knight"], // Scourge Strike
  ["55262", "death-knight"], // Heart Strike
  ["51411", "death-knight"], // Howling Blast
  ["51425", "death-knight"], // Obliterate
  ["49930", "death-knight"], // Blood Strike
  ["55268", "death-knight"], // Frost Strike
  ["49895", "death-knight"], // Death Coil
  ["48707", "death-knight"], // Anti-Magic Shell
  ["56815", "death-knight"], // Rune Strike
  ["49194", "death-knight"], // Unholy Blight
  ["49028", "death-knight"], // Dancing Rune Weapon
  ["49206", "death-knight"], // Summon Gargoyle

  // Shaman
  ["49238", "shaman"], // Lightning Bolt
  ["55459", "shaman"], // Chain Heal
  ["49271", "shaman"], // Chain Lightning
  ["60103", "shaman"], // Lava Lash
  ["17364", "shaman"], // Stormstrike
  ["49231", "shaman"], // Earth Shock
  ["49233", "shaman"], // Flame Shock
  ["61301", "shaman"], // Riptide
  ["59159", "shaman"], // Thunderstorm
  ["60043", "shaman"], // Lava Burst
  ["49273", "shaman"], // Healing Wave
  ["49276", "shaman"], // Lesser Healing Wave
  ["49284", "shaman"], // Earth Shield

  // Mage
  ["42833", "mage"], // Fireball
  ["42842", "mage"], // Frostbolt
  ["42897", "mage"], // Arcane Blast
  ["42846", "mage"], // Arcane Missiles
  ["42891", "mage"], // Pyroblast
  ["42914", "mage"], // Ice Lance
  ["55360", "mage"], // Living Bomb
  ["47610", "mage"], // Frostfire Bolt
  ["55342", "mage"], // Mirror Image
  ["44572", "mage"], // Deep Freeze
  ["42940", "mage"], // Blizzard
  ["44781", "mage"], // Arcane Barrage

  // Warlock
  ["47809", "warlock"], // Shadow Bolt
  ["47838", "warlock"], // Incinerate
  ["59164", "warlock"], // Haunt
  ["47811", "warlock"], // Immolate
  ["47813", "warlock"], // Corruption
  ["47843", "warlock"], // Unstable Affliction
  ["47836", "warlock"], // Seed of Corruption
  ["59172", "warlock"], // Chaos Bolt
  ["17962", "warlock"], // Conflagrate
  ["47864", "warlock"], // Curse of Agony
  ["57946", "warlock"], // Life Tap
  ["47855", "warlock"], // Drain Soul
  ["47241", "warlock"], // Metamorphosis

  // Druid
  ["48441", "druid"], // Rejuvenation
  ["18562", "druid"], // Swiftmend
  ["48465", "druid"], // Starfire
  ["48461", "druid"], // Wrath
  ["48564", "druid"], // Mangle
  ["48451", "druid"], // Lifebloom
  ["53251", "druid"], // Wild Growth
  ["50464", "druid"], // Nourish
  ["48463", "druid"], // Moonfire
  ["48468", "druid"], // Insect Swarm
  ["53201", "druid"], // Starfall
  ["48480", "druid"], // Maul
  ["50334", "druid"], // Berserk
]);

/** Maps talent-tree specific spell IDs to WowSpec */
export const SPELL_TO_SPEC = new Map<string, WowSpec>([
  // Warrior
  ["47486", "warrior-arms"], // Mortal Strike
  ["46924", "warrior-arms"], // Bladestorm
  ["23881", "warrior-fury"], // Bloodthirst
  ["47498", "warrior-protection"], // Devastate
  ["47488", "warrior-protection"], // Shield Slam
  ["46968", "warrior-protection"], // Shockwave

  // Paladin
  ["48825", "paladin-holy"], // Holy Shock
  ["53563", "paladin-holy"], // Beacon of Light
  ["48827", "paladin-protection"], // Avenger's Shield
  ["53595", "paladin-protection"], // Hammer of the Righteous
  ["53385", "paladin-retribution"], // Divine Storm

  // Hunter
  ["53209", "hunter-marksmanship"], // Chimera Shot
  ["19574", "hunter-beast-mastery"], // Bestial Wrath
  ["34026", "hunter-beast-mastery"], // Kill Command
  ["60053", "hunter-survival"], // Explosive Shot
  ["63672", "hunter-survival"], // Black Arrow

  // Rogue
  ["48666", "rogue-assassination"], // Mutilate
  ["57993", "rogue-assassination"], // Envenom
  ["51662", "rogue-assassination"], // Hunger for Blood
  ["51690", "rogue-combat"], // Killing Spree
  ["13750", "rogue-combat"], // Adrenaline Rush
  ["51713", "rogue-subtlety"], // Shadow Dance

  // Priest
  ["53007", "priest-discipline"], // Penance
  ["33206", "priest-discipline"], // Pain Suppression
  ["48089", "priest-holy"], // Circle of Healing
  ["47788", "priest-holy"], // Guardian Spirit
  ["48160", "priest-shadow"], // Vampiric Touch
  ["15473", "priest-shadow"], // Shadowform
  ["48300", "priest-shadow"], // Devouring Plague

  // Death Knight
  ["55262", "death-knight-blood"], // Heart Strike
  ["49028", "death-knight-blood"], // Dancing Rune Weapon
  ["51411", "death-knight-frost"], // Howling Blast
  ["55268", "death-knight-frost"], // Frost Strike
  ["55271", "death-knight-unholy"], // Scourge Strike
  ["49194", "death-knight-unholy"], // Unholy Blight
  ["49206", "death-knight-unholy"], // Summon Gargoyle

  // Shaman
  ["59159", "shaman-elemental"], // Thunderstorm
  ["60043", "shaman-elemental"], // Lava Burst
  ["60103", "shaman-enhancement"], // Lava Lash
  ["17364", "shaman-enhancement"], // Stormstrike
  ["61301", "shaman-restoration"], // Riptide
  ["49284", "shaman-restoration"], // Earth Shield

  // Mage
  ["42897", "mage-arcane"], // Arcane Blast
  ["44781", "mage-arcane"], // Arcane Barrage
  ["55360", "mage-fire"], // Living Bomb
  ["42891", "mage-fire"], // Pyroblast
  ["44572", "mage-frost"], // Deep Freeze
  ["42914", "mage-frost"], // Ice Lance

  // Warlock
  ["59164", "warlock-affliction"], // Haunt
  ["47843", "warlock-affliction"], // Unstable Affliction
  ["59172", "warlock-destruction"], // Chaos Bolt
  ["17962", "warlock-destruction"], // Conflagrate
  ["47241", "warlock-demonology"], // Metamorphosis

  // Druid
  ["53201", "druid-balance"], // Starfall
  ["48564", "druid-feral"], // Mangle
  ["50334", "druid-feral"], // Berserk
  ["53251", "druid-restoration"], // Wild Growth
  ["18562", "druid-restoration"], // Swiftmend
]);
