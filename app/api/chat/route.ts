import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lookup, question } from "@/lib/db/schema";
import { withHistorySave } from "@/lib/historyLog";
import { MAX_CONTEXT_LENGTH, MAX_MESSAGE_LENGTH } from "@/lib/limits";
import { streamLLM } from "@/lib/llm";
import { DEFAULT_MODEL } from "@/lib/models";
import { chatSystem } from "@/lib/prompts";
import { getSession, unauthorized } from "@/lib/session";
import type { ChatMessage, LearnMode } from "@/lib/types";

export const maxDuration = 60;

const MAX_MESSAGES = 40;

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const body = await req.json();
    const model = String(body.model || DEFAULT_MODEL);
    const mode: LearnMode = body.mode === "teacher" ? "teacher" : "dictionary";
    const context = String(body.context ?? "").slice(0, MAX_CONTEXT_LENGTH);
    const rawMessages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];

    const messages: ChatMessage[] = rawMessages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_MESSAGES);

    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return Response.json({ error: "Please enter a question." }, { status: 400 });
    }
    if (messages.some((m) => m.content.length > MAX_MESSAGE_LENGTH)) {
      return Response.json(
        { error: `Messages are limited to ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.` },
        { status: 400 }
      );
    }

    const claimedLookupId =
      typeof body.lookupId === "string" && body.lookupId ? body.lookupId : null;

    const stream = await streamLLM({
      model,
      system: chatSystem(mode, context),
      messages,
      effort: "low",
    });

    const logged = withHistorySave(stream, async (answer) => {
      // Attach to the lookup only if it actually belongs to this user —
      // the id arrives from the client and could be anything.
      let lookupId: string | null = null;
      if (claimedLookupId) {
        const [owned] = await db
          .select({ id: lookup.id })
          .from(lookup)
          .where(
            and(eq(lookup.id, claimedLookupId), eq(lookup.userId, session.user.id))
          )
          .limit(1);
        lookupId = owned?.id ?? null;
      }
      await db.insert(question).values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        lookupId,
        mode,
        question: messages[messages.length - 1].content,
        answer,
        model,
      });
      // No saved event for questions — nothing on the client references them.
    });

    return new Response(logged, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed. Please try again.";
    return Response.json({ error: message }, { status: 500 });
  }
}
