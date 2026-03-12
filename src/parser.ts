import type {
  ParseOptions,
  ParseResult,
  RaidSelection,
} from "./types.js";

export async function parseLog(
  stream: ReadableStream<Uint8Array>,
  _raidSelections: RaidSelection[],
  _options?: ParseOptions,
): Promise<ParseResult> {
  void stream;
  return { raids: [] };
}
