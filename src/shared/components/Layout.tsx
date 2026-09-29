import { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

/** The offset every visited page was left at, keyed by its router location key. */
const offsets = new Map<string, number>();

/**
 * Keeps the scroll position right across page changes.
 *
 * React Router ships <ScrollRestoration /> for this, but it scrolls with
 * window.scrollTo(x, y), which follows the scroll-behavior: smooth that the
 * anchor links need, so a project page slid up into place instead of opening at
 * the top. Scrolling with behaviour 'instant' overrides that rule and leaves the
 * anchor links alone.
 */
function ScrollHandler()
{
    const { key, hash } = useLocation();

    // Read by the listener below, so it records against the page that is on
    // screen rather than the one it was attached under.
    const currentKey = useRef(key);

    useEffect(() =>
    {
        // Every navigation starts with a click, and a click is handled before the
        // page changes, so this is the last moment the offset is still readable.
        // Clicks that navigate nowhere simply record it again.
        function remember()
        {
            offsets.set(currentKey.current, window.scrollY);
        }

        document.addEventListener('click', remember, { capture: true });

        return () => document.removeEventListener('click', remember, { capture: true });
    }, []);

    useLayoutEffect(() =>
    {
        currentKey.current = key;

        const offset = offsets.get(key);

        // A known key means this page is being returned to.
        if (offset !== undefined)
            window.scrollTo({ top: offset, behavior: 'instant' });
        else if (!hash)
            window.scrollTo({ top: 0, behavior: 'instant' });

    }, [key, hash]);

    return null;
}

/** Wraps every page, so scroll handling lives in one place. */
export function Layout()
{
    return (
        <>
            <ScrollHandler />
            <Outlet />
        </>
    );
}
