import { faPersonWalking } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { CSSProperties } from 'react';

import type { Token } from '../types';

import type { PendingMove } from '../map/view';

import { useKeydown } from './useKeys';

interface MoveSheetProps
{
    /** The path waiting, or null when there is none. */
    move: PendingMove | null;
    token: Token | undefined;
    onMove: () => void;
    onCancel: () => void;
}

/**
 * Asks whether to walk a path a player let go of, from the bottom of the screen where a thumb
 * reaches. Past the token's speed it says so but still lets it move, the game master rules on
 * dashing; onto someone else it cannot move at all. Enter moves, Esc or a right click on the map
 * cancels, see map/view.ts.
 */
export function MoveSheet({ move, token, onMove, onCancel }: MoveSheetProps)
{
    const open = move && token ? { move, token } : null;

    useKeydown((event) =>
    {
        if (event.key === 'Escape')
            onCancel();
        else if (event.key === 'Enter' && open && !open.move.blocked)
            onMove();

    }, open !== null);

    if (!open)
        return null;

    return <Sheet {...open} onMove={onMove} onCancel={onCancel} />;
}

interface SheetProps
{
    move: PendingMove;
    token: Token;
    onMove: () => void;
    onCancel: () => void;
}

function Sheet({ move, token, onMove, onCancel }: SheetProps)
{

    const over = move.feet > token.speed;
    let note = `${token.speed - move.feet} ft left after this`;

    if (move.blocked)
        note = 'Someone is already standing there';
    else if (over)
        note = `${move.feet - token.speed} ft past their speed`;

    return (
        <div
            className="ttrpg-panel ttrpg-sheet"
            role="dialog"
            aria-label={`Move ${token.name}`}
        >
            <div className="ttrpg-sheet__head">
                {/* The token as it is on the map: its picture, or its initial, in its ring colour. */}
                <span className="ttrpg-sheet__avatar" style={{ borderColor: token.color }} aria-hidden="true">
                    {token.avatar ? <img src={token.avatar} alt="" /> : token.name.charAt(0)}
                </span>
                <span className="ttrpg-sheet__who">
                    <strong>{token.name}</strong>
                    <span className={move.blocked || over ? 'ttrpg-sheet__warning' : undefined}>{note}</span>
                </span>
                <span className="ttrpg-sheet__feet">
                    {move.feet}
                    <small> / {token.speed} ft</small>
                </span>
            </div>
            {/* How much of the token's speed the path uses, notched every 5 ft, red once past it. */}
            <div
                className={over ? 'ttrpg-sheet__bar ttrpg-sheet__bar--over' : 'ttrpg-sheet__bar'}
                style={{ '--steps': Math.max(1, token.speed / 5) } as CSSProperties}
                aria-hidden="true"
            >
                <span style={{ width: `${Math.min(100, (move.feet / token.speed) * 100)}%` }} />
            </div>
            <div className="ttrpg-popover__foot">
                <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={onCancel}>
                    Cancel
                    <kbd>Esc</kbd>
                </button>
                <button
                    type="button"
                    className="ttrpg-segment ttrpg-segment--block ttrpg-segment--confirm"
                    disabled={move.blocked}
                    onClick={onMove}
                >
                    <FontAwesomeIcon icon={faPersonWalking} />
                    Move
                    <kbd>Enter</kbd>
                </button>
            </div>
        </div>
    );
}
