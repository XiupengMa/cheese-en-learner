export type Provider = "anthropic" | "openai";

export interface ModelOption {
  id: string;
  label: string;
  provider: Provider;
  /** Anthropic models that accept output_config.effort. */
  supportsEffort?: boolean;
  /** OpenAI models that accept reasoning_effort. */
  supportsReasoningEffort?: boolean;
}

// Model IDs and effort support verified against provider docs on 2026-10-14.
// https://platform.claude.com/docs/en/models/overview
// https://platform.claude.com/docs/en/build-with-claude/effort
// https://developers.openai.com/api/docs/models
export const MODELS: ModelOption[] = [
  // Anthropic — Messages API
  { id: "claude-fable-5-1", label: "Claude Fable 5.1", provider: "anthropic", supportsEffort: true },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic", supportsEffort: true },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic", supportsEffort: true },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", provider: "anthropic", supportsEffort: true },
  // OpenAI — Chat Completions API
  { id: "gpt-6-astra", label: "GPT-6 Astra", provider: "openai", supportsReasoningEffort: true },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol", provider: "openai", supportsReasoningEffort: true },
  { id: "gpt-6-luna", label: "GPT-6 Luna", provider: "openai", supportsReasoningEffort: true },
];

export const DEFAULT_MODEL = "claude-opus-5-5";

export function getModel(id: string): ModelOption {
  const model = MODELS.find((m) => m.id === id);
  if (!model) {
    throw new Error(`Unknown model: ${id}`);
  }
  return model;
}

export function isKnownModel(id: unknown): id is string {
  return typeof id === "string" && MODELS.some((m) => m.id === id);
}

/** A usable model id from untrusted input: the id if known, else the default.
 *  Also covers stored preferences whose model has since been retired. */
export function resolveModel(id: unknown): string {
  return isKnownModel(id) ? id : DEFAULT_MODEL;
}
