import { useEffect, useState } from 'react';
import { Head } from 'vite-react-ssg';

import type { Db } from '../types';

import { Nav } from '../../../shared/components/Nav';
import { Collection } from '../components/Collection';
import { PasswordForm } from '../components/PasswordForm';

/**
 * A private page for tracking the Skylanders collection. It is left out of the nav and marked
 * noindex, so only people with the link find it, and only people with the password see the list.
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
        import('../services/db').then((module) =>
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

    let body;

    if (!db || signedIn === null)
        body = <p>Loading.</p>;
    else if (!signedIn)
        body = <PasswordForm db={db} />;
    else
        body = <Collection db={db} />;

    return (
        <>
            <Head>
                <title>Skylanders</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <Nav back />

            <main className="container-page">
                <div className="my-[clamp(4rem,5vw+2rem,8rem)]">
                    <h1 className="section-heading">Skylanders</h1>
                    {body}
                </div>
            </main>
        </>
    );
}
