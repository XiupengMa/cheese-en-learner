import { streamLLM } from "@/lib/llm";
import { DEFAULT_MODEL } from "@/lib/models";
import { chatSystem } from "@/lib/prompts";
import type { ChatMessage, LearnMode } from "@/lib/types";

export const maxDuration = 60;

const MAX_MESSAGES = 40;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const model = String(body.model || DEFAULT_MODEL);
    const mode: LearnMode = body.mode === "teacher" ? "teacher" : "dictionary";
    const context = String(body.context ?? "");
    const rawMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];

    const messages: ChatMessage[] = rawMessages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_MESSAGES);

    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return Response.json({ error: "Please enter a question." }, { status: 400 });
    }

    const stream = await streamLLM({
      model,
      system: chatSystem(mode, context),
      messages,
      effort: "low",
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed. Please try again.";
    return Response.json({ error: message }, { status: 500 });
  }
}
