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
  const filePath = join(
    import.meta.dirname!,
    "../tests/example-logs/example-log-7.txt",
  );

  // Step 1: Scan to get raid structure
  const scanStream = fileToStream(filePath);
  const scanResult = await scanLog(scanStream);

  // Step 2: Parse each raid with consumable tracking
  const raidSelections = scanResult.raids.map((raid) => ({
    dates: raid.dates,
    startTime: raid.startTime,
    endTime: raid.endTime,
    timeRanges: raid.timeRanges,
  }));

  const parseStream = fileToStream(filePath);
  const parseResult = await parseLog(parseStream, raidSelections);

  // Step 3: Build JSON output — resolve GUIDs to player names in consumables
  const output = parseResult.raids.map((raid) => {
    const guidToName = new Map(raid.players.map((p) => [p.guid, p.name]));

    return {
      raidInstance: raid.raidInstance,
      raidDate: raid.raidDate.toISOString().split("T")[0],
      playerCount: raid.players.length,
      encounterCount: raid.encounters.length,
      encounters: raid.encounters.map((enc) => {
        // Resolve consumables: replace playerGuid keys with player names
        let consumables: Record<string, typeof enc.consumables[string]> | undefined;
        if (enc.consumables && Object.keys(enc.consumables).length > 0) {
          consumables = {};
          for (const [guid, uses] of Object.entries(enc.consumables)) {
            const name = guidToName.get(guid) ?? guid;
            consumables[name] = uses;
          }
        }

        return {
          bossName: enc.bossName,
          startTime: enc.startTime,
          endTime: enc.endTime,
          duration: enc.duration,
          result: enc.result,
          difficulty: enc.difficulty,
          ...(consumables ? { consumables } : {}),
        };
      }),
      players: raid.players.map((p) => ({
        name: p.name,
        class: p.class,
        spec: p.spec,
        ...(p.consumables && Object.keys(p.consumables).length > 0
          ? { consumables: p.consumables }
          : {}),
      })),
    };
  });

  const json = JSON.stringify(output, null, 2);
  console.log(json);

  const resultPath = join(import.meta.dirname!, "../result.json");
  writeFileSync(resultPath, json + "\n");
  console.error(`\nResults written to result.json`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
