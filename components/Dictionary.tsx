"use client";

import { useState } from "react";
import type { DictionaryEntry } from "@/lib/types";
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

export function Dictionary({ model, debug }: { model: string; debug?: boolean }) {
  const [term, setTerm] = useState("");
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const q = term.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: q, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Lookup failed (${res.status})`);
      setEntry(data as DictionaryEntry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const chatContext = entry
    ? `Word/phrase: ${entry.term}\nPronunciation: ${entry.ipa}\nMeaning: ${entry.meaning}\nChinese: ${entry.chinese}`
    : "";

  return (
    <div>
      <form onSubmit={lookup} className="flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Type or paste a word or phrase…"
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none placeholder:text-neutral-400 focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={loading || !term.trim()}
          className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-40"
        >
          {loading ? "Looking up…" : "Look up"}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}

      {loading && !entry && (
        <div className="mt-6 animate-pulse space-y-3 rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="h-6 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-4 w-full rounded bg-neutral-100 dark:bg-neutral-800/60" />
          <div className="h-4 w-3/4 rounded bg-neutral-100 dark:bg-neutral-800/60" />
        </div>
      )}

      {entry && (
        <>
          <article className="mt-6 space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-2xl font-bold">{entry.term}</h2>
              {entry.ipa && (
                <span className="font-mono text-sm text-neutral-500">{entry.ipa}</span>
              )}
              <AudioButton
                src={entry.audioUrl}
                text={entry.term}
                title="Play US pronunciation"
              />
            </header>

            <Section title="Meaning">
              <Markdown>{entry.meaning}</Markdown>
            </Section>

            {entry.background && (
              <Section title="Background & culture">
                <Markdown>{entry.background}</Markdown>
              </Section>
            )}

            <Section title="Chinese">
              <Markdown>{entry.chinese}</Markdown>
            </Section>

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

          {debug && entry.debug && (
            <DebugPanel logs={[entry.debug]} title="Lookup debug" />
          )}

          <ChatThread
            key={entry.term}
            model={model}
            mode="dictionary"
            context={chatContext}
            debug={debug}
            placeholder={`Ask more about “${entry.term}”…`}
          />
        </>
      )}
    </div>
  );
}
