// src/pipeline/line-splitter.ts

/** Creates a TransformStream splitting text into individual lines. */
export function createLineSplitter(): TransformStream<string, string> {
  let buffer = "";

  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk;
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.substring(0, newlineIdx);
        buffer = buffer.substring(newlineIdx + 1);
        if (line.endsWith("\r")) {
          line = line.substring(0, line.length - 1);
        }
        if (line.length > 0) {
          controller.enqueue(line);
        }
      }
    },
    flush(controller) {
      if (buffer.length > 0) {
        const line = buffer.endsWith("\r") ? buffer.substring(0, buffer.length - 1) : buffer;
        if (line.length > 0) {
          controller.enqueue(line);
        }
      }
    },
  });
}
