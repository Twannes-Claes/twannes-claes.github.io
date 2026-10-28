import '../styles/ttrpg.css';

import { useSearchParams } from 'react-router-dom';

import { Loading } from '../components/Feedback';
import { Shell } from '../components/Shell';
import { useModule } from '../components/useModule';
import { convexUrl } from '../services/config';

/** Loaded on demand with Convex, see components/useModule.ts. */
function loadPlayer()
{
    return import('../components/PlayerView');
}

/**
 * Where the QR code leads: players type the password, make their character and move it from
 * their phone. Phones load this page, so it never imports the editor. The session id is in ?s=,
 * see Editor.tsx. With ?table it is the Player view the GM opens on the table screen: the map as
 * the players see it, with no token of its own.
 */
export default function Join()
{
    const [search] = useSearchParams();
    const session = search.get('s');
    const table = search.has('table');
    const title = table ? 'Player view' : 'Join';
    const loaded = useModule(loadPlayer, Boolean(session && convexUrl));

    if (session && loaded)
    {
        return (
            <Shell title={title}>
                <loaded.PlayerView key={session} sessionId={session} table={table} />
            </Shell>
        );
    }

    return (
        <Shell title={title}>
            <main className="ttrpg-placeholder">
                <h1>Join a session</h1>
                {session ? <Loading>Connecting</Loading> : <p>Scan the QR code on the table to join.</p>}
            </main>
        </Shell>
    );
}
