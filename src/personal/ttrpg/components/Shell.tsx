import { faHouse } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Head } from 'vite-react-ssg';

import { ConfirmHost } from './Confirm';

interface ShellProps
{
    /** The tab title, without the app name, which is added after it. */
    title: string;
    /** Where the house button goes: the sessions page by default, the portfolio from the front pages. */
    home?: string;
    children: ReactNode;
}

/**
 * The frame every TTRPG page sits in: the noindex head, the app's root class that
 * styles/ttrpg.css scopes everything under, the house button, and the dialog that asks before
 * anything is deleted. The app is not linked from the portfolio and is private, so search
 * engines are kept out.
 */
export function Shell({ title, home = '/ttrpg', children }: ShellProps)
{
    return (
        <div className="ttrpg">
            <Head>
                <title>{`${title} | TTRPG`}</title>
                <meta name="robots" content="noindex, nofollow" />
                <meta name="theme-color" content="#1e1d1f" />
            </Head>

            <Link
                to={home}
                className="ttrpg-home"
                aria-label={home === '/' ? 'Back to the portfolio' : 'Back to the sessions'}
                title={home === '/' ? 'Portfolio' : 'Sessions'}
            >
                <FontAwesomeIcon icon={faHouse} />
            </Link>

            {children}
            <ConfirmHost />
        </div>
    );
}
