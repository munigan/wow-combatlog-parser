import type { ScanOptions, ScanResult } from "./types.js";

export async function scanLog(
  stream: ReadableStream<Uint8Array>,
  _options?: ScanOptions,
): Promise<ScanResult> {
  void stream;
  return { raids: [] };
}
