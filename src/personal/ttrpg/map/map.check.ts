import assert from 'node:assert/strict';

import type { Cell, GameSystem, Grid, Mark, Point, Scenario, Token, Wall } from '../types';
import { cleanConditions } from '../content/conditions.ts';
import { blocksOf, demoOgreStatBlock, spansOf, statBlockTemplates, statsOf } from '../content/statBlocks.ts';

import { toScreen, toWorld, zoomAt } from './camera.ts';
import { createExplored, markSeen, packedFlag, packSeen, wasSeen } from './fog.ts';
import { distance } from './geometry.ts';
import {
    cellAt,
    cellCenter,
    cellCorners,
    cellDistance,
    cellKey,
    cellLine,
    nearestCorner,
    neighbours,
    snapPoint,
    wrapOffset,
} from './grid.ts';
import { applyHit, cleanStats, healthState, hitOn, withoutNumbers } from './health.ts';
import { begun, cleanRoll, newFight, nextTurn, swapped, upNext, withoutRoll, withRoll } from './initiative.ts';
import { extendPath, pathBlocked, pathFeet } from './path.ts';
import { placedSize, propAt, snapCenter, snapSize } from './props.ts';
import { anchorAt, footprint, footprintCenter, footprintKeys, landingAt, ridesOn } from './size.ts';
import { spawnCells } from './spawn.ts';
import { createTool, measure, toggleDoor, wallInBox, type ToolPointer } from './tools.ts';
import { scenarioFromUvtt } from './uvtt.ts';
import { inSight, insidePolygon, sightSegments, visibilityPolygon } from './visibility.ts';
import { startWalk, walkAt } from './walk.ts';

/*
 * Asserts for the map maths, run with `node src/personal/ttrpg/map/map.check.ts`. Every import
 * inside map/ names its .ts extension because Node runs these files as they are and does not
 * guess extensions; Vite accepts either. Silent when everything holds.
 */

const base: Grid = {
    type: 'square',
    hexOrientation: 'pointy',
    size: 100,
    offsetX: 13,
    offsetY: -7,
    feetPerCell: 5,
    color: '#000',
    opacity: 1,
    visible: true,
};

const grids: Grid[] = [
    base,
    { ...base, type: 'hex', hexOrientation: 'pointy' },
    { ...base, type: 'hex', hexOrientation: 'flat' },
];

/** Compared by key, because Math.round can give -0, which deepEqual tells apart from 0. */
function keys(cells: Cell[]): string[]
{
    return cells.map(cellKey);
}

/** A wall along cell edges, given in cells rather than pixels. */
function wall(x1: number, y1: number, x2: number, y2: number): Wall
{
    const at = (value: number, offset: number) => value * base.size + offset;

    return {
        id: `${x1},${y1},${x2},${y2}`,
        x1: at(x1, base.offsetX),
        y1: at(y1, base.offsetY),
        x2: at(x2, base.offsetX),
        y2: at(y2, base.offsetY),
        blocksSight: true,
        blocksMove: true,
    };
}

for (const grid of grids)
{
    const label = `${grid.type} ${grid.hexOrientation}`;

    // Every cell's centre lies in that cell, and every neighbour is one step away.
    for (let q = -4; q <= 4; q++)
    {
        for (let r = -4; r <= 4; r++)
        {
            const cell = { q, r };

            assert.equal(cellKey(cellAt(grid, cellCenter(grid, cell))), cellKey(cell), label);

            for (const neighbour of neighbours(grid, cell))
                assert.equal(cellDistance(grid, cell, neighbour), 1, label);

        }
    }

    // A line is as long as the distance, and every step is to a neighbour.
    for (const [a, b] of [
        [{ q: 0, r: 0 }, { q: 7, r: 3 }],
        [{ q: -2, r: 5 }, { q: 4, r: -6 }],
        [{ q: 1, r: 1 }, { q: 1, r: 1 }],
    ])
    {
        const line = cellLine(grid, a, b);

        assert.equal(line.length, cellDistance(grid, a, b) + 1, label);
        assert.equal(cellKey(line[0]), cellKey(a), label);
        assert.equal(cellKey(line[line.length - 1]), cellKey(b), label);

        for (let index = 1; index < line.length; index++)
            assert.equal(cellDistance(grid, line[index - 1], line[index]), 1, label);

    }
}

// Feet on a square grid: diagonals cost 5, 10, 5, 10 over the whole path.
const straight = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 2, r: 0 },
    { q: 3, r: 0 },
];
const diagonal = (steps: number) => Array.from({ length: steps + 1 }, (_, i) => ({ q: i, r: i }));

