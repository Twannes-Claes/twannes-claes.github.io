import { useSyncExternalStore } from 'react';

import { defaultAccent, paintAccent } from '../map/colours';

/*
 * How the app looks on this screen, dark or light and the accent colour, picked by each
 * person for their own phone or screen and kept in their browser, never on the server. Shell.tsx
 * puts it on the app's root and styles/ttrpg.css does the rest. Changed in LookSettings.tsx.
 */

export type Theme = 'dark' | 'light';

const themeKey = 'ttrpg-theme';
const accentKey = 'ttrpg-accent';
/** What was picked this visit, so a pick holds even when storage is blocked. */
const picked: Record<string, string> = {};
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void
{
    listeners.add(onChange);
    // Another tab picking a look changes this one too.
    window.addEventListener('storage', onChange);

    return () =>
    {
        listeners.delete(onChange);
        window.removeEventListener('storage', onChange);
    };
}

function read(key: string): string | null
{
    if (key in picked)
        return picked[key];

    try
    {
        return localStorage.getItem(key);
    }
    catch
    {
        // Blocked storage: the default look.
        return null;
    }
}

function write(key: string, value: string)
{
    picked[key] = value;

    try
    {
        localStorage.setItem(key, value);
    }
    catch
    {
        // Blocked storage: the pick holds until the page reloads.
    }

    if (key === accentKey)
        paintAccent(readAccent());

    listeners.forEach((listener) => listener());
}

function readTheme(): Theme
{
    return read(themeKey) === 'light' ? 'light' : 'dark';
}

/** Six-digit hex only, as map/colours.ts lifts it and adds see-through to it. */
function readColour(key: string, fallback: string): string
{
    const stored = read(key);

    return stored && /^#[0-9a-f]{6}$/i.test(stored) ? stored : fallback;
}

const readAccent = () => readColour(accentKey, defaultAccent);

// The map draws with the picked accent from its first frame, before any component renders.
if (typeof window !== 'undefined')
    paintAccent(readAccent());

/** This screen's theme and accent. The prerender has no storage, so it shows the default look. */
export function useLook()
{
    const theme = useSyncExternalStore(subscribe, readTheme, () => 'dark' as Theme);
    const accent = useSyncExternalStore(subscribe, readAccent, () => defaultAccent);

    return {
        theme,
        accent,
        setTheme: (next: Theme) => write(themeKey, next),
        setAccent: (next: string) => write(accentKey, next),
    };
}
