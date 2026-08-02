"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { parseDictionaryText } from "@/lib/dictionaryParse";
import { MAX_TERM_LENGTH } from "@/lib/limits";
import { submitOnModEnter } from "@/lib/keySubmit";
import { readEventStream } from "@/lib/streamClient";
import { syncUrlQuery } from "@/lib/urlQuery";
import type { ChatMessage, LLMDebug, LookupRecord, Phonetics } from "@/lib/types";
import { AudioButton } from "./AudioButton";
import { ChatThread, type ChatThreadHandle } from "./ChatThread";
import { DebugPanel } from "./DebugPanel";
import { Markdown } from "./Markdown";
import { ModelSelect } from "./ModelSelect";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

type Status = "idle" | "streaming" | "done";

export interface DictionaryHandle {
  /** Show a stored history entry — no LLM call, no fetch. */
  restore: (record: LookupRecord) => void;
  /** Run a fresh lookup (from the selection popover's "Open in Dictionary"). */
  lookup: (term: string) => void;
  /** Send a question to the follow-up thread (from the selection popover). */
  ask: (question: string) => void;
  /** Whether a follow-up thread is mounted and can take questions. */
  canAsk: () => boolean;
}

export function Dictionary({
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
  /** Deep-linked query (?mode=dict&query=…) — looked up automatically. */
  initialQuery?: string;
  ref?: Ref<DictionaryHandle>;
}) {
  const [term, setTerm] = useState("");
  const [lookedUp, setLookedUp] = useState("");
  const [raw, setRaw] = useState("");
  const [phonetics, setPhonetics] = useState<Phonetics | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lookupDebug, setLookupDebug] = useState<LLMDebug | null>(null);
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [restoredThread, setRestoredThread] = useState<ChatMessage[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatRef = useRef<ChatThreadHandle>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  const entry = useMemo(() => parseDictionaryText(raw), [raw]);

  // Focus the input on load only where a real keyboard is likely — on touch
  // devices autofocus pops the on-screen keyboard over the page.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const ranInitialQuery = useRef(false);
  useEffect(() => {
    if (!initialQuery || ranInitialQuery.current) return;
    ranInitialQuery.current = true;
    const q = initialQuery.slice(0, MAX_TERM_LENGTH);
    setTerm(q);
    void runLookup(q);
    // runLookup only needs to see the model of the render that set initialQuery
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function runLookup(q: string, opts?: { force?: boolean }) {
    if (!q || (status === "streaming" && !opts?.force)) return;
    const controller = new AbortController();
    abortRef.current = controller;
    syncUrlQuery("dictionary", q);
    setLookedUp(q);
    setRaw("");
    setPhonetics(null);
    setLookupDebug(null);
    setLookupId(null);
    setRestoredThread(null);
    setError(null);
    setStatus("streaming");
    let received = false;
    try {
      const res = await fetch("/api/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: q, model }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Lookup failed (${res.status})`);
      }
      await readEventStream(res.body, {
        onDelta: (chunk) => {
          received = true;
          setRaw((prev) => prev + chunk);
        },
        onDone: (dbg) => setLookupDebug(dbg),
        onPhonetics: (p) => setPhonetics(p),
        onSaved: (id) => setLookupId(id),
      });
      setStatus("done");
    } catch (err) {
      // Aborted means a history restore took over — its state stands.
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Lookup failed. Please try again.");
      setStatus(received ? "done" : "idle");
    }
  }

  useImperativeHandle(ref, () => ({
    restore(record) {
      abortRef.current?.abort();
      setTerm(record.input);
      setLookedUp(record.input);
      setRaw(record.response.raw ?? "");
      setPhonetics(record.response.phonetics ?? null);
      setLookupDebug(null);
      setLookupId(record.id);
      setRestoredThread(
        record.questions.flatMap((q) => [
          { role: "user" as const, content: q.question },
          { role: "assistant" as const, content: q.answer },
        ])
      );
      setError(null);
      setStatus("done");
      syncUrlQuery("dictionary", record.input);
    },
    lookup(newTerm) {
      const q = newTerm.trim().slice(0, MAX_TERM_LENGTH);
      if (!q) return;
      abortRef.current?.abort(); // an in-flight lookup loses to the new one
      setTerm(q);
      void runLookup(q, { force: true });
    },
    ask(question) {
      chatRef.current?.ask(question);
      chatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    canAsk: () => chatRef.current !== null,
    // no deps: lookup() must see the current model/status closures
  }));

  const showCard = lookedUp !== "" && status !== "idle";
  const ipa = phonetics?.ipa || entry.ipa;
  const chatContext = `Word/phrase: ${lookedUp}\nPronunciation: ${ipa}\nMeaning: ${entry.meaning}\nChinese: ${entry.chinese}`;

  return (
    // Desktop: the entry on the left, follow-up thread pinned right. The
    // grid engages as soon as the card shows so the layout doesn't jump
    // when the thread mounts at the end of streaming.
    <div
      className={
        showCard
          ? "lg:mx-auto lg:grid lg:max-w-[78rem] lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-6"
          : "lg:mx-auto lg:max-w-3xl"
      }
    >
      <div className="min-w-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runLookup(term.trim());
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={submitOnModEnter}
          placeholder="Type or paste a word or phrase…"
          maxLength={MAX_TERM_LENGTH}
          className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none placeholder:text-neutral-400 focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={status === "streaming" || !term.trim()}
          className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-40"
        >
          {status === "streaming" ? "Looking up…" : "Look up"}
        </button>
      </form>

      {onModelChange && (
        <div className="mt-2 flex justify-end">
          <ModelSelect value={model} onChange={onModelChange} />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}

      {showCard && (
        <>
          <article className="mt-4 space-y-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:mt-6 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="min-w-0 break-words text-xl font-bold sm:text-2xl">
                {lookedUp}
              </h2>
              {ipa && <span className="font-mono text-sm text-neutral-500">{ipa}</span>}
              <AudioButton
                src={phonetics?.audioUrl}
                text={lookedUp}
                title="Play US pronunciation"
              />
              {status === "streaming" && (
                <span
                  className="ml-auto h-2 w-2 animate-pulse rounded-full bg-amber-500"
                  aria-label="Loading"
                />
              )}
            </header>

            {!entry.meaning && status === "streaming" && (
              <div className="animate-pulse space-y-2">
                <div className="h-4 w-full rounded bg-neutral-100 dark:bg-neutral-800/60" />
                <div className="h-4 w-3/4 rounded bg-neutral-100 dark:bg-neutral-800/60" />
              </div>
            )}

            {entry.meaning && (
              <Section title="Meaning">
                <Markdown>{entry.meaning}</Markdown>
              </Section>
            )}

            {entry.background && (
              <Section title="Background & culture">
                <Markdown>{entry.background}</Markdown>
              </Section>
            )}

            {entry.chinese && (
              <Section title="Chinese">
                <Markdown>{entry.chinese}</Markdown>
              </Section>
            )}

            {entry.examples.length > 0 && (
              <Section title="Examples">
                <ul className="space-y-3">
                  {entry.examples.map((ex, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AudioButton text={ex.en} title="Read this sentence" className="mt-0.5" />
                      <div>
                        <p className="text-sm leading-relaxed">{ex.en}</p>
                        {ex.zh && (
                          <p className="mt-0.5 text-sm text-neutral-500">{ex.zh}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </article>

          {debug && lookupDebug && <DebugPanel logs={[lookupDebug]} title="Lookup debug" />}
        </>
      )}
      </div>

      {showCard && status === "done" && (
        <div ref={chatSectionRef} className="min-w-0 lg:sticky lg:top-20">
          <ChatThread
            key={lookupId ?? lookedUp}
            ref={chatRef}
            model={model}
            mode="dictionary"
            context={chatContext}
            debug={debug}
            lookupId={lookupId}
            initialMessages={restoredThread ?? undefined}
            placeholder={`Ask more about “${lookedUp}”…`}
          />
        </div>
      )}
    </div>
  );
}
