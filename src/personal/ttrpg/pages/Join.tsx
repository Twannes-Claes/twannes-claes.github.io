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
 * see Editor.tsx.
 */
export default function Join()
{
    const [search] = useSearchParams();
    const session = search.get('s');
    const loaded = useModule(loadPlayer, Boolean(session && convexUrl));

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
                {session ? <Loading>Connecting</Loading> : <p>Scan the QR code on the table to join.</p>}
            </main>
        </Shell>
    );
}
