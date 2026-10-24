import { useState } from 'react';

import type { CreatureSize, Grid } from '../types';

import { cellsAcross, footprint } from '../map/size';

const sizes: { id: CreatureSize; name: string }[] = [
    { id: 'tiny', name: 'Tiny' },
    { id: 'small', name: 'Small' },
    { id: 'medium', name: 'Medium' },
    { id: 'large', name: 'Large' },
    { id: 'huge', name: 'Huge' },
    { id: 'gargantuan', name: 'Gargantuan' },
];

/** How much of the map a size takes on this grid, like 2×2 or 3 hexes. Nothing without a grid. */
function footprintLabel(grid: Grid, size: CreatureSize): string
{
    if (grid.type === 'none')
        return '';

    if (grid.type === 'hex')
    {
        const count = footprint(grid, { q: 0, r: 0 }, size).length;

        return count === 1 ? '1 hex' : `${count} hexes`;
    }

    const across = cellsAcross(size);

    return `${across}×${across}`;
}

interface SizePickerProps
{
    size: CreatureSize;
    /** The map's grid, to show how much of it each size takes. None on the join form. */
    grid?: Grid;
    /** Saving fails with the message to show, like the conditions, see ConditionPicker. */
    onChange: (size: CreatureSize) => Promise<void> | void;
}

/**
 * A creature's size, each a press: in the right-click menu and the Players list for the GM, and on
 * the join form. A press shows at once, before its save is back.
 */
export function SizePicker({ size, grid, onChange }: SizePickerProps)
{
    const [held, setHeld] = useState<CreatureSize | null>(null);
    const [failure, setFailure] = useState('');
    const current = held ?? size;

    const pick = (next: CreatureSize) =>
    {
        setHeld(next);
        setFailure('');
        void Promise.resolve(onChange(next))
            .catch((reason: Error) => setFailure(reason.message))
            .finally(() => setHeld(null));
    };

    return (
        <div className="ttrpg-sizes" role="group" aria-label="Size">
            {sizes.map((choice) => (
                <button key={choice.id} type="button" className="ttrpg-segment" aria-pressed={current === choice.id} onClick={() => pick(choice.id)}>
                    {choice.name}
                    {grid && grid.type !== 'none' && <span className="ttrpg-sizes__cells">{footprintLabel(grid, choice.id)}</span>}
                </button>
            ))}
            {failure && (
                <p className="ttrpg-error" role="alert">
                    {failure}
                </p>
            )}
        </div>
    );
}
