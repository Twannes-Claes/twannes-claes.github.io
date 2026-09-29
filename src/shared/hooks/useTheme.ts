import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

/*
 * The theme lives on <html data-theme>, set by the inline script in index.html
 * before first paint. That attribute is the source of truth, so it is read as
 * an external store instead of being mirrored into React state.
 */

function subscribe(onChange: () => void): () => void
{
    const observer = new MutationObserver(onChange);

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
}

function readTheme(): Theme
{
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** No document during prerender. The inline script fixes this on load. */
function readServerTheme(): Theme
{
    return 'light';
}

export function useTheme()
{
    const theme = useSyncExternalStore(subscribe, readTheme, readServerTheme);

    const toggleTheme = useCallback(() =>
    {
        const next = readTheme() === 'light' ? 'dark' : 'light';

        document.documentElement.setAttribute('data-theme', next);

        try
        {
            localStorage.setItem('theme', next);
        }
        catch
        {
            // Blocked storage. The theme still applies to this page.
        }
    }, []);

    return { theme, toggleTheme };
}
