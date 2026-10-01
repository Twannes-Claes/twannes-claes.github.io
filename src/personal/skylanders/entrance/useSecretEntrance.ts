import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useTheme, type Theme } from '../../../shared/hooks/useTheme';

import { openSecretPortal } from './secretPortal';

/*
 * The secret way into the Skylanders page from the portfolio: flip the theme five times within
 * two seconds and the page overloads and a portal opens. The page itself stays behind its
 * password, this is only the door.
 */

/** Flips closer together than this count towards opening the portal. */
const windowMs = 2000;
const flipsToOpen = 5;
/** The flip from which the toggle starts to strain, as a hint that something is building. */
const strainFrom = 3;

/** Starts fetching the page while the toggle strains, so the portal never waits on it. */
function preloadSkylanders()
{
    void import('../pages/Skylanders');
}

/**
 * Counts the theme flips. Call `flipped` right after every flip, and show `strain`, 0 to 3, on the
 * toggle, see entrance.css. After, so a theme put back as the portal opens stays put.
 */
export function useSecretEntrance(): { strain: number; flipped: () => void }
{
    const { theme, setTheme } = useTheme();
    const navigate = useNavigate();
    const flips = useRef<number[]>([]);
    /** The theme before the burst of flips, put back once the portal opens. */
    const before = useRef<Theme>(theme);
    const opening = useRef(false);
    const [strain, setStrain] = useState(0);

    // Calms down again once the flips stop.
    useEffect(() =>
    {
        if (strain === 0)
            return;

        const timer = window.setTimeout(() => setStrain(0), windowMs);

        return () => window.clearTimeout(timer);
    }, [strain]);

    const enter = useCallback(() =>
    {
        setTheme(before.current);
        navigate('/skylanders');
    }, [setTheme, navigate]);

    const flipped = useCallback(() =>
    {
        if (opening.current)
            return;

        const now = performance.now();
        const recent = flips.current.filter((time) => now - time < windowMs);

        // The theme from this render, which is still the one from before the flip.
        if (recent.length === 0)
            before.current = theme;

        flips.current = [...recent, now];

        const count = flips.current.length;

        if (count >= strainFrom)
            preloadSkylanders();

        if (count < flipsToOpen)
        {
            setStrain(Math.max(0, count - strainFrom + 1));

            return;
        }

        flips.current = [];
        opening.current = true;
        setStrain(0);

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            enter();
        else
            openSecretPortal(enter);

    }, [theme, enter]);

    return { strain, flipped };
}
