import { MAX_TERM_LENGTH } from "@/lib/limits";
import { streamLLM } from "@/lib/llm";
import { DEFAULT_MODEL } from "@/lib/models";
import { DICTIONARY_SYSTEM } from "@/lib/prompts";
import { getSession, unauthorized } from "@/lib/session";
import type { Phonetics } from "@/lib/types";

export const maxDuration = 60;

// Free Dictionary API sources most audio from Wiktionary; prefer the US recording.
async function fetchPronunciation(term: string): Promise<Phonetics> {
  const empty: Phonetics = { ipa: "", audioUrl: null };
  const word = term.trim().toLowerCase();
  if (/\s/.test(word)) return empty; // single words only

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return empty;
    const data = (await res.json()) as Array<{
      phonetic?: string;
      phonetics?: Array<{ text?: string; audio?: string }>;
    }>;
    const phonetics = data?.[0]?.phonetics ?? [];
    const withAudio = phonetics.filter((p) => p.audio);
    const us = withAudio.find((p) => p.audio!.includes("-us.")) ?? withAudio[0];
    const withText = phonetics.find((p) => p.text);
    return {
      ipa: us?.text || withText?.text || data?.[0]?.phonetic || "",
      audioUrl: us?.audio ?? null,
    };
  } catch {
    return empty;
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const body = await req.json();
    const term = String(body.term ?? "").trim();
    const model = String(body.model || DEFAULT_MODEL);
    if (!term) {
      return Response.json({ error: "Please enter a word or phrase." }, { status: 400 });
    }
    if (term.length > MAX_TERM_LENGTH) {
      return Response.json(
        { error: `That looks too long for a lookup (${MAX_TERM_LENGTH} characters max). Try the Teacher tab for full sentences.` },
        { status: 400 }
      );
    }

    const llmStream = await streamLLM({
      model,
      system: DICTIONARY_SYSTEM,
      messages: [{ role: "user", content: term }],
      effort: "low",
    });

    // Pass LLM events through, and inject a "phonetics" event as soon as the
    // (parallel) pronunciation lookup resolves. Each enqueue is a complete
    // NDJSON line, so interleaving is safe.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const pronunciation = fetchPronunciation(term)
          .then((p) => {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "phonetics", ...p }) + "\n")
            );
          })
          .catch(() => {});

        const reader = llmStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        await pronunciation;
        controller.close();
      },
      cancel() {
        void llmStream.cancel();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed. Please try again.";
    return Response.json({ error: message }, { status: 500 });
  }
}
