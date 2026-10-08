import '../styles/ttrpg.css';

import { Link, useSearchParams } from 'react-router-dom';

import { Loading } from '../components/Feedback';
import { MapEditor } from '../components/MapEditor';
import { Shell } from '../components/Shell';
import { useModule } from '../components/useModule';
import { demoScenario } from '../content/scenarios';
import { convexUrl } from '../services/config';
import { demoStore } from '../services/demo';

/** Loaded on demand with Convex, see components/useModule.ts. */
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
    const loaded = useModule(loadSession, !demo && Boolean(session && convexUrl));

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
                {session ? <Loading>Opening the session</Loading> : <p>No session picked.</p>}
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
