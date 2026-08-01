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

/** Assembled client-side from the streamed marker-format text. */
export interface DictionaryEntry {
  ipa: string;
  meaning: string;
  background: string;
  chinese: string;
  examples: DictionaryExample[];
}

export interface Phonetics {
  ipa: string;
  audioUrl: string | null;
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
  | { type: "error"; message: string }
  | ({ type: "phonetics" } & Phonetics)
  /** The completed response was saved to history under this id. */
  | { type: "saved"; id: string };

/** Stored LLM output in the `lookup` table — enough to re-open without an LLM call. */
export interface LookupResponse {
  /** Dictionary: the raw marker-format text parseDictionaryText understands. */
  raw?: string;
  /** Teacher: the Chinese translation. */
  translation?: string;
  phonetics?: Phonetics;
}

/** One row in the history list (input truncated server-side for preview). */
export interface HistoryItem {
  id: string;
  mode: LearnMode;
  input: string;
  model: string;
  createdAt: string;
}

/** A full history entry, as returned by GET /api/history/[id]. */
export interface LookupRecord extends HistoryItem {
  response: LookupResponse;
  questions: { question: string; answer: string }[];
}
