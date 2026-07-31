import { MAX_TEXT_LENGTH } from "@/lib/limits";
import { streamLLM } from "@/lib/llm";
import { DEFAULT_MODEL } from "@/lib/models";
import { TEACHER_SYSTEM } from "@/lib/prompts";
import { getSession, unauthorized } from "@/lib/session";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const body = await req.json();
    const text = String(body.text ?? "").trim();
    const model = String(body.model || DEFAULT_MODEL);
    if (!text) {
      return Response.json({ error: "Please enter some text to translate." }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return Response.json(
        { error: `That text is too long (${MAX_TEXT_LENGTH.toLocaleString()} characters max). Try a shorter passage.` },
        { status: 400 }
      );
    }

    const stream = await streamLLM({
      model,
      system: TEACHER_SYSTEM,
      messages: [{ role: "user", content: text }],
      effort: "low",
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed. Please try again.";
    return Response.json({ error: message }, { status: 500 });
  }
}
