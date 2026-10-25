import type { Cell, CreatureSize, Grid, Point, Token, Wall } from '../types';

import { distance, onMap } from './geometry.ts';
import { cellAt, cellCenter, cellKey, neighbours, stepBlocked } from './grid.ts';

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

/**
 * Where a token stands at another size, as near where it stood as the grid allows: a Large
 * footprint is centred on a grid corner, a Medium one on a cell. Without a grid it stays put.
 */
export function resizedAt(grid: Grid, point: Point, size: CreatureSize): Point
{
    return grid.type === 'none' ? { x: point.x, y: point.y } : footprintCenter(grid, anchorAt(grid, point, size), size);
}

/**
 * Where a creature let go at a point lands: lined up with the grid like resizedAt, as near the
 * point as it can stand with the middle of every cell it covers on the map, clear of the others.
 * A ragged edge cell counts while its middle is on the map.
 */
export function landingAt(
    map: { grid: Grid; width: number; height: number },
    point: Point,
    size: CreatureSize,
    others: Pick<Token, 'x' | 'y' | 'size'>[] = [],
): Point
{
    const { grid, width, height } = map;
    const at = onMap(map, point);

    if (grid.type === 'none')
        return at;

    const taken = new Set(others.flatMap((other) => [...footprintKeys(grid, anchorAt(grid, other, other.size), other.size)]));
    const onIt = (anchor: Cell) =>
        footprint(grid, anchor, size).every((cell) =>
        {
            const { x, y } = cellCenter(grid, cell);

            return x >= 0 && y >= 0 && x <= width && y <= height;
        });
    const clear = (anchor: Cell) => onIt(anchor) && footprint(grid, anchor, size).every((cell) => !taken.has(cellKey(cell)));
    const start = anchorAt(grid, at, size);

    // The nearest anchor that fits, ring by ring outwards.
    // ponytail: gives up ten rings past the footprint; a crowd that big lands on top instead.
    const nearest = (fits: (anchor: Cell) => boolean) =>
    {
        const seen = new Set([cellKey(start)]);
        let ring = [start];

        for (let step = 0; step <= across[size] + 10 && ring.length > 0; step++)
        {
            const spots = ring.filter(fits).map((anchor) => footprintCenter(grid, anchor, size));

            if (spots.length > 0)
                return spots.reduce((best, spot) => (distance(spot, at) < distance(best, at) ? spot : best));

            ring = ring.flatMap((anchor) => neighbours(grid, anchor)).filter((cell) => !seen.has(cellKey(cell)) && seen.add(cellKey(cell)));
        }

        return null;
    };

    // On top of someone in a crowd, and past the edge only on a map smaller than the creature.
    return nearest(clear) ?? nearest(onIt) ?? footprintCenter(grid, start, size);
}
