import type { WowClass, WowSpec } from "../types.js";

/**
 * Maps spell ID (as string) to WowClass.
 *
 * Includes max-rank and common lower-rank spells, passive/proc abilities,
 * stances, utility spells, and racial-like class abilities. Based on WotLK
 * 3.3.5 spell data cross-referenced with uwu-logs SPELL_BOOK.
 */
export const SPELL_TO_CLASS = new Map<string, WowClass>([
  // ─── Warrior ───────────────────────────────────────────────────────────
  // Core abilities
  ["78", "warrior"], // Heroic Strike (Rank 1)
  ["284", "warrior"], // Heroic Strike (Rank 2)
  ["285", "warrior"], // Heroic Strike (Rank 3)
  ["1608", "warrior"], // Heroic Strike (Rank 4)
  ["11564", "warrior"], // Heroic Strike (Rank 5)
  ["11565", "warrior"], // Heroic Strike (Rank 6)
  ["11566", "warrior"], // Heroic Strike (Rank 7)
  ["11567", "warrior"], // Heroic Strike (Rank 8)
  ["25286", "warrior"], // Heroic Strike (Rank 9)
  ["29707", "warrior"], // Heroic Strike (Rank 10)
  ["30324", "warrior"], // Heroic Strike (Rank 11)
  ["47449", "warrior"], // Heroic Strike (Rank 12)
  ["47450", "warrior"], // Heroic Strike (Rank 13)
  ["1680", "warrior"], // Whirlwind
  ["44949", "warrior"], // Whirlwind (off-hand)
  ["47502", "warrior"], // Thunder Clap (max rank)
  ["47486", "warrior"], // Mortal Strike
  ["23881", "warrior"], // Bloodthirst
  ["47488", "warrior"], // Shield Slam
  ["47498", "warrior"], // Devastate
  ["47471", "warrior"], // Execute (max rank)
  ["47475", "warrior"], // Slam (max rank)
  ["47465", "warrior"], // Rend (max rank)
  ["2565", "warrior"], // Shield Block
  ["47520", "warrior"], // Cleave (max rank)
  ["34428", "warrior"], // Victory Rush
  ["46924", "warrior"], // Bladestorm
  ["46968", "warrior"], // Shockwave
  // Stances
  ["2457", "warrior"], // Battle Stance
  ["2458", "warrior"], // Berserker Stance
  ["71", "warrior"], // Defensive Stance
  // Shouts
  ["47436", "warrior"], // Battle Shout (max rank)
  ["47440", "warrior"], // Commanding Shout (max rank)
  ["2048", "warrior"], // Battle Shout (Rank 1)
  // Utility & procs
  ["29131", "warrior"], // Bloodrage
  ["12721", "warrior"], // Deep Wounds (proc)
  ["12162", "warrior"], // Deep Wounds (Rank 1 proc)
  ["12850", "warrior"], // Deep Wounds (Rank 2 proc)
  ["12868", "warrior"], // Deep Wounds (Rank 3 proc)
  ["18498", "warrior"], // Silenced - Gag Order (proc)
  ["12328", "warrior"], // Sweeping Strikes
  ["52437", "warrior"], // Sudden Death (proc)
  ["46953", "warrior"], // Sword Specialization (proc)
  ["12834", "warrior"], // Flurry (proc)
  ["12292", "warrior"], // Death Wish
  ["12975", "warrior"], // Last Stand
  ["871", "warrior"], // Shield Wall
  ["1719", "warrior"], // Recklessness
  ["20230", "warrior"], // Retaliation
  ["64382", "warrior"], // Shattering Throw
  ["57755", "warrior"], // Heroic Throw
  ["3411", "warrior"], // Intervene
  ["676", "warrior"], // Disarm
  ["6552", "warrior"], // Pummel
  ["7384", "warrior"], // Overpower
  ["7386", "warrior"], // Sunder Armor (max rank)
  ["6572", "warrior"], // Revenge
  ["47474", "warrior"], // Slam! (proc, Bloodsurge)
  ["60503", "warrior"], // Taste for Blood (proc)
  ["56112", "warrior"], // Furious Attacks (debuff)
  ["58874", "warrior"], // Damage Shield (proc)

  // ─── Paladin ───────────────────────────────────────────────────────────
  // Heals
  ["48782", "paladin"], // Holy Light (max rank)
  ["48785", "paladin"], // Flash of Light (max rank)
  ["19750", "paladin"], // Flash of Light (Rank 1)
  ["19939", "paladin"], // Flash of Light (Rank 2)
  ["19940", "paladin"], // Flash of Light (Rank 3)
  ["19941", "paladin"], // Flash of Light (Rank 4)
  ["19942", "paladin"], // Flash of Light (Rank 5)
  ["19943", "paladin"], // Flash of Light (Rank 6)
  ["27137", "paladin"], // Flash of Light (Rank 7)
  // Attacks
  ["48825", "paladin"], // Holy Shock
  ["48827", "paladin"], // Avenger's Shield
  ["53385", "paladin"], // Divine Storm
  ["53595", "paladin"], // Hammer of the Righteous
  ["35395", "paladin"], // Crusader Strike
  ["48819", "paladin"], // Consecration (max rank)
  ["48801", "paladin"], // Exorcism (max rank)
  ["48806", "paladin"], // Hammer of Wrath (max rank)
  // Judgements
  ["20271", "paladin"], // Judgement of Light
  ["53408", "paladin"], // Judgement of Wisdom
  ["20184", "paladin"], // Judgement of Justice
  // Blessings & Hands
  ["642", "paladin"], // Divine Shield
  ["1044", "paladin"], // Hand of Freedom
  ["1022", "paladin"], // Hand of Protection
  ["6940", "paladin"], // Hand of Sacrifice
  ["53654", "paladin"], // Beacon of Light (uwu-logs ID)
  ["53563", "paladin"], // Beacon of Light
  ["54428", "paladin"], // Divine Plea
  ["20925", "paladin"], // Holy Shield (max rank)
  ["31884", "paladin"], // Avenging Wrath
  ["20216", "paladin"], // Divine Favor
  ["31842", "paladin"], // Divine Illumination
  ["48943", "paladin"], // Shadow Resistance Aura
  ["54172", "paladin"], // Divine Storm (uwu-logs ID)
  ["48942", "paladin"], // Devotion Aura (max rank)
  ["48945", "paladin"], // Retribution Aura (max rank)
  ["54043", "paladin"], // Retribution Aura (alt rank)
  ["58597", "paladin"], // Sacred Shield (proc)
  ["53601", "paladin"], // Sacred Shield
  ["20165", "paladin"], // Seal of Light
  ["21084", "paladin"], // Seal of Righteousness
  ["20375", "paladin"], // Seal of Command
  ["42463", "paladin"], // Seal of Vengeance
  ["31801", "paladin"], // Seal of Vengeance (dot)
  ["48952", "paladin"], // Holy Wrath
  ["19752", "paladin"], // Divine Intervention
  ["48947", "paladin"], // Fire Resistance Aura
  ["48941", "paladin"], // Frost Resistance Aura
  ["10326", "paladin"], // Turn Evil
  ["10308", "paladin"], // Hammer of Justice (max rank)
  // Raid buffs & auras (Greater Blessings)
  ["25898", "paladin"], // Greater Blessing of Kings
  ["25899", "paladin"], // Greater Blessing of Sanctuary
  ["48934", "paladin"], // Greater Blessing of Might (max rank)
  ["48938", "paladin"], // Greater Blessing of Wisdom (max rank)
  ["32223", "paladin"], // Crusader Aura
  ["25771", "paladin"], // Forbearance (debuff from DS/BoP/HoP)
  ["31803", "paladin"], // Holy Vengeance (Seal of Vengeance proc dot)
  ["57029", "paladin"], // Glyph of Holy Light (proc)
  // Single-target blessings
  ["48932", "paladin"], // Blessing of Might (max rank)
  ["48936", "paladin"], // Blessing of Wisdom (max rank)
  ["20217", "paladin"], // Blessing of Kings
  ["20911", "paladin"], // Blessing of Sanctuary

  // ─── Hunter ────────────────────────────────────────────────────────────
  ["49050", "hunter"], // Aimed Shot (max rank)
  ["49048", "hunter"], // Multi-Shot (max rank)
  ["14290", "hunter"], // Multi-Shot (Rank 4)
  ["53209", "hunter"], // Chimera Shot
  ["34026", "hunter"], // Kill Command
  ["60053", "hunter"], // Explosive Shot
  ["49052", "hunter"], // Steady Shot
  ["49001", "hunter"], // Serpent Sting (max rank)
  ["61006", "hunter"], // Kill Shot
  ["49045", "hunter"], // Arcane Shot (max rank)
  ["3045", "hunter"], // Rapid Fire
  ["63672", "hunter"], // Black Arrow
  ["19574", "hunter"], // Bestial Wrath
  // Utility
  ["34477", "hunter"], // Misdirection
  ["35079", "hunter"], // Misdirection (proc)
  ["5116", "hunter"], // Concussive Shot
  ["53338", "hunter"], // Hunter's Mark (max rank)
  ["1130", "hunter"], // Hunter's Mark (Rank 1)
  ["14323", "hunter"], // Hunter's Mark (Rank 2)
  ["14324", "hunter"], // Hunter's Mark (Rank 3)
  ["14325", "hunter"], // Hunter's Mark (Rank 4)
  ["3674", "hunter"], // Feign Death (rank 1)
  ["5384", "hunter"], // Feign Death
  ["781", "hunter"], // Disengage
  ["49056", "hunter"], // Viper Sting (max rank)
  ["34490", "hunter"], // Silencing Shot
  ["3034", "hunter"], // Viper Sting
  ["19263", "hunter"], // Deterrence
  ["49067", "hunter"], // Explosive Trap (max rank)
  ["49065", "hunter"], // Immolation Trap (max rank)
  ["60192", "hunter"], // Freezing Arrow
  ["58433", "hunter"], // Volley (max rank)
  ["53301", "hunter"], // Explosive Shot (proc)
  // Pet-related (source is still the hunter)
  ["48990", "hunter"], // Mend Pet (max rank)
  ["53271", "hunter"], // Master's Call
  ["62757", "hunter"], // Call Stabled Pet

  // ─── Rogue ─────────────────────────────────────────────────────────────
  ["48638", "rogue"], // Sinister Strike (max rank)
  ["48666", "rogue"], // Mutilate (max rank)
  ["51690", "rogue"], // Killing Spree
  ["6774", "rogue"], // Slice and Dice
  ["48668", "rogue"], // Eviscerate (max rank)
  ["48672", "rogue"], // Rupture (max rank)
  ["51723", "rogue"], // Fan of Knives
  ["57934", "rogue"], // Tricks of the Trade
  ["57933", "rogue"], // Tricks of the Trade (uwu-logs ID)
  ["51713", "rogue"], // Shadow Dance
  ["57993", "rogue"], // Envenom (max rank)
  ["48657", "rogue"], // Backstab (max rank)
  ["48676", "rogue"], // Garrote (max rank)
  ["51662", "rogue"], // Hunger for Blood
  ["13750", "rogue"], // Adrenaline Rush
  // Utility & procs
  ["1784", "rogue"], // Stealth
  ["26889", "rogue"], // Vanish (max rank)
  ["31224", "rogue"], // Cloak of Shadows
  ["2094", "rogue"], // Blind
  ["1766", "rogue"], // Kick
  ["8647", "rogue"], // Expose Armor
  ["14177", "rogue"], // Cold Blood
  ["36563", "rogue"], // Shadowstep
  ["14185", "rogue"], // Preparation
  ["5277", "rogue"], // Evasion (Rank 1)
  ["26669", "rogue"], // Evasion (Rank 2)
  ["48674", "rogue"], // Deadly Throw (max rank)
  ["35548", "rogue"], // Combat Potency (proc)
  ["57842", "rogue"], // Killing Spree (uwu-logs alt)
  ["14251", "rogue"], // Riposte
  ["13877", "rogue"], // Blade Flurry
  ["8643", "rogue"], // Kidney Shot
  // Poisons
  ["57970", "rogue"], // Deadly Poison IX
  ["57975", "rogue"], // Wound Poison VII
  ["57968", "rogue"], // Instant Poison IX
  ["57965", "rogue"], // Crippling Poison
  ["57978", "rogue"], // Anesthetic Poison

  // ─── Priest ────────────────────────────────────────────────────────────
  ["48071", "priest"], // Flash Heal (max rank)
  ["48063", "priest"], // Greater Heal (max rank)
  ["48066", "priest"], // Power Word: Shield (max rank)
  ["48125", "priest"], // Shadow Word: Pain (max rank)
  ["48127", "priest"], // Mind Blast (max rank)
  ["53007", "priest"], // Penance
  ["53000", "priest"], // Penance (uwu-logs ID)
  ["48089", "priest"], // Circle of Healing
  ["48113", "priest"], // Prayer of Mending (max rank)
  ["48158", "priest"], // Shadow Word: Death (max rank)
  ["48160", "priest"], // Vampiric Touch (max rank)
  ["48156", "priest"], // Mind Flay (max rank)
  ["58381", "priest"], // Mind Flay (uwu-logs alt)
  ["48300", "priest"], // Devouring Plague (max rank)
  ["33206", "priest"], // Pain Suppression
  ["47788", "priest"], // Guardian Spirit
  ["15473", "priest"], // Shadowform
  // Lower ranks & utility
  ["48068", "priest"], // Renew (max rank)
  ["25222", "priest"], // Renew (Rank 10)
  ["25315", "priest"], // Renew (Rank 11)
  ["25221", "priest"], // Renew (Rank 9)
  ["48078", "priest"], // Prayer of Healing (max rank)
  ["48072", "priest"], // Prayer of Healing (Rank 6)
  ["48135", "priest"], // Holy Nova (max rank)
  ["14751", "priest"], // Inner Focus
  ["47753", "priest"], // Divine Aegis (proc)
  ["47930", "priest"], // Grace (proc)
  ["33076", "priest"], // Prayer of Mending (Rank 1)
  ["48120", "priest"], // Binding Heal (max rank)
  ["64844", "priest"], // Divine Hymn
  ["64901", "priest"], // Hymn of Hope
  ["34861", "priest"], // Circle of Healing (Rank 1)
  ["32379", "priest"], // Shadow Word: Death (Rank 1)
  ["10060", "priest"], // Power Infusion
  ["53023", "priest"], // Mind Sear (max rank)
  ["15286", "priest"], // Vampiric Embrace
  ["47585", "priest"], // Dispersion
  ["34914", "priest"], // Vampiric Touch (Rank 1)
  ["6346", "priest"], // Fear Ward
  ["552", "priest"], // Abolish Disease
  ["527", "priest"], // Dispel Magic
  ["48171", "priest"], // Surge of Light (proc Flash Heal)
  // Raid buffs (group versions)
  ["48162", "priest"], // Prayer of Fortitude (max rank)
  ["48074", "priest"], // Prayer of Spirit (max rank)
  ["48170", "priest"], // Prayer of Shadow Protection (max rank)
  // Single-target buff versions
  ["48161", "priest"], // Power Word: Fortitude (max rank)
  ["48073", "priest"], // Divine Spirit (max rank)
  ["48169", "priest"], // Shadow Protection (max rank)

  // ─── Death Knight ──────────────────────────────────────────────────────
  ["49909", "death-knight"], // Icy Touch (max rank)
  ["49924", "death-knight"], // Death Strike (max rank)
  ["55271", "death-knight"], // Scourge Strike (max rank)
  ["55262", "death-knight"], // Heart Strike (max rank)
  ["51411", "death-knight"], // Howling Blast
  ["51425", "death-knight"], // Obliterate (max rank)
  ["49930", "death-knight"], // Blood Strike (max rank)
  ["55268", "death-knight"], // Frost Strike (max rank)
  ["49895", "death-knight"], // Death Coil (max rank)
  ["47528", "death-knight"], // Mind Freeze
  ["48707", "death-knight"], // Anti-Magic Shell
  ["56815", "death-knight"], // Rune Strike
  ["49194", "death-knight"], // Unholy Blight
  ["49028", "death-knight"], // Dancing Rune Weapon
  ["49206", "death-knight"], // Summon Gargoyle
  // Utility & procs
  ["49222", "death-knight"], // Bone Shield
  ["49560", "death-knight"], // Death Grip
  ["49576", "death-knight"], // Death Grip (alt)
  ["55095", "death-knight"], // Frost Fever (proc)
  ["55078", "death-knight"], // Blood Plague (proc)
  ["57623", "death-knight"], // Horn of Winter
  ["49016", "death-knight"], // Hysteria
  ["50526", "death-knight"], // Wandering Plague (proc)
  ["51460", "death-knight"], // Necrosis (proc)
  ["66992", "death-knight"], // Crypt Fever (proc)
  ["50689", "death-knight"], // Obliterate (Rank 1)
  ["45524", "death-knight"], // Chains of Ice
  ["47476", "death-knight"], // Strangulate
  ["48263", "death-knight"], // Frost Presence
  ["48265", "death-knight"], // Unholy Presence
  ["48266", "death-knight"], // Blood Presence
  ["51271", "death-knight"], // Unbreakable Armor
  ["55233", "death-knight"], // Vampiric Blood
  ["48792", "death-knight"], // Icebound Fortitude
  ["49005", "death-knight"], // Mark of Blood
  ["49143", "death-knight"], // Frost Strike (Rank 1)
  ["56817", "death-knight"], // Rune Strike (proc)
  ["66198", "death-knight"], // Obliterate (Rank 4)
  ["66196", "death-knight"], // Frost Strike (Rank 6)
  ["66216", "death-knight"], // Icy Touch (Rank 5)
  ["66188", "death-knight"], // Death Strike (Rank 5)
  ["66962", "death-knight"], // Blood Strike (Rank 6)
  ["66974", "death-knight"], // Death Coil (Rank 5)
  ["61999", "death-knight"], // Raise Ally
  ["46584", "death-knight"], // Raise Dead
  ["42650", "death-knight"], // Army of the Dead

  // ─── Shaman ────────────────────────────────────────────────────────────
  ["49238", "shaman"], // Lightning Bolt (max rank)
  ["55459", "shaman"], // Chain Heal (max rank)
  ["49271", "shaman"], // Chain Lightning (max rank)
  ["60103", "shaman"], // Lava Lash
  ["17364", "shaman"], // Stormstrike
  ["32176", "shaman"], // Stormstrike (uwu-logs ID)
  ["49231", "shaman"], // Earth Shock (max rank)
  ["49233", "shaman"], // Flame Shock (max rank)
  ["61301", "shaman"], // Riptide
  ["59159", "shaman"], // Thunderstorm
  ["60043", "shaman"], // Lava Burst
  ["49273", "shaman"], // Healing Wave (max rank)
  ["49276", "shaman"], // Lesser Healing Wave (max rank)
  ["49284", "shaman"], // Earth Shield (max rank)
  ["379", "shaman"], // Earth Shield (Rank 1)
  // Lower ranks
  ["331", "shaman"], // Healing Wave (Rank 1)
  ["25357", "shaman"], // Healing Wave (Rank 12)
  ["25396", "shaman"], // Healing Wave (Rank 13)
  ["8004", "shaman"], // Lesser Healing Wave (Rank 1)
  ["25420", "shaman"], // Lesser Healing Wave (Rank 7)
  ["55458", "shaman"], // Chain Heal (Rank 4)
  ["1064", "shaman"], // Chain Heal (Rank 1)
  // Utility & procs
  ["52759", "shaman"], // Ancestral Awakening (proc)
  ["51533", "shaman"], // Feral Spirit
  ["25504", "shaman"], // Windfury Attack (proc)
  ["58734", "shaman"], // Magma Totem (max rank)
  ["58704", "shaman"], // Searing Totem (max rank)
  ["51514", "shaman"], // Hex
  ["57994", "shaman"], // Wind Shear
  ["51505", "shaman"], // Lava Burst (Rank 1)
  ["16166", "shaman"], // Elemental Mastery
  ["30823", "shaman"], // Shamanistic Rage
  ["16190", "shaman"], // Mana Tide Totem
  ["55198", "shaman"], // Tidal Force
  ["16188", "shaman"], // Nature's Swiftness (Shaman)
  ["61295", "shaman"], // Riptide (Rank 1)
  ["8042", "shaman"], // Earth Shock (Rank 1)
  ["8050", "shaman"], // Flame Shock (Rank 1)
  ["49236", "shaman"], // Frost Shock (max rank)
  ["8056", "shaman"], // Frost Shock (Rank 1)
  ["51730", "shaman"], // Earthliving Weapon (proc)
  ["58753", "shaman"], // Stoneskin Totem (max rank)
  ["58757", "shaman"], // Healing Stream Totem (max rank)
  ["58745", "shaman"], // Strength of Earth Totem (max rank)
  ["8177", "shaman"], // Grounding Totem
  ["2894", "shaman"], // Fire Elemental Totem
  ["2062", "shaman"], // Earth Elemental Totem

  // ─── Mage ──────────────────────────────────────────────────────────────
  ["42833", "mage"], // Fireball (max rank)
  ["42842", "mage"], // Frostbolt (max rank)
  ["42897", "mage"], // Arcane Blast (max rank)
  ["36032", "mage"], // Arcane Blast (uwu-logs alt)
  ["42846", "mage"], // Arcane Missiles (max rank)
  ["42891", "mage"], // Pyroblast (max rank)
  ["42914", "mage"], // Ice Lance (max rank)
  ["55360", "mage"], // Living Bomb
  ["47610", "mage"], // Frostfire Bolt
  ["55342", "mage"], // Mirror Image
  ["44572", "mage"], // Deep Freeze
  ["42940", "mage"], // Blizzard (max rank)
  ["42938", "mage"], // Blizzard (uwu-logs alt)
  ["44781", "mage"], // Arcane Barrage
  // Utility & procs
  ["12042", "mage"], // Arcane Power
  ["12472", "mage"], // Icy Veins
  ["12654", "mage"], // Ignite (proc)
  ["31661", "mage"], // Dragon's Breath (max rank)
  ["42950", "mage"], // Dragon's Breath (max rank alt)
  ["55802", "mage"], // Brain Freeze (proc)
  ["44544", "mage"], // Fingers of Frost (proc)
  ["12536", "mage"], // Clearcasting (proc)
  ["11129", "mage"], // Combustion
  ["31687", "mage"], // Summon Water Elemental
  ["12051", "mage"], // Evocation
  ["45438", "mage"], // Ice Block
  ["2139", "mage"], // Counterspell
  ["55021", "mage"], // Silenced - Improved Counterspell
  ["42917", "mage"], // Frost Nova (max rank)
  ["42926", "mage"], // Flamestrike (max rank)
  ["42921", "mage"], // Arcane Explosion (max rank)
  ["42844", "mage"], // Cone of Cold (max rank)
  ["43010", "mage"], // Fire Blast (max rank)
  ["43012", "mage"], // Frost Armor (max rank)
  ["43015", "mage"], // Dampen Magic (max rank)
  ["43017", "mage"], // Amplify Magic (max rank)
  ["43020", "mage"], // Mana Shield (max rank)
  ["42985", "mage"], // Conjure Mana Gem (max rank)
  ["12043", "mage"], // Presence of Mind
  ["11426", "mage"], // Ice Barrier (max rank)
  ["43039", "mage"], // Ice Barrier (alt rank)
  ["44457", "mage"], // Living Bomb (Rank 1)
  ["48108", "mage"], // Hot Streak (proc)
  // Raid buffs
  ["43002", "mage"], // Arcane Brilliance (max rank)
  ["42995", "mage"], // Arcane Intellect (max rank)
  ["61316", "mage"], // Dalaran Brilliance
  ["61024", "mage"], // Dalaran Intellect
  ["1953", "mage"], // Blink
  ["42956", "mage"], // Conjure Refreshment (max rank)

  // ─── Warlock ───────────────────────────────────────────────────────────
  ["47809", "warlock"], // Shadow Bolt (max rank)
  ["47838", "warlock"], // Incinerate (max rank)
  ["59164", "warlock"], // Haunt
  ["47811", "warlock"], // Immolate (max rank)
  ["47813", "warlock"], // Corruption (max rank)
  ["47843", "warlock"], // Unstable Affliction (max rank)
  ["47836", "warlock"], // Seed of Corruption (max rank)
  ["59172", "warlock"], // Chaos Bolt
  ["17962", "warlock"], // Conflagrate
  ["47864", "warlock"], // Curse of Agony (max rank)
  ["57946", "warlock"], // Life Tap (max rank)
  ["47855", "warlock"], // Drain Soul (max rank)
  ["47241", "warlock"], // Metamorphosis
  // Lower ranks
  ["27209", "warlock"], // Shadow Bolt (Rank 10)
  ["47808", "warlock"], // Shadow Bolt (Rank 12)
  ["172", "warlock"], // Corruption (Rank 1)
  ["6222", "warlock"], // Corruption (Rank 2)
  ["6223", "warlock"], // Corruption (Rank 3)
  ["7648", "warlock"], // Corruption (Rank 4)
  ["11671", "warlock"], // Corruption (Rank 5)
  ["11672", "warlock"], // Corruption (Rank 6)
  ["25311", "warlock"], // Corruption (Rank 7)
  ["27216", "warlock"], // Corruption (Rank 8)
  // Utility & procs
  ["47860", "warlock"], // Death Coil (Warlock, max rank)
  ["47857", "warlock"], // Drain Life (max rank)
  ["47867", "warlock"], // Curse of Doom (max rank)
  ["47865", "warlock"], // Curse of the Elements (max rank)
  ["50511", "warlock"], // Curse of Weakness (max rank)
  ["11719", "warlock"], // Curse of Tongues
  ["18223", "warlock"], // Curse of Exhaustion
  ["25228", "warlock"], // Soul Link
  ["47893", "warlock"], // Fel Armor (max rank)
  ["47889", "warlock"], // Demon Armor (max rank)
  ["29858", "warlock"], // Soulshatter
  ["47856", "warlock"], // Health Funnel (max rank)
  ["61290", "warlock"], // Shadowflame (max rank)
  ["47815", "warlock"], // Searing Pain (max rank)
  ["47847", "warlock"], // Shadowfury (max rank)
  ["30283", "warlock"], // Shadowfury (Rank 1)
  ["47825", "warlock"], // Soul Fire (max rank)
  ["18288", "warlock"], // Amplify Curse
  ["50796", "warlock"], // Chaos Bolt (Rank 1)
  ["48181", "warlock"], // Haunt (Rank 1)
  ["63321", "warlock"], // Life Tap (Glyph proc)
  ["18708", "warlock"], // Fel Domination
  ["34935", "warlock"], // Backlash (proc)
  ["47231", "warlock"], // Siphon Life (proc)
  ["63108", "warlock"], // Siphon Life (Rank 1 proc)
  ["54049", "warlock"], // Shadow Bite (Felhunter spell)
  ["47988", "warlock"], // Demon Charge (Metamorphosis)

  // ─── Druid ─────────────────────────────────────────────────────────────
  ["48441", "druid"], // Rejuvenation (max rank)
  ["18562", "druid"], // Swiftmend
  ["48465", "druid"], // Starfire (max rank)
  ["48461", "druid"], // Wrath (max rank)
  ["48564", "druid"], // Mangle (Bear, max rank)
  ["48451", "druid"], // Lifebloom (max rank)
  ["53251", "druid"], // Wild Growth
  ["48438", "druid"], // Wild Growth (uwu-logs alt)
  ["50464", "druid"], // Nourish
  ["48463", "druid"], // Moonfire (max rank)
  ["48468", "druid"], // Insect Swarm (max rank)
  ["53201", "druid"], // Starfall
  ["48480", "druid"], // Maul (max rank)
  ["50334", "druid"], // Berserk
  // Lower ranks & utility
  ["26982", "druid"], // Rejuvenation (Rank 12)
  ["26981", "druid"], // Rejuvenation (Rank 11)
  ["25299", "druid"], // Rejuvenation (Rank 13)
  ["774", "druid"], // Rejuvenation (Rank 1)
  ["48443", "druid"], // Regrowth (max rank)
  ["48378", "druid"], // Healing Touch (max rank)
  ["2782", "druid"], // Remove Curse (Druid)
  ["29166", "druid"], // Innervate
  ["22812", "druid"], // Barkskin
  ["22842", "druid"], // Frenzied Regeneration
  ["17116", "druid"], // Nature's Swiftness (Druid)
  ["48566", "druid"], // Mangle (Cat, max rank)
  ["48572", "druid"], // Shred (max rank)
  ["52610", "druid"], // Savage Roar
  ["49800", "druid"], // Rip (max rank)
  ["48577", "druid"], // Ferocious Bite (max rank)
  ["62078", "druid"], // Swipe (Cat)
  ["48562", "druid"], // Swipe (Bear, max rank)
  ["33763", "druid"], // Lifebloom (Rank 1)
  ["48447", "druid"], // Tranquility (max rank)
  ["5229", "druid"], // Enrage (Bear)
  ["33831", "druid"], // Force of Nature (Treants)
  ["48570", "druid"], // Lacerate (max rank)
  ["16857", "druid"], // Faerie Fire (Feral)
  ["770", "druid"], // Faerie Fire
  ["61384", "druid"], // Typhoon (max rank)
  ["33917", "druid"], // Mangle (Bear, Rank 1)
  ["33876", "druid"], // Mangle (Cat, Rank 1)
  ["9005", "druid"], // Pounce (max rank)
  ["49803", "druid"], // Pounce (alt rank)
  ["48574", "druid"], // Rake (max rank)
  ["48579", "druid"], // Ravage (max rank)
  ["33878", "druid"], // Mangle (Bear, Rank 2)
  ["33986", "druid"], // Mangle (Cat, Rank 2)
  ["33987", "druid"], // Mangle (Cat, Rank 3)
  ["24858", "druid"], // Moonkin Form
  ["5487", "druid"], // Bear Form
  ["9634", "druid"], // Dire Bear Form
  ["768", "druid"], // Cat Form
  ["33891", "druid"], // Tree of Life
  // Raid buffs
  ["48470", "druid"], // Gift of the Wild (max rank)
  ["21850", "druid"], // Gift of the Wild (Rank 2)
  ["48469", "druid"], // Mark of the Wild (max rank)
  ["26990", "druid"], // Mark of the Wild (Rank 8)
  ["53307", "druid"], // Thorns (max rank)
  ["53308", "druid"], // Thorns (Rank 7)
  ["49804", "druid"], // Pounce Bleed (Feral)
]);

