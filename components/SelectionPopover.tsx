"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { submitOnModEnter } from "@/lib/keySubmit";
import { MAX_TERM_LENGTH } from "@/lib/limits";
import { snapEnd, snapStart, wordRuns } from "@/lib/wordSelection";

interface Popover {
  text: string;
  x: number;
  y: number;
  /** Whether the active panel had a follow-up thread when the popup opened. */
  canExplain: boolean;
}

/** One rounded highlight box per selected word, in overlay coordinates. */
interface WordBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Selection edges inside form controls or chrome aren't page content. */
const NON_CONTENT = "input, textarea, select, button, nav";

/**
 * Select-anywhere popover: selecting text inside `containerRef` snaps the
 * selection outward to whole words, highlights each word with a rounded box,
 * and offers "Explain this" (routed to the active panel's follow-up thread),
 * a free-form question, and "Open in Dictionary". The highlight is React
 * state, so it survives native-selection collapses (e.g. iOS input focus)
 * and stays visible while an answer streams. Esc or a click away deselects.
 */
export function SelectionPopover({
  containerRef,
  canExplain,
  onAsk,
  onOpenInDict,
}: {
  /** Region whose text is selectable content (the page's <main>). */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Whether the active panel currently has a thread to answer questions. */
  canExplain: () => boolean;
  /** Deliver a question to the active panel's follow-up thread. */
  onAsk: (question: string) => void;
  /** Look the words up in the Dictionary tab. */
  onOpenInDict: (term: string) => void;
}) {
  const [popover, setPopover] = useState<Popover | null>(null);
  const [question, setQuestion] = useState("");
  const [wordBoxes, setWordBoxes] = useState<WordBox[]>([]);
  // While true the word highlight is frozen (popover open, or an ask is in
  // flight) — selection collapses (e.g. iOS input focus) won't clear it.
  const lockedRef = useRef(false);
  // The snapped selection, kept for re-measuring on window resize.
  const rangeRef = useRef<Range | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLInputElement>(null);

  const clearHighlight = useCallback(() => {
    lockedRef.current = false;
    rangeRef.current = null;
    setWordBoxes([]);
  }, []);

  // Read the live browser selection, restricted to the content container,
  // with both edges snapped outward to whole-word boundaries.
  const readSelection = useCallback((): Range | null => {
    const root = containerRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    for (const container of [range.startContainer, range.endContainer]) {
      if (!root.contains(container)) return null;
      const el = container instanceof Element ? container : container.parentElement;
      if (el?.closest(NON_CONTENT)) return null;
    }
    const snapped = range.cloneRange();
    if (snapped.startContainer instanceof Text) {
      snapped.setStart(
        snapped.startContainer,
        snapStart(snapped.startContainer.data, snapped.startOffset)
      );
    }
    if (snapped.endContainer instanceof Text) {
      snapped.setEnd(
        snapped.endContainer,
        snapEnd(snapped.endContainer.data, snapped.endOffset)
      );
    }
    if (snapped.collapsed || !snapped.toString().trim()) return null;
    return snapped;
  }, [containerRef]);

  // Every text node the range passes through, with the covered slice.
  const textSlices = useCallback((range: Range) => {
    const slices: Array<{ node: Text; from: number; to: number }> = [];
    const top = range.commonAncestorContainer;
    if (top instanceof Text) {
      slices.push({ node: top, from: range.startOffset, to: range.endOffset });
      return slices;
    }
    const walker = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n as Text;
      if (!range.intersectsNode(t)) continue;
      const from = t === range.startContainer ? range.startOffset : 0;
      const to = t === range.endContainer ? range.endOffset : t.data.length;
      if (from < to && t.data.slice(from, to).trim()) slices.push({ node: t, from, to });
    }
    return slices;
  }, []);

  // Compute the rounded highlight boxes for each word in the range.
  const measureBoxes = useCallback(
    (range: Range | null) => {
      const overlay = overlayRef.current;
      if (!range || !overlay) {
        setWordBoxes([]);
        return;
      }
      const oRect = overlay.getBoundingClientRect();
      const boxes: WordBox[] = [];
      const sub = document.createRange();
      const pushRects = (rects: DOMRectList) => {
        for (const r of rects) {
          if (r.width <= 0) continue;
          boxes.push({
            left: r.left - oRect.left - 2,
            top: r.top - oRect.top - 1.5,
            width: r.width + 4,
            height: r.height + 3,
          });
        }
      };
      const runs: Array<[Text, number, number]> = [];
      for (const { node, from, to } of textSlices(range)) {
        for (const [a, b] of wordRuns(node.data, from, to)) runs.push([node, a, b]);
      }
      if (runs.length > 400) {
        pushRects(range.getClientRects()); // huge selection — box per line
      } else {
        for (const [node, a, b] of runs) {
          sub.setStart(node, a);
          sub.setEnd(node, b);
          pushRects(sub.getClientRects());
        }
      }
      setWordBoxes(boxes);
    },
    [textSlices]
  );

  // Re-measure when the window resizes (the text reflows).
  const active = wordBoxes.length > 0;
  useEffect(() => {
    if (!active) return;
    const onResize = () => measureBoxes(rangeRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, measureBoxes]);

  const showPopoverFromSelection = useCallback(() => {
    // Don't reset or reposition while the user is typing in the popover
    // (on iOS, focusing its input collapses the text selection).
    if (popoverRef.current?.contains(document.activeElement)) return;

    const range = readSelection();
    const overlay = overlayRef.current;
    if (!range) {
      // A plain click (collapsed selection) deselects, unless frozen.
      if (!lockedRef.current) clearHighlight();
      return;
    }
    if (!overlay) return;

    rangeRef.current = range;
    measureBoxes(range);

    const text = range.toString().trim();
    const explainable = canExplain();
    if (!explainable && text.length > MAX_TERM_LENGTH) return; // no actions to offer

    const rect = range.getBoundingClientRect();
    const oRect = overlay.getBoundingClientRect();
    const rawX = rect.left - oRect.left + rect.width / 2;
    // Keep the popover (half-width 130px) on screen, even when the
    // viewport is narrower than the popover on small screens.
    const half = Math.min(130, oRect.width / 2);
    const x = Math.min(Math.max(rawX, half), oRect.width - half);
    const y = rect.bottom - oRect.top;
    lockedRef.current = true; // keep the highlight while the popover is up
    setQuestion("");
    setPopover({ text, x, y, canExplain: explainable });
  }, [readSelection, measureBoxes, clearHighlight, canExplain]);

  // Tapping/clicking anywhere outside the popover dismisses it; on anything
  // that isn't selectable content it also deselects (including the native
  // selection, so a later pointerup can't resurrect a stale popover).
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      setPopover(null);
      lockedRef.current = false;
      const el = target instanceof Element ? target : target.parentElement;
      const onContent =
        containerRef.current?.contains(target) && !el?.closest(`${NON_CONTENT}, a`);
      if (!onContent) {
        clearHighlight();
        window.getSelection()?.removeAllRanges();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [containerRef, clearHighlight]);

  // Open the popover when the pointer is released — on the document, so
  // drags that end outside the text still count.
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
      const range = readSelection();
      if (!range && lockedRef.current) return; // frozen highlight stays
      if (range) lockedRef.current = false; // user is re-selecting
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        rangeRef.current = range;
        measureBoxes(range);
      });
      if (coarse && range) {
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

  // Quick deselect: Escape clears the highlight, the popover, and any
  // native selection.
  useEffect(() => {
    if (!popover && !active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setPopover(null);
      clearHighlight();
      window.getSelection()?.removeAllRanges();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [popover, active, clearHighlight]);

  // Focus the popover's question input only where a real keyboard is likely —
  // on touch devices the on-screen keyboard would cover the popover itself.
  useEffect(() => {
    if (popover?.canExplain && window.matchMedia("(pointer: fine)").matches) {
      questionInputRef.current?.focus();
    }
  }, [popover]);

  function askAboutSelection(q: string) {
    onAsk(q);
    setPopover(null);
    // Keep the word highlight visible while the answer streams — Esc, a
    // click anywhere, or a new selection clears it.
    lockedRef.current = true;
    window.getSelection()?.removeAllRanges();
  }

  function openInDict(term: string) {
    setPopover(null);
    clearHighlight();
    window.getSelection()?.removeAllRanges();
    onOpenInDict(term);
  }

  const truncatedSelection =
    popover && popover.text.length > 60 ? popover.text.slice(0, 60) + "…" : popover?.text;

  return (
    // No z-index/opacity here: the boxes' mix-blend-mode must blend with the
    // page itself, which a new stacking context on the overlay would break.
    <div ref={overlayRef} className="pointer-events-none absolute inset-0">
      {wordBoxes.map((b, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute rounded-md bg-amber-200 mix-blend-multiply dark:bg-amber-600/80 dark:mix-blend-screen"
          style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
        />
      ))}

      {popover && (
        <div
          ref={popoverRef}
          style={{ left: popover.x, top: popover.y + 8 }}
          className="pointer-events-auto absolute z-10 w-64 -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        >
          <p className="mb-2 line-clamp-2 text-xs italic text-neutral-500">
            “{truncatedSelection}”
          </p>
          {popover.canExplain && (
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
          )}
          {popover.text.length <= MAX_TERM_LENGTH && (
            <button
              type="button"
              onClick={() => openInDict(popover.text)}
              className="mb-2 w-full rounded-lg border border-amber-500/50 px-3 py-1.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
            >
              📖 Open in Dictionary
            </button>
          )}
          {popover.canExplain && (
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
          )}
        </div>
      )}
    </div>
  );
}
