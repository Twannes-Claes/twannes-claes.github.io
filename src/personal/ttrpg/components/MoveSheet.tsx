import { useEffect } from 'react';

import type { Token } from '../types';

import type { PendingMove } from '../map/view';

interface MoveSheetProps
{
    move: PendingMove;
    token: Token;
    onMove: () => void;
    onCancel: () => void;
}

/**
 * Asks whether to walk a path a player let go of, from the bottom of the screen where a thumb
 * reaches. Past the token's speed it says so but still lets it move, the game master rules on
 * dashing; onto someone else it cannot move at all. Enter moves, Esc cancels.
 */
export function MoveSheet({ move, token, onMove, onCancel }: MoveSheetProps)
{
    useEffect(() =>
    {
        const keydown = (event: KeyboardEvent) =>
        {
            if (event.key === 'Escape')
                onCancel();
            else if (event.key === 'Enter' && !move.blocked)
                onMove();

        };

        window.addEventListener('keydown', keydown);

        return () => window.removeEventListener('keydown', keydown);
    }, [move, onMove, onCancel]);

    let note = `${token.name} walks ${move.feet} ft of ${token.speed} ft.`;

    if (move.blocked)
        note = 'Someone is already standing there.';
    else if (move.feet > token.speed)
        note = `That is past ${token.name}'s ${token.speed} ft.`;

    return (
        <div className="ttrpg-panel ttrpg-sheet" role="dialog" aria-label="Move">
            <p className={move.blocked || move.feet > token.speed ? 'ttrpg-sheet__warning' : undefined}>
                {note}
            </p>
            <div className="ttrpg-sheet__actions">
                <button
                    type="button"
                    className="ttrpg-button ttrpg-button--confirm"
                    disabled={move.blocked}
                    onClick={onMove}
                >
                    Move {move.feet} ft
                </button>
                <button type="button" className="ttrpg-button" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
