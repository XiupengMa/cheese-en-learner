export type Provider = "anthropic" | "openai";

export interface ModelOption {
  id: string;
  label: string;
  provider: Provider;
  /** Anthropic models that accept output_config.effort (not Sonnet 4.5 / Haiku 4.5). */
  supportsEffort?: boolean;
  /** OpenAI models that accept reasoning_effort. */
  supportsReasoningEffort?: boolean;
}

export const MODELS: ModelOption[] = [
  // Anthropic — Messages API
  { id: "claude-opus-5", label: "Claude Opus 5", provider: "anthropic", supportsEffort: true },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "anthropic", supportsEffort: true },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", provider: "anthropic", supportsEffort: true },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "anthropic", supportsEffort: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic", supportsEffort: true },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic", supportsEffort: true },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic" },
  // OpenAI — Chat Completions API
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", provider: "openai", supportsReasoningEffort: true },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", provider: "openai", supportsReasoningEffort: true },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", provider: "openai", supportsReasoningEffort: true },
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai", supportsReasoningEffort: true },
  { id: "gpt-5.4", label: "GPT-5.4", provider: "openai", supportsReasoningEffort: true },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai", supportsReasoningEffort: true },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "openai", supportsReasoningEffort: true },
];

export const DEFAULT_MODEL = "claude-opus-5";

export function getModel(id: string): ModelOption {
  const model = MODELS.find((m) => m.id === id);
  if (!model) {
    throw new Error(`Unknown model: ${id}`);
  }
  return model;
}
