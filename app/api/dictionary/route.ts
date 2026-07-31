import { completeText } from "@/lib/llm";
import { DEFAULT_MODEL } from "@/lib/models";
import { DICTIONARY_SYSTEM } from "@/lib/prompts";
import type { DictionaryEntry, DictionaryExample } from "@/lib/types";

export const maxDuration = 60;

interface Phonetics {
  ipa?: string;
  audioUrl?: string;
}

// Free Dictionary API sources most audio from Wiktionary; prefer the US recording.
async function fetchPronunciation(term: string): Promise<Phonetics> {
  const word = term.trim().toLowerCase();
  if (/\s/.test(word)) return {}; // single words only

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return {};
    const data = (await res.json()) as Array<{
      phonetic?: string;
      phonetics?: Array<{ text?: string; audio?: string }>;
    }>;
    const phonetics = data?.[0]?.phonetics ?? [];
    const withAudio = phonetics.filter((p) => p.audio);
    const us = withAudio.find((p) => p.audio!.includes("-us.")) ?? withAudio[0];
    const withText = phonetics.find((p) => p.text);
    return {
      ipa: us?.text || withText?.text || data?.[0]?.phonetic,
      audioUrl: us?.audio,
    };
  } catch {
    return {};
  }
}

function parseEntryJson(raw: string): Record<string, unknown> {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("The model did not return a valid dictionary entry. Please try again.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const term = String(body.term ?? "").trim();
    const model = String(body.model || DEFAULT_MODEL);
    if (!term) {
      return Response.json({ error: "Please enter a word or phrase." }, { status: 400 });
    }

    const [result, phonetics] = await Promise.all([
      completeText({
        model,
        system: DICTIONARY_SYSTEM,
        messages: [{ role: "user", content: term }],
        effort: "low",
      }),
      fetchPronunciation(term),
    ]);

    const parsed = parseEntryJson(result.text);
    const examples: DictionaryExample[] = Array.isArray(parsed.examples)
      ? (parsed.examples as DictionaryExample[]).filter((ex) => ex && ex.en)
      : [];

    const entry: DictionaryEntry = {
      term,
      ipa: phonetics.ipa || String(parsed.ipa ?? ""),
      audioUrl: phonetics.audioUrl ?? null,
      meaning: String(parsed.meaning ?? ""),
      background: String(parsed.background ?? ""),
      chinese: String(parsed.chinese ?? ""),
      examples,
      debug: result.debug,
    };
    return Response.json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed. Please try again.";
    return Response.json({ error: message }, { status: 500 });
  }
}
