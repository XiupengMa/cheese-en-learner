import { createHash, timingSafeEqual } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";

// Constant-time comparison; hashing first makes unequal lengths safe.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const auth = betterAuth({
  appName: "Cheese English Learner",
  // Pin the canonical origin so Better Auth's Origin-header check validates
  // against it instead of trusting Host/X-Forwarded-Host from the request.
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
  },
  rateLimit: {
    // Counters in Postgres instead of per-instance memory, so limits hold
    // across serverless invocations. (Enabled in production by default.)
    storage: "database",
    modelName: "rateLimit",
  },
  hooks: {
    // Sign-up is invite-only: the client sends `inviteCode` alongside the
    // regular sign-up fields, checked here against SIGNUP_INVITE_CODE
    // (one or more valid codes, comma-separated).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const validCodes = (process.env.SIGNUP_INVITE_CODE ?? "")
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean);
      const given =
        typeof ctx.body?.inviteCode === "string" ? ctx.body.inviteCode.trim() : "";
      const matches = validCodes.some((code) => safeEqual(given, code));
      if (validCodes.length === 0 || !matches) {
        throw new APIError("FORBIDDEN", {
          message: "Invalid invite code. Ask the person who runs this app for one.",
        });
      }
    }),
  },
  plugins: [nextCookies()],
});
