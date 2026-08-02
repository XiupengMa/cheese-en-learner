import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Better Auth core tables (spec from getAuthTables() for better-auth 1.6).
// Property names must match Better Auth's field names; column names are
// snake_case per Postgres convention. History tables will join these later.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Per-account model preferences (additionalFields in lib/auth.ts).
  // Null = app default; validated against lib/models.ts on write.
  dictionaryModel: text("dictionary_model"),
  teacherModel: text("teacher_model"),
  // Daily LLM-query allowance. Null = DAILY_QUERY_QUOTA default. Deliberately
  // NOT a Better Auth additionalField: users must not raise it via updateUser;
  // bump it per-account with SQL instead.
  dailyQuota: integer("daily_quota"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull(),
});

// Storage for Better Auth's rate limiter (rateLimit.storage: "database") —
// in-memory counters don't survive across serverless invocations. The unique
// key is load-bearing: the limiter's create-then-catch races depend on it.
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Query history: one row per Dictionary lookup / Teacher translation.
// `response` holds the full LLM output (raw marker text or translation, plus
// phonetics) so reopening from history never re-spends an LLM call.
export const lookup = pgTable(
  "lookup",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(), // "dictionary" | "teacher"
    input: text("input").notNull(),
    response: jsonb("response").notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("lookup_user_created_idx").on(t.userId, t.createdAt)]
);

// Follow-up and selection questions. lookupId is null when the parent lookup
// was deleted from history or its save failed; mode keeps them classifiable
// for the later suggested-prompts phase.
export const question = pgTable(
  "question",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lookupId: text("lookup_id").references(() => lookup.id, {
      onDelete: "set null",
    }),
    mode: text("mode").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("question_lookup_idx").on(t.lookupId)]
);

// Daily query counter, one row per user per UTC day. Incremented atomically
// (upsert) by lib/quota.ts on every LLM call; old rows are just dead weight
// and cheap enough to keep.
export const dailyUsage = pgTable(
  "daily_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // "YYYY-MM-DD" (UTC)
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })]
);

// WebAuthn credentials for the @better-auth/passkey plugin (spec from the
// plugin's schema definition).
export const passkey = pgTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"),
  createdAt: timestamp("created_at").defaultNow(),
  aaguid: text("aaguid"),
});
