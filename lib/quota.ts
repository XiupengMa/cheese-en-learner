import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyUsage, user } from "@/lib/db/schema";
import { DAILY_QUERY_QUOTA } from "@/lib/limits";

// Every LLM call (lookup, translation, follow-up question) spends one unit
// of the user's daily allowance. The counter increments atomically via
// upsert, so concurrent requests can't sneak past the limit; once over, the
// count keeps incrementing harmlessly — enforcement only cares about <=.

export async function consumeQuota(
  userId: string
): Promise<{ allowed: boolean; limit: number }> {
  const day = new Date().toISOString().slice(0, 10); // UTC
  const [[row], [account]] = await Promise.all([
    db
      .insert(dailyUsage)
      .values({ userId, day, count: 1 })
      .onConflictDoUpdate({
        target: [dailyUsage.userId, dailyUsage.day],
        set: { count: sql`${dailyUsage.count} + 1` },
      })
      .returning({ count: dailyUsage.count }),
    db
      .select({ dailyQuota: user.dailyQuota })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
  ]);
  const limit = account?.dailyQuota ?? DAILY_QUERY_QUOTA;
  return { allowed: (row?.count ?? 1) <= limit, limit };
}

export function quotaExceeded(limit: number): Response {
  return Response.json(
    {
      error: `Daily limit reached — you've used all ${limit.toLocaleString()} queries for today. The counter resets at midnight UTC.`,
    },
    { status: 429 }
  );
}
