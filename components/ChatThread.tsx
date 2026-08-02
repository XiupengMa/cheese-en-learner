"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { submitOnModEnter } from "@/lib/keySubmit";
import { MAX_MESSAGE_LENGTH } from "@/lib/limits";
import { readEventStream } from "@/lib/streamClient";
import type { ChatMessage, LearnMode, LLMDebug } from "@/lib/types";
import { DebugPanel } from "./DebugPanel";
import { Markdown } from "./Markdown";

export interface ChatThreadHandle {
  ask: (question: string) => void;
}

interface ChatThreadProps {
  model: string;
  mode: LearnMode;
  context: string;
  placeholder?: string;
  debug?: boolean;
  /** History row this thread belongs to; sent so follow-ups are linked to it. */
  lookupId?: string | null;
  /** Restored thread from history. Change the component key to re-init. */
  initialMessages?: ChatMessage[];
  ref?: Ref<ChatThreadHandle>;
}

export function ChatThread({
  model,
  mode,
  context,
  placeholder,
  debug,
  lookupId,
  initialMessages,
  ref,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<LLMDebug[]>([]);
  const busyRef = useRef(false);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  // Follow the stream only while the user is at the bottom of the box —
  // scrolling up means they're reading, so stop yanking the view down.
  const followRef = useRef(true);

  function onScroll() {
    const el = scrollBoxRef.current;
    if (!el) return;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  // Pin the box to the bottom as messages stream in (after the DOM commit,
  // so the new content's height is included). Only the box scrolls — never
  // the page.
  useEffect(() => {
    const el = scrollBoxRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busyRef.current) return;
      busyRef.current = true;
      followRef.current = true; // a new prompt re-arms auto-scroll
      setBusy(true);
      setError(null);

      let history: ChatMessage[] = [];
      setMessages((prev) => {
        history = [...prev, { role: "user", content: q }];
        return [...history, { role: "assistant", content: "" }];
      });
      // let the state update above flush before the fetch races it
      await Promise.resolve();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            mode,
            context,
            messages: history,
            lookupId: lookupId ?? null,
          }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `Request failed (${res.status})`);
        }
        await readEventStream(res.body, {
          onDelta: (chunk) => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + chunk };
              return next;
            });
          },
          onDone: (dbg) => setDebugLogs((prev) => [...prev, dbg]),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        // drop the empty assistant placeholder if nothing streamed
        setMessages((prev) =>
          prev.length && prev[prev.length - 1].content === ""
            ? prev.slice(0, -1)
            : prev
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [model, mode, context, lookupId]
  );

  useImperativeHandle(ref, () => ({ ask }), [ask]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input;
    setInput("");
    void ask(q);
  }

  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm lg:mt-0 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Follow-up
      </p>

      {messages.length > 0 && (
        <div
          ref={scrollBoxRef}
          onScroll={onScroll}
          className="mb-3 flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1 lg:max-h-[max(16rem,calc(100dvh-19rem))]"
        >
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div
                key={i}
                className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-amber-100 px-3.5 py-2 text-sm text-neutral-900 dark:bg-amber-900/40 dark:text-neutral-100"
              >
                {msg.content}
              </div>
            ) : (
              <div
                key={i}
                className="max-w-[95%] rounded-2xl rounded-bl-sm bg-neutral-100 px-3.5 py-2 dark:bg-neutral-800"
              >
                {msg.content ? (
                  <Markdown>{msg.content}</Markdown>
                ) : (
                  <span className="text-sm text-neutral-400">Thinking…</span>
                )}
              </div>
            )
          )}
        </div>
      )}

      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={submitOnModEnter}
          placeholder={placeholder ?? "Ask anything about it…"}
          maxLength={MAX_MESSAGE_LENGTH}
          className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-base outline-none placeholder:text-neutral-400 focus:border-amber-400 sm:text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>

      {debug && <DebugPanel logs={debugLogs} title="Follow-up debug" />}
    </div>
  );
}
