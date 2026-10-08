import { useState } from 'react';

import type { Token } from '../types';

import type { PendingMove } from '../map/view';

import { useKeydown } from './useKeys';

interface MoveSheetProps
{
    /** The path waiting, or null when there is none and the sheet slides away. */
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
    // The last path shown, kept on screen while the sheet slides away once it is gone.
    const [last, setLast] = useState<{ move: PendingMove; token: Token } | null>(null);
    const open = move && token ? { move, token } : null;

    if (open && (open.move !== last?.move || open.token !== last.token))
        setLast(open);

    const shown = open ?? last;

    useKeydown((event) =>
    {
        if (event.key === 'Escape')
            onCancel();
        else if (event.key === 'Enter' && open && !open.move.blocked)
            onMove();

    }, open !== null);

    if (!shown)
        return null;

    return (
        <Sheet
            {...shown}
            closing={!open}
            onMove={onMove}
            onCancel={onCancel}
            onGone={() => setLast(null)}
        />
    );
}

interface SheetProps
{
    move: PendingMove;
    token: Token;
    closing: boolean;
    onMove: () => void;
    onCancel: () => void;
    onGone: () => void;
}

function Sheet({ move, token, closing, onMove, onCancel, onGone }: SheetProps)
{

    const over = move.feet > token.speed;
    let note = `${token.speed - move.feet} ft left after this`;

    if (move.blocked)
        note = 'Someone is already standing there';
    else if (over)
        note = `${move.feet - token.speed} ft past their speed`;

    return (
        <div
            className={closing ? 'ttrpg-panel ttrpg-sheet ttrpg-sheet--closing' : 'ttrpg-panel ttrpg-sheet'}
            role="dialog"
            aria-label={`Move ${token.name}`}
            inert={closing}
            onAnimationEnd={() =>
            {
                if (closing)
                    onGone();

            }}
        >
            <div className="ttrpg-sheet__head">
                <span className="ttrpg-swatch" style={{ background: token.color }} />
                <span className="ttrpg-sheet__who">
                    <strong>{token.name}</strong>
                    <span className={move.blocked || over ? 'ttrpg-sheet__warning' : undefined}>{note}</span>
                </span>
                <span className="ttrpg-sheet__feet">
                    {move.feet}
                    <small> / {token.speed} ft</small>
                </span>
            </div>
            {/* How much of the token's speed the path uses, red once past it. */}
            <div className={over ? 'ttrpg-sheet__bar ttrpg-sheet__bar--over' : 'ttrpg-sheet__bar'} aria-hidden="true">
                <span style={{ width: `${Math.min(100, (move.feet / token.speed) * 100)}%` }} />
            </div>
            <div className="ttrpg-sheet__actions">
                <button type="button" className="ttrpg-button" onClick={onCancel}>
                    Cancel
                </button>
                <button
                    type="button"
                    className="ttrpg-button ttrpg-button--confirm"
                    disabled={move.blocked}
                    onClick={onMove}
                >
                    Move
                </button>
            </div>
        </div>
    );
}
