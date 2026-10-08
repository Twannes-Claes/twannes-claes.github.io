import '../styles/ttrpg.css';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Shell } from '../components/Shell';
import { convexUrl } from '../services/config';

/**
 * Loaded on demand rather than imported, so Convex is not in the portfolio bundle and never runs
 * during the prerender.
 */
function loadPlayer()
{
    return import('../components/PlayerView');
}

/**
 * Where the QR code leads: players type the password, make their character and move it from
 * their phone. Phones load this page, so it never imports the editor. The session id is in ?s=,
 * see Editor.tsx.
 */
export default function Join()
{
    const [search] = useSearchParams();
    const session = search.get('s');
    const [loaded, setLoaded] = useState<Awaited<ReturnType<typeof loadPlayer>> | null>(null);

    useEffect(() =>
    {
        if (!session || !convexUrl)
            return;

        let cancelled = false;

        loadPlayer().then((module) =>
        {
            if (!cancelled)
                setLoaded(module);

        });

        return () =>
        {
            cancelled = true;
        };
    }, [session]);

    if (session && loaded)
    {
        return (
            <Shell title="Join" home="/">
                <loaded.PlayerView key={session} sessionId={session} />
            </Shell>
        );
    }

    return (
        <Shell title="Join" home="/">
            <main className="ttrpg-placeholder">
                <h1>Join a session</h1>
                <p>{session ? 'Connecting' : 'Scan the QR code on the table to join.'}</p>
            </main>
        </Shell>
    );
}
