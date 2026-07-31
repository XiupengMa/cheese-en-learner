import OpenAI from "openai";
import { MAX_TTS_LENGTH } from "@/lib/limits";
import { getSession, unauthorized } from "@/lib/session";

export const maxDuration = 30;

// Reads short text aloud with OpenAI TTS. The client falls back to browser
// speech synthesis when this route errors (e.g. no OPENAI_API_KEY).
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "Speech is not configured on this server." },
        { status: 503 }
      );
    }

    const body = await req.json();
    const text = String(body.text ?? "").trim();
    if (!text) {
      return Response.json({ error: "Nothing to read." }, { status: 400 });
    }
    if (text.length > MAX_TTS_LENGTH) {
      return Response.json(
        { error: `Text to read is limited to ${MAX_TTS_LENGTH.toLocaleString()} characters.` },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      input: text,
      instructions:
        "Read clearly at a relaxed pace, like a friendly American English teacher reading an example sentence to a learner.",
      response_format: "mp3",
    });

    return new Response(speech.body, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Speech failed. Please try again.";
    return Response.json({ error: message }, { status: 500 });
  }
}
