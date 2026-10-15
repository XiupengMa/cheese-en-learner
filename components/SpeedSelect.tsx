"use client";

import { getModel, isSpeedMode, resolveSpeed, type SpeedMode } from "@/lib/models";

export function SpeedSelect({
  model,
  value,
  onChange,
  disabled,
}: {
  model: string;
  value: SpeedMode;
  onChange: (speed: SpeedMode) => void;
  disabled?: boolean;
}) {
  const selected = getModel(model);
  const supported = selected.supportsFastMode === true;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <label className="flex items-center gap-2 text-sm text-neutral-500">
        <span>Speed</span>
        <select
          value={resolveSpeed(model, value)}
          disabled={disabled || !supported}
          onChange={(e) => {
            if (isSpeedMode(e.target.value)) onChange(e.target.value);
          }}
          className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-base text-neutral-800 shadow-sm outline-none focus:border-amber-400 disabled:opacity-50 sm:text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <option value="standard">Standard</option>
          <option value="fast">Fast</option>
        </select>
      </label>
      <span className="text-xs text-neutral-500">
        {!supported
          ? "Fast unavailable for this model"
          : selected.provider === "anthropic"
            ? "Fast costs more; requires Anthropic fast-mode access"
            : "Fast costs more"}
      </span>
    </div>
  );
}
