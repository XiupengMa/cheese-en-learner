"use client";

import { MODELS } from "@/lib/models";

export function ModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const anthropicModels = MODELS.filter((m) => m.provider === "anthropic");
  const openaiModels = MODELS.filter((m) => m.provider === "openai");

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-500">
      <span className="hidden sm:inline">Model</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-800 shadow-sm outline-none focus:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      >
        <optgroup label="Claude">
          {anthropicModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="GPT">
          {openaiModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
