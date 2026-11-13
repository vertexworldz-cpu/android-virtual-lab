"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type State<T> = { data: T | undefined; error: string | null; loading: boolean };

/** Fetch a GET endpoint. Pass null to skip. `reload()` refetches. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ data: undefined, error: null, loading: path !== null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    api<T>(path).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e: Error) => alive && setState((s) => ({ data: s.data, error: e.message, loading: false })),
    );
    return () => {
      alive = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((data: T) => setState({ data, error: null, loading: false }), []);
  return { ...state, reload, setData };
}

/** Re-run `fn` whenever a window event fires. */
export function useWindowEvent(name: string, fn: () => void) {
  useEffect(() => {
    window.addEventListener(name, fn);
    return () => window.removeEventListener(name, fn);
  }, [name, fn]);
}
