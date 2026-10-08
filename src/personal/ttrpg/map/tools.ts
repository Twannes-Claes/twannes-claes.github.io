import type { Point, Prop, PropPicture, Scenario, Wall } from '../types';

import { distance, distanceToSegment, segmentsTouch } from './geometry.ts';
import { cellAt, cellCenter, cellLine, snapPoint } from './grid.ts';
import { lineFeet, pathFeet } from './path.ts';
import { fromLocal, placedSize, propAt, propHandles, snapCenter, snapSize } from './props.ts';
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

/** A box of the world, for Reveal area. */
export interface Area
{
    left: number;
    top: number;
    right: number;
    bottom: number;
}

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
}

export interface MapTool
{
    cursor: string;
    /** True when the tool takes this press; otherwise it pans or drags a token. */
    down: (pointer: ToolPointer) => boolean;
    /** While pressed, and while hovering with a mouse. */
    move: (pointer: ToolPointer, pressed: boolean) => void;
    up: (pointer: ToolPointer) => void;
    /** True when the tool used the key. */
    key: (key: string, scenario: Scenario) => boolean;
    /**
     * A right click: drops what is half done, like a chain of walls or a box being dragged, and
     * true when there was something. False leaves the page to put the tool away, see map/view.ts.
     */
    cancel: () => boolean;
    /** Previews over the map, in world pixels. */
    draw: (ctx: CanvasRenderingContext2D, zoom: number, scenario: Scenario) => void;
}

/** How close a click has to be to a wall to hit it, in screen pixels. */
const reach = 10;
const accent = '#a77ee0';
const danger = '#e0565b';
const doorColour = '#d8a657';

/**
 * Where a click lands: the nearest snap point, steps per cell side, see snapPoint in map/grid.ts.
 * The exact spot with Alt, with snapping off (0) or without a grid. Pulled inside the map, so no
 * wall ends beyond its edge.
 */
function cornerPoint({ world, free, scenario }: ToolPointer, steps: number): Point
{
    const exact = free || steps === 0 || scenario.grid.type === 'none';
    const { x, y } = exact ? world : snapPoint(scenario.grid, world, steps);

    return { x: Math.min(Math.max(x, 0), scenario.width), y: Math.min(Math.max(y, 0), scenario.height) };
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

function dot(ctx: CanvasRenderingContext2D, at: Point, radius: number, colour: string)
{
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
}

/**
 * Click, click, click for a chain of walls on the snap points, or of closed doors with door.
 * Clicking the last point again, a double click, or Esc ends the chain.
 */
function wallTool(change: Change, snap: number, door: boolean): MapTool
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

                change({ ...pointer.scenario, walls: [...pointer.scenario.walls, door ? nextDoor(wall) : wall] });
            }

            last = point;

            return true;
        },
        move: (pointer) =>
        {
            hover = cornerPoint(pointer, snap);
        },
        up: () => {},
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
                    door ? doorColour : accent,
                    3 / zoom,
                );
                ctx.setLineDash([]);
            }

            if (last)
                dot(ctx, last, 5 / zoom, accent);

            if (hover)
                dot(ctx, hover, 4 / zoom, '#fcf8ec');

        },
    };
}

/**
 * Tools that act on the wall under the pointer and show which one that is. A press away from
 * any wall pans as usual.
 */
function wallClickTool(
    colour: string,
    only: (wall: Wall) => boolean,
    act: (scenario: Scenario, wall: Wall) => Scenario,
    change: Change,
): MapTool
{
    let hover: Wall | undefined;

    return {
        cursor: 'pointer',
        down: (pointer) =>
        {
            const wall = wallNear(pointer, only);

            if (!wall)
                return false;

            change(act(pointer.scenario, wall));
            hover = undefined;

            return true;
        },
        move: (pointer, pressed) =>
        {
            hover = pressed ? undefined : wallNear(pointer, only);
        },
        up: () => {},
        key: () => false,
        cancel: () => false,
        draw: (ctx, zoom) =>
        {
            if (hover)
                strokeWall(ctx, hover, colour, 7 / zoom);

        },
    };
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
        up: () => {},
        key: () => false,
        cancel: () => false,
        draw: (ctx, zoom) =>
        {
            if (hover)
                dot(ctx, hover, 8 / zoom, 'rgb(167 126 224 / 0.6)');

        },
    };
}

