"use client";

import { useCallback, useEffect, useState } from "react";
import type { HistoryItem, LearnMode, LookupRecord } from "@/lib/types";

const MODE_ICON: Record<LearnMode, string> = {
  dictionary: "📖",
  teacher: "🎓",
};

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function History({
  active,
  onOpen,
}: {
  /** The tab is visible; refresh the list when this turns on. */
  active: boolean;
  /** Called with the full stored record when an entry is clicked. */
  onOpen: (record: LookupRecord) => void;
}) {
  // null = first load not finished (skeleton); afterwards stale items stay
  // visible while a refresh is in flight.
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/history")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Failed to load (${res.status})`);
        setItems(data.items);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load history.");
      });
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  async function open(item: HistoryItem) {
    if (openingId) return;
    setOpeningId(item.id);
    try {
      const res = await fetch(`/api/history/${item.id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Failed to open (${res.status})`);
      onOpen(data as LookupRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the entry.");
    } finally {
      setOpeningId(null);
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? prev);
    try {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setError("Could not delete the entry.");
      load(); // restore the optimistically removed row
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm sm:p-3 dark:border-neutral-800 dark:bg-neutral-900">
      {error && (
        <p className="m-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </p>
      )}

      {items === null && !error && (
        <div className="animate-pulse space-y-2 p-2">
          <div className="h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800/60" />
          <div className="h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800/60" />
          <div className="h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800/60" />
        </div>
      )}

      {items?.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-neutral-400">
          Nothing here yet — lookups and translations are saved automatically.
        </p>
      )}

      {items && items.length > 0 && (
        <ul>
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => open(item)}
                disabled={openingId !== null}
                className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:hover:bg-neutral-800 ${
                  openingId === item.id ? "animate-pulse" : ""
                }`}
              >
                <span aria-hidden>{MODE_ICON[item.mode] ?? "❓"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.input}</span>
                  <span className="block text-xs text-neutral-400">
                    {relativeTime(item.createdAt)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`Delete “${item.input}” from history`}
                title="Delete from history"
                className="shrink-0 rounded-full p-2 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-red-500 pointer-coarse:p-2.5 dark:text-neutral-600 dark:hover:bg-neutral-800"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
