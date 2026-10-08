import type { Point, Prop, PropPicture, Scenario, Wall } from '../types';

import { danger, door as doorColour, faded, ground, highlight, ink } from './colours.ts';
import { boxOf, closestOnSegment, distance, distanceToSegment, onMap, segmentsTouch, type Area } from './geometry.ts';
import { cellAt, cellCenter, cellLine, snapPoint } from './grid.ts';
import { lineFeet, pathFeet } from './path.ts';
import { fromLocal, placedSize, propAt, propCorners, propHandles, snapCenter, snapSize } from './props.ts';
import { drawPill, drawRoute } from './render.ts';

import { confirmAction } from '../services/confirm.ts';

/*
 * The editor's tools. Each one gets the pointer in world pixels and hands back a changed
 * scenario through `change`, so the page that owns the scenario decides what happens to it:
 * history, saving, showing it. Without a tool, or when a tool turns a press down, the map pans
 * and tokens drag as usual, see map/view.ts.
 */

export type ToolId =
    | 'select'
    | 'walls'
    | 'erase'
    | 'doors'
    | 'spawn'
    | 'align'
    | 'props'
    | 'open-doors'
    | 'measure'
    | 'reveal';

/**
 * Hands a changed scenario back. A drag passes final false while it moves, which only shows
 * the change, and final true once on release, which keeps it as one step to undo.
 */
export type Change = (next: Scenario, final?: boolean) => void;

/** One pointer event, as a tool sees it. */
export interface ToolPointer
{
    world: Point;
    /** Alt is held: place freely rather than on the grid. */
    free: boolean;
    /** Screen pixels per world pixel, so hit areas feel the same size at any zoom. */
    zoom: number;
    scenario: Scenario;
    /** Whether the players see a spot or have seen it, or the GM is peeking. True without fog. */
    seen: (point: Point) => boolean;
}

export interface MapTool
{
    /**
     * Read again after every move, so it can follow what is under the pointer. Empty leaves the
     * stylesheet's open hand, for where a press pans, see .ttrpg-map in styles/ttrpg.css.
     */
    readonly cursor: string;
    /** True when the tool takes this press; otherwise it pans or drags a token. */
    down: (pointer: ToolPointer) => boolean;
    /** While pressed, and while hovering with a mouse. */
    move: (pointer: ToolPointer, pressed: boolean) => void;
    up?: (pointer: ToolPointer) => void;
    /** True when the tool used the key. */
    key?: (key: string, scenario: Scenario) => boolean;
    /**
     * A right click: drops what is half done, like a chain of walls or a box being dragged, and
     * true when there was something. False, or no cancel at all, leaves the page to put the tool
     * away, see map/view.ts.
     */
    cancel?: () => boolean;
    /** Previews over the map, in world pixels. */
    draw: (ctx: CanvasRenderingContext2D, zoom: number, scenario: Scenario) => void;
}

/** How close a click has to be to a wall to hit it, in screen pixels. */
const reach = 10;

/** A box or a line being dragged, from where the press started to the pointer. */
interface Drag
{
    start: Point;
    end: Point;
}

/**
 * The end of a wall near the pointer, or, placing freely, the nearest spot on a wall, so a new
 * wall joins the old ones exactly, with no gap for light to slip through. Snapped to the grid, a
 * spot along a wall would pull the click off its grid point, so only the ends count there.
 */
function wallJoint({ world, zoom, scenario }: ToolPointer, exact: boolean): Point | null
{
    let joint: Point | null = null;
    let gap = reach / zoom;
    const consider = (spot: Point) =>
    {
        if (distance(world, spot) > gap)
            return;

        joint = spot;
        gap = distance(world, spot);
    };

    for (const wall of scenario.walls)
    {
        consider({ x: wall.x1, y: wall.y1 });
        consider({ x: wall.x2, y: wall.y2 });
    }

    if (exact && !joint)
    {
        for (const wall of scenario.walls)
            consider(closestOnSegment(world, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }));

    }

    return joint;
}

