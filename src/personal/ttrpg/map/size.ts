import type { Cell, CreatureSize, Grid, Point, Wall } from '../types';

import { cellAt, cellCenter, cellKey, stepBlocked } from './grid.ts';

/*
 * How much of the grid a creature takes, see PLAN.md: Tiny to Medium one cell, Large 2 by 2,
 * Huge 3 by 3, Gargantuan 4 by 4, and on a hex grid 1, 3, 7 and 19 hexes. A creature's place is
 * its anchor cell: the top left of its square, or on a hex grid the first hex of the triangle or
 * the middle of the ring. Paths are paths of anchors, so every size walks the same way.
 */

/** Cells across for each size. Tiny shares a cell in the rules; here it takes one, like Small. */
const across: Record<CreatureSize, number> = {
    tiny: 1,
    small: 1,
    medium: 1,
    large: 2,
    huge: 3,
    gargantuan: 4,
};

export function cellsAcross(size: CreatureSize): number
{
    return across[size];
}

/** The hexes around an anchor out to a radius: 1, 7 or 19 of them. */
function hexRing(anchor: Cell, radius: number): Cell[]
{
    const cells: Cell[] = [];

    for (let q = -radius; q <= radius; q++)
    {
        for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++)
            cells.push({ q: anchor.q + q, r: anchor.r + r });

    }

    return cells;
}

/**
 * Every cell a creature covers, always in the same order for a size, so the cells of two
 * anchors pair up one by one when checking a step.
 */
export function footprint(grid: Grid, anchor: Cell, size: CreatureSize): Cell[]
{
    const count = across[size];

    if (grid.type === 'hex')
    {
        if (count === 2)
            return [anchor, { q: anchor.q + 1, r: anchor.r }, { q: anchor.q, r: anchor.r + 1 }];

        return hexRing(anchor, count === 1 ? 0 : count - 2);
    }

    const cells: Cell[] = [];

    for (let r = 0; r < count; r++)
    {
        for (let q = 0; q < count; q++)
            cells.push({ q: anchor.q + q, r: anchor.r + r });

    }

    return cells;
}

/** The middle of what a creature covers, where its token is drawn and its sight starts. */
export function footprintCenter(grid: Grid, anchor: Cell, size: CreatureSize): Point
{
    const centers = footprint(grid, anchor, size).map((cell) => cellCenter(grid, cell));

    return {
        x: centers.reduce((sum, point) => sum + point.x, 0) / centers.length,
        y: centers.reduce((sum, point) => sum + point.y, 0) / centers.length,
    };
}

/** The anchor whose footprint is centred closest to a point, like where a finger is. */
export function anchorAt(grid: Grid, point: Point, size: CreatureSize): Cell
{
    // How far the footprint's middle sits from its anchor's middle, the same for every anchor.
    const origin = { q: 0, r: 0 };
    const middle = footprintCenter(grid, origin, size);
    const anchorMiddle = cellCenter(grid, origin);

    return cellAt(grid, {
        x: point.x - (middle.x - anchorMiddle.x),
        y: point.y - (middle.y - anchorMiddle.y),
    });
}

/**
 * Whether a wall stands in the way of a creature stepping from one anchor to the next. Every
 * cell it covers makes the step, so a Large ogre cannot squeeze through a one cell gap.
 */
export function footprintBlocked(
    grid: Grid,
    walls: Wall[],
    from: Cell,
    to: Cell,
    size: CreatureSize,
): boolean
{
    const before = footprint(grid, from, size);
    const after = footprint(grid, to, size);

    return before.some((cell, index) => stepBlocked(grid, walls, cell, after[index]));
}

/** The keys of every cell a creature covers, for checking who stands where. */
export function footprintKeys(grid: Grid, anchor: Cell, size: CreatureSize): Set<string>
{
    return new Set(footprint(grid, anchor, size).map(cellKey));
}