assert.equal(pathFeet(base, straight), 15);
assert.equal(pathFeet(base, diagonal(1)), 5);
assert.equal(pathFeet(base, diagonal(2)), 15);
assert.equal(pathFeet(base, diagonal(3)), 20);
assert.equal(pathFeet(base, diagonal(4)), 30);
// With equal diagonals, every diagonal is one cell.
assert.equal(pathFeet({ ...base, diagonals: 'equal' }, diagonal(4)), 20);
// Diagonal, straight, diagonal: the straight step does not reset the count.
assert.equal(
    pathFeet(base, [
        { q: 0, r: 0 },
        { q: 1, r: 1 },
        { q: 2, r: 1 },
        { q: 3, r: 2 },
    ]),
    20,
);
assert.equal(pathFeet(base, [{ q: 0, r: 0 }]), 0);
assert.equal(pathFeet(grids[1], straight), 15);

// Retracing cuts the path back, and a skipped stretch is filled in.
const filled = extendPath(base, [], [{ q: 0, r: 0 }], { q: 4, r: 0 });

assert.deepEqual(keys(filled), ['0,0', '1,0', '2,0', '3,0', '4,0']);
assert.deepEqual(keys(extendPath(base, [], filled, { q: 2, r: 0 })), ['0,0', '1,0', '2,0']);

// A wall between columns 2 and 3 stops the path before it.
const fence = [wall(3, -5, 3, 5)];

assert.deepEqual(keys(extendPath(base, fence, [{ q: 0, r: 0 }], { q: 5, r: 0 })), [
    '0,0',
    '1,0',
    '2,0',
]);

// A diagonal step past the end of a wall is blocked, so a doorway's corner cannot be cut.
assert.deepEqual(keys(extendPath(base, [wall(1, -3, 1, 1)], [{ q: 0, r: 0 }], { q: 1, r: 1 })), [
    '0,0',
]);

// The server's check of a walk: a path across the fence is refused, one up to it is not, and an
// open door lets it through.
const across = [cellCenter(base, { q: 0, r: 0 }), cellCenter(base, { q: 2, r: 0 }), cellCenter(base, { q: 4, r: 0 })];

assert.equal(pathBlocked(fence, across), true);
assert.equal(pathBlocked(fence, across.slice(0, 2)), false);
assert.equal(pathBlocked([toggleDoor({ ...fence[0], door: { open: false } })], across), false);

// Spawning: the spawn cell first, skipping taken cells, never through walls or off the map.
const map = { width: 2000, height: 2000 };
const spawn = cellCenter(base, { q: 5, r: 5 });
const spread = spawnCells(base, [], map, spawn, 4, new Set(['5,5']));

assert.equal(spread.length, 4);
assert.equal(new Set(keys(spread)).size, 4);
assert.ok(spread.every((cell) => cellKey(cell) !== '5,5' && cellDistance(base, cell, { q: 5, r: 5 }) === 1));

// A one-cell room fits one token, however many are asked for.
const box = [wall(5, 5, 6, 5), wall(6, 5, 6, 6), wall(6, 6, 5, 6), wall(5, 6, 5, 5)];

assert.deepEqual(keys(spawnCells(base, box, map, spawn, 3, new Set())), ['5,5']);

// Zooming keeps the point under the cursor where it is.
const camera = { x: 40, y: -20, zoom: 0.5 };
const cursor = { x: 300, y: 200 };
const under = toWorld(camera, cursor);
const zoomed = zoomAt(camera, cursor, 1.7, 0.1, 10);
const after = toScreen(zoomed, under);

assert.ok(Math.abs(after.x - cursor.x) < 1e-9 && Math.abs(after.y - cursor.y) < 1e-9);
assert.equal(zoomAt(camera, cursor, 1000, 0.1, 10).zoom, 10);

// Sight: a wall down the middle of a 1000 by 1000 map hides the other half.
const open: Scenario = {
    id: 'check',
    name: 'Check',
    width: 1000,
    height: 1000,
    background: null,
    grid: { ...base, offsetX: 0, offsetY: 0 },
    props: [],
    walls: [],
    spawn: { x: 0, y: 0 },
};
const eye = { x: 250, y: 500 };
const sideWall = (y1: number, y2: number): Wall => ({
    id: `${y1}`,
    x1: 500,
    y1,
    x2: 500,
    y2,
    blocksSight: true,
    blocksMove: true,
});
const walled = { ...open, walls: [sideWall(0, 1000)] };
const sight = visibilityPolygon(eye, sightSegments(walled));

assert.ok(insidePolygon({ x: 400, y: 100 }, sight));
assert.ok(!insidePolygon({ x: 750, y: 500 }, sight));

// With a gap from 400 to 600, the far side shows straight through it but not off to the side.
const gapped = { ...open, walls: [sideWall(0, 400), sideWall(600, 1000)] };
const throughGap = visibilityPolygon(eye, sightSegments(gapped));

