import '../styles/ttrpg.css';

import { Link } from 'react-router-dom';

import { Loading } from '../components/Feedback';
import { Shell } from '../components/Shell';
import { useModule } from '../components/useModule';
import { convexUrl } from '../services/config';

/** Loaded on demand with Convex, see components/useModule.ts. */
function loadAccount()
{
    return import('../components/Account');
}

/** The way in for game masters: sign in, ask to host, and the list of sessions. */
export default function Dashboard()
{
    const account = useModule(loadAccount, Boolean(convexUrl));

    return (
        <Shell title="Sessions" home="/">
            <main className="ttrpg-dashboard">
                <header className="ttrpg-dashboard__header">
                    <h1>TTRPG</h1>
                    <p>Battle maps for the table.</p>
                </header>

                {account && <account.Account />}
                {!account && convexUrl && <Loading>Loading</Loading>}
                {!convexUrl && (
                    <p className="ttrpg-dashboard__note">The backend is not set up yet, see README.md.</p>
                )}

                <p className="ttrpg-dashboard__note">
                    <Link to="/ttrpg/edit?demo" className="ttrpg-link">
                        Try the demo map
                    </Link>
                    , no account needed.
                </p>
            </main>
        </Shell>
    );
}
