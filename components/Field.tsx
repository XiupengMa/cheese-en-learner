"use client";

import { submitOnModEnter } from "@/lib/keySubmit";

/** Labeled text input used by the auth and account forms. */
export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      <input
        onKeyDown={submitOnModEnter}
        {...props}
        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base shadow-sm outline-none placeholder:text-neutral-400 focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
}