assert.ok(insidePolygon({ x: 750, y: 500 }, throughGap));
assert.ok(!insidePolygon({ x: 750, y: 100 }, throughGap));

// A window does not block sight.
const glass = { ...open, walls: [{ ...sideWall(0, 1000), blocksSight: false }] };

assert.ok(insidePolygon({ x: 750, y: 500 }, visibilityPolygon(eye, sightSegments(glass))));

// The server's line test agrees with the polygons the screens draw.
for (const [scenario, polygon] of [
    [walled, sight],
    [gapped, throughGap],
] as const)
{
    for (const point of [
        { x: 400, y: 100 },
        { x: 750, y: 500 },
        { x: 750, y: 100 },
    ])
        assert.equal(inSight(scenario.walls, eye, point), insidePolygon(point, polygon));

}

assert.ok(inSight(glass.walls, eye, { x: 750, y: 500 }));

// Seen samples are remembered, unseen ones are not, and marking twice changes nothing.
const explored = createExplored(walled);

assert.equal(markSeen(explored, sight), true);
assert.equal(explored.seen[10 * explored.columns + 2], 1);
assert.equal(explored.seen[10 * explored.columns + 15], 0);
assert.equal(markSeen(explored, sight), false);
// Players only walk where it was seen, see extendRoute in map/view.ts.
assert.deepEqual([{ x: 125, y: 525 }, { x: 775, y: 525 }, { x: -10, y: 525 }].map((point) => wasSeen(explored, point)), [true, false, false]);

// Reveal area marks the samples whose centres the box reaches, and nothing outside it.
const revealed = createExplored(walled);
const press = (x: number, y: number): ToolPointer => ({ world: { x, y }, free: false, zoom: 1, scenario: walled, seen: () => true, system: '5e' });
const uncover = (polygon: Point[]) => void markSeen(revealed, polygon);
const revealTool = createTool('reveal', () => {}, null, uncover);

assert.ok(revealTool);
revealTool.down(press(600, 100));
revealTool.move(press(700, 150), true);
revealTool.up?.(press(700, 150));
assert.deepEqual(
    [...revealed.seen.keys()].filter((index) => revealed.seen[index] === 1),
    [2 * revealed.columns + 12, 2 * revealed.columns + 13],
);

// A circle reveals whole cells round where it lands, 2.5 rounding to 3, and the wall stops it.
const circleTool = createTool('reveal-circle', () => {}, null, uncover);

assert.ok(circleTool);
revealed.seen.fill(0);
circleTool.down(press(400, 500));
circleTool.move(press(650, 500), true);
circleTool.up?.(press(650, 500));
assert.deepEqual([425, 575, 125, 75].map((x) => wasSeen(revealed, { x, y: 525 })), [true, false, true, false]);

// Hiding a box forgets what it covers, and nothing else.
const hideTool = createTool('hide', () => {}, null, (polygon, hide) => void markSeen(revealed, polygon, hide ? 0 : 1));

assert.ok(hideTool);
hideTool.down(press(400, 500));
hideTool.move(press(450, 550), true);
hideTool.up?.(press(450, 550));
assert.deepEqual([425, 125].map((x) => wasSeen(revealed, { x, y: 525 })), [false, true]);

// A Universal VTT file: cells become pixels from the map's origin, every stretch of a line of
// sight is a wall, and a closed door blocks while an open one does not.
const uvtt = scenarioFromUvtt(
    JSON.stringify({
        format: 0.3,
        resolution: { map_origin: { x: 1, y: 2 }, map_size: { x: 10, y: 8 }, pixels_per_grid: 70 },
        line_of_sight: [[{ x: 1, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 6 }]],
        objects_line_of_sight: [],
        portals: [
            { bounds: [{ x: 6, y: 2 }, { x: 7, y: 2 }], closed: true },
            { bounds: [{ x: 8, y: 2 }, { x: 9, y: 2 }], closed: false },
        ],
        image: 'iVBORw0KGgo=',
    }),
    'uvtt',
    'Crypt',
);

assert.equal(uvtt.width, 700);
assert.equal(uvtt.height, 560);
assert.equal(uvtt.grid.size, 70);
assert.ok(uvtt.background?.startsWith('data:image/png;base64,'));
// The line's four points, one doubled, make two walls, and each door one more.
assert.equal(uvtt.walls.length, 4);
assert.deepEqual(
    [uvtt.walls[0].x1, uvtt.walls[0].y1, uvtt.walls[0].x2, uvtt.walls[0].y2],
    [0, 0, 210, 0],
);
assert.equal(uvtt.walls[2].blocksSight, true);
assert.equal(uvtt.walls[3].blocksMove, false);
assert.deepEqual(uvtt.walls[3].door, { open: true });
assert.throws(() => scenarioFromUvtt('not json', 'x', 'x'), /not JSON/);
assert.throws(() => scenarioFromUvtt('{"image": 5}', 'x', 'x'), /not a Universal VTT map/);

