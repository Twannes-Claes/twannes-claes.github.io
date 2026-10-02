import '@fontsource/lilita-one';
import '@fontsource-variable/nunito';
import '../styles/skylanders.css';

import { faBookOpen, faHouse, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Head } from 'vite-react-ssg';

import type { Db } from '../types';

import { Collection } from '../components/Collection';
import { PasswordForm } from '../components/PasswordForm';
import { SkyBackdrop } from '../components/SkyBackdrop';

/**
 * A private page for tracking the Skylanders collection. It is left out of the nav and marked
 * noindex, so only people with the link find it, and only people with the password see the list.
 * Anyone can try it with ?demo, which swaps in a sample collection, see services/demo.ts.
 * It deliberately shares none of the portfolio styling, see styles/skylanders.css.
 */
export default function Skylanders()
{
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const demo = search.has('demo');
    // Both kept with the mode they came from, so switching between the demo and the real
    // collection never shows one with the other's module or sign in for a moment.
    const [loaded, setLoaded] = useState<{ demo: boolean; db: Db } | null>(null);
    const [auth, setAuth] = useState<{ demo: boolean; signedIn: boolean } | null>(null);
    const db = loaded?.demo === demo ? loaded.db : null;
    const signedIn = auth?.demo === demo ? auth.signedIn : null;

    useEffect(() =>
    {
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;

        // Loaded here rather than imported, so Firebase is not in the portfolio bundle and
        // never runs during the prerender. The demo never loads Firebase at all.
        const load = demo ? import('../services/demo') : import('../services/db');

        load.then((module) =>
        {
            if (cancelled)
                return;

            setLoaded({ demo, db: module });
            unsubscribe = module.watchSignedIn((value) => setAuth({ demo, signedIn: value }));
        });

        return () =>
        {
            cancelled = true;
            unsubscribe?.();
        };
    }, [demo]);

    // A plain ?demo rather than the ?demo= setSearchParams would write, for a tidy link to share.
    const enterDemo = useCallback(() => navigate({ search: '?demo' }), [navigate]);

    // Leaving the demo goes back to the lock screen rather than signing the demo out.
    const signOut = useCallback(() =>
    {
        if (demo)
            navigate({ search: '' });
        else
            void db?.signOut();

    }, [db, demo, navigate]);

    let body;

    if (!db || signedIn === null)
        body = <p className="sky-loading">Powering up the portal</p>;
    else if (!signedIn)
        body = <PasswordForm db={db} onDemo={enterDemo} />;
    else
        // Keyed on the mode, so the demo and the real collection never share state.
        body = <Collection key={demo ? 'demo' : 'real'} db={db} />;

    return (
        <div className="sky">
            <Head>
                <title>Our Skylanders</title>
                <meta name="robots" content="noindex, nofollow" />
                <meta name="theme-color" content="#060d2e" />
            </Head>
            <SkyBackdrop />

            <div className="sky-inner">
                {/* The way back to the portfolio, there whether signed in or not. */}
                <Link to="/" className="sky-home" aria-label="Back to the portfolio" title="Portfolio">
                    <FontAwesomeIcon icon={faHouse} />
                </Link>

                <header className="sky-header">
                    <h1 className="sky-logo" data-text="Skylanders">
                        Skylanders
                    </h1>
                    <p className="sky-ribbon">{demo ? 'Demo collection' : 'Our collection'}</p>
                </header>

                {demo && (
                    <p className="sky-demo">
                        A sample collection to try things out. Nothing is saved, a reload starts
                        over.
                    </p>
                )}

                <main>{body}</main>

                <footer className="sky-footer">
                    <p className="sky-footer__credit">
                        <FontAwesomeIcon icon={faBookOpen} className="sky-footer__icon" />
                        <span>
                            Pictures from the{' '}
                            <a href="https://skylanders.fandom.com" target="_blank" rel="noreferrer">
                                Skylanders Wiki
                            </a>
                        </span>
                    </p>
                    {db && signedIn && (
                        <button type="button" className="sky-logout" onClick={signOut}>
                            <FontAwesomeIcon icon={faRightFromBracket} />
                            {demo ? 'Leave demo' : 'Log out'}
                        </button>
                    )}
                </footer>

                {/* One template string, like SiteFooter.tsx, so the built HTML has no
                    comment between the v and the number. */}
                <p className="sky-version">{`v${__APP_VERSION__}`}</p>
            </div>
        </div>
    );
}
