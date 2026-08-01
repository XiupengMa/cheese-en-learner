"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseDictionaryText } from "@/lib/dictionaryParse";
import { MAX_TERM_LENGTH } from "@/lib/limits";
import { readEventStream } from "@/lib/streamClient";
import { syncUrlQuery } from "@/lib/urlQuery";
import type { LLMDebug, Phonetics } from "@/lib/types";
import { AudioButton } from "./AudioButton";
import { ChatThread } from "./ChatThread";
import { DebugPanel } from "./DebugPanel";
import { Markdown } from "./Markdown";

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

export function Dictionary({
  model,
  debug,
  initialQuery,
}: {
  model: string;
  debug?: boolean;
  /** Deep-linked query (?mode=dict&query=…) — looked up automatically. */
  initialQuery?: string;
}) {
  const [term, setTerm] = useState("");
  const [lookedUp, setLookedUp] = useState("");
  const [raw, setRaw] = useState("");
  const [phonetics, setPhonetics] = useState<Phonetics | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lookupDebug, setLookupDebug] = useState<LLMDebug | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function runLookup(q: string) {
    if (!q || status === "streaming") return;
    syncUrlQuery("dictionary", q);
    setLookedUp(q);
    setRaw("");
    setPhonetics(null);
    setLookupDebug(null);
    setError(null);
    setStatus("streaming");
    let received = false;
    try {
      const res = await fetch("/api/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: q, model }),
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
      });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed. Please try again.");
      setStatus(received ? "done" : "idle");
    }
  }

  const showCard = lookedUp !== "" && status !== "idle";
  const ipa = phonetics?.ipa || entry.ipa;
  const chatContext = `Word/phrase: ${lookedUp}\nPronunciation: ${ipa}\nMeaning: ${entry.meaning}\nChinese: ${entry.chinese}`;

  return (
    <div>
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

          {status === "done" && (
            <ChatThread
              key={lookedUp}
              model={model}
              mode="dictionary"
              context={chatContext}
              debug={debug}
              placeholder={`Ask more about “${lookedUp}”…`}
            />
          )}
        </>
      )}
    </div>
  );
}
