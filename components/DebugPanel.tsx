"use client";

import type { LLMDebug } from "@/lib/types";

export function DebugPanel({ logs, title }: { logs: LLMDebug[]; title?: string }) {
  if (logs.length === 0) return null;
  return (
    <details className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-100/60 px-4 py-3 text-xs dark:border-neutral-700 dark:bg-neutral-900/60">
      <summary className="cursor-pointer select-none font-mono font-medium text-neutral-500">
        🐞 {title ?? "Debug"} — {logs.length} LLM call{logs.length > 1 ? "s" : ""}
      </summary>
      <div className="mt-3 space-y-5">
        {logs.map((log, i) => (
          <div key={i} className="space-y-2">
            <p className="font-mono text-neutral-400">
              #{i + 1} · {log.request.provider} · {log.request.endpoint} ·{" "}
              {log.response.durationMs}ms
            </p>
            <div>
              <p className="mb-1 font-semibold text-neutral-500">Request → provider</p>
              <pre className="max-h-80 overflow-auto rounded-lg bg-neutral-950 p-3 text-[11px] leading-relaxed text-emerald-300">
                {JSON.stringify(log.request.payload, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 font-semibold text-neutral-500">Response ← provider</p>
              <pre className="max-h-80 overflow-auto rounded-lg bg-neutral-950 p-3 text-[11px] leading-relaxed text-sky-300">
                {JSON.stringify(log.response, null, 2)}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
