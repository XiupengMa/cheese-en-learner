// Word-boundary helpers for the Teacher selection feature. Intl.Segmenter
// keeps contractions ("don't") as one word; segments joined by a hyphen or
// apostrophe ("well-known", "l'avenir") are stitched back together here.

const JOINERS = new Set(["-", "‑", "'", "’"]);

const segmenter = new Intl.Segmenter("en", { granularity: "word" });

/**
 * Snap [start, end) outward to whole-word boundaries. Edge whitespace is
 * trimmed, but deliberately selected punctuation ("Hello, world!") is kept —
 * the range only grows when it cuts through the middle of a word.
 */
export function expandToWords(
  text: string,
  start: number,
  end: number
): [number, number] {
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  if (start >= end) return [start, start];

  const segments = segmenter.segment(text);
  const startSeg = segments.containing(start);
  if (startSeg?.isWordLike) {
    start = startSeg.index;
    while (start >= 2 && JOINERS.has(text[start - 1]!)) {
      const prev = segments.containing(start - 2);
      if (!prev?.isWordLike) break;
      start = prev.index;
    }
  }
  const endSeg = segments.containing(end - 1);
  if (endSeg?.isWordLike) {
    end = endSeg.index + endSeg.segment.length;
    while (end < text.length - 1 && JOINERS.has(text[end]!)) {
      const next = segments.containing(end + 1);
      if (!next?.isWordLike) break;
      end = next.index + next.segment.length;
    }
  }
  return [start, end];
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
