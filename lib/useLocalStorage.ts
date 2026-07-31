"use client";

import { useCallback, useEffect, useState } from "react";

// Starts with `initial` on first render (SSR-safe), then loads the stored
// value after mount to avoid hydration mismatches.
export function useLocalStorage(
  key: string,
  initial: string
): [string, (value: string) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) setValue(stored);
  }, [key]);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      window.localStorage.setItem(key, next);
    },
    [key]
  );

  return [value, set];
}
