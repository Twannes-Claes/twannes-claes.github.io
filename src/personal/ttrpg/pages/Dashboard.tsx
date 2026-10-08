import '../styles/ttrpg.css';

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Shell } from '../components/Shell';
import { convexUrl } from '../services/config';

/**
 * Loaded on demand rather than imported, so Convex is not in the portfolio bundle and never runs
 * during the prerender.
 */
function loadAccount()
{
    return import('../components/Account');
}

/** The way in for game masters: sign in, ask to host, and the list of sessions. */
export default function Dashboard()
{
    const [account, setAccount] = useState<Awaited<ReturnType<typeof loadAccount>> | null>(null);

    useEffect(() =>
    {
        if (!convexUrl)
            return;

        let cancelled = false;

        loadAccount().then((module) =>
        {
            if (!cancelled)
                setAccount(module);

        });

        return () =>
        {
            cancelled = true;
        };
    }, []);

    return (
        <Shell title="Sessions" home="/">
            <main className="ttrpg-dashboard">
                <header className="ttrpg-dashboard__header">
                    <h1>TTRPG</h1>
                    <p>Battle maps for the table.</p>
                </header>

                {account ? (
                    <account.Account />
                ) : (
                    <p className="ttrpg-dashboard__note">
                        {convexUrl ? 'Loading' : 'The backend is not set up yet, see README.md.'}
                    </p>
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