// Walls snap to the nearest grid corner: on a square grid, and a hex radius away on a hex grid.
assert.deepEqual(nearestCorner(base, { x: 13 + 290, y: -7 + 112 }), { x: 313, y: 93 });

// Finer snapping: a quarter cell on a square grid, the middle of a side on a hex grid.
assert.deepEqual(snapPoint(base, { x: 13 + 262, y: -7 + 137 }, 4), { x: 263, y: 118 });

for (const grid of grids.slice(1))
{
    const [a, b] = cellCorners(grid, { q: 2, r: 3 });
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const snapped = snapPoint(grid, { x: middle.x + 0.5, y: middle.y - 0.5 }, 2);

    assert.ok(distance(snapped, middle) < 1e-6);
}

for (const grid of grids.slice(1))
{
    const center = cellCenter(grid, { q: 2, r: 1 });
    const corner = nearestCorner(grid, center);

    assert.ok(Math.abs(Math.hypot(corner.x - center.x, corner.y - center.y) - 100 / Math.sqrt(3)) < 1e-9);
}

// An offset past a whole repeat of the grid wraps back under it, and every cell stays where it was.
for (const grid of grids)
{
    const far = { ...grid, offsetX: 1013, offsetY: -707 };
    const wrapped = wrapOffset(far);
    const spot = { x: 333, y: 444 };

    assert.ok(wrapped.offsetX >= 0 && wrapped.offsetX < 200 && wrapped.offsetY >= 0 && wrapped.offsetY < 200);
    assert.ok(distance(cellCenter(far, cellAt(far, spot)), cellCenter(wrapped, cellAt(wrapped, spot))) < 1e-6);
}

// The tools, clicked the way a person would, on an empty map with the grid at the origin.
let edited: Scenario = { ...open, grid: { ...base, offsetX: 0, offsetY: 0 } };
const click = (x: number, y: number, free = false): ToolPointer => ({
    world: { x, y },
    free,
    zoom: 1,
    scenario: edited,
    seen: () => true,
    system: '5e',
});
const keep = (next: Scenario) =>
{
    edited = next;
};

// Three clicks make two walls on grid corners; clicking the last point again ends the chain.
const wallTool = createTool('walls', keep);

assert.ok(wallTool);
wallTool.down(click(102, 98));
wallTool.down(click(298, 104));
wallTool.down(click(305, 396));
wallTool.down(click(305, 396));
wallTool.down(click(500, 500));
assert.deepEqual(
    edited.walls.map((made) => [made.x1, made.y1, made.x2, made.y2]),
    [
        [100, 100, 300, 100],
        [300, 100, 300, 400],
    ],
);

// Placing freely, a click near a wall's end lands on it, and one near a wall lands on its line.
const beforeFree = edited;

wallTool.cancel?.();
wallTool.down(click(297, 103, true));
wallTool.down(click(296, 250, true));
assert.deepEqual(edited.walls.map((made) => [made.x1, made.y1, made.x2, made.y2]).at(-1), [300, 100, 300, 250]);
wallTool.cancel?.();
edited = beforeFree;

// Doors: a click on a wall makes it a closed door, the next one opens it, the one after makes it a
// plain wall again.
const doorTool = createTool('doors', keep);

assert.ok(doorTool);
assert.equal(doorTool.down(click(200, 103)), true);
assert.deepEqual(edited.walls[0].door, { open: false });
doorTool.down(click(200, 103));
assert.deepEqual([edited.walls[0].door, edited.walls[0].blocksMove], [{ open: true }, false]);
assert.equal(toggleDoor(edited.walls[0]).blocksSight, true);
doorTool.down(click(200, 103));
assert.deepEqual([edited.walls[0].door, edited.walls[0].blocksSight, edited.walls[0].blocksMove], [undefined, true, true]);
// A press away from every wall is left alone, so it pans.
assert.equal(doorTool.down(click(700, 700)), false);

// Play mode only opens and closes doors, never plain walls.
const playTool = createTool('open-doors', keep);

assert.ok(playTool);
assert.equal(playTool.down(click(302, 250)), false);
// A door in the fog does not react until the players see it.
edited = { ...edited, walls: [{ ...edited.walls[0], door: { open: false } }, ...edited.walls.slice(1)] };
assert.equal(playTool.down({ ...click(200, 103), seen: () => false }), false);
assert.equal(playTool.down(click(200, 103)), true);
assert.equal(edited.walls[0].door?.open, true);