/**
 * Where a click lands: on a wall it joins, else the nearest snap point, steps per cell side, see
 * snapPoint in map/grid.ts. The exact spot with Alt, with snapping off (0) or without a grid.
 * Pulled inside the map, so no wall ends beyond its edge.
 */
function cornerPoint(pointer: ToolPointer, steps: number): Point
{
    const { world, free, scenario } = pointer;
    const exact = free || steps === 0 || scenario.grid.type === 'none';

    return onMap(scenario, wallJoint(pointer, exact) ?? (exact ? world : snapPoint(scenario.grid, world, steps)));
}

/** The middle of the cell under the pointer, or the exact spot with Alt or without a grid. */
function cellPoint({ world, free, scenario }: ToolPointer): Point
{
    const { grid } = scenario;

    return free || grid.type === 'none' ? world : cellCenter(grid, cellAt(grid, world));
}

function wallNear(pointer: ToolPointer, only: (wall: Wall) => boolean = () => true)
{
    let nearest: Wall | undefined;
    let best = reach / pointer.zoom;

    for (const wall of pointer.scenario.walls)
    {
        const gap = distanceToSegment(
            pointer.world,
            { x: wall.x1, y: wall.y1 },
            { x: wall.x2, y: wall.y2 },
        );

        if (only(wall) && gap <= best)
        {
            nearest = wall;
            best = gap;
        }
    }

    return nearest;
}

function replaceWall(scenario: Scenario, wall: Wall): Scenario
{
    return { ...scenario, walls: scenario.walls.map((other) => (other.id === wall.id ? wall : other)) };
}

/**
 * The editor's Doors tool steps a wall round: a plain wall becomes a closed door, a closed door
 * opens, and an open door goes back to a plain wall. Play mode only opens and closes, see
 * toggleDoor.
 */
export function nextDoor({ door, ...wall }: Wall): Wall
{
    if (!door)
        return { ...wall, door: { open: false }, blocksSight: true, blocksMove: true };

    if (!door.open)
        return toggleDoor({ ...wall, door });

    return { ...wall, blocksSight: true, blocksMove: true };
}

/** Opens a closed door or closes an open one, keeping what it blocks in step. */
export function toggleDoor(wall: Wall): Wall
{
    const open = !wall.door?.open;

    return { ...wall, door: { open }, blocksSight: !open, blocksMove: !open };
}

function strokeWall(ctx: CanvasRenderingContext2D, wall: Wall, colour: string, width: number)
{
    ctx.beginPath();
    ctx.moveTo(wall.x1, wall.y1);
    ctx.lineTo(wall.x2, wall.y2);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
}

/** A prop's outline, turned with it, with a faint fill so a big one reads as one thing. */
function strokeProp(ctx: CanvasRenderingContext2D, prop: Prop, colour: string, width: number)
{
    ctx.beginPath();
    propCorners(prop).forEach((corner, index) =>
        index === 0 ? ctx.moveTo(corner.x, corner.y) : ctx.lineTo(corner.x, corner.y),
    );
    ctx.closePath();
    ctx.fillStyle = faded(colour, 0.2);
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, at: Point, radius: number, colour: string)
{
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
}

/** The dashed outline of a dragged box, with a faint fill when it marks an area. */
function drawBox(ctx: CanvasRenderingContext2D, { start, end }: Drag, zoom: number, colour: string, fill = false)
{
    if (fill)
    {
        ctx.fillStyle = faded(colour, 0.14);
        ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
    }

    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.setLineDash([]);
}

/**
 * Click, click, click for a chain of walls on the snap points.
 * Clicking the last point again, a double click, or Esc ends the chain.
 */
