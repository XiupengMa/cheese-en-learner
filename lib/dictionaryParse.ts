import type { DictionaryEntry, DictionaryExample } from "./types";

// The dictionary prompt asks the model for plain text split into sections by
// @@MARKER lines (see DICTIONARY_SYSTEM). This parser is safe to run on a
// partial stream: it renders whatever sections have arrived so far.

const MARKER_RE = /^@@(IPA|MEANING|BACKGROUND|CHINESE|EXAMPLE)[^\S\r\n]*\r?$/gm;

export function parseDictionaryText(raw: string): DictionaryEntry {
  const markers: { name: string; markerStart: number; contentStart: number }[] = [];
  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(raw)) !== null) {
    markers.push({ name: m[1], markerStart: m.index, contentStart: m.index + m[0].length });
  }

  const entry: DictionaryEntry = {
    ipa: "",
    meaning: "",
    background: "",
    chinese: "",
    examples: [],
  };

  markers.forEach((section, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].markerStart : raw.length;
    const content = raw
      .slice(section.contentStart, end)
      // hide a half-received marker at the stream tail (e.g. "@@BACK")
      .replace(/\r?\n@{1,2}[A-Z]*$/, "")
      .trim();
    switch (section.name) {
      case "IPA":
        entry.ipa = content;
        break;
      case "MEANING":
        entry.meaning = content;
        break;
      case "BACKGROUND":
        entry.background = content;
        break;
      case "CHINESE":
        entry.chinese = content;
        break;
      case "EXAMPLE": {
        const example = parseExample(content);
        if (example) entry.examples.push(example);
        break;
      }
    }
  });

  return entry;
}

function parseExample(content: string): DictionaryExample | null {
  if (!content) return null;
  const zhIndex = content.search(/^ZH:/m);
  const enPart = zhIndex === -1 ? content : content.slice(0, zhIndex);
  const zhPart = zhIndex === -1 ? "" : content.slice(zhIndex);
  const en = enPart.replace(/^EN:\s*/, "").trim();
  const zh = zhPart.replace(/^ZH:\s*/, "").trim();
  if (!en) return null;
  return { en, zh };
}
