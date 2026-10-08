import { faPlay, faQrcode, faStop, faUsers } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useActionState, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Live } from '../types';

import { confirmAction } from '../services/confirm';

import { Popover } from './Popover';
import { useKeydown } from './useKeys';

/** The QR code maker, loaded when the code is first shown, see PLAN.md. */
function loadQr()
{
    return import('uqr');
}

interface LiveControlsProps
{
    live: Live;
    /** The map the session starts on: the one open in the editor. */
    scenarioId: string;
    /** Hears that the session started, so the editor can switch to play mode. */
    onStarted: () => void;
    /** Hears what worked, for the editor's toast. */
    onDone: (message: string) => void;
    onError: (message: string) => void;
}

/**
 * Starting and ending a saved session, beside the Edit and Play switch. Start asks for the
 * password players join with; while live, the players at the table and the QR code that leads
 * to the join page.
 */
export function LiveControls({ live, scenarioId, onStarted, onDone, onError }: LiveControlsProps)
{
    const [asking, setAsking] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [showPlayers, setShowPlayers] = useState(false);
    const players = live.tokens.filter((token) => token.kind === 'player');

    const [failure, start, starting] = useActionState(
        (_: string, form: FormData) =>
            live
                .start(String(form.get('password')), scenarioId, form.get('fresh') === 'on')
                .then(() =>
                {
                    setAsking(false);
                    onStarted();
                    onDone('The session is live. Show the QR code so players can join.');

                    return '';
                })
                .catch((reason: Error) => reason.message),
        '',
    );

    const kick = (id: string, name: string) =>
    {
        void confirmAction(`Remove ${name} from the table? They cannot join again until the session starts again.`, 'Remove')
            .then(async (yes) =>
            {
                if (!yes)
                    return;

                await live.kick(id);
                onDone(`${name} left the table.`);
            })
            .catch((reason: Error) => onError(reason.message));
    };

    const end = () =>
    {
        void confirmAction('End the session? Players can no longer move until it starts again.', 'End')
            .then(async (yes) =>
            {
                if (!yes)
                    return;

                await live.end();
                setShowPlayers(false);
                onDone('The session has ended.');
            })
            .catch((reason: Error) => onError(reason.message));
    };

    if (!live.live)
    {
        return (
            <>
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-expanded={asking}
                    onClick={() => setAsking((open) => !open)}
                >
                    <FontAwesomeIcon icon={faPlay} />
                    Start
                </button>

                {asking && (
                    <Popover title="Start the session" className="ttrpg-start" dismissOnOutside onClose={() => setAsking(false)}>
                        <form action={start} className="ttrpg-popover__body">
                            <label className="ttrpg-field">
                                Password for the players
                                <input name="password" defaultValue={live.password} autoComplete="off" required autoFocus />
                            </label>
                            <label
                                className="ttrpg-check"
                                title="Forget what the party saw of every map last time. Untick to pick up where they left off."
                            >
                                <input name="fresh" type="checkbox" defaultChecked />
                                Start with fresh fog
                            </label>
                            {failure && (
                                <p className="ttrpg-error" role="alert">
                                    {failure}
                                </p>
                            )}
                            <div className="ttrpg-sheet__actions">
                                <button type="submit" className="ttrpg-button ttrpg-button--confirm" disabled={starting}>
                                    {starting ? 'Starting' : 'Start session'}
                                </button>
                                <button type="button" className="ttrpg-button" onClick={() => setAsking(false)}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </Popover>
                )}
            </>
        );
    }

    return (
        <>
            <button
                type="button"
                className="ttrpg-segment"
                aria-pressed={showPlayers}
                aria-expanded={showPlayers}
                onClick={() => setShowPlayers((open) => !open)}
            >
                <FontAwesomeIcon icon={faUsers} />
                Players <span className="ttrpg-count">{players.length}</span>
            </button>
            <button
                type="button"
                className="ttrpg-segment"
                aria-label="Show the QR code to join"
                title="Show the QR code to join"
                onClick={() => setShowQr(true)}
            >
                <FontAwesomeIcon icon={faQrcode} />
            </button>
            <button type="button" className="ttrpg-segment" onClick={end}>
                <FontAwesomeIcon icon={faStop} />
                End
            </button>

            {showPlayers && (
                <Popover title="Players" className="ttrpg-start" dismissOnOutside onClose={() => setShowPlayers(false)}>
                    {players.length === 0 ? (
                        <div className="ttrpg-empty">
                            <p>Nobody has joined yet.</p>
                            <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={() => setShowQr(true)}>
                                <FontAwesomeIcon icon={faQrcode} />
                                Show the QR code
                            </button>
                        </div>
                    ) : (
                        <ul className="ttrpg-rows">
                            {players.map((player) => (
                                <li key={player.id} className="ttrpg-row">
                                    <span className="ttrpg-row__main ttrpg-row__main--swatch">
                                        <span className="ttrpg-swatch" style={{ background: player.color }} />
                                        {player.name}
                                    </span>
                                    <button type="button" className="ttrpg-segment" onClick={() => kick(player.id, player.name)}>
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Popover>
            )}

            {showQr && <QrCode path={live.joinPath} password={live.password} onClose={() => setShowQr(false)} />}
        </>
    );
}

interface QrCodeProps
{
    /** The join page, without the site's address, which is added in the browser. */
    path: string;
    /** What players type after scanning. Only the game master's screen has it, see play.status. */
    password: string;
    onClose: () => void;
}

/**
 * The join link as a QR code over the whole screen, big enough to scan from across the table,
 * with the password written under it for everyone at the table. The password is not in the code
 * itself, so a photo of the code shared further does not let anyone in. Any click or Esc closes it.
 */
function QrCode({ path, password, onClose }: QrCodeProps)
{
    const [code, setCode] = useState<{ url: string; modules: boolean[][] } | null>(null);

    useEffect(() =>
    {
        // Testing with phones, the game master stays on localhost and the phones need the
        // laptop's address on the network instead, see README.md.
        const url = `${import.meta.env.VITE_JOIN_ORIGIN || window.location.origin}${path}`;
        let cancelled = false;

        loadQr().then(({ encode }) =>
        {
            if (!cancelled)
                setCode({ url, modules: encode(url, { border: 2 }).data });

        });

        return () =>
        {
            cancelled = true;
        };
    }, [path]);

    useKeydown((event) =>
    {
        if (event.key === 'Escape')
            onClose();

    });

    // One square per dark module, all in one path.
    const squares = code
        ? code.modules.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : ''))).join('')
        : '';
    const side = code ? code.modules.length : 0;

    // In the app's own root rather than the top bar: the bar's blur makes it the box that fixed
    // things fill, which squeezed the overlay to the size of the bar.
    return createPortal(
        <div className="ttrpg-qr" role="dialog" aria-label="Join with this QR code" onClick={onClose}>
            <div className="ttrpg-panel ttrpg-qr__card">
                <h2>Scan to join the table</h2>
                {/* The tile is there from the start, so the panel does not jump when the code arrives. */}
                <div className="ttrpg-qr__code">
                    {code && (
                        <svg viewBox={`0 0 ${side} ${side}`} shapeRendering="crispEdges" aria-hidden="true">
                            <path d={squares} fill="#1e1d1f" />
                        </svg>
                    )}
                </div>
                <p className="ttrpg-qr__next">Then type the password</p>
                <p className="ttrpg-qr__password">{password}</p>
                {code && <p className="ttrpg-qr__url">{code.url}</p>}
                <p className="ttrpg-qr__close">Click anywhere or press Esc to close</p>
            </div>
        </div>,
        document.querySelector('.ttrpg') ?? document.body,
    );
}
