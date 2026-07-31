"use client";

import { useEffect, useRef, useState } from "react";
import { readEventStream } from "@/lib/streamClient";
import type { LLMDebug } from "@/lib/types";
import { AudioButton } from "./AudioButton";
import { ChatThread, type ChatThreadHandle } from "./ChatThread";
import { DebugPanel } from "./DebugPanel";

interface Popover {
  text: string;
  x: number;
  y: number;
}

export function Teacher({ model, debug }: { model: string; debug?: boolean }) {
  const [text, setText] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translationDebug, setTranslationDebug] = useState<LLMDebug | null>(null);

  const [popover, setPopover] = useState<Popover | null>(null);
  const [question, setQuestion] = useState("");

  const selectionAreaRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<ChatThreadHandle>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  // Close the popover when clicking anywhere outside of it.
  useEffect(() => {
    if (!popover) return;
    function onMouseDown(e: MouseEvent) {
      if (!popoverRef.current?.contains(e.target as Node)) {
        setPopover(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [popover]);

  async function translate(e: React.FormEvent) {
    e.preventDefault();
    const source = text.trim();
    if (!source || translating) return;
    setSubmittedText(source);
    setTranslation("");
    setTranslationDebug(null);
    setPopover(null);
    setError(null);
    setTranslating(true);
    try {
      const res = await fetch("/api/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, model }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Translation failed (${res.status})`);
      }
      await readEventStream(res.body, {
        onDelta: (chunk) => setTranslation((prev) => prev + chunk),
        onDone: (dbg) => setTranslationDebug(dbg),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed. Please try again.");
    } finally {
      setTranslating(false);
    }
  }

  function onTextMouseUp() {
    // Let the browser finish updating the selection first.
    setTimeout(() => {
      const sel = window.getSelection();
      const selText = sel?.toString().trim();
      if (!sel || sel.isCollapsed || !selText) return;
      if (!selectionAreaRef.current?.contains(sel.anchorNode)) return;

      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const areaRect = selectionAreaRef.current.getBoundingClientRect();
      const rawX = rect.left - areaRect.left + rect.width / 2;
      const x = Math.min(Math.max(rawX, 130), areaRect.width - 130);
      const y = rect.bottom - areaRect.top;
      setQuestion("");
      setPopover({ text: selText, x, y });
    }, 0);
  }

  function askAboutSelection(q: string) {
    chatRef.current?.ask(q);
    setPopover(null);
    window.getSelection()?.removeAllRanges();
    chatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const truncatedSelection =
    popover && popover.text.length > 60 ? popover.text.slice(0, 60) + "…" : popover?.text;

  const chatContext = submittedText
    ? `English text:\n${submittedText}\n\nChinese translation:\n${translation}`
    : "";

  return (
    <div>
      <form onSubmit={translate}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Paste an English sentence or paragraphs to study…"
          className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base leading-relaxed shadow-sm outline-none placeholder:text-neutral-400 focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="mt-2 flex justify-end">
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
          {/* Original text — selectable, with the ask-about-selection popover */}
          <div
            ref={selectionAreaRef}
            className="relative mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
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
            <p
              onMouseUp={onTextMouseUp}
              className="cursor-text select-text whitespace-pre-wrap leading-relaxed selection:bg-amber-200 dark:selection:bg-amber-700/60"
            >
              {submittedText}
            </p>

            {popover && (
              <div
                ref={popoverRef}
                style={{ left: popover.x, top: popover.y + 8 }}
                className="absolute z-10 w-64 -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
              >
                <p className="mb-2 line-clamp-2 text-xs italic text-neutral-500">
                  “{truncatedSelection}”
                </p>
                <button
                  type="button"
                  onClick={() =>
                    askAboutSelection(
                      `Explain this part of the text: “${popover.text}” — its meaning, grammar, and usage.`
                    )
                  }
                  className="mb-2 w-full rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                >
                  ✨ Explain this
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!question.trim()) return;
                    askAboutSelection(
                      `About the selected part “${popover.text}”: ${question.trim()}`
                    );
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Or ask a question…"
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-amber-400 dark:border-neutral-600 dark:bg-neutral-900"
                  />
                  <button
                    type="submit"
                    disabled={!question.trim()}
                    className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    Ask
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Translation */}
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
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

          <div ref={chatSectionRef}>
            <ChatThread
              key={submittedText}
              ref={chatRef}
              model={model}
              mode="teacher"
              context={chatContext}
              debug={debug}
              placeholder="Ask about grammar, vocabulary, tone…"
            />
          </div>
        </>
      )}
    </div>
  );
}
