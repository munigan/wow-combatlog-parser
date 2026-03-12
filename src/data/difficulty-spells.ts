/** Maps boss name → [10N_spellId, 10H_spellId, 25N_spellId, 25H_spellId] */
export const DIFFICULTY_SPELLS = new Map<
  string,
  [string, string, string, string]
>([
  // Icecrown Citadel
  ["Lord Marrowgar", ["69057", "70826", "69057", "70826"]], // Bone Spike Graveyard
  ["Lady Deathwhisper", ["71001", "72108", "72501", "72502"]], // Death and Decay
  ["Deathbringer Saurfang", ["72378", "72378", "72385", "72385"]], // Blood Nova (10/25 differ)
  ["Festergut", ["69279", "73031", "69279", "73031"]], // Gaseous Blight
  ["Rotface", ["69674", "73022", "69674", "73022"]], // Mutated Infection
  ["Professor Putricide", ["70341", "71966", "70341", "71966"]], // Slime Puddle
  ["Blood Prince Council", ["71405", "71485", "71405", "71485"]], // Shadow Lance
  ["Blood-Queen Lana'thel", ["70838", "71532", "70838", "71532"]], // Vampiric Bite
  ["Sindragosa", ["69762", "73785", "69762", "73785"]], // Unchained Magic
  ["The Lich King", ["70541", "73780", "73779", "73781"]], // Infest
  // Trial of the Crusader
  ["Lord Jaraxxus", ["66532", "68628", "66532", "68628"]], // Fel Fireball
  ["Anub'arak", ["66013", "68509", "67700", "68510"]], // Penetrating Cold
]);
