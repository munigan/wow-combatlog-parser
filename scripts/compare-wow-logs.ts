/**
 * Comparison script: our parser vs wow-logs.co.in vs uwu-logs reference data
 * 
 * Analyzes healing accuracy for 5 healers across 15 Naxx bosses,
 * encounter timing differences, and overkill impact on damage.
 * 
 * Run: npx tsx scripts/compare-wow-logs.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── wow-logs.co.in reference data (scraped from /6658/884xx) ───

interface BossRef {
  damage: Record<string, number>;
  healing: Record<string, number>;
  duration: number;
}

const wowLogsRef: Record<string, BossRef> = {
  "Instructor Razuvious": {
    damage: {"Smalldpskekw":674891,"Mopex":661265,"Yuenmi":658970,"Munigan":622901,"Egaroto":591025,"Choijong":578611,"Delidk":553660,"Badhead":553659,"Mareshall":537252,"Rahkdos":514547,"Rorkino":495004,"Budega":485349,"Kascerata":483493,"Mayt":476991,"Mulltilator":468439,"Gatoajato":464585,"Blitera":451348,"Mallevolence":438169,"Kenpach":368108,"Jbeto":331003,"Pattz":161472,"Degustaroxo":46526,"Crismado":11490},
    healing: {"Jbeto":359767,"Kurjin":327695,"Dotahkiin":173564,"Rahkdos":16582,"Kascerata":16246,"Mallevolence":15414,"Badhead":12837,"Blitera":11689,"Munigan":8420,"Yuenmi":7883,"Degustaroxo":5999,"Delidk":5687,"Gatoajato":2316,"Egaroto":2169,"Smalldpskekw":1826,"Kenpach":1823,"Mayt":1706,"Mopex":1527,"Rorkino":1100,"Mareshall":956,"Pattz":785,"Crismado":729},
    duration: 65.817
  },
  "Gothik the Harvester": {
    damage: {"Egaroto":242934,"Delidk":222984,"Budega":210752,"Crismado":177361,"Mallevolence":168240,"Badhead":150310,"Choijong":143415,"Mayt":137717,"Munigan":137479,"Kascerata":128858,"Mulltilator":126182,"Rorkino":105281,"Jbeto":97132,"Mareshall":93947,"Rahkdos":89458,"Smalldpskekw":85631,"Blitera":77790,"Gatoajato":71971,"Pattz":46044,"Kenpach":36021,"Degustaroxo":29674,"Mopex":25634,"Kurjin":3101,"Dotahkiin":385},
    healing: {"Dotahkiin":49234,"Kurjin":20183,"Yuenmi":10772,"Jbeto":6791,"Degustaroxo":5125,"Pattz":3527,"Mallevolence":2762,"Badhead":2335,"Mopex":2143,"Munigan":1953,"Rorkino":1531,"Rahkdos":1426,"Crismado":868,"Blitera":598,"Gatoajato":520,"Delidk":363,"Smalldpskekw":134},
    duration: 34.397
  },
  "Four Horsemen": {
    damage: {"Munigan":753358,"Rorkino":582692,"Rahkdos":580315,"Crismado":572650,"Mopex":547610,"Blitera":545035,"Badhead":520375,"Mallevolence":508593,"Smalldpskekw":506240,"Budega":502368,"Yuenmi":453960,"Mulltilator":441793,"Delidk":424715,"Jbeto":390958,"Choijong":364045,"Kascerata":354824,"Mayt":308254,"Mareshall":300617,"Gatoajato":280322,"Kenpach":200578,"Pattz":134738,"Egaroto":49230,"Kurjin":1763},
    healing: {"Dotahkiin":422350,"Jbeto":277289,"Kurjin":192756,"Pattz":51236,"Crismado":35888,"Munigan":23609,"Kascerata":18221,"Mallevolence":18089,"Rahkdos":14557,"Yuenmi":12545,"Blitera":12332,"Budega":10477,"Badhead":10234,"Rorkino":7781,"Smalldpskekw":6809,"Mopex":6356,"Kenpach":3039,"Delidk":2646,"Gatoajato":1199,"Mayt":309},
    duration: 123.293
  },
  "Patchwerk": {
    damage: {"Egaroto":815437,"Mopex":768514,"Munigan":752888,"Yuenmi":737421,"Delidk":711213,"Mallevolence":706410,"Smalldpskekw":705235,"Mareshall":703860,"Rahkdos":681140,"Mayt":671128,"Mulltilator":664367,"Badhead":641781,"Choijong":638453,"Rorkino":616031,"Blitera":602509,"Kascerata":591530,"Budega":553201,"Crismado":544602,"Jbeto":367398,"Gatoajato":252766,"Kenpach":206044,"Degustaroxo":18147,"Pattz":4955,"Kurjin":1002},
    healing: {"Kurjin":263387,"Degustaroxo":253554,"Pattz":203538,"Dotahkiin":175509,"Jbeto":56217,"Gatoajato":27553,"Kenpach":10888,"Mallevolence":5390,"Badhead":5341,"Blitera":5292,"Rahkdos":5270,"Munigan":3607,"Crismado":2632,"Yuenmi":1103,"Smalldpskekw":670,"Egaroto":398,"Delidk":39,"Mopex":2},
    duration: 88.718
  },
  "Grobbulus": {
    damage: {"Mopex":645045,"Smalldpskekw":630521,"Rahkdos":555401,"Munigan":543308,"Yuenmi":523857,"Budega":521677,"Egaroto":520445,"Mareshall":515176,"Mayt":469304,"Delidk":447289,"Mulltilator":434948,"Rorkino":423269,"Gatoajato":418841,"Crismado":412468,"Mallevolence":406490,"Blitera":398729,"Badhead":392885,"Kascerata":376884,"Choijong":351404,"Kenpach":331075,"Jbeto":278221,"Kurjin":4288,"Pattz":4281},
    healing: {"Degustaroxo":257331,"Pattz":135032,"Jbeto":133999,"Dotahkiin":132510,"Kurjin":95542,"Kascerata":30355,"Yuenmi":12353,"Rahkdos":9954,"Munigan":8582,"Delidk":5709,"Mallevolence":5463,"Blitera":3618,"Smalldpskekw":3318,"Egaroto":2966,"Badhead":2893,"Mopex":2675,"Budega":2639,"Kenpach":1588,"Rorkino":1556,"Mayt":602,"Choijong":314,"Crismado":304},
    duration: 59.729
  },
  "Gluth": {
    damage: {"Mareshall":499005,"Mopex":489497,"Egaroto":477374,"Munigan":463949,"Gatoajato":458153,"Mayt":446826,"Mulltilator":442914,"Yuenmi":441766,"Delidk":435255,"Smalldpskekw":432269,"Mallevolence":427359,"Kascerata":417447,"Budega":415588,"Choijong":387573,"Badhead":382612,"Blitera":377189,"Rahkdos":372953,"Crismado":370361,"Jbeto":287771,"Rorkino":218509,"Kenpach":193227,"Pattz":131847,"Kurjin":3244},
    healing: {"Dotahkiin":115356,"Jbeto":76469,"Degustaroxo":50444,"Pattz":30470,"Kurjin":27611,"Rahkdos":5865,"Blitera":5731,"Kascerata":5175,"Munigan":4993,"Mallevolence":4657,"Crismado":4538,"Badhead":3717,"Delidk":3356,"Egaroto":1314,"Yuenmi":970,"Kenpach":603,"Gatoajato":549,"Mareshall":528,"Mayt":526,"Mopex":519},
    duration: 68.459
  },
  "Thaddius": {
    damage: {"Mareshall":2153739,"Delidk":1896047,"Mayt":1828467,"Rahkdos":1824230,"Yuenmi":1802164,"Munigan":1659135,"Egaroto":1625155,"Mulltilator":1595488,"Mopex":1541966,"Crismado":1540093,"Rorkino":1532587,"Choijong":1524408,"Smalldpskekw":1471769,"Mallevolence":1438646,"Budega":1425993,"Kascerata":1356397,"Blitera":1308967,"Kenpach":1178438,"Gatoajato":768822,"Badhead":535384,"Pattz":67580,"Kurjin":25744,"Degustaroxo":22492},
    healing: {"Degustaroxo":363211,"Dotahkiin":207175,"Pattz":204924,"Kurjin":174614,"Gatoajato":39849,"Crismado":23134,"Rahkdos":13700,"Blitera":11469,"Kascerata":9968,"Yuenmi":6410,"Munigan":6318,"Budega":6300,"Mallevolence":5745,"Badhead":5676,"Kenpach":2415,"Delidk":2229,"Mopex":1617,"Rorkino":1609,"Egaroto":1536,"Smalldpskekw":1176},
    duration: 149.457
  },
  "Anub'Rekhan": {
    damage: {"Mopex":517416,"Egaroto":474406,"Budega":453817,"Smalldpskekw":446625,"Yuenmi":417675,"Mulltilator":404816,"Kascerata":390335,"Delidk":383607,"Munigan":375024,"Mallevolence":369781,"Crismado":344084,"Mareshall":337085,"Mayt":333784,"Badhead":316020,"Gatoajato":313220,"Blitera":313160,"Choijong":307198,"Rahkdos":295573,"Rorkino":279237,"Jbeto":267706,"Kenpach":250355,"Pattz":165050,"Dotahkiin":9681,"Degustaroxo":952},
    healing: {"Degustaroxo":73878,"Kurjin":64840,"Dotahkiin":36981,"Jbeto":25092,"Mallevolence":6537,"Blitera":5789,"Crismado":4704,"Badhead":4535,"Rahkdos":3141,"Smalldpskekw":1769,"Mopex":1438,"Munigan":1251,"Yuenmi":1020,"Kascerata":1020,"Gatoajato":579,"Rorkino":297},
    duration: 37.678
  },
  "Grand Widow Faerlina": {
    damage: {"Munigan":596664,"Mopex":530630,"Yuenmi":499688,"Smalldpskekw":490962,"Delidk":476052,"Rahkdos":463685,"Choijong":441678,"Mareshall":409378,"Rorkino":405318,"Mallevolence":396916,"Kascerata":394938,"Budega":380602,"Egaroto":377655,"Badhead":347934,"Gatoajato":342204,"Jbeto":338003,"Mulltilator":307470,"Crismado":297556,"Mayt":283429,"Kenpach":282416,"Blitera":236063,"Pattz":222088,"Kurjin":1152},
    healing: {"Degustaroxo":351306,"Kurjin":213804,"Dotahkiin":124517,"Jbeto":85347,"Yuenmi":18401,"Kascerata":16661,"Pattz":14116,"Mallevolence":9713,"Munigan":9564,"Crismado":9226,"Rahkdos":8289,"Delidk":5744,"Badhead":5409,"Smalldpskekw":4533,"Blitera":2501,"Mopex":2058,"Mareshall":1488,"Kenpach":1206,"Rorkino":1100,"Mayt":1054,"Egaroto":998,"Gatoajato":248},
    duration: 51.276
  },
  "Maexxna": {
    damage: {"Mopex":551360,"Smalldpskekw":471120,"Yuenmi":429794,"Mayt":427434,"Egaroto":424779,"Mulltilator":414786,"Gatoajato":407710,"Mareshall":405987,"Badhead":380403,"Munigan":379047,"Kascerata":366180,"Delidk":360782,"Rahkdos":353025,"Crismado":346585,"Mallevolence":333854,"Rorkino":320328,"Blitera":292961,"Choijong":282571,"Kenpach":233897,"Jbeto":188987,"Pattz":133463,"Budega":90362,"Degustaroxo":16285,"Kurjin":6595},
    healing: {"Degustaroxo":130351,"Jbeto":58539,"Kurjin":39969,"Dotahkiin":36054,"Yuenmi":11229,"Blitera":4723,"Rahkdos":4229,"Badhead":3585,"Mallevolence":3297,"Munigan":2736,"Egaroto":2043,"Crismado":1943,"Smalldpskekw":1806,"Delidk":1437,"Kenpach":1206,"Mopex":1059,"Rorkino":918,"Pattz":758,"Mayt":527},
    duration: 51.588
  },
  "Noth the Plaguebringer": {
    damage: {"Egaroto":592701,"Smalldpskekw":564489,"Mopex":552897,"Yuenmi":518708,"Rorkino":483127,"Rahkdos":476643,"Gatoajato":452664,"Mareshall":445237,"Munigan":438234,"Kascerata":422427,"Mallevolence":419032,"Delidk":414850,"Mayt":407547,"Budega":389186,"Mulltilator":377012,"Badhead":349457,"Crismado":342200,"Blitera":335025,"Choijong":331820,"Kenpach":310181,"Jbeto":291339,"Pattz":180894,"Kurjin":3689},
    healing: {"Degustaroxo":207342,"Dotahkiin":184926,"Jbeto":140156,"Kurjin":116142,"Yuenmi":30933,"Kascerata":28608,"Crismado":17738,"Blitera":11903,"Mopex":11168,"Munigan":10341,"Pattz":9797,"Mallevolence":8557,"Rahkdos":8435,"Badhead":6905,"Budega":6880,"Rorkino":4610,"Egaroto":3452,"Delidk":3183,"Smalldpskekw":1691,"Kenpach":1206,"Mareshall":807,"Gatoajato":678,"Mayt":527},
    duration: 60.009
  },
  "Heigan the Unclean": {
    damage: {"Mopex":576839,"Egaroto":574239,"Mareshall":539873,"Delidk":534167,"Rorkino":508842,"Yuenmi":502868,"Smalldpskekw":495176,"Rahkdos":485003,"Kascerata":464461,"Gatoajato":462949,"Munigan":448588,"Mulltilator":424801,"Crismado":422967,"Budega":412967,"Blitera":408469,"Mallevolence":372904,"Mayt":351152,"Badhead":341569,"Choijong":325656,"Kenpach":311922,"Jbeto":283936,"Degustaroxo":21604,"Pattz":4195,"Kurjin":2746},
    healing: {"Degustaroxo":254794,"Pattz":93052,"Dotahkiin":74315,"Jbeto":70262,"Kurjin":62826,"Munigan":10439,"Crismado":7553,"Kascerata":3134,"Rorkino":2989,"Yuenmi":2773,"Badhead":2753,"Rahkdos":2599,"Smalldpskekw":1932,"Mallevolence":1348,"Mopex":883,"Delidk":711,"Gatoajato":579,"Mayt":527,"Blitera":501,"Kenpach":137},
    duration: 58.579
  },
  "Loatheb": {
    damage: {"Egaroto":1205043,"Mareshall":1126798,"Yuenmi":1106488,"Delidk":1104386,"Gatoajato":1085202,"Mallevolence":1045778,"Munigan":1041585,"Choijong":1026271,"Crismado":1025746,"Rahkdos":1013488,"Blitera":1011563,"Smalldpskekw":1005018,"Mopex":986245,"Rorkino":960400,"Kascerata":912481,"Badhead":899336,"Budega":774353,"Mulltilator":757704,"Mayt":734164,"Kenpach":600671,"Jbeto":591924,"Kurjin":59447,"Pattz":36842,"Degustaroxo":10838},
    healing: {"Jbeto":110558,"Dotahkiin":106925,"Degustaroxo":80408,"Kurjin":56855,"Pattz":53753,"Crismado":26420,"Rahkdos":13714,"Kascerata":12542,"Badhead":8417,"Blitera":8134,"Mallevolence":6449,"Delidk":5117,"Smalldpskekw":5048,"Budega":4065,"Munigan":3603,"Yuenmi":3244,"Mopex":2716,"Kenpach":2412,"Rorkino":1940,"Egaroto":1763,"Mareshall":1570,"Gatoajato":1158,"Mayt":944},
    duration: 129.903
  },
  "Sapphiron": {
    damage: {"Mopex":819884,"Munigan":798800,"Egaroto":774930,"Rahkdos":731390,"Mareshall":702623,"Yuenmi":691204,"Smalldpskekw":674733,"Gatoajato":651824,"Rorkino":648891,"Delidk":630029,"Badhead":599770,"Mallevolence":580042,"Budega":572448,"Crismado":568919,"Kascerata":547367,"Blitera":546054,"Mulltilator":538370,"Mayt":479756,"Choijong":471039,"Jbeto":393684,"Kenpach":369627,"Degustaroxo":15903,"Pattz":15894,"Kurjin":6133},
    healing: {"Degustaroxo":724449,"Dotahkiin":351155,"Jbeto":348053,"Kurjin":258884,"Pattz":158907,"Crismado":119530,"Badhead":43126,"Blitera":42238,"Kascerata":37722,"Rahkdos":34865,"Munigan":23041,"Mallevolence":20678,"Delidk":13189,"Yuenmi":12042,"Kenpach":9566,"Smalldpskekw":8587,"Mopex":8191,"Egaroto":7241,"Rorkino":6993,"Mareshall":4484,"Mayt":3869,"Gatoajato":2265},
    duration: 106.868
  },
  "Kel'Thuzad": {
    damage: {"Smalldpskekw":1079969,"Mareshall":939323,"Munigan":898527,"Egaroto":883634,"Gatoajato":878401,"Mopex":876573,"Mayt":849137,"Blitera":845514,"Delidk":843715,"Rahkdos":832842,"Badhead":825981,"Mallevolence":718921,"Crismado":714305,"Mulltilator":696823,"Rorkino":666905,"Choijong":605237,"Kascerata":591498,"Budega":512952,"Kenpach":488367,"Jbeto":457619,"Pattz":265514,"Degustaroxo":19584,"Kurjin":4083,"Yuenmi":1434},
    healing: {"Degustaroxo":353015,"Dotahkiin":221342,"Yuenmi":215744,"Jbeto":210882,"Kurjin":178580,"Crismado":48491,"Kascerata":33413,"Badhead":23075,"Blitera":22987,"Munigan":19794,"Rahkdos":19583,"Mallevolence":18394,"Pattz":11951,"Rorkino":5370,"Mopex":5215,"Smalldpskekw":5056,"Egaroto":4622,"Delidk":3638,"Kenpach":2413,"Budega":1829,"Gatoajato":1156,"Mareshall":1056},
    duration: 127.912
  }
};

// ─── Load our result.json ───

const resultPath = path.join(__dirname, '..', 'result.json');
const resultData = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
const raid = resultData[0];

interface OurEncounter {
  bossName: string;
  duration: number;
  combatStats: Record<string, { damage: number; healing: number }>;
}

const ourEncounters: Record<string, OurEncounter> = {};
for (const enc of raid.encounters) {
  ourEncounters[enc.bossName] = enc;
}

// ─── Healers to analyze ───

const HEALERS = ['Degustaroxo', 'Kurjin', 'Dotahkiin', 'Pattz', 'Jbeto'];
const HEALER_CLASSES: Record<string, string> = {
  'Degustaroxo': 'Disc Priest',
  'Kurjin': 'Holy Paladin',
  'Dotahkiin': 'Resto Shaman',
  'Pattz': 'Holy Paladin',
  'Jbeto': 'Holy Paladin',
};

// ─── Boss name mapping (our parser → wow-logs) ───

const BOSS_MAP: Record<string, string> = {
  'Four Horsemen': 'Four Horsemen',  // wow-logs uses "The Four Horsemen"
};

function getRefBoss(ourName: string): BossRef | undefined {
  const mappedName = BOSS_MAP[ourName] || ourName;
  return wowLogsRef[mappedName];
}

// ─── Analysis functions ───

function pctDelta(ours: number, ref: number): number {
  if (ref === 0) return ours === 0 ? 0 : Infinity;
  return ((ours - ref) / ref) * 100;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

// ─── 1. HEALER COMPARISON TABLE ───

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('  TASK 1: HEALER HEALING COMPARISON (our parser vs wow-logs.co.in)');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

const bossOrder = [
  'Instructor Razuvious', 'Gothik the Harvester', 'Four Horsemen',
  'Patchwerk', 'Grobbulus', 'Gluth', 'Thaddius',
  "Anub'Rekhan", 'Grand Widow Faerlina', 'Maexxna',
  'Noth the Plaguebringer', 'Heigan the Unclean', 'Loatheb',
  'Sapphiron', "Kel'Thuzad"
];

interface ComparisonRow {
  boss: string;
  healer: string;
  ours: number;
  ref: number;
  delta: number;
  deltaPct: number;
}

const allComparisons: ComparisonRow[] = [];
const healerTotals: Record<string, { ours: number; ref: number; count: number }> = {};

for (const healer of HEALERS) {
  healerTotals[healer] = { ours: 0, ref: 0, count: 0 };
}

for (const bossName of bossOrder) {
  const ourEnc = ourEncounters[bossName];
  const refBoss = getRefBoss(bossName);
  
  if (!ourEnc || !refBoss) {
    console.log(`  SKIP: ${bossName} (missing data)`);
    continue;
  }
  
  for (const healer of HEALERS) {
    const oursVal = ourEnc.combatStats?.[healer]?.healing ?? 0;
    const refVal = refBoss.healing[healer] ?? 0;
    
    // Skip if both are 0 or healer not present in either
    if (oursVal === 0 && refVal === 0) continue;
    
    const delta = oursVal - refVal;
    const deltaPct = pctDelta(oursVal, refVal);
    
    allComparisons.push({ boss: bossName, healer, ours: oursVal, ref: refVal, delta, deltaPct });
    
    healerTotals[healer].ours += oursVal;
    healerTotals[healer].ref += refVal;
    healerTotals[healer].count++;
  }
}

// Print table
console.log('  Boss                    | Healer       | Ours       | Wow-Logs   | Delta      | Delta%');
console.log('  ─────────────────────── | ──────────── | ────────── | ────────── | ────────── | ──────');

let currentBoss = '';
for (const row of allComparisons) {
  const bossCol = row.boss === currentBoss ? '                          ' : `  ${row.boss.padEnd(24)}`;
  currentBoss = row.boss;
  
  const flag = Math.abs(row.deltaPct) > 10 ? ' ⚠' : Math.abs(row.deltaPct) > 5 ? ' !' : '  ';
  
  console.log(
    `${bossCol}| ${row.healer.padEnd(13)}| ${fmt(row.ours).padStart(10)} | ${fmt(row.ref).padStart(10)} | ${fmt(row.delta).padStart(10)} | ${fmtPct(row.deltaPct).padStart(7)}${flag}`
  );
}

// Per-healer totals
console.log('\n  ─── Per-Healer Totals (across all 15 bosses) ───\n');
console.log('  Healer          | Class          | Ours Total   | Ref Total    | Delta%  | Bosses');
console.log('  ─────────────── | ────────────── | ──────────── | ──────────── | ─────── | ──────');

for (const healer of HEALERS) {
  const t = healerTotals[healer];
  const deltaPct = pctDelta(t.ours, t.ref);
  console.log(
    `  ${healer.padEnd(17)} | ${(HEALER_CLASSES[healer] || '?').padEnd(15)}| ${fmt(t.ours).padStart(12)} | ${fmt(t.ref).padStart(12)} | ${fmtPct(deltaPct).padStart(7)} | ${t.count}`
  );
}

// ─── 2. ENCOUNTER TIMING INVESTIGATION ───

console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
console.log('  TASK 2: ENCOUNTER TIMING COMPARISON');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

console.log('  Boss                    | Our Duration | WL Duration | Delta (s) | Delta%');
console.log('  ─────────────────────── | ──────────── | ─────────── | ───────── | ──────');

interface TimingRow {
  boss: string;
  ourDuration: number;
  refDuration: number;
  deltaSec: number;
  deltaPct: number;
}

const timingRows: TimingRow[] = [];

for (const bossName of bossOrder) {
  const ourEnc = ourEncounters[bossName];
  const refBoss = getRefBoss(bossName);
  
  if (!ourEnc || !refBoss) continue;
  
  const deltaSec = ourEnc.duration - refBoss.duration;
  const deltaPct = pctDelta(ourEnc.duration, refBoss.duration);
  
  timingRows.push({ boss: bossName, ourDuration: ourEnc.duration, refDuration: refBoss.duration, deltaSec, deltaPct });
  
  console.log(
    `  ${bossName.padEnd(24)} | ${ourEnc.duration.toFixed(3).padStart(12)} | ${refBoss.duration.toFixed(3).padStart(11)} | ${deltaSec.toFixed(3).padStart(9)} | ${fmtPct(deltaPct).padStart(7)}`
  );
}

// Correlation analysis: does healing gap correlate with timing gap?
console.log('\n  ─── Timing vs Healing Gap Correlation ───');
console.log('  (Are non-absorb healer gaps explained by duration differences?)\n');
console.log('  Boss                    | Duration Δ% | Dotahkiin Δ% | Kurjin Δ%');
console.log('  ─────────────────────── | ─────────── | ──────────── | ─────────');

for (const bossName of bossOrder) {
  const timing = timingRows.find(t => t.boss === bossName);
  const dotRow = allComparisons.find(c => c.boss === bossName && c.healer === 'Dotahkiin');
  const kurRow = allComparisons.find(c => c.boss === bossName && c.healer === 'Kurjin');
  
  if (!timing) continue;
  
  const dotPct = dotRow ? fmtPct(dotRow.deltaPct).padStart(12) : '         N/A';
  const kurPct = kurRow ? fmtPct(kurRow.deltaPct).padStart(9) : '      N/A';
  
  console.log(
    `  ${bossName.padEnd(24)} | ${fmtPct(timing.deltaPct).padStart(11)} | ${dotPct} | ${kurPct}`
  );
}

// ─── 3. OVERKILL INVESTIGATION ───

console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
console.log('  TASK 3: OVERKILL INVESTIGATION');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');
console.log('  Our parser subtracts overkill from damage. wow-logs "Amount" column may include it.');
console.log('  Comparing top 5 DPS on Thaddius, Patchwerk, and Loatheb.\n');

const OVERKILL_BOSSES = ['Thaddius', 'Patchwerk', 'Loatheb'];
const TOP_DPS = ['Egaroto', 'Mopex', 'Mareshall', 'Delidk', 'Smalldpskekw'];

for (const bossName of OVERKILL_BOSSES) {
  const ourEnc = ourEncounters[bossName];
  const refBoss = getRefBoss(bossName);
  
  if (!ourEnc || !refBoss) continue;
  
  console.log(`  ── ${bossName} ──`);
  console.log('  Player        | Ours (−overkill) | Wow-Logs     | Delta      | Delta%');
  console.log('  ───────────── | ──────────────── | ──────────── | ────────── | ──────');
  
  for (const player of TOP_DPS) {
    const oursVal = ourEnc.combatStats?.[player]?.damage ?? 0;
    const refVal = refBoss.damage[player] ?? 0;
    
    if (oursVal === 0 && refVal === 0) continue;
    
    const delta = oursVal - refVal;
    const deltaPct = pctDelta(oursVal, refVal);
    
    console.log(
      `  ${player.padEnd(15)}| ${fmt(oursVal).padStart(16)} | ${fmt(refVal).padStart(12)} | ${fmt(delta).padStart(10)} | ${fmtPct(deltaPct).padStart(7)}`
    );
  }
  console.log();
}

// ─── Summary statistics ───

console.log('\n═══════════════════════════════════════════════════════════════════════════════');
console.log('  SUMMARY STATISTICS');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

// Healing accuracy by healer
for (const healer of HEALERS) {
  const rows = allComparisons.filter(c => c.healer === healer);
  if (rows.length === 0) continue;
  
  const absPcts = rows.map(r => Math.abs(r.deltaPct));
  const avgAbsPct = absPcts.reduce((a, b) => a + b, 0) / absPcts.length;
  const maxAbsPct = Math.max(...absPcts);
  const maxBoss = rows[absPcts.indexOf(maxAbsPct)].boss;
  const withinFivePct = rows.filter(r => Math.abs(r.deltaPct) <= 5).length;
  const withinTenPct = rows.filter(r => Math.abs(r.deltaPct) <= 10).length;
  
  console.log(`  ${healer} (${HEALER_CLASSES[healer]}):`);
  console.log(`    Avg |delta|: ${avgAbsPct.toFixed(2)}%`);
  console.log(`    Max |delta|: ${maxAbsPct.toFixed(2)}% (${maxBoss})`);
  console.log(`    Within ±5%: ${withinFivePct}/${rows.length} | Within ±10%: ${withinTenPct}/${rows.length}`);
  console.log();
}

// Duration accuracy
const durationAbsPcts = timingRows.map(r => Math.abs(r.deltaPct));
const avgDurationDelta = durationAbsPcts.reduce((a, b) => a + b, 0) / durationAbsPcts.length;
console.log(`  Duration accuracy: avg |delta| = ${avgDurationDelta.toFixed(3)}%`);
console.log(`    Exact matches (delta < 0.01s): ${timingRows.filter(t => Math.abs(t.deltaSec) < 0.01).length}/${timingRows.length}`);
console.log(`    Within 1s: ${timingRows.filter(t => Math.abs(t.deltaSec) < 1).length}/${timingRows.length}`);


// ─── 4. THREE-WAY COMPARISON: Ours vs wow-logs vs uwu-logs ───

const uwuLogsRef: Record<string, Record<string, number>> = {
  "Instructor Razuvious": {"Smalldpskekw":1826,"Mopex":1527,"Yuenmi":7883,"Munigan":11427,"Egaroto":2169,"Mareshall":956,"Delidk":5687,"Choijong":0,"Rahkdos":16582,"Mallevolence":15414,"Budega":0,"Badhead":12837,"Mayt":1706,"Gatoajato":2316,"Kascerata":16246,"Blitera":11689,"Rorkino":1100,"Mulltilator":0,"Kenpach":1823,"Jbeto":359767,"Pattz":3512,"Degustaroxo":5999,"Crismado":729,"Dotahkiin":171667,"Kurjin":327695},
  "Gothik the Harvester": {"Egaroto":0,"Delidk":363,"Budega":0,"Mallevolence":2762,"Crismado":868,"Badhead":1824,"Choijong":0,"Mayt":0,"Kascerata":0,"Munigan":651,"Mulltilator":0,"Jbeto":6791,"Rorkino":398,"Mareshall":0,"Rahkdos":373,"Smalldpskekw":0,"Blitera":418,"Gatoajato":0,"Pattz":1965,"Kenpach":0,"Degustaroxo":5217,"Mopex":0,"Kurjin":14189,"Dotahkiin":11634,"Yuenmi":10063},
  "Four Horsemen": {"Munigan":25705,"Mallevolence":19383,"Rorkino":7781,"Rahkdos":13575,"Crismado":35888,"Mopex":6007,"Blitera":11824,"Badhead":9739,"Smalldpskekw":6460,"Budega":7289,"Yuenmi":12545,"Mulltilator":0,"Delidk":2646,"Jbeto":277289,"Choijong":0,"Kascerata":18221,"Mayt":309,"Mareshall":0,"Gatoajato":1199,"Kenpach":3039,"Pattz":51236,"Egaroto":0,"Kurjin":192175,"Dotahkiin":419594,"Degustaroxo":0},
  "Patchwerk": {"Egaroto":398,"Mopex":2,"Munigan":3607,"Yuenmi":559,"Mallevolence":5390,"Delidk":39,"Smalldpskekw":670,"Mareshall":0,"Rahkdos":5028,"Mayt":0,"Mulltilator":0,"Badhead":5341,"Choijong":0,"Rorkino":0,"Blitera":4784,"Kascerata":0,"Budega":3009,"Crismado":2632,"Jbeto":56217,"Gatoajato":27819,"Kenpach":10888,"Degustaroxo":266851,"Pattz":202437,"Kurjin":252587,"Dotahkiin":173267},
  "Grobbulus": {"Mopex":2675,"Smalldpskekw":2268,"Rahkdos":9628,"Munigan":9114,"Yuenmi":12353,"Budega":2639,"Egaroto":2966,"Mareshall":0,"Mayt":602,"Mallevolence":5343,"Delidk":12551,"Mulltilator":0,"Rorkino":1556,"Gatoajato":0,"Crismado":304,"Blitera":3117,"Badhead":2893,"Kascerata":30355,"Choijong":314,"Kenpach":1588,"Jbeto":142605,"Kurjin":95542,"Pattz":137799,"Dotahkiin":130564,"Degustaroxo":241719},
  "Gluth": {"Mareshall":528,"Mopex":519,"Egaroto":1314,"Munigan":3602,"Gatoajato":549,"Mayt":526,"Mallevolence":4158,"Mulltilator":0,"Yuenmi":970,"Delidk":3356,"Smalldpskekw":0,"Kascerata":5175,"Budega":0,"Choijong":0,"Badhead":2699,"Rahkdos":4867,"Crismado":4538,"Blitera":4879,"Jbeto":66605,"Rorkino":0,"Kenpach":603,"Kurjin":27611,"Pattz":37781,"Dotahkiin":110109,"Degustaroxo":50909},
  "Thaddius": {"Mareshall":0,"Delidk":2229,"Mayt":0,"Rahkdos":13261,"Yuenmi":6410,"Munigan":5053,"Egaroto":1536,"Mallevolence":5330,"Mulltilator":0,"Crismado":23134,"Mopex":1617,"Rorkino":1609,"Choijong":0,"Smalldpskekw":1176,"Budega":3616,"Kascerata":9968,"Blitera":11027,"Kenpach":2415,"Gatoajato":38462,"Badhead":4828,"Pattz":197208,"Kurjin":176648,"Degustaroxo":352779,"Dotahkiin":206361},
  "Anub'Rekhan": {"Budega":0,"Mopex":1438,"Egaroto":0,"Mulltilator":0,"Smalldpskekw":1769,"Munigan":1251,"Yuenmi":1020,"Mayt":0,"Mareshall":0,"Delidk":0,"Kascerata":1020,"Mallevolence":6038,"Gatoajato":579,"Badhead":4086,"Rahkdos":2701,"Crismado":4704,"Choijong":0,"Blitera":5288,"Rorkino":297,"Jbeto":28833,"Kenpach":0,"Pattz":0,"Dotahkiin":23761,"Degustaroxo":60185,"Kurjin":64840},
  "Grand Widow Faerlina": {"Mopex":4830,"Munigan":17086,"Mareshall":1488,"Smalldpskekw":3483,"Delidk":5744,"Yuenmi":18401,"Budega":0,"Choijong":0,"Gatoajato":248,"Rahkdos":7309,"Egaroto":998,"Rorkino":1100,"Mallevolence":9214,"Crismado":9226,"Mulltilator":0,"Kascerata":16661,"Badhead":4387,"Mayt":1054,"Kenpach":1206,"Jbeto":85347,"Pattz":14116,"Blitera":2000,"Kurjin":213804,"Degustaroxo":303189,"Dotahkiin":124517},
  "Maexxna": {"Mopex":1059,"Smalldpskekw":1806,"Mayt":527,"Egaroto":2043,"Mulltilator":0,"Gatoajato":0,"Mareshall":0,"Yuenmi":11229,"Mallevolence":3574,"Badhead":3585,"Munigan":3594,"Kascerata":0,"Delidk":1437,"Rahkdos":3739,"Crismado":1943,"Rorkino":918,"Blitera":3839,"Choijong":0,"Kenpach":1206,"Jbeto":60533,"Pattz":758,"Budega":0,"Degustaroxo":126517,"Kurjin":41410,"Dotahkiin":36054},
  "Noth the Plaguebringer": {"Egaroto":3452,"Smalldpskekw":1691,"Mopex":11168,"Yuenmi":30933,"Rorkino":4610,"Rahkdos":7455,"Gatoajato":678,"Mareshall":807,"Munigan":11877,"Mallevolence":8058,"Kascerata":28608,"Delidk":3183,"Mayt":527,"Budega":3231,"Mulltilator":0,"Badhead":6396,"Crismado":17738,"Blitera":11402,"Choijong":0,"Kenpach":1206,"Jbeto":137456,"Pattz":19962,"Kurjin":116142,"Dotahkiin":184926,"Degustaroxo":190349},
  "Heigan the Unclean": {"Mopex":883,"Egaroto":0,"Mareshall":0,"Delidk":711,"Yuenmi":2773,"Smalldpskekw":1093,"Rahkdos":1966,"Rorkino":2989,"Gatoajato":579,"Kascerata":3134,"Munigan":10439,"Mallevolence":1803,"Mulltilator":0,"Crismado":7553,"Budega":0,"Blitera":501,"Mayt":527,"Badhead":2226,"Choijong":0,"Kenpach":137,"Jbeto":70264,"Degustaroxo":254792,"Pattz":92252,"Kurjin":62826,"Dotahkiin":74315},
  "Loatheb": {"Egaroto":1763,"Mareshall":1570,"Yuenmi":3244,"Delidk":5117,"Mallevolence":6449,"Gatoajato":1158,"Munigan":6194,"Crismado":26420,"Choijong":0,"Rahkdos":13311,"Blitera":8134,"Smalldpskekw":5606,"Mopex":2716,"Rorkino":1940,"Kascerata":12542,"Badhead":7908,"Budega":4065,"Mulltilator":0,"Mayt":944,"Kenpach":2412,"Jbeto":120343,"Kurjin":56855,"Pattz":54194,"Degustaroxo":75638,"Dotahkiin":103130},
  "Sapphiron": {"Mopex":8191,"Munigan":33298,"Egaroto":7241,"Rahkdos":33885,"Mareshall":4484,"Yuenmi":12042,"Mallevolence":20724,"Smalldpskekw":8587,"Gatoajato":2265,"Rorkino":6993,"Delidk":13189,"Badhead":43126,"Budega":0,"Crismado":119530,"Kascerata":37256,"Blitera":41737,"Mulltilator":0,"Mayt":3869,"Choijong":0,"Jbeto":362607,"Kenpach":9566,"Degustaroxo":667219,"Pattz":169054,"Kurjin":258884,"Dotahkiin":345410},
  "Kel'Thuzad": {"Mareshall":1056,"Munigan":23032,"Egaroto":4622,"Gatoajato":1156,"Mopex":5215,"Mayt":0,"Delidk":3638,"Rahkdos":18963,"Smalldpskekw":5056,"Mallevolence":22977,"Blitera":21489,"Badhead":23075,"Crismado":48491,"Mulltilator":0,"Choijong":0,"Rorkino":5370,"Kascerata":33413,"Kenpach":2413,"Budega":1829,"Jbeto":210564,"Degustaroxo":354057,"Pattz":11951,"Kurjin":176078,"Yuenmi":215744,"Dotahkiin":219151}
};

console.log('\n\n═══════════════════════════════════════════════════════════════════════════════');
console.log('  3-WAY COMPARISON: Ours vs wow-logs.co.in vs uwu-logs (healers only)');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

console.log('  Boss                    | Healer       | Ours       | Wow-Logs   | UwU-Logs   | vs WL     | vs UwU');
console.log('  ─────────────────────── | ──────────── | ────────── | ────────── | ────────── | ───────── | ─────────');

const threeWayTotals: Record<string, { ours: number; wl: number; uwu: number; count: number }> = {};
for (const healer of HEALERS) {
  threeWayTotals[healer] = { ours: 0, wl: 0, uwu: 0, count: 0 };
}

let prevBoss3 = '';
for (const bossName of bossOrder) {
  const ourEnc = ourEncounters[bossName];
  const refBoss = getRefBoss(bossName);
  const uwuBoss = uwuLogsRef[bossName];
  
  if (!ourEnc || !refBoss || !uwuBoss) continue;
  
  for (const healer of HEALERS) {
    const oursVal = ourEnc.combatStats?.[healer]?.healing ?? 0;
    const wlVal = refBoss.healing[healer] ?? 0;
    const uwuVal = uwuBoss[healer] ?? 0;
    
    if (oursVal === 0 && wlVal === 0 && uwuVal === 0) continue;
    
    const vsWl = pctDelta(oursVal, wlVal);
    const vsUwu = pctDelta(oursVal, uwuVal);
    
    const bossCol = bossName === prevBoss3 ? '                          ' : `  ${bossName.padEnd(24)}`;
    prevBoss3 = bossName;
    
    const vsWlStr = isFinite(vsWl) ? fmtPct(vsWl).padStart(9) : '      N/A';
    const vsUwuStr = isFinite(vsUwu) ? fmtPct(vsUwu).padStart(9) : '      N/A';
    
    console.log(
      `${bossCol}| ${healer.padEnd(13)}| ${fmt(oursVal).padStart(10)} | ${fmt(wlVal).padStart(10)} | ${fmt(uwuVal).padStart(10)} | ${vsWlStr} | ${vsUwuStr}`
    );
    
    threeWayTotals[healer].ours += oursVal;
    threeWayTotals[healer].wl += wlVal;
    threeWayTotals[healer].uwu += uwuVal;
    threeWayTotals[healer].count++;
  }
}

console.log('\n  ─── Per-Healer Totals (3-way) ───\n');
console.log('  Healer          | Class          | Ours         | Wow-Logs     | UwU-Logs     | vs WL   | vs UwU');
console.log('  ─────────────── | ────────────── | ──────────── | ──────────── | ──────────── | ─────── | ───────');

for (const healer of HEALERS) {
  const t = threeWayTotals[healer];
  const vsWl = pctDelta(t.ours, t.wl);
  const vsUwu = pctDelta(t.ours, t.uwu);
  console.log(
    `  ${healer.padEnd(17)} | ${(HEALER_CLASSES[healer] || '?').padEnd(15)}| ${fmt(t.ours).padStart(12)} | ${fmt(t.wl).padStart(12)} | ${fmt(t.uwu).padStart(12)} | ${fmtPct(vsWl).padStart(7)} | ${fmtPct(vsUwu).padStart(7)}`
  );
}

// Also show wow-logs vs uwu-logs to understand how they differ from each other
console.log('\n  ─── wow-logs vs uwu-logs (how do the references differ?) ───\n');
console.log('  Healer          | Class          | Wow-Logs     | UwU-Logs     | WL vs UwU');
console.log('  ─────────────── | ────────────── | ──────────── | ──────────── | ─────────');

for (const healer of HEALERS) {
  const t = threeWayTotals[healer];
  const wlVsUwu = pctDelta(t.wl, t.uwu);
  console.log(
    `  ${healer.padEnd(17)} | ${(HEALER_CLASSES[healer] || '?').padEnd(15)}| ${fmt(t.wl).padStart(12)} | ${fmt(t.uwu).padStart(12)} | ${fmtPct(wlVsUwu).padStart(9)}`
  );
}
