import { bench, describe } from "vitest";
import { parseLine } from "../../src/pipeline/line-parser.js";
import { parseFields } from "../../src/utils/fields.js";

// Realistic WoW combat log lines for benchmarking
const SPELL_DAMAGE_LINE =
  '3/12 20:15:42.123  SPELL_DAMAGE,0x0E000000000A3A18,"Egaroto",0x514,0xF13000393F000001,"Instructor Razuvious",0xa48,49909,"Icy Touch",0x10,5000,200,0x10,0,0,0,nil,nil,nil';

const SWING_DAMAGE_LINE =
  '2/22 15:18:06.300  SWING_DAMAGE,0xF130007E61000002,"Archavon Warder",0xa48,0x0E0000000018667D,"Stranglol",0x512,13337,0,1,0,0,0,nil,nil,nil';

const SPELL_AURA_APPLIED_LINE =
  '3/12 20:14:41.000  SPELL_AURA_APPLIED,0x0E000000000A3A18,"Egaroto",0x514,0x0E000000000A3A18,"Egaroto",0x514,53908,"Potion of Speed",0x1,BUFF';

const FULL_EVENT_DATA =
  'SPELL_DAMAGE,0x0E000000000A3A18,"Egaroto",0x514,0xF13000393F000001,"Instructor Razuvious",0xa48,49909,"Icy Touch",0x10,5000,200,0x10,0,0,0,nil,nil,nil';

const YEAR = 2025;

describe("parseLine", () => {
  bench("SPELL_DAMAGE", () => {
    parseLine(SPELL_DAMAGE_LINE, YEAR);
  });

  bench("SWING_DAMAGE", () => {
    parseLine(SWING_DAMAGE_LINE, YEAR);
  });

  bench("SPELL_AURA_APPLIED", () => {
    parseLine(SPELL_AURA_APPLIED_LINE, YEAR);
  });
});

describe("parseFields", () => {
  bench("full 15-field event data", () => {
    parseFields(FULL_EVENT_DATA);
  });
});