function wallTool(change: Change, snap: number): MapTool
{
    let last: Point | null = null;
    let hover: Point | null = null;

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            const point = cornerPoint(pointer, snap);

            if (last && distance(last, point) * pointer.zoom < 4)
            {
                last = null;

                return true;
            }

            if (last)
            {
                const wall: Wall = {
                    id: crypto.randomUUID(),
                    x1: last.x,
                    y1: last.y,
                    x2: point.x,
                    y2: point.y,
                    blocksSight: true,
                    blocksMove: true,
                };

                change({ ...pointer.scenario, walls: [...pointer.scenario.walls, wall] });
            }

            last = point;

            return true;
        },
        move: (pointer) =>
        {
            hover = cornerPoint(pointer, snap);
        },
        key: (key) =>
        {
            if (key !== 'Escape' || !last)
                return false;

            last = null;

            return true;
        },
        cancel: () =>
        {
            if (!last)
                return false;

            last = null;

            return true;
        },
        draw: (ctx, zoom) =>
        {
            if (last && hover)
            {
                ctx.setLineDash([8 / zoom, 6 / zoom]);
                strokeWall(
                    ctx,
                    { id: '', x1: last.x, y1: last.y, x2: hover.x, y2: hover.y, blocksSight: true, blocksMove: true },
                    highlight,
                    3 / zoom,
                );
                ctx.setLineDash([]);
            }

            if (last)
                dot(ctx, last, 5 / zoom, highlight);

            if (hover)
                dot(ctx, hover, 4 / zoom, ink);

        },
    };
}

/**
 * Whether the players see a wall, or saw it. Tested just off either side of its middle, as sight
 * stops right at a closed door, so the door itself sits on the edge of what is seen.
 */
function wallSeen(pointer: ToolPointer, wall: Wall): boolean
{
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) || 1;
    const side = { x: ((wall.y1 - wall.y2) / length) * 4, y: ((wall.x2 - wall.x1) / length) * 4 };
    const middle = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };

    return [1, -1].some((sign) => pointer.seen({ x: middle.x + side.x * sign, y: middle.y + side.y * sign }));
}

/**
 * Tools that act on the wall under the pointer and show which one that is. A press away from
 * any wall pans as usual.
 */
function wallClickTool(
    only: (wall: Wall) => boolean,
    act: (scenario: Scenario, wall: Wall) => Scenario,
    label: (wall: Wall) => string,
    change: Change,
): MapTool
{
    let hover: Wall | undefined;
    /** Where the pointer is, so the label sits beside it rather than under the finger. */
    let at: Point | null = null;

    return {
        get cursor()
        {
            return hover ? 'pointer' : '';
        },
        down: (pointer) =>
        {
            const wall = wallNear(pointer, (other) => only(other) && wallSeen(pointer, other));

            if (!wall)
                return false;

            const next = act(pointer.scenario, wall);

            change(next);
            // Stays on the wall as it is now, so the label already says what the next click does.
            hover = next.walls.find((other) => other.id === wall.id);

            return true;
        },
        move: (pointer) =>
        {
            // A door in the fog stays out of reach, or a hover would give away where it is.
            hover = wallNear(pointer, (other) => only(other) && wallSeen(pointer, other));
            at = pointer.world;
        },
        draw: (ctx, zoom) =>
        {
            if (!hover || !at)
                return;

            // A soft glow under a crisp line, the hinge at each end, and what a click does.
            ctx.save();
            ctx.shadowColor = doorColour;
            ctx.shadowBlur = 16 / zoom;
            strokeWall(ctx, hover, faded(doorColour, 0.35), 14 / zoom);
            ctx.restore();
            strokeWall(ctx, hover, doorColour, 4 / zoom);
            dot(ctx, { x: hover.x1, y: hover.y1 }, 4.5 / zoom, ink);
            dot(ctx, { x: hover.x2, y: hover.y2 }, 4.5 / zoom, ink);
            drawPill(ctx, label(hover), at, zoom, faded(ground, 0.9));
        },
    };
}

