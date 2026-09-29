import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Tracks a media query. Returns false during prerender and until the first
 * client render, so static HTML always falls back to the desktop layout.
 */
export function useMediaQuery(query: string): boolean
{
    const list = useMemo(
        () => (typeof window === 'undefined' ? null : window.matchMedia(query)),
        [query],
    );

    const subscribe = useCallback(
        (onChange: () => void) =>
        {
            if (!list)
                return () => {};

            list.addEventListener('change', onChange);

            return () => list.removeEventListener('change', onChange);
        },
        [list],
    );

    const read = useCallback(() => list?.matches ?? false, [list]);
    const readServer = useCallback(() => false, []);

    return useSyncExternalStore(subscribe, read, readServer);
}
