// tests/unit/decompress.test.ts
import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { maybeDecompress } from "../../src/pipeline/decompress.js";

function makeByteStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

async function collectBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

describe("maybeDecompress", () => {
  it("passes through non-gzip data unchanged", async () => {
    const input = new TextEncoder().encode("Hello, World!\n");
    const stream = makeByteStream(input);
    const result = await maybeDecompress(stream);
    const output = await collectBytes(result);
    expect(new TextDecoder().decode(output)).toBe("Hello, World!\n");
  });

  it("decompresses gzip data", async () => {
    const original = "Hello, compressed World!\n";
    const compressed = gzipSync(Buffer.from(original));
    const stream = makeByteStream(new Uint8Array(compressed));
    const result = await maybeDecompress(stream);
    const output = await collectBytes(result);
    expect(new TextDecoder().decode(output)).toBe(original);
  });

  it("handles empty stream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const result = await maybeDecompress(stream);
    const output = await collectBytes(result);
    expect(output.byteLength).toBe(0);
  });

  it("handles single-byte stream (not gzip)", async () => {
    const input = new Uint8Array([0x41]); // 'A'
    const stream = makeByteStream(input);
    const result = await maybeDecompress(stream);
    const output = await collectBytes(result);
    expect(output.byteLength).toBe(1);
    expect(output[0]).toBe(0x41);
  });
});