// Erasing takes the wall under the click.
const eraseTool = createTool('erase', keep);

assert.ok(eraseTool);
eraseTool.down(click(302, 250));
assert.equal(edited.walls.length, 1);
// Away from every wall, it takes the prop under the click, turned or not.
edited = { ...edited, props: [{ id: 'crate', src: '', x: 600, y: 600, width: 100, height: 40, rotation: Math.PI / 2 }] };
eraseTool.down(click(610, 560));
assert.deepEqual([edited.props.length, edited.walls.length], [0, 1]);

// A round wall: dragged from a cell's middle, its edge snaps to half cells, and the eraser takes
// the whole ring. The Doors tool leaves it alone.
const ringTool = createTool('rings', keep);
const plain = edited.walls.length;

assert.ok(ringTool);
ringTool.down(click(845, 160));
ringTool.move(click(895, 155), true);
ringTool.up?.(click(895, 155));
assert.equal(edited.walls.length, plain + 12);
assert.ok(edited.walls.slice(plain).every((made) => Math.abs(distance({ x: made.x1, y: made.y1 }, { x: 850, y: 150 }) - 50) < 1e-9));
assert.equal(createTool('doors', keep)?.down(click(900, 150)), false);
eraseTool.down(click(900, 150));
assert.equal(edited.walls.length, plain);

// The spawn point lands in the middle of a cell, or exactly where clicked with Alt.
const spawnTool = createTool('spawn', keep);

assert.ok(spawnTool);
spawnTool.down(click(420, 260));
assert.deepEqual(edited.spawn, { x: 450, y: 250 });
spawnTool.down(click(420, 260, true));
assert.deepEqual(edited.spawn, { x: 420, y: 260 });

// The grid panel and the select tool leave the map to panning.
assert.equal(createTool('align', keep), null);
assert.equal(createTool('select', keep), null);

// Props land one cell per 200 pixels of their longest side.
const picture = { id: 'barrel', name: 'Barrel', src: 'barrel.png', width: 400, height: 200, bytes: 0 };

assert.deepEqual(placedSize(picture, base), { width: 200, height: 100 });

// A prop turned a quarter is hit along its new long side, not its old one.
const turned = { id: 'p', src: '', x: 500, y: 500, width: 200, height: 100, rotation: Math.PI / 2 };

assert.equal(propAt([turned], { x: 500, y: 580 }), turned);
assert.equal(propAt([turned], { x: 580, y: 500 }), undefined);

// A two-cell side lines up with grid lines, a one-cell side sits in a cell's middle.
const flatGrid = { ...base, offsetX: 0, offsetY: 0 };

assert.deepEqual(snapCenter(flatGrid, { ...turned, rotation: 0 }, { x: 432, y: 371 }), {
    x: 400,
    y: 350,
});
assert.deepEqual(snapSize(flatGrid, 130, 65), { width: 150, height: 75 });

// Placing, then dragging: the drag shows as it goes and lands as a single step to undo.
let steps = 0;
const record = (next: Scenario, final = true) =>
{
    edited = next;

    if (final)
        steps++;

};

// A 100 pixel grid at the origin, with no props.
edited = { ...edited, grid: flatGrid, props: [] };

const place = createTool('props', record, { ...picture, width: 200, height: 200 });

assert.ok(place);
place.down(click(240, 260));
assert.deepEqual(
    edited.props.map((prop) => [prop.x, prop.y, prop.width, prop.height]),
    [[250, 250, 100, 100]],
);

const edit = createTool('props', record);

assert.ok(edit);
steps = 0;
assert.equal(edit.down(click(250, 250)), true);
edit.move(click(300, 255), true);
edit.move(click(330, 260), true);
edit.up?.(click(330, 260));
assert.equal(steps, 1);
assert.deepEqual([edited.props[0].x, edited.props[0].y], [350, 250]);

// A click away from every prop lets the map pan; Delete removes the selected one.
assert.equal(edit.down(click(800, 800)), false);
edit.down(click(350, 250));
edit.up?.(click(350, 250));
assert.equal(edit.key?.('Delete', edited), true);
assert.equal(edited.props.length, 0);

// Creature sizes: a Large square creature covers 2 by 2 and is centred on a grid corner.
assert.deepEqual(keys(footprint(base, { q: 2, r: 3 }, 'large')), ['2,3', '3,3', '2,4', '3,4']);
assert.deepEqual(footprintCenter(base, { q: 2, r: 3 }, 'large'), { x: 313, y: 393 });

const sizes = ['medium', 'large', 'huge', 'gargantuan'] as const;

