// Word-boundary helpers for the select-anywhere feature. Intl.Segmenter
// keeps contractions ("don't") as one word; segments joined by a hyphen or
// apostrophe ("well-known", "l'avenir") are stitched back together here.

const JOINERS = new Set(["-", "‑", "'", "’"]);

const segmenter = new Intl.Segmenter("en", { granularity: "word" });

/**
 * Snap a selection-start offset outward to the beginning of the word it
 * lands inside. Leading whitespace is skipped; punctuation is left alone —
 * the boundary only moves left when it cuts through the middle of a word.
 */
export function snapStart(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i]!)) i++;
  if (i >= text.length) return i;
  const segments = segmenter.segment(text);
  const seg = segments.containing(i);
  if (seg?.isWordLike) {
    i = seg.index;
    while (i >= 2 && JOINERS.has(text[i - 1]!)) {
      const prev = segments.containing(i - 2);
      if (!prev?.isWordLike) break;
      i = prev.index;
    }
  }
  return i;
}

/** Mirror of {@link snapStart} for the end offset (exclusive). */
export function snapEnd(text: string, i: number): number {
  while (i > 0 && /\s/.test(text[i - 1]!)) i--;
  if (i <= 0) return i;
  const segments = segmenter.segment(text);
  const seg = segments.containing(i - 1);
  if (seg?.isWordLike) {
    i = seg.index + seg.segment.length;
    while (i < text.length - 1 && JOINERS.has(text[i]!)) {
      const next = segments.containing(i + 1);
      if (!next?.isWordLike) break;
      i = next.index + next.segment.length;
    }
  }
  return i;
}

/**
 * Character runs of the words inside [start, end), for drawing one highlight
 * box per word. Runs separated only by a joiner char merge into one box.
 */
export function wordRuns(
  text: string,
  start: number,
  end: number
): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const seg of segmenter.segment(text.slice(start, end))) {
    if (!seg.isWordLike) continue;
    const a = start + seg.index;
    const b = a + seg.segment.length;
    const prev = runs[runs.length - 1];
    if (prev && (prev[1] === a || (a - prev[1] === 1 && JOINERS.has(text[prev[1]]!)))) {
      prev[1] = b;
    } else {
      runs.push([a, b]);
    }
  }
  return runs;
}
