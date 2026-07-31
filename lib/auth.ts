import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";

export const auth = betterAuth({
  appName: "Cheese English Learner",
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
  },
  hooks: {
    // Sign-up is invite-only: the client sends `inviteCode` alongside the
    // regular sign-up fields, checked here against SIGNUP_INVITE_CODE.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const expected = process.env.SIGNUP_INVITE_CODE;
      const given =
        typeof ctx.body?.inviteCode === "string" ? ctx.body.inviteCode.trim() : "";
      if (!expected || given !== expected) {
        throw new APIError("FORBIDDEN", {
          message: "Invalid invite code. Ask the person who runs this app for one.",
        });
      }
    }),
  },
  plugins: [nextCookies()],
});
