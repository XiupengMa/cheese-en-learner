import type { Provider } from "./models";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type LearnMode = "dictionary" | "teacher";

export interface DictionaryExample {
  en: string;
  zh: string;
}

export interface DictionaryEntry {
  term: string;
  ipa: string;
  audioUrl: string | null;
  meaning: string;
  background: string;
  chinese: string;
  examples: DictionaryExample[];
  debug?: LLMDebug;
}

/** A faithful record of one round trip between this server and the LLM provider. */
export interface LLMDebug {
  request: {
    provider: Provider;
    endpoint: string;
    /** The exact payload object passed to the provider SDK. */
    payload: unknown;
  };
  response: {
    text: string;
    usage?: unknown;
    durationMs: number;
  };
}

/** NDJSON events emitted by the streaming API routes. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; debug: LLMDebug }
  | { type: "error"; message: string };
