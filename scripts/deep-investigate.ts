import { scanLog } from "../dist/index.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFields } from "../src/utils/fields.js";

function fileToStream(path: string): ReadableStream<Uint8Array> {
  const content = readFileSync(path);
  return new ReadableStream({
    start(controller) {
      const chunkSize = 64 * 1024;
      for (let i = 0; i < content.length; i += chunkSize) {
        controller.enqueue(content.subarray(i, i + chunkSize));
      }
      controller.close();
    },
  });
}

async function main() {
  const logFile = process.argv[2] || "tests/example-logs/example-log-1.txt";
  const filePath = join(process.cwd(), logFile);

  // Scan to find unknown players
  console.error("Scanning...");
  const stream = fileToStream(filePath);
  const result = await scanLog(stream);

  const unknownGuids = new Set<string>();
  const guidToName = new Map<string, string>();
  for (const raid of result.raids) {
    for (const p of raid.players) {
      if (!p.class) {
        unknownGuids.add(p.guid);
        guidToName.set(p.guid, p.name);
      }
    }
  }
  console.error(`Found ${unknownGuids.size} unknown players`);

  // Read raw log and properly parse lines
  const lines = readFileSync(filePath, "utf-8").split("\n");

  // For each unknown, track: event types as source + spell IDs used
  const nameData = new Map<string, {
    eventTypes: Map<string, number>;
    spells: Map<string, { name: string; count: number }>;
    hasNonAuraRemoved: boolean;
    totalAsSource: number;
  }>();

  for (const line of lines) {
    if (!line.trim()) continue;
    const spaceIdx = line.indexOf("  ");
    if (spaceIdx === -1) continue;
    const eventData = line.substring(spaceIdx + 2);

    const fields = parseFields(eventData);
    if (fields.length < 7) continue;

    const eventType = fields[0];
    const sourceGuid = fields[1];

    if (!unknownGuids.has(sourceGuid)) continue;

    const name = guidToName.get(sourceGuid)!;
    if (!nameData.has(name)) {
      nameData.set(name, {
        eventTypes: new Map(),
        spells: new Map(),
        hasNonAuraRemoved: false,
        totalAsSource: 0,
      });
    }
    const data = nameData.get(name)!;
    data.totalAsSource++;

    // Track event type
    data.eventTypes.set(eventType, (data.eventTypes.get(eventType) || 0) + 1);
    if (eventType !== "SPELL_AURA_REMOVED") {
      data.hasNonAuraRemoved = true;
    }

    // Extract spell ID (field 7 = first field after prefix)
    if (fields.length > 7 && !eventType.startsWith("SWING_") && eventType !== "ENVIRONMENTAL_DAMAGE") {
      const spellId = fields[7];
      const spellName = fields[8] || "?";
      if (spellId) {
        if (!data.spells.has(spellId)) data.spells.set(spellId, { name: spellName, count: 0 });
        data.spells.get(spellId)!.count++;
      }
    }
  }

  // Print results grouped by category
  const withRefresh: string[] = [];
  const onlyRemoved: string[] = [];
  const noEvents: string[] = [];

  for (const name of [...guidToName.values()].sort()) {
    const data = nameData.get(name);
    if (!data) {
      noEvents.push(name);
      continue;
    }
    if (data.hasNonAuraRemoved) {
      withRefresh.push(name);
    } else {
      onlyRemoved.push(name);
    }
  }

  console.log(`\n=== DETECTABLE (have REFRESH/APPLIED/other events as source): ${withRefresh.length} ===\n`);
  for (const name of withRefresh) {
    const data = nameData.get(name)!;
    const evts = [...data.eventTypes.entries()].sort((a, b) => b[1] - a[1]).map(([e, c]) => `${e}(${c})`).join(", ");
    const spells = [...data.spells.entries()].sort((a, b) => b[1].count - a[1].count).map(([id, info]) => `${id}:${info.name}(${info.count}x)`).join(", ");
    console.log(`  ${name}: [${evts}] → ${spells}`);
  }

  console.log(`\n=== ONLY SPELL_AURA_REMOVED as source: ${onlyRemoved.length} ===\n`);
  for (const name of onlyRemoved) {
    const data = nameData.get(name)!;
    const spells = [...data.spells.entries()].sort((a, b) => b[1].count - a[1].count).map(([id, info]) => `${id}:${info.name}(${info.count}x)`).join(", ");
    console.log(`  ${name}: ${data.totalAsSource} events → ${spells}`);
  }

  console.log(`\n=== NO SOURCE EVENTS AT ALL: ${noEvents.length} ===\n`);
  for (const name of noEvents) {
    console.log(`  ${name}`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Detectable (non-AURA_REMOVED events): ${withRefresh.length}`);
  console.log(`Only AURA_REMOVED: ${onlyRemoved.length}`);
  console.log(`No source events: ${noEvents.length}`);
  console.log(`Total unknown: ${unknownGuids.size}`);

  // Check which spells from detectable players are missing from our spell book
  const { SPELL_TO_CLASS } = await import("../src/data/spell-book.js");
  console.log(`\n=== MISSING SPELLS (cast by unknowns, not in spell book) ===\n`);
  const missingSpells = new Map<string, { name: string; players: string[] }>();
  for (const name of [...withRefresh, ...onlyRemoved]) {
    const data = nameData.get(name)!;
    for (const [spellId, info] of data.spells) {
      if (!SPELL_TO_CLASS.has(spellId)) {
        if (!missingSpells.has(spellId)) missingSpells.set(spellId, { name: info.name, players: [] });
        missingSpells.get(spellId)!.players.push(name);
      }
    }
  }
  const sortedMissing = [...missingSpells.entries()].sort((a, b) => b[1].players.length - a[1].players.length);
  for (const [id, info] of sortedMissing) {
    console.log(`  ${id} "${info.name}" — used by ${info.players.length} unknown(s): ${info.players.join(", ")}`);
  }
}
main();
