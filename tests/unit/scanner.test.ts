import { describe, it, expect } from "vitest";
import { scanLog } from "../../src/scanner.js";
import { existsSync, readFileSync } from "node:fs";
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

const LOGS_DIR = join(__dirname, "../example-logs");
const LOG3_EXISTS = existsSync(join(LOGS_DIR, "example-log-3.txt"));
const LOG6_EXISTS = existsSync(join(LOGS_DIR, "example-log-6.txt"));

describe("scanLog", () => {
  it.skipIf(!LOG3_EXISTS)("detects raids from a single-raid log file", async () => {
    const stream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
    const result = await scanLog(stream);
    expect(result.raids.length).toBeGreaterThanOrEqual(1);
    const raid = result.raids[0];
    expect(raid.dates).toContain("2/22");
    expect(raid.playerCount).toBeGreaterThan(0);
    expect(raid.players.length).toBeGreaterThan(0);
  });

  it.skipIf(!LOG3_EXISTS)("detects encounters within raids", async () => {
    const stream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
    const result = await scanLog(stream);
    const raid = result.raids[0];
    expect(raid.encounters.length).toBeGreaterThan(0);
    for (const enc of raid.encounters) {
      expect(enc.bossName).toBeTruthy();
      expect(enc.duration).toBeGreaterThanOrEqual(0);
      expect(["kill", "wipe"]).toContain(enc.result);
    }
    // At least one encounter should have meaningful duration
    const withDuration = raid.encounters.filter((e) => e.duration > 0);
    expect(withDuration.length).toBeGreaterThan(0);
  });

  it.skipIf(!LOG3_EXISTS)("detects player classes", async () => {
    const stream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
    const result = await scanLog(stream);
    const raid = result.raids[0];
    const withClass = raid.players.filter((p) => p.class !== null);
    expect(withClass.length).toBeGreaterThan(0);
  });

  it.skipIf(!LOG3_EXISTS)("reports progress", async () => {
    const stream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
    const progress: number[] = [];
    await scanLog(stream, { onProgress: (bytes) => progress.push(bytes) });
    expect(progress.length).toBeGreaterThan(0);
  });

  it.skipIf(!LOG3_EXISTS)("produces valid ISO timestamps", async () => {
    const stream = fileToStream(join(LOGS_DIR, "example-log-3.txt"));
    const result = await scanLog(stream);
    for (const raid of result.raids) {
      expect(new Date(raid.startTime).getTime()).not.toBeNaN();
      expect(new Date(raid.endTime).getTime()).not.toBeNaN();
      for (const enc of raid.encounters) {
        expect(new Date(enc.startTime).getTime()).not.toBeNaN();
        expect(new Date(enc.endTime).getTime()).not.toBeNaN();
      }
    }
  });

  it.skipIf(!LOG6_EXISTS)("detects multiple raids from a multi-raid log file", async () => {
    const stream = fileToStream(
      join(LOGS_DIR, "example-log-6.txt"),
    );
    const result = await scanLog(stream);
    expect(result.raids.length).toBeGreaterThan(1);
  }, 60000);
});
