"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { submitOnModEnter } from "@/lib/keySubmit";
import { MAX_TEXT_LENGTH } from "@/lib/limits";
import { readEventStream } from "@/lib/streamClient";
import { syncUrlQuery } from "@/lib/urlQuery";
import type { ChatMessage, LLMDebug, LookupRecord } from "@/lib/types";
import { expandToWords, wordRuns } from "@/lib/wordSelection";
import { AudioButton } from "./AudioButton";
import { ChatThread, type ChatThreadHandle } from "./ChatThread";
import { DebugPanel } from "./DebugPanel";
import { ModelSelect } from "./ModelSelect";

interface Popover {
  text: string;
  x: number;
  y: number;
}

/** One rounded highlight box per selected word, relative to the card. */
interface WordBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TeacherHandle {
  /** Show a stored history entry — no LLM call, no fetch. */
  restore: (record: LookupRecord) => void;
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

  const [popover, setPopover] = useState<Popover | null>(null);
  const [question, setQuestion] = useState("");
  const [selOffsets, setSelOffsets] = useState<{ start: number; end: number } | null>(null);
  const [wordBoxes, setWordBoxes] = useState<WordBox[]>([]);
  // While true the word highlight is frozen (popover open, or an ask is in
  // flight) — selection collapses (e.g. iOS input focus) won't clear it.
  const lockedRef = useRef(false);

