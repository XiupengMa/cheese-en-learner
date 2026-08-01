import type { LearnMode } from "./types";

// Deep-link params: /?mode=dict&query=hello opens the Dictionary tab and runs
// the lookup. `mode` accepts the short "dict" alias as well as full names.
const MODE_PARAM = "mode";
const QUERY_PARAM = "query";

// Teacher texts can be up to MAX_TEXT_LENGTH (20k) — far past what URLs can
// carry reliably. Beyond this we keep `mode` but drop `query` from the URL.
export const MAX_URL_QUERY_LENGTH = 1_000;

const MODE_ALIASES: Record<string, LearnMode> = {
  dict: "dictionary",
  dictionary: "dictionary",
  teacher: "teacher",
};

export function readUrlQuery(): { mode: LearnMode | null; query: string } {
  const params = new URLSearchParams(window.location.search);
  const mode = MODE_ALIASES[params.get(MODE_PARAM)?.toLowerCase() ?? ""] ?? null;
  const query = params.get(QUERY_PARAM)?.trim() ?? "";
  return { mode, query };
}

/** Reflect the query being run in the address bar so the page is shareable. */
export function syncUrlQuery(mode: LearnMode, query: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(MODE_PARAM, mode === "dictionary" ? "dict" : mode);
  if (query && query.length <= MAX_URL_QUERY_LENGTH) {
    url.searchParams.set(QUERY_PARAM, query);
  } else {
    url.searchParams.delete(QUERY_PARAM);
  }
  window.history.replaceState(null, "", url);
}
