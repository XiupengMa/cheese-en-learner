import { streamLLM } from "@/lib/llm";
import { DEFAULT_MODEL } from "@/lib/models";
import { TEACHER_SYSTEM } from "@/lib/prompts";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body.text ?? "").trim();
    const model = String(body.model || DEFAULT_MODEL);
    if (!text) {
      return Response.json({ error: "Please enter some text to translate." }, { status: 400 });
    }

    const stream = await streamLLM({
      model,
      system: TEACHER_SYSTEM,
      messages: [{ role: "user", content: text }],
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Translation failed. Please try again.";
    return Response.json({ error: message }, { status: 500 });
  }
}