/** What a click with the editor's Doors tool turns a wall into, see nextDoor. */
function nextDoorLabel({ door }: Wall): string
{
    if (!door)
        return 'Make it a door';

    return door.open ? 'Make it a wall' : 'Open the door';
}

function spawnTool(change: Change): MapTool
{
    let hover: Point | null = null;

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            change({ ...pointer.scenario, spawn: cellPoint(pointer) });

            return true;
        },
        move: (pointer) =>
        {
            hover = cellPoint(pointer);
        },
        draw: (ctx, zoom) =>
        {
            if (hover)
                dot(ctx, hover, 8 / zoom, faded(highlight, 0.6));

        },
    };
}

/**
 * What a straight line from a to b costs: through the cells it crosses, counted like a path,
 * or as a plain length without a grid.
 */
export function measure(scenario: Scenario, a: Point, b: Point): { points: Point[]; feet: number }
{
    const { grid } = scenario;

    if (grid.type === 'none')
        return { points: [a, b], feet: Math.round(lineFeet(grid, [a, b])) };

    const cells = cellLine(grid, cellAt(grid, a), cellAt(grid, b));

    return { points: cells.map((cell) => cellCenter(grid, cell)), feet: pathFeet(grid, cells) };
}

/** The ruler: drag from one spot to another to see how far it is. Only this screen sees it. */
function measureTool(): MapTool
{
    let drag: Drag | null = null;

    return {
        cursor: 'crosshair',
        down: ({ world }) =>
        {
            drag = { start: world, end: world };

            return true;
        },
        move: ({ world }, pressed) =>
        {
            if (pressed && drag)
                drag.end = world;

        },
        up: () =>
        {
            drag = null;
        },
        cancel: () =>
        {
            const had = drag !== null;

            drag = null;

            return had;
        },
        draw: (ctx, zoom, scenario) =>
        {
            if (!drag)
                return;

            const { points, feet } = measure(scenario, drag.start, drag.end);

            drawRoute(ctx, points, zoom, ink);
            drawPill(ctx, `${feet} ft`, drag.end, zoom, faded(ground, 0.9));
        },
    };
}

/** The game master's Reveal area: drag a box and everything in it counts as seen before. */
function revealTool(reveal: (area: Area) => void): MapTool
{
    let drag: Drag | null = null;

    return {
        cursor: 'crosshair',
        down: ({ world }) =>
        {
            drag = { start: world, end: world };

            return true;
        },
        move: ({ world }, pressed) =>
        {
            if (pressed && drag)
                drag.end = world;

        },
        up: () =>
        {
            if (drag)
                reveal(boxOf(drag.start, drag.end));

            drag = null;
        },
        cancel: () =>
        {
            const had = drag !== null;

            drag = null;

            return had;
        },
        draw: (ctx, zoom) =>
        {
            if (drag)
                drawBox(ctx, drag, zoom, highlight, true);

        },
    };
}

/** Whether a wall lies in a box or crosses into it. */
export function wallInBox(wall: Wall, { left, top, right, bottom }: Area): boolean
{
    const inside = (x: number, y: number) => x >= left && x <= right && y >= top && y <= bottom;
    const corners = [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ];
    const a = { x: wall.x1, y: wall.y1 };
    const b = { x: wall.x2, y: wall.y2 };

    return (
        inside(a.x, a.y) ||
        inside(b.x, b.y) ||
        corners.some((corner, index) => segmentsTouch(a, b, corner, corners[(index + 1) % corners.length]))
    );
}

/**
 * The eraser: click a wall to take it away, or drag a box from the floor and every wall it
 * touches goes when it is let go, once confirmed, as one step to undo. The walls about to go
 * show red.
 */
/** "the wall", "3 walls", for the erase dialog. Empty for none. */
function counted(count: number, noun: string): string
{
    if (count === 0)
        return '';

    return count === 1 ? `the ${noun}` : `${count} ${noun}s`;
}

