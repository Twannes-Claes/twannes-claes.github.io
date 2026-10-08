import type { Cell, Grid, Point, Wall } from '../types';

import { distance, lerp, segmentsTouch } from './geometry.ts';

/*
 * Square and hex grid maths, after Red Blob Games' guide to hex grids. Cells are { q, r }: column
 * and row on a square grid, axial coordinates on a hex grid. A grid's size is always the distance
 * between the centres of two neighbouring cells, one step, so the same size measures the same on
 * both kinds of grid. Hex cell 0, 0 is centred on the grid's offset.
 */

const sqrt3 = Math.sqrt(3);

const squareSteps: Cell[] = [
    { q: 1, r: 0 },
    { q: 1, r: 1 },
    { q: 0, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 0 },
    { q: -1, r: -1 },
    { q: 0, r: -1 },
    { q: 1, r: -1 },
];

const hexSteps: Cell[] = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
];

/** For sets and maps, which compare objects by identity. */
export function cellKey(cell: Cell): string
{
    return `${cell.q},${cell.r}`;
}

export function sameCell(a: Cell, b: Cell): boolean
{
    return a.q === b.q && a.r === b.r;
}

/** From the centre of a hex to one of its corners. */
export function hexRadius(grid: Grid): number
{
    return grid.size / sqrt3;
}

export function cellCenter(grid: Grid, { q, r }: Cell): Point
{
    const { size, offsetX, offsetY } = grid;

    if (grid.type !== 'hex')
        return { x: offsetX + (q + 0.5) * size, y: offsetY + (r + 0.5) * size };

    if (grid.hexOrientation === 'pointy')
        return { x: offsetX + size * (q + r / 2), y: offsetY + size * (sqrt3 / 2) * r };

    return { x: offsetX + size * (sqrt3 / 2) * q, y: offsetY + size * (r + q / 2) };
}

/**
 * Snaps fractional axial coordinates to the hex they fall in. Rounding q and r on their own picks
 * the wrong hex near corners, so the third cube coordinate decides which one to correct.
 */
function roundHex(q: number, r: number): Cell
{
    const s = -q - r;
    let roundQ = Math.round(q);
    let roundR = Math.round(r);
    const roundS = Math.round(s);
    const errorQ = Math.abs(roundQ - q);
    const errorR = Math.abs(roundR - r);
    const errorS = Math.abs(roundS - s);

    if (errorQ > errorR && errorQ > errorS)
        roundQ = -roundR - roundS;
    else if (errorR > errorS)
        roundR = -roundQ - roundS;

    return { q: roundQ, r: roundR };
}

/** The cell a point falls in. */
export function cellAt(grid: Grid, point: Point): Cell
{
    const x = point.x - grid.offsetX;
    const y = point.y - grid.offsetY;
    const { size } = grid;

    if (grid.type !== 'hex')
        return { q: Math.floor(x / size), r: Math.floor(y / size) };

    if (grid.hexOrientation === 'pointy')
    {
        const r = y / (size * (sqrt3 / 2));

        return roundHex(x / size - r / 2, r);
    }

    const q = x / (size * (sqrt3 / 2));

    return roundHex(q, y / size - q / 2);
}

/** Eight around a square, diagonals included, six around a hex. */
export function neighbours(grid: Grid, cell: Cell): Cell[]
{
    const steps = grid.type === 'hex' ? hexSteps : squareSteps;

    return steps.map((step) => ({ q: cell.q + step.q, r: cell.r + step.r }));
}

/** The fewest steps between two cells, ignoring walls. */
export function cellDistance(grid: Grid, a: Cell, b: Cell): number
{
    const q = Math.abs(a.q - b.q);
    const r = Math.abs(a.r - b.r);

    if (grid.type !== 'hex')
        return Math.max(q, r);

    return (q + r + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

/** The outline of a cell, for drawing it. */
export function cellCorners(grid: Grid, cell: Cell): Point[]
{
    const center = cellCenter(grid, cell);

    if (grid.type !== 'hex')
    {
        const half = grid.size / 2;

        return [
            { x: center.x - half, y: center.y - half },
            { x: center.x + half, y: center.y - half },
            { x: center.x + half, y: center.y + half },
            { x: center.x - half, y: center.y + half },
        ];
    }

    const radius = hexRadius(grid);
    const start = grid.hexOrientation === 'pointy' ? Math.PI / 6 : 0;

    return Array.from({ length: 6 }, (_, corner) =>
    {
        const angle = start + (corner * Math.PI) / 3;

        return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
    });
}

/** Whether a wall that blocks movement stands between two neighbouring cells. */
export function stepBlocked(grid: Grid, walls: Wall[], from: Cell, to: Cell): boolean
{
    const a = cellCenter(grid, from);
    const b = cellCenter(grid, to);

    return walls.some(
        (wall) =>
            wall.blocksMove &&
            segmentsTouch(a, b, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }),
    );
}

/** The grid corner closest to a point, where walls snap to by default. */
export function nearestCorner(grid: Grid, point: Point): Point
{
    return snapPoint(grid, point, 1);
}

/**
 * Where a wall end snaps to with steps points per cell side: 1 for the corners only, 2 adds the
 * middles of the sides, and so on. On a square grid that is a finer grid over the whole cell; on
 * a hex grid the points sit on the sides of the hex the point is in, which hold the nearest one.
 */
export function snapPoint(grid: Grid, point: Point, steps: number): Point
{
    if (grid.type !== 'hex')
    {
        const step = grid.size / steps;
        const snap = (value: number, offset: number) => offset + Math.round((value - offset) / step) * step;

        return { x: snap(point.x, grid.offsetX), y: snap(point.y, grid.offsetY) };
    }

    const corners = cellCorners(grid, cellAt(grid, point));
    const points = corners.flatMap((corner, index) =>
    {
        const next = corners[(index + 1) % corners.length];

        return Array.from({ length: steps }, (_, step) => ({
            x: corner.x + ((next.x - corner.x) * step) / steps,
            y: corner.y + ((next.y - corner.y) * step) / steps,
        }));
    });

    return points.reduce((best, candidate) =>
        distance(candidate, point) < distance(best, point) ? candidate : best,
    );
}

/**
 * The cells on a straight line from a to b, both included, each a neighbour of the one before.
 * Fills the gap when a finger skips cells. Both ends are nudged by a hair, so a line running
 * exactly along an edge between two cells always picks the same side.
 */
export function cellLine(grid: Grid, a: Cell, b: Cell): Cell[]
{
    const steps = cellDistance(grid, a, b);
    const nudge = { x: grid.size * 1e-6, y: grid.size * 2e-6 };
    const from = cellCenter(grid, a);
    const to = cellCenter(grid, b);
    const start = { x: from.x + nudge.x, y: from.y + nudge.y };
    const end = { x: to.x + nudge.x, y: to.y + nudge.y };

    return Array.from({ length: steps + 1 }, (_, step) =>
        cellAt(grid, lerp(start, end, steps === 0 ? 0 : step / steps)),
    );
}
