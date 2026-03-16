import { maybeDecompress } from "./decompress.js";
import { createLineSplitter } from "./line-splitter.js";
import { FileTooLargeError, DEFAULT_MAX_BYTES } from "../errors.js";

export interface PipelineResult {
  reader: ReadableStreamDefaultReader<string>;
  getBytesRead: () => number;
}

/**
 * Build the standard parsing pipeline:
 * stream → maybeDecompress → byteCounter (with size limit) → TextDecoder → LineSplitter
 */
export async function buildPipeline(
  stream: ReadableStream<Uint8Array>,
  maxBytes?: number,
): Promise<PipelineResult> {
  const limit = maxBytes ?? DEFAULT_MAX_BYTES;
  let bytesRead = 0;

  const decompressed = await maybeDecompress(stream);

  const byteCounter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength;
      if (bytesRead > limit) {
        controller.error(new FileTooLargeError(bytesRead, limit));
        return;
      }
      controller.enqueue(chunk);
    },
  });

  const lineSplitter = createLineSplitter();

  const textStream = decompressed
    .pipeThrough(byteCounter)
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>);

  const lineStream = textStream.pipeThrough(lineSplitter);

  return {
    reader: lineStream.getReader(),
    getBytesRead: () => bytesRead,
  };
}
