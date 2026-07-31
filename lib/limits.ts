// Server-enforced input caps (mirrored as maxLength on the inputs).
// These bound per-request LLM token spend; they're generous for real usage.
export const MAX_TERM_LENGTH = 200;
export const MAX_TEXT_LENGTH = 20_000;
export const MAX_MESSAGE_LENGTH = 8_000;
// App-generated (entry summary / text + translation) — truncated, not rejected.
export const MAX_CONTEXT_LENGTH = 24_000;
