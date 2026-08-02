// Server-enforced input caps (mirrored as maxLength on the inputs).
// These bound per-request LLM token spend; they're generous for real usage.
export const MAX_TERM_LENGTH = 200;
export const MAX_TEXT_LENGTH = 20_000;
export const MAX_MESSAGE_LENGTH = 8_000;
// App-generated (entry summary / text + translation) — truncated, not rejected.
export const MAX_CONTEXT_LENGTH = 24_000;
// Text-to-speech input (example sentences and short fragments).
export const MAX_TTS_LENGTH = 1_000;
// Default per-user LLM queries per UTC day — lookups, translations, and
// follow-up questions all count. Overridable per account (user.daily_quota).
export const DAILY_QUERY_QUOTA = 1_000;
