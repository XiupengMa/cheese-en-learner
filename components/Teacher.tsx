"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { submitOnModEnter } from "@/lib/keySubmit";
import { MAX_TEXT_LENGTH } from "@/lib/limits";
import { readEventStream } from "@/lib/streamClient";
import { syncUrlQuery } from "@/lib/urlQuery";
import type { ChatMessage, LLMDebug, LookupRecord } from "@/lib/types";
import { AudioButton } from "./AudioButton";
import { ChatThread, type ChatThreadHandle } from "./ChatThread";
import { DebugPanel } from "./DebugPanel";
import { ModelSelect } from "./ModelSelect";

export interface TeacherHandle {
  /** Show a stored history entry — no LLM call, no fetch. */
  restore: (record: LookupRecord) => void;
  /** Send a question to the follow-up thread (from the selection popover). */
  ask: (question: string) => void;
  /** Whether a follow-up thread is mounted and can take questions. */
  canAsk: () => boolean;
}

export function Teacher({
  model,
  onModelChange,
  debug,
  initialQuery,
  ref,
}: {
  model: string;
  /** Persist a new model choice for this mode (account-level preference). */
  onModelChange?: (id: string) => void;
  debug?: boolean;
  /** Deep-linked text (?mode=teacher&query=…) — translated automatically. */
  initialQuery?: string;
  ref?: Ref<TeacherHandle>;
}) {
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translationDebug, setTranslationDebug] = useState<LLMDebug | null>(null);
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [restoredThread, setRestoredThread] = useState<ChatMessage[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const chatRef = useRef<ChatThreadHandle>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  const ranInitialQuery = useRef(false);
  useEffect(() => {
    if (!initialQuery || ranInitialQuery.current) return;
    ranInitialQuery.current = true;
    const source = initialQuery.slice(0, MAX_TEXT_LENGTH);
    setText(source);
    void runTranslate(source);
    // runTranslate only needs the model of the render that set initialQuery
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function runTranslate(source: string) {
    if (!source || translating) return;
    const controller = new AbortController();
    abortRef.current = controller;
    syncUrlQuery("teacher", source);
    setSubmittedText(source);
    setTranslation("");
    setTranslationDebug(null);
    setLookupId(null);
    setRestoredThread(null);
    setError(null);
    setTranslating(true);
    try {
      const res = await fetch("/api/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, model }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Translation failed (${res.status})`);
      }
      await readEventStream(res.body, {
        onDelta: (chunk) => setTranslation((prev) => prev + chunk),
        onDone: (dbg) => setTranslationDebug(dbg),
        onSaved: (id) => setLookupId(id),
      });
    } catch (err) {
      // Aborted means a history restore took over — its state stands.
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Translation failed. Please try again.");
    } finally {
      setTranslating(false);
    }
  }

  useImperativeHandle(ref, () => ({
    restore(record) {
      abortRef.current?.abort();
      setText(record.input);
      setSubmittedText(record.input);
      setTranslation(record.response.translation ?? "");
      setTranslationDebug(null);
      setLookupId(record.id);
      setRestoredThread(
        record.questions.flatMap((q) => [
          { role: "user" as const, content: q.question },
          { role: "assistant" as const, content: q.answer },
        ])
      );
      setError(null);
      syncUrlQuery("teacher", record.input);
    },
    ask(question) {
      chatRef.current?.ask(question);
      chatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    canAsk: () => chatRef.current !== null,
  }), []);

  const chatContext = submittedText
    ? `English text:\n${submittedText}\n\nChinese translation:\n${translation}`
    : "";

  return (
    // Desktop: reading material on the left, follow-up thread pinned right.
    <div
      className={
        submittedText
          ? "lg:mx-auto lg:grid lg:max-w-[78rem] lg:grid-cols-2 lg:items-start lg:gap-6"
          : "lg:mx-auto lg:max-w-3xl"
      }
    >
      <div className="min-w-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runTranslate(text.trim());
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={submitOnModEnter}
          rows={5}
          maxLength={MAX_TEXT_LENGTH}
          placeholder="Paste an English sentence or paragraphs to study…"
          className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base leading-relaxed shadow-sm outline-none placeholder:text-neutral-400 focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {onModelChange ? (
            <ModelSelect value={model} onChange={onModelChange} />
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={translating || !text.trim()}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-40"
          >
            {translating ? "Translating…" : "Translate & study"}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}

      {submittedText && (
        <>
          {/* Original text — select any part to get the explain/dict popover */}
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:mt-6 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500">
                  Original
                </h3>
                <AudioButton text={submittedText} title="Read the text aloud" />
              </div>
              <span className="text-xs text-neutral-400">
                Select any part to ask about it
              </span>
            </div>
            <p className="cursor-text select-text whitespace-pre-wrap leading-relaxed">
              {submittedText}
            </p>
          </div>

          {/* Translation */}
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500">
              Translation
            </h3>
            {translation ? (
              <p className="whitespace-pre-wrap leading-relaxed">{translation}</p>
            ) : (
              <p className="text-sm text-neutral-400">
                {translating ? "Translating…" : ""}
              </p>
            )}
          </div>

          {debug && translationDebug && (
            <DebugPanel logs={[translationDebug]} title="Translation debug" />
          )}
        </>
      )}
      </div>

      {submittedText && (
        <div ref={chatSectionRef} className="min-w-0 lg:sticky lg:top-20">
          <ChatThread
            key={lookupId ?? submittedText}
            ref={chatRef}
            model={model}
            mode="teacher"
            context={chatContext}
            debug={debug}
            lookupId={lookupId}
            initialMessages={restoredThread ?? undefined}
            placeholder="Ask about grammar, vocabulary, tone…"
          />
        </div>
      )}
    </div>
  );
}
