import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lookup } from "@/lib/db/schema";
import { getSession, unauthorized } from "@/lib/session";

const MAX_ITEMS = 100;
// Teacher inputs run to 20k chars; the list only needs a preview line.
const PREVIEW_LENGTH = 200;

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    if (!session) return unauthorized();

    const items = await db
      .select({
        id: lookup.id,
        mode: lookup.mode,
        input: sql<string>`left(${lookup.input}, ${PREVIEW_LENGTH})`,
        model: lookup.model,
        createdAt: lookup.createdAt,
      })
      .from(lookup)
      .where(eq(lookup.userId, session.user.id))
      .orderBy(desc(lookup.createdAt))
      .limit(MAX_ITEMS);

    return Response.json({ items });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load history.";
    return Response.json({ error: message }, { status: 500 });
  }
}
