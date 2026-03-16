// src/pipeline/decompress.ts

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/**
 * Peek at the first bytes of a stream to detect gzip compression.
 * If gzip magic bytes are found, pipe through DecompressionStream.
 * Otherwise, pass through unchanged.
 */
export async function maybeDecompress(
  stream: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
  const reader = stream.getReader();
  const { done, value: firstChunk } = await reader.read();

  if (done || firstChunk === undefined || firstChunk.length === 0) {
    reader.releaseLock();
    return new ReadableStream({ start(c) { c.close(); } });
  }

  const isGzip =
    firstChunk.length >= 2 &&
    firstChunk[0] === GZIP_MAGIC_0 &&
    firstChunk[1] === GZIP_MAGIC_1;

  // Reconstruct stream: re-enqueue first chunk + pipe remaining
  const reconstructed = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(firstChunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  if (isGzip) {
    return reconstructed.pipeThrough(
      new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>,
    );
  }

  return reconstructed;
}
