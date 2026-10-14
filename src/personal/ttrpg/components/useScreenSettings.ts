import { useEffect, useState } from 'react';

/*
 * What each screen sets for itself, kept in its browser: the 4K table screen wants bigger controls
 * that stay out of the way longer than a laptop's. The stylesheet zooms every control by
 * --ttrpg-ui, never the map, see styles/ttrpg.css. Changed in components/Settings.tsx.
 */

export interface ScreenSettings
{
    /** How big the controls are, from smallestScale to largestScale. */
    scale: number;
    /** Milliseconds without the mouse before player view hides its controls, 0 for never. */
    hideAfter: number;
    /** The frame rate in the corner, as ?debug shows it, see pages/Editor.tsx. */
    frameRate: boolean;
}

export const smallestScale = 0.75;
export const largestScale = 1.25;

const settingsKey = 'ttrpg-screen';
const defaults: ScreenSettings = { scale: 1, hideAfter: 3000, frameRate: false };

function readSettings(): ScreenSettings
{
    try
    {
        const stored = { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey) ?? '{}') } as ScreenSettings;

        return { ...stored, scale: Math.min(largestScale, Math.max(smallestScale, stored.scale)) };
    }
    catch
    {
        // Blocked storage, a broken value, or no window while the page is prerendered.
        return defaults;
    }
}

/**
 * This screen's settings, saved as they change, with the control size put on the app's root,
 * where the popovers and tips are too.
 */
export function useScreenSettings()
{
    const [settings, setSettings] = useState(readSettings);

    useEffect(() =>
    {
        const root = document.querySelector<HTMLElement>('.ttrpg');

        root?.style.setProperty('--ttrpg-ui', String(settings.scale));

        try
        {
            localStorage.setItem(settingsKey, JSON.stringify(settings));
        }
        catch
        {
            // Blocked storage: the settings hold until the page reloads.
        }

        return () => void root?.style.removeProperty('--ttrpg-ui');
    }, [settings]);

    return [settings, setSettings] as const;
}
