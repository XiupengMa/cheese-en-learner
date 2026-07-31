"use client";

import { useCallback, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
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
  ref?: Ref<ChatThreadHandle>;
}

export function ChatThread({
  model,
  mode,
  context,
  placeholder,
  debug,
  ref,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<LLMDebug[]>([]);
  const busyRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busyRef.current) return;
      busyRef.current = true;
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
          body: JSON.stringify({ model, mode, context, messages: history }),
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
            bottomRef.current?.scrollIntoView({ block: "nearest" });
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
    [model, mode, context]
  );

  useImperativeHandle(ref, () => ({ ask }), [ask]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input;
    setInput("");
    void ask(q);
  }

  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Follow-up
      </p>

      {messages.length > 0 && (
        <div className="mb-3 flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">
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
          <div ref={bottomRef} />
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
          placeholder={placeholder ?? "Ask anything about it…"}
          className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-950"
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