/** Maps talent-tree specific spell IDs to WowSpec */
export const SPELL_TO_SPEC = new Map<string, WowSpec>([
  // ─── Warrior ───────────────────────────────────────────────────────────
  ["47486", "warrior-arms"], // Mortal Strike
  ["46924", "warrior-arms"], // Bladestorm
  ["12328", "warrior-arms"], // Sweeping Strikes
  ["52437", "warrior-arms"], // Sudden Death
  ["60503", "warrior-arms"], // Taste for Blood
  ["23881", "warrior-fury"], // Bloodthirst
  ["12292", "warrior-fury"], // Death Wish
  ["46953", "warrior-fury"], // Sword Specialization
  ["47498", "warrior-protection"], // Devastate
  ["47488", "warrior-protection"], // Shield Slam
  ["46968", "warrior-protection"], // Shockwave
  ["12975", "warrior-protection"], // Last Stand
  ["58874", "warrior-protection"], // Damage Shield

  // ─── Paladin ───────────────────────────────────────────────────────────
  ["48825", "paladin-holy"], // Holy Shock
  ["53563", "paladin-holy"], // Beacon of Light
  ["53654", "paladin-holy"], // Beacon of Light (uwu-logs)
  ["31842", "paladin-holy"], // Divine Illumination
  ["20216", "paladin-holy"], // Divine Favor
  ["48827", "paladin-protection"], // Avenger's Shield
  ["53595", "paladin-protection"], // Hammer of the Righteous
  ["20925", "paladin-protection"], // Holy Shield
  ["53385", "paladin-retribution"], // Divine Storm
  ["54172", "paladin-retribution"], // Divine Storm (uwu-logs)
  ["35395", "paladin-retribution"], // Crusader Strike

  // ─── Hunter ────────────────────────────────────────────────────────────
  ["53209", "hunter-marksmanship"], // Chimera Shot
  ["34490", "hunter-marksmanship"], // Silencing Shot
  ["19574", "hunter-beast-mastery"], // Bestial Wrath
  ["34026", "hunter-beast-mastery"], // Kill Command
  ["60053", "hunter-survival"], // Explosive Shot
  ["53301", "hunter-survival"], // Explosive Shot (proc)
  ["63672", "hunter-survival"], // Black Arrow

  // ─── Rogue ─────────────────────────────────────────────────────────────
  ["48666", "rogue-assassination"], // Mutilate
  ["57993", "rogue-assassination"], // Envenom
  ["51662", "rogue-assassination"], // Hunger for Blood
  ["14177", "rogue-assassination"], // Cold Blood
  ["51690", "rogue-combat"], // Killing Spree
  ["57842", "rogue-combat"], // Killing Spree (alt)
  ["13750", "rogue-combat"], // Adrenaline Rush
  ["13877", "rogue-combat"], // Blade Flurry
  ["35548", "rogue-combat"], // Combat Potency
  ["14251", "rogue-combat"], // Riposte
  ["51713", "rogue-subtlety"], // Shadow Dance
  ["36563", "rogue-subtlety"], // Shadowstep
  ["14185", "rogue-subtlety"], // Preparation

  // ─── Priest ────────────────────────────────────────────────────────────
  ["53007", "priest-discipline"], // Penance
  ["53000", "priest-discipline"], // Penance (uwu-logs)
  ["33206", "priest-discipline"], // Pain Suppression
  ["47753", "priest-discipline"], // Divine Aegis
  ["47930", "priest-discipline"], // Grace
  ["10060", "priest-discipline"], // Power Infusion
  ["48089", "priest-holy"], // Circle of Healing
  ["34861", "priest-holy"], // Circle of Healing (Rank 1)
  ["47788", "priest-holy"], // Guardian Spirit
  ["64844", "priest-holy"], // Divine Hymn
  ["48160", "priest-shadow"], // Vampiric Touch
  ["34914", "priest-shadow"], // Vampiric Touch (Rank 1)
  ["15473", "priest-shadow"], // Shadowform
  ["48300", "priest-shadow"], // Devouring Plague
  ["15286", "priest-shadow"], // Vampiric Embrace
  ["47585", "priest-shadow"], // Dispersion

  // ─── Death Knight ──────────────────────────────────────────────────────
  ["55262", "death-knight-blood"], // Heart Strike
  ["49028", "death-knight-blood"], // Dancing Rune Weapon
  ["55233", "death-knight-blood"], // Vampiric Blood
  ["49005", "death-knight-blood"], // Mark of Blood
  ["49016", "death-knight-blood"], // Hysteria
  ["51411", "death-knight-frost"], // Howling Blast
  ["55268", "death-knight-frost"], // Frost Strike
  ["49143", "death-knight-frost"], // Frost Strike (Rank 1)
  ["66196", "death-knight-frost"], // Frost Strike (Rank 6)
  ["51271", "death-knight-frost"], // Unbreakable Armor
  ["55271", "death-knight-unholy"], // Scourge Strike
  ["49194", "death-knight-unholy"], // Unholy Blight
  ["49206", "death-knight-unholy"], // Summon Gargoyle
  ["50526", "death-knight-unholy"], // Wandering Plague
  ["51460", "death-knight-unholy"], // Necrosis
  ["66992", "death-knight-unholy"], // Crypt Fever
  ["42650", "death-knight-unholy"], // Army of the Dead

  // ─── Shaman ────────────────────────────────────────────────────────────
  ["59159", "shaman-elemental"], // Thunderstorm
  ["60043", "shaman-elemental"], // Lava Burst
  ["51505", "shaman-elemental"], // Lava Burst (Rank 1)
  ["16166", "shaman-elemental"], // Elemental Mastery
  ["60103", "shaman-enhancement"], // Lava Lash
  ["17364", "shaman-enhancement"], // Stormstrike
  ["32176", "shaman-enhancement"], // Stormstrike (uwu-logs)
  ["51533", "shaman-enhancement"], // Feral Spirit
  ["30823", "shaman-enhancement"], // Shamanistic Rage
  ["25504", "shaman-enhancement"], // Windfury Attack
  ["61301", "shaman-restoration"], // Riptide
  ["61295", "shaman-restoration"], // Riptide (Rank 1)
  ["49284", "shaman-restoration"], // Earth Shield
  ["379", "shaman-restoration"], // Earth Shield (Rank 1)
  ["16190", "shaman-restoration"], // Mana Tide Totem
  ["55198", "shaman-restoration"], // Tidal Force
  ["52759", "shaman-restoration"], // Ancestral Awakening

  // ─── Mage ──────────────────────────────────────────────────────────────
  ["42897", "mage-arcane"], // Arcane Blast
  ["36032", "mage-arcane"], // Arcane Blast (uwu-logs)
  ["44781", "mage-arcane"], // Arcane Barrage
  ["12042", "mage-arcane"], // Arcane Power
  ["12043", "mage-arcane"], // Presence of Mind
  ["55360", "mage-fire"], // Living Bomb
  ["44457", "mage-fire"], // Living Bomb (Rank 1)
  ["42891", "mage-fire"], // Pyroblast
  ["12654", "mage-fire"], // Ignite
  ["11129", "mage-fire"], // Combustion
  ["48108", "mage-fire"], // Hot Streak
  ["31661", "mage-fire"], // Dragon's Breath
  ["42950", "mage-fire"], // Dragon's Breath (alt)
  ["44572", "mage-frost"], // Deep Freeze
  ["42914", "mage-frost"], // Ice Lance
  ["31687", "mage-frost"], // Summon Water Elemental
  ["11426", "mage-frost"], // Ice Barrier
  ["43039", "mage-frost"], // Ice Barrier (alt)
  ["55802", "mage-frost"], // Brain Freeze
  ["44544", "mage-frost"], // Fingers of Frost

  // ─── Warlock ───────────────────────────────────────────────────────────
  ["59164", "warlock-affliction"], // Haunt
  ["48181", "warlock-affliction"], // Haunt (Rank 1)
  ["47843", "warlock-affliction"], // Unstable Affliction
  ["47231", "warlock-affliction"], // Siphon Life (proc)
  ["63108", "warlock-affliction"], // Siphon Life (alt)
  ["59172", "warlock-destruction"], // Chaos Bolt
  ["50796", "warlock-destruction"], // Chaos Bolt (Rank 1)
  ["17962", "warlock-destruction"], // Conflagrate
  ["34935", "warlock-destruction"], // Backlash
  ["47241", "warlock-demonology"], // Metamorphosis
  ["47988", "warlock-demonology"], // Demon Charge
  ["18708", "warlock-demonology"], // Fel Domination
  ["25228", "warlock-demonology"], // Soul Link

  // ─── Druid ─────────────────────────────────────────────────────────────
  ["53201", "druid-balance"], // Starfall
  ["24858", "druid-balance"], // Moonkin Form
  ["33831", "druid-balance"], // Force of Nature
  ["61384", "druid-balance"], // Typhoon
  ["48564", "druid-feral"], // Mangle (Bear)
  ["48566", "druid-feral"], // Mangle (Cat)
  ["33917", "druid-feral"], // Mangle (Bear, Rank 1)
  ["33876", "druid-feral"], // Mangle (Cat, Rank 1)
  ["50334", "druid-feral"], // Berserk
  ["52610", "druid-feral"], // Savage Roar
  ["53251", "druid-restoration"], // Wild Growth
  ["48438", "druid-restoration"], // Wild Growth (uwu-logs)
  ["18562", "druid-restoration"], // Swiftmend
  ["33891", "druid-restoration"], // Tree of Life
  ["17116", "druid-restoration"], // Nature's Swiftness
  ["49804", "druid-feral"], // Pounce Bleed
]);
