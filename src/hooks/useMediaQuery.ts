import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Tracks a media query.
 *
 * Returns `false` during prerender and until the first client commit, so the
 * static HTML and the no-JS fallback always render the desktop layout. The
 * project showcase depends on that: it only swaps in the carousel once the
 * viewport has actually been measured.
 */
export function useMediaQuery(query: string): boolean {
  const list = useMemo(
    () => (typeof window === 'undefined' ? null : window.matchMedia(query)),
    [query],
  );

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!list) return () => {};
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [list],
  );

  const getSnapshot = useCallback(() => list?.matches ?? false, [list]);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