for (const grid of grids)
{
    for (const size of sizes)
    {
        const anchor = { q: 3, r: -2 };
        const cells = footprint(grid, anchor, size);
        const label = `${grid.type} ${grid.hexOrientation} ${size}`;

        // Each cell once, as many as the rules say, and the middle leads back to the anchor.
        const expected = grid.type === 'hex' ? [1, 3, 7, 19] : [1, 4, 9, 16];

        assert.equal(new Set(keys(cells)).size, expected[sizes.indexOf(size)], label);
        assert.equal(
            cellKey(anchorAt(grid, footprintCenter(grid, anchor, size), size)),
            cellKey(anchor),
            label,
        );
    }
}

// Let go on or past an edge, every size lands with the middle of each cell it covers on the map.
for (const grid of grids)
{
    const map = { grid, width: 1000, height: 800 };

    for (const size of sizes)
    {
        for (const point of [{ x: 1000, y: 800 }, { x: -300, y: 400 }, { x: 500, y: 2000 }, { x: 0, y: 0 }])
        {
            const anchor = anchorAt(grid, landingAt(map, point, size), size);
            const label = `${grid.type} ${grid.hexOrientation} ${size} ${point.x},${point.y}`;

            for (const cell of footprint(grid, anchor, size))
            {
                const { x, y } = cellCenter(grid, cell);

                assert.ok(x >= 0 && y >= 0 && x <= map.width && y <= map.height, label);
            }
        }
    }
}

// Let go on someone, every size lands beside them.
for (const grid of grids)
{
    const map = { grid, width: 1000, height: 800 };
    const other = { ...landingAt(map, { x: 500, y: 400 }, 'medium'), size: 'medium' as const };

    for (const size of sizes)
    {
        const anchor = anchorAt(grid, landingAt(map, other, size, [other]), size);
        const theirs = footprintKeys(grid, anchorAt(grid, other, 'medium'), 'medium');

        assert.ok(footprint(grid, anchor, size).every((cell) => !theirs.has(cellKey(cell))), `${grid.type} ${grid.hexOrientation} ${size}`);
    }
}

// The three hexes of a Large creature all touch each other.
const triangle = footprint(grids[1], { q: 0, r: 0 }, 'large');

assert.ok(triangle.every((a) => triangle.every((b) => a === b || cellDistance(grids[1], a, b) === 1)));

// A one cell gap in a wall lets a Medium creature through but stops a Large one at the wall.
const gap = [wall(3, -5, 3, 0), wall(3, 1, 3, 5)];

assert.equal(extendPath(base, gap, [{ q: 0, r: 0 }], { q: 5, r: 0 }).length, 6);
assert.deepEqual(keys(extendPath(base, gap, [{ q: 0, r: 0 }], { q: 5, r: 0 }, 'large')), [
    '0,0',
    '1,0',
]);

// A walk eases from its first point to its last, a little over a third of a second a cell.
const walk = startWalk(
    [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 0 },
    ],
    1000,
    100,
);

assert.equal(walk.duration, 760);
assert.deepEqual(walkAt(walk, 1000).point, { x: 0, y: 0 });
assert.ok(Math.abs(walkAt(walk, 1380).point.x - 100) < 1e-9);
assert.deepEqual([walkAt(walk, 1760).point, walkAt(walk, 1760).done], [{ x: 200, y: 0 }, true]);

// It sets off slower than it walks, and a corner is cut, never more than a quarter step.
assert.ok(walkAt(walk, 1050).point.x < 50 / 2);

// It lifts once and stays up while it walks, rather than bobbing on every cell, and lands at rest.
assert.deepEqual([walkAt(walk, 1000).lift, walkAt(walk, 1380).lift, walkAt(walk, 1760).lift], [0, 1, 0]);

const corner = startWalk(
    [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
    ],
    0,
    100,
);

assert.deepEqual([corner.points[0], corner.points[corner.points.length - 1]], [{ x: 0, y: 0 }, { x: 100, y: 100 }]);
assert.ok(!corner.points.some((point) => point.x === 100 && point.y === 0));
assert.ok(corner.points.every((point) => point.x >= 0 && point.y <= 100 && point.x - point.y <= 100));

// The eraser's box takes a wall inside it, one crossing it, and not one beside it.
const eraserBox = { left: 100, top: 100, right: 300, bottom: 300 };

assert.ok(wallInBox(wall(1.5, 1.5, 2, 2), eraserBox));
assert.ok(wallInBox(wall(0, 2, 4, 2), eraserBox));
assert.ok(!wallInBox(wall(4, 0, 4, 4), eraserBox));

// The ruler counts like a path: two diagonals are 5 and 10 ft.
assert.equal(measure({ ...open, grid: flatGrid }, { x: 50, y: 50 }, { x: 250, y: 250 }).feet, 15);

