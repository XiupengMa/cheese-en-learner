import type { LLMDebug, Phonetics, StreamEvent } from "./types";

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone?: (debug: LLMDebug) => void;
  onPhonetics?: (phonetics: Phonetics) => void;
}

/**
 * Reads an NDJSON stream from the API routes, dispatching each event to its
 * handler. Throws if the server reports a mid-stream error.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers
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
        handlers.onDelta(event.text);
      } else if (event.type === "done") {
        handlers.onDone?.(event.debug);
      } else if (event.type === "phonetics") {
        handlers.onPhonetics?.({ ipa: event.ipa, audioUrl: event.audioUrl });
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    }
  }
}
