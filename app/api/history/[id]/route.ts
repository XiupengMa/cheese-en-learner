import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lookup, question } from "@/lib/db/schema";
import { getSession, unauthorized } from "@/lib/session";

type Context = { params: Promise<{ id: string }> };

function notFound() {
  return Response.json({ error: "History entry not found." }, { status: 404 });
}

/** Full record for instant re-open: stored response plus the Q&A thread. */
export async function GET(req: Request, { params }: Context) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const { id } = await params;

    const [row] = await db
      .select()
      .from(lookup)
      .where(and(eq(lookup.id, id), eq(lookup.userId, session.user.id)))
      .limit(1);
    if (!row) return notFound();

    const questions = await db
      .select({ question: question.question, answer: question.answer })
      .from(question)
      .where(eq(question.lookupId, id))
      .orderBy(asc(question.createdAt));

    return Response.json({ ...row, questions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load the entry.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Context) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const { id } = await params;

    // Question rows keep their text (lookupId nulls out via FK) — they feed
    // the future suggested-prompts ranking even after the lookup is gone.
    const deleted = await db
      .delete(lookup)
      .where(and(eq(lookup.id, id), eq(lookup.userId, session.user.id)))
      .returning({ id: lookup.id });
    if (deleted.length === 0) return notFound();

    return Response.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not delete the entry.";
    return Response.json({ error: message }, { status: 500 });
  }
}