/**
 * Lines the grid up with one drawn on the picture: drag a box over exactly one of its cells.
 * The box sets the cell size, and its corner the offset.
 */
function alignTool(change: Change): MapTool
{
    let start: Point | null = null;
    let end: Point | null = null;

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            start = pointer.world;
            end = pointer.world;

            return true;
        },
        move: (pointer, pressed) =>
        {
            if (pressed)
                end = pointer.world;

        },
        up: (pointer) =>
        {
            if (!start || !end)
                return;

            const width = Math.abs(end.x - start.x);
            const height = Math.abs(end.y - start.y);
            const left = Math.min(start.x, end.x);
            const top = Math.min(start.y, end.y);

            start = null;
            end = null;

            // A click rather than a drag, or a box too small to be a cell.
            if ((width + height) * pointer.zoom < 16)
                return;

            const size = (width + height) / 2;
            const { scenario } = pointer;

            change({
                ...scenario,
                grid: {
                    ...scenario.grid,
                    type: scenario.grid.type === 'none' ? 'square' : scenario.grid.type,
                    size,
                    offsetX: ((left % size) + size) % size,
                    offsetY: ((top % size) + size) % size,
                },
            });
        },
        key: () => false,
        cancel: () =>
        {
            if (!start)
                return false;

            start = null;
            end = null;

            return true;
        },
        draw: (ctx, zoom) =>
        {
            if (!start || !end)
                return;

            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2 / zoom;
            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
            ctx.setLineDash([]);
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
    let start: Point | null = null;
    let end: Point | null = null;

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            start = pointer.world;
            end = pointer.world;

            return true;
        },
        move: (pointer, pressed) =>
        {
            if (pressed)
                end = pointer.world;

        },
        up: () =>
        {
            start = null;
            end = null;
        },
        key: () => false,
        cancel: () =>
        {
            if (!start)
                return false;

            start = null;
            end = null;

            return true;
        },
        draw: (ctx, zoom, scenario) =>
        {
            if (!start || !end)
                return;

            const { points, feet } = measure(scenario, start, end);

            drawRoute(ctx, points, zoom, '#fcf8ec');
            drawPill(ctx, `${feet} ft`, end, zoom, 'rgb(30 29 31 / 0.9)');
        },
    };
}

