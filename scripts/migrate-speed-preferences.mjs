import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL (or add it to .env.local) before running this migration.");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  // Additive and safe to re-run; existing accounts start at Standard speed.
  await client.query(`
    ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS dictionary_speed text NOT NULL DEFAULT 'standard',
      ADD COLUMN IF NOT EXISTS teacher_speed text NOT NULL DEFAULT 'standard'
  `);
  console.log("Account speed preferences are ready.");
} finally {
  await client.end();
}
