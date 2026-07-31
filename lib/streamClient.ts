import type { LLMDebug, StreamEvent } from "./types";

/**
 * Reads an NDJSON stream from the API routes, invoking `onDelta` for each text
 * chunk and `onDone` with the debug record when the stream completes.
 * Throws if the server reports a mid-stream error.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  onDone?: (debug: LLMDebug) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === "delta") {
        onDelta(event.text);
      } else if (event.type === "done") {
        onDone?.(event.debug);
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  }
}
