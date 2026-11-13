import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data with `fn`, again whenever `deps` change, and every `pollMs` if given.
// A failed reload keeps the last good data and reports the error next to it.
export function useLoad(fn, deps, pollMs) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ data: s.data, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    reload();
    const timer = pollMs ? setInterval(reload, pollMs) : null;
    return () => {
      if (timer) clearInterval(timer);
      seq.current++; // drop any answer still in flight
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload };
}