// Shared fog packs eight samples to a byte and reads back the same, the ragged last byte too.
const mask = Uint8Array.from([1, 0, 0, 1, 0, 0, 0, 0, 1, 1]);
const packed = new Uint8Array(packSeen(mask));

assert.equal(packed.length, 2);
assert.deepEqual([...mask].map((_, index) => (packedFlag(packed, index) ? 1 : 0)), [...mask]);

// How hurt looks: bloodied at half, critical at a quarter, down at 0, and the numbers stay home.
assert.deepEqual([40, 39, 20, 11, 10, 0].map((hp) => healthState(hp, 40)), ['unhurt', 'hurt', 'bloodied', 'bloodied', 'critical', 'down']);

const hidden = withoutNumbers<Token>({ id: 'a', kind: 'player', name: 'A', color: '#000000', size: 'medium', speed: 30, x: 0, y: 0, hp: 5, maxHp: 40, tempHp: 3, ac: 15, perception: 12 });

assert.equal(hidden.state, 'critical');
assert.deepEqual([hidden.hp, hidden.maxHp, hidden.tempHp, hidden.ac, hidden.perception], [undefined, undefined, undefined, undefined, undefined]);
assert.deepEqual(cleanStats({ hp: 50, maxHp: 30.4, tempHp: -2, ac: Number.NaN, perception: 99 }), { hp: 30, maxHp: 30, tempHp: 0, ac: 0, perception: 50 });

// Damage takes temp HP first and stops at 0; healing stops at max and never adds temp HP.
assert.deepEqual(applyHit({ hp: 20, maxHp: 30, tempHp: 5 }, 'attack', 8), { hp: 17, tempHp: 0 });
assert.deepEqual(applyHit({ hp: 20, maxHp: 30, tempHp: 5 }, 'attack', 3), { hp: 20, tempHp: 2 });
assert.deepEqual(applyHit({ hp: 4, maxHp: 30 }, 'attack', 50), { hp: 0, tempHp: 0 });
assert.deepEqual(applyHit({ hp: 25, maxHp: 30, tempHp: 2 }, 'heal', 10), { hp: 30, tempHp: 2 });

// A player brought to 0 goes down once, not again while there; a monster dies instead.
assert.equal(hitOn({ kind: 'player', hp: 5, maxHp: 30 }, 'attack', 9).downed, true);
assert.equal(hitOn({ kind: 'player', hp: 0, maxHp: 30 }, 'attack', 9).downed, false);
assert.deepEqual(hitOn({ kind: 'npc', hp: 5, maxHp: 30 }, 'attack', 9), { after: { hp: 0, tempHp: 0 }, died: true, downed: false });

// Conditions keep to the system's list and order, once each, values whole and in range.
assert.deepEqual(
    cleanConditions('5e', [{ id: 'prone' }, { id: 'clumsy', value: 2 }, { id: 'exhaustion', value: 9.6 }, { id: 'prone' }, { id: 'blinded', value: 3 }]),
    [{ id: 'blinded' }, { id: 'exhaustion', value: 6 }, { id: 'prone' }],
);
assert.deepEqual(cleanConditions('pf2e', [{ id: 'frightened' }, { id: 'dying', value: 0 }]), [{ id: 'dying', value: 1 }, { id: 'frightened', value: 1 }]);

// Initiative: higher rolls first; a tie goes to players in 5e and to monsters in Pathfinder 2e.
const kinds: Record<string, Token['kind']> = { ann: 'player', bo: 'player', orc: 'npc', imp: 'npc' };
const kindOf = (id: string) => kinds[id];
const roll = (system: 'pf2e' | '5e') =>
    [
        { id: 'orc', roll: 12 },
        { id: 'ann', roll: 12 },
        { id: 'bo', roll: 18 },
        { id: 'imp', roll: 3 },
    ].reduce((fight, { id, roll: value }) => withRoll(fight, { id, kind: kinds[id] }, value, kindOf, system), newFight);
const order = (fight: typeof newFight) => fight.order.map((entry) => entry.tokenId);

assert.deepEqual(order(roll('5e')), ['bo', 'ann', 'orc', 'imp']);
assert.deepEqual(order(roll('pf2e')), ['bo', 'orc', 'ann', 'imp']);
assert.deepEqual(order(swapped(roll('5e'), 'orc', true)), ['bo', 'orc', 'ann', 'imp']);
assert.equal(cleanRoll(150.4), 99);
assert.equal(cleanRoll(Number.NaN), null);

// Turns skip whoever is gone and start a new round after the last; a new roll is slotted in.
const everyone = () => true;
const fight = begun(roll('5e'), everyone);

assert.equal(fight.turn, 'bo');
assert.equal(upNext(fight, everyone), 'ann');

