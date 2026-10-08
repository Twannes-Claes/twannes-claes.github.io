import type { Cell, Grid, Point, Wall } from '../types';

import { cellAt, cellCenter, cellKey, neighbours, stepBlocked } from './grid.ts';

/**
 * Free cells for tokens arriving at a spawn point: the spawn cell first, then ring after ring
 * around it, closest first. It spreads like someone walking out of the spawn, so it never hands
 * out a cell on the far side of a wall, and stays on the map. Can return fewer than asked for
 * when the area is walled in.
 */
export function spawnCells(
    grid: Grid,
    walls: Wall[],
    map: { width: number; height: number },
    spawn: Point,
    count: number,
    taken: Set<string>,
): Cell[]
{
    const onMap = (cell: Cell) =>
    {
        const center = cellCenter(grid, cell);

        return center.x >= 0 && center.y >= 0 && center.x <= map.width && center.y <= map.height;
    };

    const start = cellAt(grid, spawn);
    const queue = [start];
    const seen = new Set([cellKey(start)]);
    const found: Cell[] = [];

    // An index rather than shift(), which copies the whole queue on every call.
    for (let next = 0; next < queue.length && found.length < count; next++)
    {
        const cell = queue[next];

        if (!taken.has(cellKey(cell)))
            found.push(cell);

        for (const neighbour of neighbours(grid, cell))
        {
            const key = cellKey(neighbour);

            if (seen.has(key) || !onMap(neighbour) || stepBlocked(grid, walls, cell, neighbour))
                continue;

            seen.add(key);
            queue.push(neighbour);
        }
    }

    return found;
}
