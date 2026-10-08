import '../styles/ttrpg.css';

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { MapEditor } from '../components/MapEditor';
import { Shell } from '../components/Shell';
import { demoScenario } from '../content/scenarios';
import { convexUrl } from '../services/config';
import { demoStore } from '../services/demo';

/**
 * Loaded on demand rather than imported, so Convex is not in the portfolio bundle, never runs
 * during the prerender, and the demo never loads it.
 */
function loadSession()
{
    return import('../components/SessionEditor');
}

/**
 * The battle map editor, and its play mode that the game master mirrors to the table screen.
 * The session id is in ?s= rather than the path, because GitHub Pages only serves prerendered
 * paths, see PLAN.md. With ?demo it opens the demo map, kept in this tab only, see
 * services/demo.ts. ?debug adds a frame rate display, for checking the table screen and phones.
 */
export default function Editor()
{
    const [search] = useSearchParams();
    const session = search.get('s');
    const demo = search.has('demo');
    const debug = search.has('debug');
    const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadSession>> | null>(null);

    useEffect(() =>
    {
        if (demo || !session || !convexUrl)
            return;

        let cancelled = false;

        loadSession().then((module) =>
        {
            if (!cancelled)
                setLoaded(module);

        });

        return () =>
        {
            cancelled = true;
        };
    }, [demo, session]);

    if (demo)
    {
        return (
            <Shell title="Demo">
                <MapEditor initial={[demoScenario]} library={[]} store={demoStore} debug={debug} />
            </Shell>
        );
    }

    if (session && loaded)
    {
        return (
            <Shell title="Editor">
                {/* Keyed on the session, so opening another one starts fresh. */}
                <loaded.SessionEditor key={session} sessionId={session} debug={debug} />
            </Shell>
        );
    }

    return (
        <Shell title="Editor">
            <main className="ttrpg-placeholder">
                <p>{session ? 'Opening the session' : 'No session picked.'}</p>
                {!session && (
                    <p>
                        <Link to="/ttrpg" className="ttrpg-link">
                            Your sessions
                        </Link>
                    </p>
                )}
            </main>
        </Shell>
    );
}
