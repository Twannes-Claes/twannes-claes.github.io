import {
    faArrowUpRightFromSquare,
    faCloud,
    faEye,
    faPlay,
    faQrcode,
    faStop,
    faUserXmark,
    faUsers,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useActionState, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Condition, CreatureSize, GameSystem, Grid, Live, Stats, Token } from '../types';

import { confirmAction, kickPlayer } from '../services/confirm';

import { ConditionPicker } from './ConditionPicker';
import { Spinner } from './Feedback';
import { Popover } from './Popover';
import { RowEditor } from './RowEditor';
import { SizePicker } from './SizePicker';
import { useOpenRow } from './useOpenRow';
import { StatChips, StatsForm } from './StatsForm';
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
    /** That map's grid, for the players' sizes. */
    grid: Grid;
    /** Hears that the session started, so the editor can switch to the GM view. */
    onStarted: () => void;
    /** Hears what worked, for the editor's toast. */
    onDone: (message: string) => void;
    onError: (message: string) => void;
    /**
     * The bar faded out after the mouse rested. Its pop-outs live outside it, so they hide here
     * and come back as they were, like the settings, see Settings.tsx.
     */
    hidden?: boolean;
}

interface PlayersProps
{
    /** Every token; the players among them are listed. */
    tokens: Token[];
    onSetStats: (tokenId: string, stats: Stats) => Promise<void>;
    /** The session's game, whose conditions the list offers. */
    system: GameSystem;
    onSetConditions: (tokenId: string, conditions: Condition[]) => Promise<void>;
    onSetSize: (tokenId: string, size: CreatureSize) => Promise<void>;
    /** The open map's grid, to show how much of it each size takes. */
    grid: Grid;
    /** Removes one from the table, only in a live session. */
    onKick?: (tokenId: string, name: string) => void;
    /** Shows the QR code to join, only in a live session. */
    onQr?: () => void;
    /** See hidden on LiveControls. */
    hidden?: boolean;
}

/**
 * The Players button and its pop-out: who is at the table, with their numbers to change. Live
 * it lists who joined; before that the GM view's two test players, see demoTokens.
 */
