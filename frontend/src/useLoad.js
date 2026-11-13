import { useCallback, useEffect, useRef, useState } from 'react';

export const POLL_MS = 5000;

// Loads data with `load()`; reloads when `deps` change, every `pollMs` (if given), and on reload().
export function useLoad(load, deps, pollMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let alive = true;
    const run = () => loadRef.current()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e); });
    run();
    const timer = pollMs ? setInterval(run, pollMs) : null;
    return () => { alive = false; if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload };
}

// Per-viewer convenience only; works without storage.
export function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}
export function recall(key) {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

export function newKey() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