/** The game master's Reveal area: drag a box and everything in it counts as seen before. */
function revealTool(reveal: (area: Area) => void): MapTool
{
    let start: Point | null = null;
    let end: Point | null = null;

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            start = pointer.world;
            end = pointer.world;

            return true;
        },
        move: (pointer, pressed) =>
        {
            if (pressed)
                end = pointer.world;

        },
        up: () =>
        {
            if (start && end)
            {
                reveal({
                    left: Math.min(start.x, end.x),
                    top: Math.min(start.y, end.y),
                    right: Math.max(start.x, end.x),
                    bottom: Math.max(start.y, end.y),
                });
            }

            start = null;
            end = null;
        },
        key: () => false,
        cancel: () =>
        {
            if (!start)
                return false;

            start = null;
            end = null;

            return true;
        },
        draw: (ctx, zoom) =>
        {
            if (!start || !end)
                return;

            ctx.fillStyle = 'rgb(167 126 224 / 0.15)';
            ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2 / zoom;
            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
            ctx.setLineDash([]);
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

/** The box between two corners, whichever way it was dragged. */
function boxOf(start: Point, end: Point): Area
{
    return {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        right: Math.max(start.x, end.x),
        bottom: Math.max(start.y, end.y),
    };
}

/**
 * The eraser: click a wall to take it away, or drag a box from the floor and every wall it
 * touches goes when it is let go, once confirmed, as one step to undo. The walls about to go
 * show red.
 */
function eraseTool(change: Change): MapTool
{
    let hover: Wall | undefined;
    let start: Point | null = null;
    let end: Point | null = null;

    const inBox = (scenario: Scenario) =>
    {
        if (!start || !end)
            return [];

        const box = boxOf(start, end);

        return scenario.walls.filter((wall) => wallInBox(wall, box));
    };

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            const wall = wallNear(pointer);

            if (wall)
            {
                change({ ...pointer.scenario, walls: pointer.scenario.walls.filter((other) => other.id !== wall.id) });
                hover = undefined;

                return true;
            }

            start = pointer.world;
            end = pointer.world;

            return true;
        },
        move: (pointer, pressed) =>
        {
            if (pressed && start)
                end = pointer.world;

            hover = pressed ? undefined : wallNear(pointer);
        },
        up: (pointer) =>
        {
            const { scenario } = pointer;
            const doomed = new Set(inBox(scenario).map((wall) => wall.id));

            start = null;
            end = null;

            const count = doomed.size === 1 ? 'the wall' : `${doomed.size} walls`;

            // The dialog is modal, so nothing else changes the scenario while it asks.
            if (doomed.size > 0)
            {
                void confirmAction(`Erase ${count} in the box?`, 'Erase').then((yes) =>
                {
                    if (yes)
                        change({ ...scenario, walls: scenario.walls.filter((wall) => !doomed.has(wall.id)) });
                });
            }

        },
        key: () => false,
        cancel: () =>
        {
            if (!start)
                return false;

            start = null;
            end = null;

            return true;
        },
        draw: (ctx, zoom, scenario) =>
        {
            if (hover)
                strokeWall(ctx, hover, danger, 7 / zoom);

            if (!start || !end)
                return;

            for (const wall of inBox(scenario))
                strokeWall(ctx, wall, danger, 7 / zoom);

            ctx.fillStyle = 'rgb(224 86 91 / 0.12)';
            ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.strokeStyle = danger;
            ctx.lineWidth = 2 / zoom;
            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
            ctx.setLineDash([]);
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

    const replace = (scenario: Scenario, prop: Prop) =>
    {
        moved = true;
        change(
            { ...scenario, props: scenario.props.map((other) => (other.id === prop.id ? prop : other)) },
            false,
        );
    };

    return {
        cursor: placing ? 'copy' : 'default',
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
                const corners = [
                    { x: -1, y: -1 },
                    { x: 1, y: -1 },
                    { x: 1, y: 1 },
                    { x: -1, y: 1 },
                ].map((corner) =>
                    fromLocal(prop, { x: (corner.x * prop.width) / 2, y: (corner.y * prop.height) / 2 }),
                );
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
                ctx.strokeStyle = accent;
                ctx.lineWidth = 1.5 / zoom;
                ctx.stroke();
                ctx.setLineDash([]);
                dot(ctx, handles.scale, 6 / zoom, accent);
                dot(ctx, handles.turn, 6 / zoom, accent);
            }

            if (placing && hover)
            {
                const size = placedSize(placing, scenario.grid);
                const ghost: Prop = { id: '', src: '', ...hover, ...size, rotation: 0 };
                const center = snapCenter(scenario.grid, ghost, hover);

                ctx.setLineDash([6 / zoom, 4 / zoom]);
                ctx.strokeStyle = accent;
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
 * how many points per cell side walls snap to, 0 for none, and door makes the walls tool draw
 * closed doors.
 */
export function createTool(
    id: ToolId,
    change: Change,
    placing: PropPicture | null = null,
    reveal: (area: Area) => void = () => {},
    snap = 1,
    door = false,
): MapTool | null
{
    const isDoor = (wall: Wall) => wall.door !== undefined;

    switch (id)
    {
        case 'walls':
            return wallTool(change, snap, door);
        case 'erase':
            return eraseTool(change);
        case 'doors':
            return wallClickTool(doorColour, () => true, (scenario, wall) => replaceWall(scenario, nextDoor(wall)), change);
        case 'open-doors':
            // Play mode: only doors react, so a press anywhere else still pans or drags a token.
            return wallClickTool(
                doorColour,
                isDoor,
                (scenario, wall) => replaceWall(scenario, toggleDoor(wall)),
                change,
            );
        case 'spawn':
            return spawnTool(change);
        case 'align':
            return alignTool(change);
        case 'props':
            return propTool(change, placing);
        case 'measure':
            return measureTool();
        case 'reveal':
            return revealTool(reveal);
        case 'select':
            return null;
    }
}
