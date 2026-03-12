import { scanLog, parseLog } from "../dist/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  const logFile = process.argv[2];
  if (!logFile) {
    console.error("Usage: npx tsx scripts/parse-log.ts <log-file>");
    process.exit(1);
  }

  const filePath = join(process.cwd(), logFile);
  console.error(`Scanning ${filePath}...`);

  // Phase 1: Scan
  const scanStream = fileToStream(filePath);
  const scanResult = await scanLog(scanStream);
  console.error(`Found ${scanResult.raids.length} raid(s)`);

  // Phase 2: Parse all raids
  const selections = scanResult.raids.map((raid) => ({
    dates: raid.dates,
    startTime: raid.startTime,
    endTime: raid.endTime,
    timeRanges: raid.timeRanges,
  }));

  const parseStream = fileToStream(filePath);
  const parseResult = await parseLog(parseStream, selections);

  // Build output combining scan + parse data
  const output = {
    file: logFile,
    raidCount: scanResult.raids.length,
    raids: scanResult.raids.map((scan, i) => {
      const parsed = parseResult.raids[i];
      return {
        raidInstance: scan.raidInstance,
        dates: scan.dates,
        startTime: scan.startTime,
        endTime: scan.endTime,
        playerCount: scan.playerCount,
        players: scan.players.map((p) => ({
          name: p.name,
          class: p.class,
          spec: p.spec,
        })),
        encounters: scan.encounters.map((enc) => ({
          bossName: enc.bossName,
          startTime: enc.startTime,
          endTime: enc.endTime,
          duration: enc.duration,
          result: enc.result,
          difficulty: enc.difficulty,
        })),
      };
    }),
  };

  const json = JSON.stringify(output, null, 2);
  console.log(json);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
