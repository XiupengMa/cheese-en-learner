import type { StreamEvent } from "./types";

/**
 * Passes an NDJSON LLM stream through untouched while accumulating the
 * response text, then runs `save` with the full text before the stream
 * closes. Running in flush() — not after the response — matters on
 * serverless: the function can be frozen the moment the response stream
 * ends, so the insert must complete while the stream is still open.
 *
 * If `save` returns an id, a {"type":"saved","id"} event is appended so the
 * client can link follow-up questions to the stored row. Errored or
 * cancelled streams (no "done" event) are not saved; a failed save is
 * logged and swallowed — history must never break the answer itself.
 */
export function withHistorySave(
  stream: ReadableStream<Uint8Array>,
  save: (fullText: string) => Promise<string | void>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let text = "";
  let completed = false;

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        buffer += decoder.decode(chunk, { stream: true });
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          try {
            const event = JSON.parse(line) as StreamEvent;
            if (event.type === "delta") text += event.text;
            if (event.type === "done") completed = true;
          } catch {
            // Not this wrapper's problem — the client parser will complain.
          }
        }
      },
      async flush(controller) {
        if (!completed || !text) return;
        try {
          const id = await save(text);
          if (id) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "saved", id }) + "\n")
            );
          }
        } catch (err) {
          console.error("history save failed:", err);
        }
      },
    })
  );
}
