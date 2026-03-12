import { scanLog } from "../dist/index.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LOGS_DIR = join(import.meta.dirname, "../tests/example-logs");

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

const files = readdirSync(LOGS_DIR)
  .filter((f) => f.endsWith(".txt"))
  .sort();

for (const fileName of files) {
  const filePath = join(LOGS_DIR, fileName);
  const sizeBytes = statSync(filePath).size;
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);

  const stream = fileToStream(filePath);
  const result = await scanLog(stream);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`FILE: ${fileName} (${sizeMB} MB)`);
  console.log(`${"=".repeat(80)}`);
  console.log(`Raids detected: ${result.raids.length}`);

  for (let i = 0; i < result.raids.length; i++) {
    const raid = result.raids[i];
    // Filter out phantom encounters (0 or very short duration wipes)
    const realEncounters = raid.encounters.filter(
      (e) => e.duration >= 10 || e.result === "kill",
    );
    const phantomCount = raid.encounters.length - realEncounters.length;

    console.log(`\n--- Raid ${i + 1}: ${raid.raidInstance ?? "Unknown"} ---`);
    console.log(`  Dates: ${raid.dates.join(", ")}`);
    console.log(`  Time: ${formatTime(raid.startTime)} → ${formatTime(raid.endTime)}`);
    console.log(`  Players: ${raid.playerCount}`);
    console.log(
      `  Encounters: ${realEncounters.length} real` +
        (phantomCount > 0 ? ` (${phantomCount} phantom/0-dur filtered)` : ""),
    );

    if (realEncounters.length > 0) {
      console.log("");
      console.log(
        "  " +
          "Boss".padEnd(30) +
          "Duration".padEnd(12) +
          "Result".padEnd(8) +
          "Difficulty",
      );
      console.log("  " + "-".repeat(62));
      for (const enc of realEncounters) {
        console.log(
          "  " +
            enc.bossName.padEnd(30) +
            formatDuration(enc.duration).padEnd(12) +
            enc.result.padEnd(8) +
            (enc.difficulty ?? "?"),
        );
      }
    }

    // Player roster
    const classGroups = new Map<string, string[]>();
    for (const p of raid.players) {
      const key = p.spec ?? p.class ?? "unknown";
      if (!classGroups.has(key)) classGroups.set(key, []);
      classGroups.get(key)!.push(p.name);
    }
    console.log(`\n  Player Roster (${raid.playerCount}):`);
    const sortedKeys = [...classGroups.keys()].sort();
    for (const key of sortedKeys) {
      const names = classGroups.get(key)!.sort();
      console.log(`    ${key}: ${names.join(", ")}`);
    }
  }
}

console.log(`\n${"=".repeat(80)}`);
console.log("DONE");
