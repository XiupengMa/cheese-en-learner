"use client";

import { useCallback, useSyncExternalStore } from "react";

// Same-tab writes don't fire the browser's `storage` event (it only reaches
// *other* tabs), so set() notifies subscribed hooks through this registry.
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

// Renders `initial` on the server and during hydration (so server and client
// HTML match), then re-renders with the stored value once mounted.
export function useLocalStorage(
  key: string,
  initial: string
): [string, (value: string) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let keyListeners = listeners.get(key);
      if (!keyListeners) {
        keyListeners = new Set();
        listeners.set(key, keyListeners);
      }
      keyListeners.add(onChange);
      // Cross-tab changes; key is null when another tab calls clear().
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        keyListeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key]
  );

  const value = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key) ?? initial,
    () => initial
  );

  const set = useCallback(
    (next: string) => {
      window.localStorage.setItem(key, next);
      emit(key);
    },
    [key]
  );

  return [value, set];
}