export function Players({ tokens, onSetStats, system, onSetConditions, onSetSize, grid, onKick, onQr, hidden = false }: PlayersProps)
{
    const [open, setOpen] = useState(false);
    // The one player opened under their row, and the one folding away.
    const rows = useOpenRow();
    const players = tokens.filter((token) => token.kind === 'player' && !token.summonOf);
    // Each player's companions right under them, so the GM sees their numbers too.
    const rowsShown = players.flatMap((player) => [player, ...tokens.filter((token) => token.summonOf === player.id)]);

    return (
        <>
            <button
                type="button"
                className="ttrpg-segment"
                aria-pressed={open}
                aria-expanded={open}
                title={onQr ? 'Who has joined' : 'The test players'}
                onClick={() => setOpen((was) => !was)}
            >
                <FontAwesomeIcon icon={faUsers} />
                Players <span className="ttrpg-count">{players.length}</span>
            </button>

            {open && !hidden && (
                <Popover title="Players" className="ttrpg-start" dismissOnOutside onClose={() => setOpen(false)}>
                    {players.length === 0 ? (
                        <p className="ttrpg-empty">Nobody has joined yet.</p>
                    ) : (
                        <ul className="ttrpg-rows">
                            {rowsShown.map((player) => (
                                <li key={player.id} className={`ttrpg-row${rows.open === player.id ? ' ttrpg-row--open' : ''}${player.summonOf ? ' ttrpg-row--companion' : ''}`}>
                                    <button
                                        type="button"
                                        className="ttrpg-row__main ttrpg-row__main--swatch"
                                        aria-expanded={rows.open === player.id}
                                        onClick={() => rows.toggle(player.id)}
                                    >
                                        <span className="ttrpg-swatch" style={{ background: player.color }} />
                                        {/* The name, with the numbers under it. */}
                                        <span className="ttrpg-row__text">
                                            <span className="ttrpg-row__name">
                                                {player.name}
                                                {player.summonOf && <span className="ttrpg-tag">Companion</span>}
                                            </span>
                                            <StatChips token={player} />
                                        </span>
                                    </button>
                                    {onKick && (
                                        <button
                                            type="button"
                                            className="ttrpg-icon-button ttrpg-icon-button--small"
                                            aria-label={`Remove ${player.name}`}
                                            title="Remove from the table"
                                            onClick={() => onKick(player.id, player.name)}
                                        >
                                            <FontAwesomeIcon icon={faUserXmark} />
                                        </button>
                                    )}
                                    {(rows.open === player.id || rows.closing === player.id) && (
                                        <RowEditor
                                            closing={rows.open !== player.id}
                                            onClosed={rows.folded}
                                            tabs={[
                                                { id: 'numbers', label: 'Numbers', content: <StatsForm token={player} onSave={(stats) => onSetStats(player.id, stats)} /> },
                                                {
                                                    id: 'conditions',
                                                    label: 'Conditions',
                                                    scrolls: true,
                                                    content: (
                                                        <ConditionPicker
                                                            system={system}
                                                            conditions={player.conditions ?? []}
                                                            onChange={(conditions) => onSetConditions(player.id, conditions)}
                                                        />
                                                    ),
                                                },
                                                {
                                                    id: 'size',
                                                    label: 'Size',
                                                    content: <SizePicker size={player.size} grid={grid} onChange={(size) => onSetSize(player.id, size)} />,
                                                },
                                            ]}
                                        />
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {/* Always here live, the only way to the QR code, so late players can join. */}
                    {onQr && (
                        <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={onQr}>
                            <FontAwesomeIcon icon={faQrcode} />
                            Show the QR code
                        </button>
                    )}
                </Popover>
            )}
        </>
    );
}

/**
 * Starting and ending a saved session, beside the mode switch. Start asks for the password
 * players join with; while live, the players at the table, with the QR code that leads to the
 * join page under them.
 */
export function LiveControls({ live, scenarioId, grid, onStarted, onDone, onError, hidden = false }: LiveControlsProps)
{
    const [asking, setAsking] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [freshFog, setFreshFog] = useState(true);

    const [failure, start, starting] = useActionState(
        (_: string, form: FormData) =>
            live
                .start(String(form.get('password')), scenarioId, freshFog)
                .then(() =>
                {
                    setAsking(false);
                    onStarted();
                    onDone('The session is live. The QR code to join is under Players.');

                    return '';
                })
                .catch((reason: Error) => reason.message),
        '',
    );

    const kick = (id: string, name: string) => kickPlayer(live, id, name, onDone, onError);

    const end = () =>
    {
        void confirmAction('End the session? Players can no longer move until it starts again.', 'End')
            .then(async (yes) =>
            {
                if (!yes)
                    return;

                await live.end();
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
                    aria-pressed={asking}
                    aria-expanded={asking}
                    title="Go live, so players can join with a password"
                    onClick={() => setAsking((open) => !open)}
                >
                    <FontAwesomeIcon icon={faPlay} />
                    Start
                </button>

                {asking && !hidden && (
                    <Popover title="Start the session" className="ttrpg-start" dismissOnOutside onClose={() => setAsking(false)}>
                        <form action={start} className="ttrpg-popover__body ttrpg-settings">
                            <label title="What the players type to join">
                                Password
                                <input name="password" defaultValue={live.password} autoComplete="off" required autoFocus />
                            </label>
                            <div className="ttrpg-settings__group" role="group" aria-label="Fog">
                                Fog
                                <div className="ttrpg-settings__choices">
                                    <button
                                        type="button"
                                        className="ttrpg-segment"
                                        aria-pressed={freshFog}
                                        title="Forget what the party saw last time"
                                        onClick={() => setFreshFog(true)}
                                    >
                                        <FontAwesomeIcon icon={faCloud} />
                                        Fresh
                                    </button>
                                    <button
                                        type="button"
                                        className="ttrpg-segment"
                                        aria-pressed={!freshFog}
                                        title="Pick up where they left off"
                                        onClick={() => setFreshFog(false)}
                                    >
                                        <FontAwesomeIcon icon={faEye} />
                                        Keep
                                    </button>
                                </div>
                            </div>
                            {failure && (
                                <p className="ttrpg-error" role="alert">
                                    {failure}
                                </p>
                            )}
                            <div className="ttrpg-popover__foot">
                                <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={() => setAsking(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm" disabled={starting}>
                                    {starting ? <Spinner /> : <FontAwesomeIcon icon={faPlay} />}
                                    {starting ? 'Starting' : 'Start'}
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
            <Players
                tokens={live.tokens}
                onSetStats={live.setStats}
                system={live.system}
                onSetConditions={live.setConditions}
                onSetSize={live.setSize}
                grid={grid}
                onKick={kick} onQr={() => setShowQr(true)} hidden={hidden}
            />
            <button type="button" className="ttrpg-segment" title="End the session for everyone" onClick={end}>
                <FontAwesomeIcon icon={faStop} />
                End
            </button>

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
        const url = `${__JOIN_ORIGIN__ ?? window.location.origin}${path}`;
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
                <button
                    type="button"
                    className="ttrpg-icon-button ttrpg-icon-button--small ttrpg-qr__close"
                    aria-label="Close"
                    title="Close"
                    onClick={onClose}
                >
                    <FontAwesomeIcon icon={faXmark} />
                </button>
                <p className="ttrpg-subhead">Join the table</p>
                <h2>Scan with your phone camera</h2>
                {/* The tile is there from the start, so the panel does not jump when the code arrives. */}
                <div className="ttrpg-qr__code">
                    {code && (
                        <svg viewBox={`0 0 ${side} ${side}`} shapeRendering="crispEdges" aria-hidden="true">
                            <path d={squares} fill="#1e1d1f" />
                        </svg>
                    )}
                </div>
                <div className="ttrpg-qr__password">
                    <span className="ttrpg-subhead">Then type the password</span>
                    <strong>{password}</strong>
                </div>
                {/* Opens the join page here too, to try it, without closing the code behind it. */}
                {code && (
                    <a
                        className="ttrpg-qr__url"
                        href={code.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {code.url.replace(/^https?:\/\//, '')}
                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                    </a>
                )}
                <p className="ttrpg-qr__hint">Click anywhere or press <kbd>Esc</kbd> to close</p>
            </div>
        </div>,
        document.querySelector('.ttrpg') ?? document.body,
    );
}
