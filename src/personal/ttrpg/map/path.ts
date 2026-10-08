import type { Cell, CreatureSize, Grid, Point, Wall } from '../types';

import { distance, segmentsTouch } from './geometry.ts';
import { cellLine, sameCell } from './grid.ts';
import { footprintBlocked } from './size.ts';

/**
 * Grows a path of anchor cells, which starts where the creature stands, towards the anchor under
 * the finger, see map/size.ts. Going back onto a cell already on the path cuts the path there,
 * so retracing undoes steps. A skipped stretch is filled with a straight line of cells, and a
 * wall in the way of any cell the creature covers stops the path at the last cell before it.
 */
export function extendPath(
    grid: Grid,
    walls: Wall[],
    path: Cell[],
    to: Cell,
    size: CreatureSize = 'medium',
): Cell[]
{
    const visited = path.findIndex((cell) => sameCell(cell, to));

    if (visited !== -1)
        return path.slice(0, visited + 1);

    const next = [...path];

    for (const cell of cellLine(grid, path[path.length - 1], to).slice(1))
    {
        if (footprintBlocked(grid, walls, next[next.length - 1], cell, size))
            break;

        next.push(cell);
    }

    return next;
}

/**
 * Feet walked along a path of neighbouring cells. On a square grid diagonals alternate 5 and 10
 * ft, counted over the whole path, so straight steps in between do not reset the count, unless
 * the grid's diagonals are equal, then every diagonal is 5 ft.
 */
export function pathFeet(grid: Grid, path: Cell[]): number
{
    const step = grid.feetPerCell;

    if (grid.type === 'hex')
        return Math.max(0, path.length - 1) * step;

    let feet = 0;
    let diagonals = 0;

    for (let index = 1; index < path.length; index++)
    {
        const from = path[index - 1];
        const to = path[index];

        if (from.q === to.q || from.r === to.r)
        {
            feet += step;
            continue;
        }

        diagonals++;
        feet += diagonals % 2 === 0 && grid.diagonals !== 'equal' ? step * 2 : step;
    }

    return feet;
}

/** Feet along a free line, for a scenario without a grid, scaled by the grid's size. */
export function lineFeet(grid: Grid, points: Point[]): number
{
    let pixels = 0;

    for (let index = 1; index < points.length; index++)
        pixels += distance(points[index - 1], points[index]);

    return (pixels / grid.size) * grid.feetPerCell;
}

/**
 * Whether a wall that blocks movement crosses any stretch of a line of points. The view stops a
 * path drawn into a wall with it, and the server refuses a player's walk through one, see
 * convex/play.ts.
 */
export function pathBlocked(walls: Wall[], points: Point[]): boolean
{
    return points.slice(1).some((point, index) =>
        walls.some(
            (wall) =>
                wall.blocksMove &&
                segmentsTouch(points[index], point, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }),
        ),
    );
}
