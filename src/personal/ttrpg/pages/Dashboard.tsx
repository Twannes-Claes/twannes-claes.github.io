import '../styles/ttrpg.css';

import { faDiceD20, faMap } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
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
                    <h1>
                        <FontAwesomeIcon icon={faDiceD20} className="ttrpg-dashboard__mark" />
                        TTRPG
                    </h1>
                    <p>Battle maps for the table.</p>
                </header>

                {account && <account.Account />}
                {!account && convexUrl && <Loading>Loading</Loading>}
                {!convexUrl && (
                    <p className="ttrpg-dashboard__note">The backend is not set up yet, see README.md.</p>
                )}

                <section className="ttrpg-panel ttrpg-card" aria-label="Demo">
                    <h2>Try it first</h2>
                    <p className="ttrpg-dashboard__note">
                        A finished battle map with walls, fog and two test players.
                        <br />
                        No account needed.
                    </p>
                    <div className="ttrpg-card__actions">
                        <Link to="/ttrpg/edit?demo" className="ttrpg-button">
                            <FontAwesomeIcon icon={faMap} />
                            Open the demo map
                        </Link>
                    </div>
                </section>
            </main>
        </Shell>
    );
}
