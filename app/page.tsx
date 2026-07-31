"use client";

import { useRouter } from "next/navigation";
import { Dictionary } from "@/components/Dictionary";
import { ModelSelect } from "@/components/ModelSelect";
import { Teacher } from "@/components/Teacher";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_MODEL } from "@/lib/models";
import { useLocalStorage } from "@/lib/useLocalStorage";
import type { LearnMode } from "@/lib/types";

const TABS: { id: LearnMode; label: string }[] = [
  { id: "dictionary", label: "📖 Dictionary" },
  { id: "teacher", label: "🎓 Teacher" },
];

export default function Home() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [model, setModel] = useLocalStorage("cheese.model", DEFAULT_MODEL);
  const [tab, setTab] = useLocalStorage("cheese.tab", "dictionary");
  const [debugStr, setDebugStr] = useLocalStorage("cheese.debug", "0");
  const debug = debugStr === "1";

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4">
          <h1 className="text-base font-bold tracking-tight">
            🧀 Cheese{" "}
            <span className="font-normal text-neutral-400">English Learner</span>
          </h1>
          <div className="flex items-center gap-4">
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
            <ModelSelect value={model} onChange={setModel} />
            {session && (
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="max-w-24 truncate text-neutral-500"
                  title={session.user.email}
                >
                  {session.user.name}
                </span>
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <nav className="mb-6 flex gap-1 rounded-xl bg-neutral-200/60 p-1 dark:bg-neutral-900">
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

        {/* Both panels stay mounted so switching tabs never loses your work */}
        <div className={tab === "dictionary" ? "" : "hidden"}>
          <Dictionary model={model} debug={debug} />
        </div>
        <div className={tab === "teacher" ? "" : "hidden"}>
          <Teacher model={model} debug={debug} />
        </div>
      </main>

      <footer className="pb-6 text-center text-xs text-neutral-400">
        Answers are AI-generated — double-check anything important.
      </footer>
    </div>
  );
}
