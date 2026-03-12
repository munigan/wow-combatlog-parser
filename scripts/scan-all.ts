import { scanLog } from "../dist/index.js";
import { readFileSync, statSync } from "node:fs";
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

const LOGS_DIR = join(import.meta.dirname!, "../tests/example-logs");

const FILES = [
  "example-log-1.txt",
  "example-log-2.txt",
  "example-log-3.txt",
  "example-log-4.txt",
  "example-log-5.txt",
  "example-log-6.txt",
];

interface FileResult {
  fileName: string;
  fileSizeBytes: number;
  skipped?: string;
  raidCount?: number;
  raids?: Array<{
    raidInstance: string | null;
    dates: string[];
    startTime: string;
    endTime: string;
    playerCount: number;
    encounterCount: number;
    encounters: Array<{
      bossName: string;
      duration: number;
      result: string;
      difficulty: string | null;
    }>;
    players: Array<{
      name: string;
      class: string | null;
      spec: string | null;
    }>;
  }>;
}

async function main() {
  const results: FileResult[] = [];

  for (const fileName of FILES) {
    const filePath = join(LOGS_DIR, fileName);

    // Check file exists
    try {
      statSync(filePath);
    } catch {
      results.push({
        fileName,
        fileSizeBytes: 0,
        skipped: "file not found",
      });
      continue;
    }

    const fileSizeBytes = statSync(filePath).size;

    const stream = fileToStream(filePath);
    const scanResult = await scanLog(stream);

    results.push({
      fileName,
      fileSizeBytes,
      raidCount: scanResult.raids.length,
      raids: scanResult.raids.map((raid) => ({
        raidInstance: raid.raidInstance,
        dates: raid.dates,
        startTime: raid.startTime,
        endTime: raid.endTime,
        playerCount: raid.playerCount,
        encounterCount: raid.encounters.length,
        encounters: raid.encounters.map((enc) => ({
          bossName: enc.bossName,
          duration: enc.duration,
          result: enc.result,
          difficulty: enc.difficulty,
        })),
        players: raid.players.map((p) => ({
          name: p.name,
          class: p.class,
          spec: p.spec,
        })),
      })),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
