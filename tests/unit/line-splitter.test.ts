// tests/unit/line-splitter.test.ts
import { describe, it, expect } from "vitest";
import { createLineSplitter } from "../../src/pipeline/line-splitter.js";

function makeStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function collectLines(stream: ReadableStream<string>): Promise<string[]> {
  const lines: string[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lines.push(value);
  }
  return lines;
}

describe("createLineSplitter", () => {
  it("splits complete lines from a single chunk", async () => {
    const lines = await collectLines(makeStream(["line1\nline2\nline3\n"]).pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });

  it("handles lines split across chunks", async () => {
    const lines = await collectLines(makeStream(["li", "ne1\nlin", "e2\n"]).pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2"]);
  });

  it("handles last line without trailing newline", async () => {
    const lines = await collectLines(makeStream(["line1\nline2"]).pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2"]);
  });

  it("handles \\r\\n line endings", async () => {
    const lines = await collectLines(makeStream(["line1\r\nline2\r\n"]).pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2"]);
  });

  it("skips empty lines", async () => {
    const lines = await collectLines(makeStream(["line1\n\nline2\n"]).pipeThrough(createLineSplitter()));
    expect(lines).toEqual(["line1", "line2"]);
  });
});
