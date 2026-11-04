import { faHouse } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { Head } from 'vite-react-ssg';

import { ConfirmHost } from './Confirm';
import { TooltipHost } from './Tooltip';
import { useLook } from './useLook';

/**
 * The mouse pointer: an arrow in the accent with a white edge, so it shows on any map and in
 * either theme. Built from the accent, so it follows the one picked, see styles/ttrpg.css.
 */
function cursorOf(accent: string)
{
    const arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.5 14.8 L10.5 21.5 L14 20 L11 13.4 L17 13.2 Z" fill="${accent}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

    return `url("data:image/svg+xml,${encodeURIComponent(arrow)}") 3 2, auto`;
}

/** What pops in, each with an animation of its own in styles/ttrpg.css. */
const popsIn = [
    '.ttrpg-pop__menu',
    '.ttrpg-toast',
    '.ttrpg-sheet',
    '.ttrpg-popover',
    '.ttrpg-properties',
    '.ttrpg-tip',
    '.ttrpg-confirm',
    '.ttrpg-tray',
    '.ttrpg-qr',
    '.ttrpg-corner',
    '.ttrpg-saved',
    '.ttrpg-music__idle',
].join(', ');

/**
 * Lets whatever pops in pop out the same way. React takes it off the page at once, so it is put
 * back where it was, inert and marked ttrpg-leaving, which plays its way in backwards, and taken
 * off again once that ends. What is inside it plays backwards too, as putting it back starts
 * every animation in it again. One watcher on the root rather than a closing state in every
 * component. A dialog is shown as a modal again, since leaving the page closed it.
 */
function useLeaving(root: RefObject<HTMLDivElement | null>)
{
    useEffect(() =>
    {
        const observer = new MutationObserver((records) =>
        {
            for (const { target, removedNodes, nextSibling } of records)
            {
                for (const node of removedNodes)
                {
                    // Still on the page when React only moved it, as in a list put in a new order.
                    if (!(node instanceof HTMLElement) || node.isConnected || !target.isConnected)
                        continue;

                    if (!node.matches(popsIn) || node.classList.contains('ttrpg-leaving'))
                        continue;

                    if (node instanceof HTMLDialogElement)
                        node.close();

                    node.classList.add('ttrpg-leaving');
                    target.insertBefore(node, nextSibling?.parentNode === target ? nextSibling : null);

                    if (node instanceof HTMLDialogElement)
                        node.showModal();

                    node.inert = true;
                    const [leave] = node.getAnimations();
                    const gone = () => node.remove();

                    // None with reduced motion, see styles/ttrpg.css.
                    if (leave)
                        leave.finished.then(gone, gone);
                    else
                        gone();

                }
            }
        });

        if (root.current)
            observer.observe(root.current, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [root]);
}

interface ShellProps
{
    /** The tab title, without the app name, which is added after it. */
    title: string;
    /** Where the house button goes: the sessions page by default, the portfolio from the sessions page itself. */
    home?: string;
    children: ReactNode;
}

/**
 * The frame every TTRPG page sits in: the noindex head, the app's root class that
 * styles/ttrpg.css scopes everything under, the house button, the dialog that asks before
 * anything is deleted, and the tooltips. The app is not linked from the portfolio and is
 * private, so search engines are kept out.
 */
export function Shell({ title, home = '/ttrpg', children }: ShellProps)
{
    const root = useRef<HTMLDivElement>(null);

    const { theme, accent } = useLook();

    useLeaving(root);

    return (
        <div ref={root} className="ttrpg" data-theme={theme} style={{ '--ttrpg-accent': accent, '--ttrpg-cursor': cursorOf(accent) } as CSSProperties}>
            <Head>
                <title>{`${title} | TTRPG`}</title>
                <meta name="robots" content="noindex, nofollow" />
                <meta name="theme-color" content={theme === 'light' ? '#fcf8ec' : '#1e1d1f'} />
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
            <TooltipHost />
        </div>
    );
}