function eraseTool(change: Change): MapTool
{
    let hover: { wall?: Wall; prop?: Prop } = {};
    let drag: Drag | null = null;

    // The wall near the pointer before the prop under it, as walls are thin and props are big.
    const under = (pointer: ToolPointer) =>
    {
        const wall = wallNear(pointer);

        return wall ? { wall } : { prop: propAt(pointer.scenario.props, pointer.world) };
    };

    /** The walls in the box, and the props with their middle in it. */
    const inBox = (scenario: Scenario) =>
    {
        if (!drag)
            return { walls: [], props: [] };

        const box = boxOf(drag.start, drag.end);
        const inside = ({ x, y }: Point) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

        return {
            walls: scenario.walls.filter((wall) => wallInBox(wall, box)),
            props: scenario.props.filter(inside),
        };
    };

    return {
        get cursor()
        {
            return hover.wall || hover.prop ? 'pointer' : 'crosshair';
        },
        down: (pointer) =>
        {
            const { scenario } = pointer;
            const { wall, prop } = under(pointer);

            hover = {};

            if (wall)
                change({ ...scenario, walls: scenario.walls.filter((other) => other.id !== wall.id) });
            else if (prop)
                change(withoutProp(scenario, prop.id));
            else
                drag = { start: pointer.world, end: pointer.world };

            return true;
        },
        move: (pointer, pressed) =>
        {
            if (pressed && drag)
                drag.end = pointer.world;

            hover = pressed ? {} : under(pointer);
        },
        up: (pointer) =>
        {
            const { scenario } = pointer;
            const { walls, props } = inBox(scenario);
            const doomed = new Set([...walls, ...props].map((thing) => thing.id));
            const what = [counted(walls.length, 'wall'), counted(props.length, 'prop')].filter(Boolean).join(' and ');

            drag = null;

            // The dialog is modal, so nothing else changes the scenario while it asks.
            if (doomed.size > 0)
            {
                void confirmAction(`Erase ${what} in the box?`, 'Erase').then((yes) =>
                {
                    if (yes)
                    {
                        change({
                            ...scenario,
                            walls: scenario.walls.filter((wall) => !doomed.has(wall.id)),
                            props: scenario.props.filter((prop) => !doomed.has(prop.id)),
                        });
                    }
                });
            }

        },
        cancel: () =>
        {
            const had = drag !== null;

            drag = null;

            return had;
        },
        draw: (ctx, zoom, scenario) =>
        {
            if (hover.wall)
                strokeWall(ctx, hover.wall, danger, 7 / zoom);

            if (hover.prop)
                strokeProp(ctx, hover.prop, danger, 3 / zoom);

            if (!drag)
                return;

            const { walls, props } = inBox(scenario);

            for (const wall of walls)
                strokeWall(ctx, wall, danger, 7 / zoom);

            for (const prop of props)
                strokeProp(ctx, prop, danger, 3 / zoom);

            drawBox(ctx, drag, zoom, danger, true);
        },
    };
}

/** How close a press has to be to a handle to grab it, in screen pixels. */
const handleReach = 12;

/** Takes a prop away, for the Delete key. */
function withoutProp(scenario: Scenario, id: string): Scenario
{
    return { ...scenario, props: scenario.props.filter((prop) => prop.id !== id) };
}

type PropDrag =
    | { kind: 'move'; id: string; offset: Point }
    | { kind: 'scale'; id: string; start: Prop; reach: number }
    | { kind: 'turn'; id: string };

/**
 * Places, moves, scales and turns props. With a picture picked in the library, every click
 * places one. Otherwise a click selects the prop under it: drag it to move, drag the corner
 * handle to scale, drag the handle above it to turn, Delete to remove. Everything snaps to the
 * grid unless Alt is held: moves to cells, sizes to half cells, turns to 15 degrees.
 */