  const selectionAreaRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<ChatThreadHandle>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);

  const clearHighlight = useCallback(() => {
    lockedRef.current = false;
    setSelOffsets(null);
    setWordBoxes([]);
  }, []);

  // Tapping/clicking anywhere outside the popover dismisses it; away from
  // the original text it also deselects (including the native selection, so
  // a later pointerup can't resurrect the popover from a stale range).
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      setPopover(null);
      lockedRef.current = false;
      if (!textRef.current?.contains(target)) {
        clearHighlight();
        window.getSelection()?.removeAllRanges();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [clearHighlight]);

  // Quick deselect: Escape clears the highlight, the popover, and any
  // native selection.
  useEffect(() => {
    if (!popover && !selOffsets) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setPopover(null);
      clearHighlight();
      window.getSelection()?.removeAllRanges();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [popover, selOffsets, clearHighlight]);

  // Focus the popover's question input only where a real keyboard is likely —
  // on touch devices the on-screen keyboard would cover the popover itself.
  useEffect(() => {
    if (popover && window.matchMedia("(pointer: fine)").matches) {
      questionInputRef.current?.focus();
    }
  }, [popover]);

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
    setPopover(null);
    clearHighlight();
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
      setPopover(null);
      clearHighlight();
      setError(null);
      syncUrlQuery("teacher", record.input);
    },
  }), [clearHighlight]);

  // Map the live browser selection onto [start, end) offsets in the original
  // text, clamped to the paragraph and snapped outward to whole words.
  const readSelection = useCallback((): { start: number; end: number } | null => {
    const p = textRef.current;
    const node = p?.firstChild;
    const sel = window.getSelection();
    if (!p || !(node instanceof Text) || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return null;
    }
    const range = sel.getRangeAt(0);
    const toOffset = (container: Node, offset: number): number | null => {
      if (container === node) return offset;
      if (container === p) return offset === 0 ? 0 : node.data.length;
      // Selection edge outside the paragraph (the drag overshot it) —
      // clamp to the nearest end of the text.
      const pos = p.compareDocumentPosition(container);
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 0;
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return node.data.length;
      return null;
    };
    const rawStart = toOffset(range.startContainer, range.startOffset);
    const rawEnd = toOffset(range.endContainer, range.endOffset);
    if (rawStart === null || rawEnd === null || rawStart >= rawEnd) return null;
    const [start, end] = expandToWords(node.data, rawStart, rawEnd);
    return start < end ? { start, end } : null;
  }, []);

  // Compute the rounded highlight boxes for the words inside [start, end).
  const measureBoxes = useCallback((offsets: { start: number; end: number } | null) => {
    const area = selectionAreaRef.current;
    const node = textRef.current?.firstChild;
    if (!offsets || !area || !(node instanceof Text)) {
      setWordBoxes([]);
      return;
    }
    const areaRect = area.getBoundingClientRect();
    const range = document.createRange();
    const boxes: WordBox[] = [];
    const pushRects = (from: number, to: number) => {
      range.setStart(node, from);
      range.setEnd(node, to);
      for (const r of range.getClientRects()) {
        if (r.width <= 0) continue;
        boxes.push({
          left: r.left - areaRect.left - 2,
          top: r.top - areaRect.top - 1.5,
          width: r.width + 4,
          height: r.height + 3,
        });
      }
    };
    const runs = wordRuns(node.data, offsets.start, offsets.end);
    if (runs.length > 400) {
      pushRects(offsets.start, offsets.end); // huge selection — box per line
    } else {
      for (const [from, to] of runs) pushRects(from, to);
    }
    setWordBoxes(boxes);
  }, []);

  // Re-measure when the window resizes (the text reflows).
  useEffect(() => {
    if (!selOffsets) return;
    const onResize = () => measureBoxes(selOffsets);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [selOffsets, measureBoxes]);

  const showPopoverFromSelection = useCallback(() => {
    // Don't reset or reposition while the user is typing in the popover
    // (on iOS, focusing its input collapses the text selection).
    if (popoverRef.current?.contains(document.activeElement)) return;

    const offsets = readSelection();
    const area = selectionAreaRef.current;
    const node = textRef.current?.firstChild;
    if (!offsets) {
      // A plain click (collapsed selection) deselects, unless frozen.
      if (!lockedRef.current) clearHighlight();
      return;
    }
    if (!area || !(node instanceof Text)) return;

    setSelOffsets(offsets);
    measureBoxes(offsets);

    const range = document.createRange();
    range.setStart(node, offsets.start);
    range.setEnd(node, offsets.end);
    const rect = range.getBoundingClientRect();
    const areaRect = area.getBoundingClientRect();
    const rawX = rect.left - areaRect.left + rect.width / 2;
    // Keep the popover (half-width 130px) inside the card, even when the
    // card itself is narrower than the popover on small screens.
    const half = Math.min(130, areaRect.width / 2);
    const x = Math.min(Math.max(rawX, half), areaRect.width - half);
    const y = rect.bottom - areaRect.top;
    lockedRef.current = true; // keep the highlight while the popover is up
    setQuestion("");
    setPopover({ text: node.data.slice(offsets.start, offsets.end), x, y });
  }, [readSelection, measureBoxes, clearHighlight]);

  // Open the popover when the pointer is released — on the document, not
  // the paragraph, so drags that end past the text edge still count.
  useEffect(() => {
    function onPointerUp(e: PointerEvent) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      // Let the browser finish updating the selection first.
      setTimeout(showPopoverFromSelection, 0);
    }
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, [showPopoverFromSelection]);

  // Word-snapped highlight follows the selection live while dragging. On
  // touch, the popover follows too (debounced) — long-press selection and
  // drag handles don't reliably fire pointerup.
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let popoverTimer: number;
    let frame: number;
    const onSelectionChange = () => {
      if (popoverRef.current?.contains(document.activeElement)) return;
      const offsets = readSelection();
      if (!offsets && lockedRef.current) return; // frozen highlight stays
      if (offsets) lockedRef.current = false; // user is re-selecting
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setSelOffsets(offsets);
        measureBoxes(offsets);
      });
      if (coarse && offsets) {
        window.clearTimeout(popoverTimer);
        popoverTimer = window.setTimeout(showPopoverFromSelection, 300);
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      window.clearTimeout(popoverTimer);
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [readSelection, measureBoxes, showPopoverFromSelection]);

  function askAboutSelection(q: string) {
    chatRef.current?.ask(q);
    setPopover(null);
    // Keep the word highlight visible while the answer streams — Esc, a
    // click anywhere, or a new selection clears it.
    lockedRef.current = true;
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
          {/* Original text — selectable, with the ask-about-selection popover */}
          <div
            ref={selectionAreaRef}
            className="relative mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:mt-6 sm:p-6 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500">
                  Original
                </h3>
                <AudioButton text={submittedText} title="Read the text aloud" />
              </div>
              <span className="text-xs text-neutral-400">
                {selOffsets ? "Esc or click away to deselect" : "Select any part to ask about it"}
              </span>
            </div>
            {/* Rounded per-word highlight — painted under the text (the
                paragraph is positioned and later in the DOM) */}
            {wordBoxes.map((b, i) => (
              <span
                key={i}
                aria-hidden
                className="pointer-events-none absolute rounded-md bg-amber-200 ring-1 ring-amber-400/60 dark:bg-amber-700/60 dark:ring-amber-500/50"
                style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
              />
            ))}
            <p
              ref={textRef}
              className="relative cursor-text select-text whitespace-pre-wrap leading-relaxed selection:bg-transparent"
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
                      `Explain this part of the text: “${popover.text.slice(0, 2000)}” — its meaning, grammar, and usage.`
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
                      `About the selected part “${popover.text.slice(0, 2000)}”: ${question.trim()}`
                    );
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    ref={questionInputRef}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={submitOnModEnter}
                    placeholder="Or ask a question…"
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-base outline-none focus:border-amber-400 sm:text-xs dark:border-neutral-600 dark:bg-neutral-900"
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

          <div ref={chatSectionRef}>
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
        </>
      )}
    </div>
  );
}
