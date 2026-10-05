import { useSyncExternalStore } from 'react';

/**
 * Tracks a media query. Returns false during prerender and until the first
 * client render, so static HTML always falls back to the desktop layout.
 */
export function useMediaQuery(query: string): boolean
{
    const list = typeof window === 'undefined' ? null : window.matchMedia(query);

    const subscribe = (onChange: () => void) =>
    {
        if (!list)
            return () => {};

        list.addEventListener('change', onChange);

        return () => list.removeEventListener('change', onChange);
    };

    const read = () => list?.matches ?? false;
    const readServer = () => false;

    return useSyncExternalStore(subscribe, read, readServer);
}