function propTool(change: Change, placing: PropPicture | null): MapTool
{
    let selected: string | null = null;
    let drag: PropDrag | null = null;
    let moved = false;
    /** The scenario when the drag started, to put back if it is cancelled. */
    let before: Scenario | null = null;
    let hover: Point | null = null;
    /** The last pointer, for the cursor to say what a press there would do. */
    let at: ToolPointer | null = null;

    const replace = (scenario: Scenario, prop: Prop) =>
    {
        moved = true;
        change(
            { ...scenario, props: scenario.props.map((other) => (other.id === prop.id ? prop : other)) },
            false,
        );
    };

    return {
        get cursor()
        {
            if (placing)
                return 'copy';

            if (drag)
                return { move: 'move', scale: 'nwse-resize', turn: 'grabbing' }[drag.kind];

            if (!at)
                return '';

            const { scenario, world, zoom } = at;
            const current = scenario.props.find((prop) => prop.id === selected);
            const handles = current && propHandles(current, zoom);

            if (handles && distance(world, handles.turn) * zoom <= handleReach)
                return 'grab';

            if (handles && distance(world, handles.scale) * zoom <= handleReach)
                return 'nwse-resize';

            return propAt(scenario.props, world) ? 'move' : '';
        },
        down: (pointer) =>
        {
            const { scenario, world, zoom } = pointer;

            if (placing)
            {
                const prop: Prop = {
                    id: crypto.randomUUID(),
                    src: placing.src,
                    ...world,
                    ...placedSize(placing, scenario.grid),
                    rotation: 0,
                };
                const center = pointer.free ? world : snapCenter(scenario.grid, prop, world);

                change({ ...scenario, props: [...scenario.props, { ...prop, ...center }] });
                selected = prop.id;

                return true;
            }

            const current = scenario.props.find((prop) => prop.id === selected);

            if (current)
            {
                const handles = propHandles(current, zoom);

                if (distance(world, handles.turn) * zoom <= handleReach)
                {
                    drag = { kind: 'turn', id: current.id };
                    before = scenario;

                    return true;
                }

                if (distance(world, handles.scale) * zoom <= handleReach)
                {
                    drag = { kind: 'scale', id: current.id, start: current, reach: distance(current, world) };
                    before = scenario;

                    return true;
                }
            }

            const hit = propAt(scenario.props, world);

            selected = hit ? hit.id : null;

            if (!hit)
                return false;

            drag = { kind: 'move', id: hit.id, offset: { x: world.x - hit.x, y: world.y - hit.y } };
            before = scenario;

            return true;
        },
        move: (pointer, pressed) =>
        {
            const { scenario, world, free } = pointer;

            hover = world;
            at = pointer;

            if (!pressed || !drag)
                return;

            const { id } = drag;
            const prop = scenario.props.find((candidate) => candidate.id === id);

            if (!prop)
                return;

            if (drag.kind === 'move')
            {
                const center = { x: world.x - drag.offset.x, y: world.y - drag.offset.y };

                replace(scenario, { ...prop, ...(free ? center : snapCenter(scenario.grid, prop, center)) });
            }
            else if (drag.kind === 'scale' && drag.reach > 0)
            {
                const factor = distance(prop, world) / drag.reach;
                const width = Math.max(drag.start.width * factor, scenario.grid.size * 0.25);
                const height = (width / drag.start.width) * drag.start.height;
                const snap = !free && scenario.grid.type !== 'none';

                replace(scenario, { ...prop, ...(snap ? snapSize(scenario.grid, width, height) : { width, height }) });
            }
            else if (drag.kind === 'turn')
            {
                // The handle sits above the prop, so straight up is no turn at all.
                const angle = Math.atan2(world.y - prop.y, world.x - prop.x) + Math.PI / 2;
                const step = Math.PI / 12;

                replace(scenario, { ...prop, rotation: free ? angle : Math.round(angle / step) * step });
            }
        },
        up: (pointer) =>
        {
            // One step to undo for the whole drag, and none for a click that only selected.
            if (drag && moved)
                change(pointer.scenario, true);

            drag = null;
            moved = false;
            before = null;
        },
        cancel: () =>
        {
            if (drag && before)
            {
                // Only ever shown, never handed on as final, so this is all it takes.
                change(before, false);
                drag = null;
                moved = false;
                before = null;

                return true;
            }

            // Placing, the page stops placing at once, rather than first letting go of the last one.
            if (!selected || placing)
                return false;

            selected = null;

            return true;
        },
        key: (key, scenario) =>
        {
            if (!selected)
                return false;

            if (key === 'Delete' || key === 'Backspace')
                change(withoutProp(scenario, selected));
            else if (key !== 'Escape')
                return false;

            selected = null;

            return true;
        },
        draw: (ctx, zoom, scenario) =>
        {
            const prop = scenario.props.find((candidate) => candidate.id === selected);

            if (prop)
            {
                const corners = propCorners(prop);
                const handles = propHandles(prop, zoom);
                const top = fromLocal(prop, { x: 0, y: -prop.height / 2 });

                ctx.beginPath();
                corners.forEach((corner, index) =>
                    index === 0 ? ctx.moveTo(corner.x, corner.y) : ctx.lineTo(corner.x, corner.y),
                );
                ctx.closePath();
                ctx.moveTo(top.x, top.y);
                ctx.lineTo(handles.turn.x, handles.turn.y);
                ctx.setLineDash([6 / zoom, 4 / zoom]);
                ctx.strokeStyle = highlight;
                ctx.lineWidth = 1.5 / zoom;
                ctx.stroke();
                ctx.setLineDash([]);
                dot(ctx, handles.scale, 6 / zoom, highlight);
                dot(ctx, handles.turn, 6 / zoom, highlight);
            }

            if (placing && hover)
            {
                const size = placedSize(placing, scenario.grid);
                const ghost: Prop = { id: '', src: '', ...hover, ...size, rotation: 0 };
                const center = snapCenter(scenario.grid, ghost, hover);

                ctx.setLineDash([6 / zoom, 4 / zoom]);
                ctx.strokeStyle = highlight;
                ctx.lineWidth = 1.5 / zoom;
                ctx.strokeRect(center.x - size.width / 2, center.y - size.height / 2, size.width, size.height);
                ctx.setLineDash([]);
            }
        },
    };
}

