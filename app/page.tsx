"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dictionary, type DictionaryHandle } from "@/components/Dictionary";
import { History } from "@/components/History";
import { SelectionPopover } from "@/components/SelectionPopover";
import { Teacher, type TeacherHandle } from "@/components/Teacher";
import { authClient } from "@/lib/auth-client";
import { isKnownModel, resolveModel } from "@/lib/models";
import { readUrlQuery } from "@/lib/urlQuery";
import { useLocalStorage } from "@/lib/useLocalStorage";
import type { LearnMode, LookupRecord } from "@/lib/types";

type TabId = LearnMode | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "dictionary", label: "📖 Dictionary" },
  { id: "teacher", label: "🎓 Teacher" },
  { id: "history", label: "🕘 History" },
];

export default function Home() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [tab, setTab] = useLocalStorage("cheese.tab", "dictionary");
  const [debugStr, setDebugStr] = useLocalStorage("cheese.debug", "0");
  const debug = debugStr === "1";

  // Model preferences live on the account (user.dictionaryModel/teacherModel,
  // one per learn mode). Local state is an optimistic overlay so the select
  // responds instantly while updateUser persists in the background.
  const [modelOverride, setModelOverride] = useState<
    Partial<Record<LearnMode, string>>
  >({});
  const dictionaryModel =
    modelOverride.dictionary ?? resolveModel(session?.user.dictionaryModel);
  const teacherModel =
    modelOverride.teacher ?? resolveModel(session?.user.teacherModel);

  function setModelFor(mode: LearnMode, id: string) {
    setModelOverride((prev) => ({ ...prev, [mode]: id }));
    const patch =
      mode === "dictionary" ? { dictionaryModel: id } : { teacherModel: id };
    void authClient.updateUser(patch).then((res) => {
      if (res.error) {
        console.error("Saving model preference failed:", res.error.message);
      }
    });
  }

  // One-time adoption of the pre-account preference: earlier versions kept a
  // single model in localStorage ("cheese.model"). Seed both modes from it.
  const migratedModelRef = useRef(false);
  useEffect(() => {
    if (!session?.user || migratedModelRef.current) return;
    migratedModelRef.current = true;
    const stored = window.localStorage.getItem("cheese.model");
    if (!stored) return;
    window.localStorage.removeItem("cheese.model");
    if (session.user.dictionaryModel || session.user.teacherModel) return;
    if (!isKnownModel(stored)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModelOverride({ dictionary: stored, teacher: stored });
    void authClient.updateUser({ dictionaryModel: stored, teacherModel: stored });
  }, [session]);

  const [urlQuery, setUrlQuery] = useState<{
    mode: LearnMode;
    query: string;
  } | null>(null);

  const dictionaryRef = useRef<DictionaryHandle>(null);
  const teacherRef = useRef<TeacherHandle>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Reopen a stored entry instantly in its panel — no LLM call.
  function openHistoryEntry(record: LookupRecord) {
    const panel = record.mode === "teacher" ? teacherRef : dictionaryRef;
    panel.current?.restore(record);
    setTab(record.mode);
  }

  // The selection popover talks to whichever panel is visible.
  function activePanel() {
    if (tab === "teacher") return teacherRef.current;
    if (tab === "dictionary") return dictionaryRef.current;
    return null;
  }

  function openInDictionary(term: string) {
    dictionaryRef.current?.lookup(term);
    setTab("dictionary");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Deep links: /?mode=dict&query=hello opens that tab and runs the query.
  // The query is handed to the panel only once the session has loaded (see
  // initialQuery below), so the auto-run uses the account's model.
  useEffect(() => {
    const { mode, query } = readUrlQuery();
    if (mode) setTab(mode);
    // One-shot init from the URL; the extra render is the point — the query
    // must reach the panel only after the stored model has loaded above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (query) setUrlQuery({ mode: mode ?? "dictionary", query });
  }, [setTab]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex min-h-14 w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:py-0 lg:max-w-[80rem]">
          <h1 className="text-base font-bold tracking-tight">
            🧀 Cheese{" "}
            <span className="hidden font-normal text-neutral-400 min-[440px]:inline">
              English Learner
            </span>
          </h1>
          <div className="flex items-center gap-3 sm:gap-4">
            <label
              className="flex cursor-pointer items-center gap-1.5 text-sm text-neutral-500"
              title="Show the raw requests and responses exchanged with the LLM"
            >
              <input
                type="checkbox"
                checked={debug}
                onChange={(e) => setDebugStr(e.target.checked ? "1" : "0")}
                className="accent-amber-500"
              />
              Debug
            </label>
            {session && (
              <div className="flex items-center gap-2 text-sm">
                <Link
                  href="/account"
                  title="Account settings — password and passkeys"
                  className="flex max-w-32 items-center gap-1.5 text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline dark:hover:text-neutral-200"
                >
                  <span aria-hidden>⚙️</span>
                  <span className="hidden truncate sm:inline">
                    {session.user.name}
                  </span>
                </Link>
                <button
                  onClick={signOut}
                  className="text-neutral-400 underline-offset-2 hover:text-neutral-700 hover:underline dark:hover:text-neutral-200"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        data-selection-root
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 sm:py-6 lg:max-w-[80rem]"
      >
        <nav className="mx-auto mb-4 flex max-w-3xl gap-1 rounded-xl bg-neutral-200/60 p-1 sm:mb-6 dark:bg-neutral-900">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* All panels stay mounted so switching tabs never loses your work */}
        <div className={tab === "dictionary" ? "" : "hidden"}>
          <Dictionary
            ref={dictionaryRef}
            model={dictionaryModel}
            onModelChange={(id) => setModelFor("dictionary", id)}
            debug={debug}
            initialQuery={
              !sessionPending && urlQuery?.mode === "dictionary"
                ? urlQuery.query
                : undefined
            }
          />
        </div>
        <div className={tab === "teacher" ? "" : "hidden"}>
          <Teacher
            ref={teacherRef}
            model={teacherModel}
            onModelChange={(id) => setModelFor("teacher", id)}
            debug={debug}
            initialQuery={
              !sessionPending && urlQuery?.mode === "teacher"
                ? urlQuery.query
                : undefined
            }
          />
        </div>
        <div className={tab === "history" ? "mx-auto max-w-3xl" : "hidden"}>
          <History active={tab === "history"} onOpen={openHistoryEntry} />
        </div>
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-neutral-400">
        Answers are AI-generated — double-check anything important.
      </footer>

      <SelectionPopover
        containerRef={mainRef}
        canExplain={() => activePanel()?.canAsk() ?? false}
        onAsk={(q) => activePanel()?.ask(q)}
        onOpenInDict={openInDictionary}
      />
    </div>
  );
}
