import type { Cell, CreatureSize, Point, Scenario, Token } from '../types';

import { distance } from './geometry.ts';
import { cellAt, cellCenter, cellKey, neighbours, stepBlocked } from './grid.ts';
import { anchorAt, cellsAcross, footprint, footprintCenter, footprintKeys, partners, resizedAt } from './size.ts';

type Ground = Pick<Scenario, 'grid' | 'walls' | 'width' | 'height'>;

/** The cells the tokens cover. */
function takenBy(grid: Scenario['grid'], tokens: Pick<Token, 'x' | 'y' | 'size'>[]): Set<string>
{
    return new Set(tokens.flatMap((token) => [...footprintKeys(grid, anchorAt(grid, token, token.size), token.size)]));
}

/** Whether a wall runs between any two of the cells, which a creature cannot stand across. */
function walled(ground: Ground, cells: Cell[]): boolean
{
    const keys = new Set(cells.map(cellKey));

    return cells.some((cell) => neighbours(ground.grid, cell).some((next) => keys.has(cellKey(next)) && stepBlocked(ground.grid, ground.walls, cell, next)));
}

/**
 * The anchor nearest to a point where a creature fits: every cell it covers on the map, free and
 * with no wall between them, reached from the point's cell without crossing a wall. It spreads
 * like someone walking out of the spawn, so it never lands on the far side of a wall. Null when
 * the walls leave no such room. With solid, the others block the walk too, not only the landing.
 * ponytail: walks the whole area the point reaches when nothing fits, a big map's corridor maze at
 * worst; cap the walk if a spawn ever takes long.
 */
function roomFor(ground: Ground, at: Point, size: CreatureSize, taken: Set<string>, solid = false): Cell | null
{
    const { grid, walls } = ground;
    const onMap = (cell: Cell) =>
    {
        const center = cellCenter(grid, cell);

        return center.x >= 0 && center.y >= 0 && center.x <= ground.width && center.y <= ground.height;
    };

    const fits = (anchor: Cell) =>
    {
        const cells = footprint(grid, anchor, size);

        return cells.every((cell) => onMap(cell) && !taken.has(cellKey(cell))) && !walled(ground, cells);
    };

    const start = cellAt(grid, at);
    const queue = [{ cell: start, steps: 0 }];
    const seen = new Set([cellKey(start)]);
    const found: Cell[] = [];
    // Anchors a few steps past the first that fits can still sit closer, a Large one up and left.
    let until = Infinity;

    // An index rather than shift(), which copies the whole queue on every call.
    for (let next = 0; next < queue.length && queue[next].steps <= until; next++)
    {
        const { cell, steps } = queue[next];

        if (fits(cell))
        {
            found.push(cell);
            until = Math.min(until, steps + cellsAcross(size));
        }

        for (const neighbour of neighbours(grid, cell))
        {
            const key = cellKey(neighbour);

            if (seen.has(key) || !onMap(neighbour) || (solid && taken.has(key)) || stepBlocked(grid, walls, cell, neighbour))
                continue;

            seen.add(key);
            queue.push({ cell: neighbour, steps: steps + 1 });
        }
    }

    const away = (anchor: Cell) => distance(footprintCenter(grid, anchor, size), at);

    return found.length > 0 ? found.reduce((best, anchor) => (away(anchor) < away(best) ? anchor : best)) : null;
}

/**
 * Where tokens arriving at a spawn point stand: the nearest room for each one's whole footprint,
 * clear of the ones staying and of each other. One with no room is put on the spawn point anyway,
 * rather than refused, for the GM to move, see stuckAt.
 */
export function spawnSpots(
    scenario: Ground & Pick<Scenario, 'spawn'>,
    arriving: Pick<Token, 'size'>[],
    staying: Pick<Token, 'x' | 'y' | 'size'>[],
): Point[]
{
    const { grid, spawn } = scenario;
    const taken = takenBy(grid, staying);

    return arriving.map(({ size }) =>
    {
        const room = roomFor(scenario, spawn, size, taken);
        const anchor = room ?? anchorAt(grid, spawn, size);

        for (const key of footprintKeys(grid, anchor, size))
            taken.add(key);

        return footprintCenter(grid, anchor, size);
    });
}

/** Whether a creature of a size, alone, has room around a spawn point, for the Spawn tool. */
export function roomAt(scenario: Ground, spawn: Point, size: CreatureSize): boolean
{
    return roomFor(scenario, spawn, size, new Set()) !== null;
}

/**
 * Where a token stands at a new size: the nearest room for its new footprint, walking out from
 * where it stood, so one growing beside a wall steps away from it, but never past someone else.
 * Its own companions may share its space. With no room it grows where it stands, for the GM to
 * move, see stuckAt. Without a grid it stays put.
 */
export function resizedSpot(
    scenario: Ground,
    token: Pick<Token, 'id' | 'x' | 'y' | 'summonOf'>,
    size: CreatureSize,
    others: Pick<Token, 'id' | 'x' | 'y' | 'size' | 'summonOf'>[],
): Point
{
    const { grid } = scenario;
    const at = resizedAt(grid, token, size);

    if (grid.type === 'none')
        return at;

    const room = roomFor(scenario, token, size, takenBy(grid, others.filter((other) => other.id !== token.id && !partners(token, other))), true);

    return room ? footprintCenter(grid, room, size) : at;
}

/**
 * Whether a token stands across a wall, however it got there: put on a walled-in spawn point, grown
 * with no room, or dragged or dropped by the GM. Worked out from where it stands rather than kept,
 * so nothing that moves a token has to remember it. A Medium one covers a single cell, never.
 */
export function stuckAt(scenario: Ground, token: Pick<Token, 'x' | 'y' | 'size'>): boolean
{
    const { grid } = scenario;

    return grid.type !== 'none' && walled(scenario, footprint(grid, anchorAt(grid, token, token.size), token.size));
}