/**
 * The tool for an id, or null for plain panning and token dragging. placing is the library
 * picture the props tool places with each click, null to select and edit placed props. reveal
 * hears the boxes of Reveal area, which change what was seen rather than the scenario. snap is
 * how many points per cell side walls snap to, 0 for none.
 */
export function createTool(
    id: ToolId,
    change: Change,
    placing: PropPicture | null = null,
    reveal: (area: Area) => void = () => {},
    snap = 1,
): MapTool | null
{
    switch (id)
    {
        case 'walls':
            return wallTool(change, snap);
        case 'erase':
            return eraseTool(change);
        case 'doors':
            return wallClickTool(
                () => true,
                (scenario, wall) => replaceWall(scenario, nextDoor(wall)),
                nextDoorLabel,
                change,
            );
        case 'open-doors':
            // Play mode: only doors react, so a press anywhere else still pans or drags a token.
            return wallClickTool(
                (wall) => wall.door !== undefined,
                (scenario, wall) => replaceWall(scenario, toggleDoor(wall)),
                (wall) => (wall.door?.open ? 'Close door' : 'Open door'),
                change,
            );
        case 'spawn':
            return spawnTool(change);
        case 'props':
            return propTool(change, placing);
        case 'measure':
            return measureTool();
        case 'reveal':
            return revealTool(reveal);
        case 'select':
        case 'align':
            return null;
    }
}