const orcGone = nextTurn(nextTurn(fight, everyone), (id) => id !== 'orc');
const wrapped = nextTurn({ ...fight, turn: 'imp' }, everyone);

assert.deepEqual([order(orcGone), orcGone.turn], [['bo', 'ann', 'imp'], 'imp']);
assert.deepEqual([wrapped.round, wrapped.turn], [2, 'bo']);
assert.equal(withoutRoll(fight, 'bo', everyone).turn, 'ann');
assert.deepEqual(order(withRoll(fight, { id: 'cy', kind: 'player' }, 15, kindOf, '5e')), ['bo', 'cy', 'ann', 'orc', 'imp']);

// A stat block gives a token its numbers in either system, and shows as the blocks it is written in.
assert.deepEqual(statsOf(statBlockTemplates['5e']), { name: 'Monster name', size: 'medium', ac: 12, maxHp: 11, speed: 30, perception: 12 });
assert.deepEqual(statsOf(statBlockTemplates.pf2e), { name: 'Creature name', size: 'medium', ac: 16, maxHp: 20, speed: 25, perception: 16 });
assert.deepEqual(statsOf('> ## Ogre\n> *Large giant*\n> **AC:** 11'), { name: '', size: 'large', ac: 11, maxHp: undefined, speed: undefined, perception: undefined });
assert.deepEqual(
    blocksOf('# Imp\n**AC** 13\n**HP** 10\n\n| A | B |\n|---|---|\n| 1 | 2 |\n- one\n---'),
    [
        { kind: 'heading', level: 1, text: 'Imp' },
        { kind: 'lines', lines: ['**AC** 13', '**HP** 10'] },
        { kind: 'table', head: ['A', 'B'], rows: [['1', '2']] },
        { kind: 'list', items: ['one'] },
        { kind: 'rule' },
    ],
);
assert.deepEqual(spansOf('***Bite.*** *Hit:* 5 x * 2'), [
    { text: 'Bite.', bold: true, italic: true },
    { text: ' ' },
    { text: 'Hit:', italic: true },
    { text: ' 5 x * 2' },
]);

// A monster that goes down at 0 lies there like a player rather than dying.
assert.deepEqual(hitOn({ kind: 'npc', hp: 5, maxHp: 30, downs: true }, 'attack', 9), { after: { hp: 0, tempHp: 0 }, died: false, downed: true });

// The example session's ogre preset gives the numbers its token starts with.
assert.deepEqual(statsOf(demoOgreStatBlock), { name: 'Ogre', size: 'large', ac: 11, maxHp: 59, speed: 40, perception: 8 });

// A companion shares its player's space: the smaller rides, the player at the same size, and
// only while it stands on the other.
{
    const square: Grid = { ...base, size: 50, offsetX: 0, offsetY: 0 };
    const hero = { id: 'hero', x: 75, y: 75, size: 'medium' as const };
    const owl = { id: 'owl', x: 75, y: 75, size: 'tiny' as const, summonOf: 'hero' };
    const horse = { id: 'horse', x: 100, y: 100, size: 'large' as const, summonOf: 'hero' };
    const wolf = { id: 'wolf', x: 75, y: 75, size: 'medium' as const, summonOf: 'hero' };

    assert.equal(ridesOn(square, owl, hero), true);
    assert.equal(ridesOn(square, hero, owl), false);
    assert.equal(ridesOn(square, hero, horse), true);
    assert.equal(ridesOn(square, horse, hero), false);
    assert.equal(ridesOn(square, wolf, hero), false);
    assert.equal(ridesOn(square, hero, wolf), true);
    assert.equal(ridesOn(square, { ...owl, x: 125 }, hero), false);
    assert.equal(ridesOn(square, { ...owl, summonOf: undefined }, hero), false);
}

// A cone starts on the nearer grid corner and reaches in whole cells. In Pathfinder 2e it points
// straight or diagonally; in 5e any way.
{
    const shared: (Mark | null)[] = [];
    const cell = edited.grid.size;
    const cone = createTool('cone', () => {}, null, undefined, 1, (mark) => void shared.push(mark));
    const at = (x: number, y: number, system: GameSystem): ToolPointer => ({ world: { x, y }, free: false, zoom: 1, scenario: edited, seen: () => true, system });

    cone?.down(at(cell - 2, cell + 2, 'pf2e'));
    cone?.move(at(cell * 3.9, cell * 1.6, 'pf2e'), true);
    assert.deepEqual(shared.at(-1), { kind: 'cone', from: { x: cell, y: cell }, to: { x: cell * 4, y: cell } });

    cone?.move(at(cell * 3.9, cell * 1.6, '5e'), true);
    const free = shared.at(-1);

    assert.ok(free && free.to.y > cell && Math.abs(distance(free.from, free.to) - cell * 3) < 1e-9);
}
