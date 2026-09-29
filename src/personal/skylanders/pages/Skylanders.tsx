import '@fontsource/lilita-one';
import '@fontsource-variable/nunito';
import '../styles/skylanders.css';

import { faBookOpen, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useState } from 'react';
import { Head } from 'vite-react-ssg';

import type { Db } from '../types';

import { Collection } from '../components/Collection';
import { PasswordForm } from '../components/PasswordForm';
import { SkyBackdrop } from '../components/SkyBackdrop';

/**
 * A private page for tracking the Skylanders collection. It is left out of the nav and marked
 * noindex, so only people with the link find it, and only people with the password see the list.
 * It deliberately shares none of the portfolio styling, see styles/skylanders.css.
 */
export default function Skylanders()
{
    const [db, setDb] = useState<Db | null>(null);
    const [signedIn, setSignedIn] = useState<boolean | null>(null);

    useEffect(() =>
    {
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;

        // Loaded here rather than imported, so Firebase is not in the portfolio bundle and
        // never runs during the prerender.
        // ?mock under npm run dev swaps in fake in-memory data, see services/mock.ts. The DEV
        // check folds away in a production build, so the mock never ships.
        const load =
            import.meta.env.DEV && new URLSearchParams(location.search).has('mock')
                ? import('../services/mock')
                : import('../services/db');

        load.then((module) =>
        {
            if (cancelled)
                return;

            setDb(module);
            unsubscribe = module.watchSignedIn(setSignedIn);
        });

        return () =>
        {
            cancelled = true;
            unsubscribe?.();
        };
    }, []);

    const signOut = useCallback(() => void db?.signOut(), [db]);

    let body;

    if (!db || signedIn === null)
        body = <p className="sky-loading">Powering up the portal</p>;
    else if (!signedIn)
        body = <PasswordForm db={db} />;
    else
        body = <Collection db={db} />;

    return (
        <div className="sky">
            <Head>
                <title>Our Skylanders</title>
                <meta name="robots" content="noindex, nofollow" />
                <meta name="theme-color" content="#060d2e" />
            </Head>
            <SkyBackdrop />

            <div className="sky-inner">
                <header className="sky-header">
                    <h1 className="sky-logo" data-text="Skylanders">
                        Skylanders
                    </h1>
                    <p className="sky-ribbon">Our collection</p>
                </header>

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
                            Log out
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
}
