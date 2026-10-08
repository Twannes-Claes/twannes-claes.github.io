import assert from 'node:assert/strict';

import type { Cell, Grid, Scenario, Wall } from '../types';

import { toScreen, toWorld, zoomAt } from './camera.ts';
import { createExplored, markArea, markSeen } from './fog.ts';
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
} from './grid.ts';
import { extendPath, pathBlocked, pathFeet } from './path.ts';
import { placedSize, propAt, snapCenter, snapSize } from './props.ts';
import { anchorAt, footprint, footprintCenter } from './size.ts';
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

// Reveal area marks the samples whose centres the box reaches, and nothing outside it.
const revealed = createExplored(walled);

markArea(revealed, { left: 600, top: 100, right: 700, bottom: 150 });
assert.deepEqual(
    [...revealed.seen.keys()].filter((index) => revealed.seen[index] === 1),
    [2 * revealed.columns + 12, 2 * revealed.columns + 13],
);

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

// The tools, clicked the way a person would, on an empty map with the grid at the origin.
let edited: Scenario = { ...open, grid: { ...base, offsetX: 0, offsetY: 0 } };
const click = (x: number, y: number, free = false): ToolPointer => ({
    world: { x, y },
    free,
    zoom: 1,
    scenario: edited,
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

// Erasing takes the wall under the click.
const eraseTool = createTool('erase', keep);

assert.ok(eraseTool);
eraseTool.down(click(302, 250));
assert.equal(edited.walls.length, 1);

// The spawn point lands in the middle of a cell, or exactly where clicked with Alt.
const spawnTool = createTool('spawn', keep);

assert.ok(spawnTool);
spawnTool.down(click(420, 260));
assert.deepEqual(edited.spawn, { x: 450, y: 250 });
spawnTool.down(click(420, 260, true));
assert.deepEqual(edited.spawn, { x: 420, y: 260 });

// A box over one drawn cell sets the grid's size and offset.
const alignTool = createTool('align', keep);

assert.ok(alignTool);
alignTool.down(click(130, 40));
alignTool.move(click(194, 106), true);
alignTool.up(click(194, 106));
assert.equal(edited.grid.size, 65);
assert.deepEqual([edited.grid.offsetX, edited.grid.offsetY], [0, 40]);
assert.equal(createTool('select', keep), null);

// Props land one cell per 200 pixels of their longest side.
const picture = { id: 'barrel', name: 'Barrel', src: 'barrel.png', width: 400, height: 200 };

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

// Back to a 100 pixel grid at the origin, after the alignment above changed it.
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
edit.up(click(330, 260));
assert.equal(steps, 1);
assert.deepEqual([edited.props[0].x, edited.props[0].y], [350, 250]);

// A click away from every prop lets the map pan; Delete removes the selected one.
assert.equal(edit.down(click(800, 800)), false);
edit.down(click(350, 250));
edit.up(click(350, 250));
assert.equal(edit.key('Delete', edited), true);
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

// A walk eases from its first point to its last, a little slower than a fifth of a second a cell.
const walk = startWalk(
    [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 0 },
    ],
    1000,
    100,
);

assert.equal(walk.duration, 440);
assert.deepEqual(walkAt(walk, 1000).point, { x: 0, y: 0 });
assert.ok(Math.abs(walkAt(walk, 1220).point.x - 100) < 1e-9);
assert.deepEqual([walkAt(walk, 1440).point, walkAt(walk, 1440).done], [{ x: 200, y: 0 }, true]);

// It sets off slower than it walks, and a corner is cut, never more than a quarter step.
assert.ok(walkAt(walk, 1050).point.x < 50 / 2);

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
