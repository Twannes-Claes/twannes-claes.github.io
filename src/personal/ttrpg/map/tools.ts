import type { GameSystem, Mark, Point, Prop, PropPicture, Scenario, Token, Wall } from '../types';

import { danger, door as doorColour, faded, ground, highlight, ink } from './colours.ts';
import { boxOf, closestOnSegment, distance, distanceToSegment, onMap, segmentsTouch, type Area } from './geometry.ts';
import { cellAt, cellCenter, cellLine, nearestCorner, snapPoint } from './grid.ts';
import { lineFeet, pathFeet } from './path.ts';
import { fromLocal, newProp, placedSize, propAt, propCorners, propHandles, snapCenter, snapSize } from './props.ts';
import { drawPill, drawRoute, tokenRadius } from './render.ts';
import { sightSegments, visibilityPolygon } from './visibility.ts';

import { confirmAction } from '../services/confirm.ts';

/*
 * The editor's tools. Each one gets the pointer in world pixels and hands back a changed
 * scenario through `change`, so the page that owns the scenario decides what happens to it:
 * history, saving, showing it. Without a tool, or when a tool turns a press down, the map pans
 * and tokens drag as usual, see map/view.ts.
 */

export type ToolId =
    | 'select'
    | 'pick'
    | 'walls'
    | 'rings'
    | 'erase'
    | 'doors'
    | 'spawn'
    | 'align'
    | 'props'
    | 'monsters'
    | 'open-doors'
    | 'measure'
    | 'area'
    | 'cone'
    | 'reveal'
    | 'reveal-circle'
    | 'hide'
    | 'hide-circle';

/**
 * Hands a changed scenario back. A drag passes final false while it moves, which only shows
 * the change, and final true once on release, which keeps it as one step to undo.
 */
export type Change = (next: Scenario, final?: boolean) => void;

/**
 * Hears what Reveal uncovers, a polygon or a circle, as a polygon in world pixels, and whether it hides
 * it again instead.
 */
export type Reveal = (polygon: Point[], hide: boolean) => void;

/** Hears a ruler or an area as it is dragged, to show on every screen, and null once let go. */
export type ShareMark = (mark: Mark | null) => void;

/** One pointer event, as a tool sees it. */
export interface ToolPointer
{
    world: Point;
    /** Alt is held: place freely rather than on the grid. */
    free: boolean;
    /** Shift is held: keep a line at 0, 45 or 90 degrees. */
    straight?: boolean;
    /** Screen pixels per world pixel, so hit areas feel the same size at any zoom. */
    zoom: number;
    scenario: Scenario;
    /** Whether the players see a spot or have seen it, or the GM is peeking. True without fog. */
    seen: (point: Point) => boolean;
    /** The monsters on this screen, which the erase tool takes too. */
    monsters?: Token[];
    /** The session's game, which shapes a cone, see drawMark. */
    system: GameSystem;
    /** A finger rather than a mouse, which hides what is under it. */
    touch?: boolean;
    /** A token is under the pointer, which a press drags before a prop under it. */
    onToken?: boolean;
}

/** Hears the monsters the erase tool took, once the GM said yes, see eraseTool. */
export type EraseMonsters = (ids: string[]) => void;

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
export function drawBox(ctx: CanvasRenderingContext2D, { start, end }: Drag, zoom: number, colour: string, fill = false)
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
 * A ring's middle: the middle of the cell under the pointer or the nearest snap point, whichever
 * is closer, so a tree sits in its cell or between four. The exact spot with Alt, with snapping
 * off (0) or without a grid.
 */
function ringCenter(pointer: ToolPointer, steps: number): Point
{
    const { world, free, scenario } = pointer;
    const { grid } = scenario;

    if (free || steps === 0 || grid.type === 'none')
        return onMap(scenario, world);

    const middle = cellCenter(grid, cellAt(grid, world));
    const corner = snapPoint(grid, world, steps);

    return onMap(scenario, distance(middle, world) < distance(corner, world) ? middle : corner);
}

/** Evenly spaced points round a circle, the corners of the polygon that stands in for it. */
function circlePoints(center: Point, radius: number, count: number): Point[]
{
    return Array.from({ length: count }, (_, index) =>
    {
        const angle = (index / count) * Math.PI * 2;

        return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    });
}

/** A ring's walls, short enough that it reads as round: 12 for a small tree, up to 32. */
function ringWalls(center: Point, radius: number, cell: number): Wall[]
{
    const ring = crypto.randomUUID();
    const points = circlePoints(center, radius, Math.min(32, Math.max(12, Math.ceil((radius / cell) * 16))));

    return points.map((a, index) =>
    {
        const b = points[(index + 1) % points.length];

        return { id: crypto.randomUUID(), x1: a.x, y1: a.y, x2: b.x, y2: b.y, blocksSight: true, blocksMove: true, ring };
    });
}

/**
 * Round walls, for trees and pillars: press on the middle and drag out to the edge. The edge
 * snaps to steps of half a cell side divided by the snap, so a one cell tree is one drag.
 */
function ringTool(change: Change, snap: number): MapTool
{
    let drag: { center: Point; radius: number } | null = null;
    let hover: Point | null = null;

    const radiusAt = ({ world, free, scenario }: ToolPointer, center: Point) =>
    {
        const raw = distance(center, world);

        if (free || snap === 0 || scenario.grid.type === 'none')
            return raw;

        const step = scenario.grid.size / (2 * snap);

        return Math.max(step, Math.round(raw / step) * step);
    };

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            const center = ringCenter(pointer, snap);

            drag = { center, radius: radiusAt(pointer, center) };

            return true;
        },
        move: (pointer, pressed) =>
        {
            hover = ringCenter(pointer, snap);

            if (pressed && drag)
                drag.radius = radiusAt(pointer, drag.center);

        },
        up: ({ scenario, zoom }) =>
        {
            // A ring too small to see on screen was a slip, not a tree.
            if (drag && drag.radius * zoom >= 4)
            {
                const walls = ringWalls(drag.center, drag.radius, scenario.grid.size);

                change({ ...scenario, walls: [...scenario.walls, ...walls] });
            }

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
            {
                ctx.beginPath();
                ctx.arc(drag.center.x, drag.center.y, drag.radius, 0, Math.PI * 2);
                ctx.setLineDash([8 / zoom, 6 / zoom]);
                ctx.strokeStyle = highlight;
                ctx.lineWidth = 3 / zoom;
                ctx.stroke();
                ctx.setLineDash([]);
                dot(ctx, drag.center, 5 / zoom, highlight);
            }
            else if (hover)
                dot(ctx, hover, 4 / zoom, ink);

        },
    };
}

/** The walls a wall goes with: its whole ring, or only itself. */
function withRing(walls: Wall[], wall: Wall): Wall[]
{
    return wall.ring ? walls.filter((other) => other.ring === wall.ring) : [wall];
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

/** How far above a finger its feet show while it drags a ruler or a path, in screen pixels. */
export const fingerGap = 50;

/**
 * A ruler or an area of effect, in its colour: the line through the cells with its feet, or the
 * circle or cone with its reach in feet. A cone has a rounded end and follows the system: as wide
 * as it is long in 5e, a quarter circle in Pathfinder 2e. A circle's feet sit in its middle. Given the
 * finger dragging it, the feet sit just above it and follow it between cells, clear
 * of the thumb.
 */
export function drawMark(ctx: CanvasRenderingContext2D, mark: Mark, zoom: number, scenario: Scenario, colour: string, system: GameSystem, finger?: Point)
{
    const label = (text: string, at: Point) =>
        (finger ? drawPill(ctx, text, { x: finger.x, y: finger.y - fingerGap / zoom }, zoom, faded(ground, 0.9), 1, true) : drawPill(ctx, text, at, zoom, faded(ground, 0.9)));

    if (mark.kind === 'ruler')
    {
        const { points, feet } = measure(scenario, mark.from, mark.to);

        drawRoute(ctx, points, zoom, colour);
        label(`${feet} ft`, mark.to);

        return;
    }

    const { grid } = scenario;
    const { from, to } = mark;
    const reach = distance(from, to);

    ctx.beginPath();

    if (mark.kind === 'area')
        ctx.arc(from.x, from.y, reach, 0, Math.PI * 2);
    else
    {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        // To each side: a quarter turn in all in Pathfinder, as wide as it is long in 5e.
        const spread = system === 'pf2e' ? Math.PI / 4 : Math.atan(0.5);

        ctx.moveTo(from.x, from.y);
        ctx.arc(from.x, from.y, reach, angle - spread, angle + spread);
        ctx.closePath();
    }

    ctx.fillStyle = faded(colour, 0.18);
    ctx.fill();
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
    ctx.setLineDash([]);
    const feet = `${Math.round((reach / grid.size) * grid.feetPerCell)} ft`;

    if (mark.kind === 'area' && !finger)
        drawPill(ctx, feet, from, zoom, faded(ground, 0.9), 1, true);
    else
        label(feet, to);
}

/**
 * A drag that shares itself while it lasts, for the ruler and the area tool: start makes the mark
 * from the press, update follows the pointer. Every screen at the table sees it until let go.
 */
function markTool(share: ShareMark, start: (pointer: ToolPointer) => Mark, update: (mark: Mark, pointer: ToolPointer) => Mark): MapTool
{
    let mark: Mark | null = null;
    // The last pointer's, for drawing, which gets no pointer.
    let system: GameSystem = '5e';
    // Where a finger dragging it is now, which the feet follow; none with a mouse.
    let finger: Point | undefined;

    const drop = () =>
    {
        const had = mark !== null;

        mark = null;

        if (had)
            share(null);

        return had;
    };

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            mark = start(pointer);
            system = pointer.system;
            finger = pointer.touch ? pointer.world : undefined;

            return true;
        },
        move: (pointer, pressed) =>
        {
            if (!pressed || !mark)
                return;

            const next = update(mark, pointer);

            system = pointer.system;
            finger = pointer.touch ? pointer.world : undefined;

            // Only a real change goes out: an area moves in whole cells, so most moves are none.
            if (next.to.x !== mark.to.x || next.to.y !== mark.to.y)
                share(next);

            mark = next;
        },
        up: () => void drop(),
        cancel: drop,
        draw: (ctx, zoom, scenario) =>
        {
            if (mark)
                drawMark(ctx, mark, zoom, scenario, ink, system, finger);

        },
    };
}

/** The ruler: drag from one spot to another to see how far it is. */
function measureTool(share: ShareMark): MapTool
{
    return markTool(
        share,
        ({ world }) => ({ kind: 'ruler', from: world, to: world }),
        (mark, { world }) => ({ ...mark, to: world }),
    );
}

/**
 * Where an area or a cone starts: on a grid, whichever is nearer, a grid corner as spells are
 * placed at the table or a cell's middle for an aura around a token; Alt places it freely.
 */
function areaStart({ world, free, scenario: { grid } }: ToolPointer): Point
{
    if (free || grid.type === 'none')
        return world;

    const corner = nearestCorner(grid, world);
    const middle = cellCenter(grid, cellAt(grid, world));

    return distance(corner, world) <= distance(middle, world) ? corner : middle;
}

/** How far an area or a cone reaches from where it starts: in whole cells on a grid. */
function reachAt({ world, free, scenario: { grid } }: ToolPointer, from: Point): number
{
    const raw = distance(from, world);

    return free || grid.type === 'none' ? raw : Math.max(1, Math.round(raw / grid.size)) * grid.size;
}

/** An area of effect, like a fireball: drag from where it lands out to how far it reaches. */
function areaTool(share: ShareMark): MapTool
{
    // The radius goes as a point straight right of the middle, see Mark.
    const reaching = (center: Point, radius: number): Mark => ({ kind: 'area', from: center, to: { x: center.x + radius, y: center.y } });

    return markTool(
        share,
        (pointer) =>
        {
            const center = areaStart(pointer);

            return reaching(center, reachAt(pointer, center));
        },
        (mark, pointer) => reaching(mark.from, reachAt(pointer, mark.from)),
    );
}

/**
 * A cone, like a dragon's breath: drag from where it starts the way it points, out to how far it
 * reaches. In Pathfinder 2e it points straight or diagonally on a grid, the ways its cones are
 * counted in cells.
 */
function coneTool(share: ShareMark): MapTool
{
    const eighth = Math.PI / 4;

    const reaching = (from: Point, pointer: ToolPointer): Mark =>
    {
        const { world, free, scenario, system } = pointer;
        const raw = Math.atan2(world.y - from.y, world.x - from.x);
        const angle = system === 'pf2e' && !free && scenario.grid.type !== 'none' ? Math.round(raw / eighth) * eighth : raw;
        const reach = reachAt(pointer, from);

        return { kind: 'cone', from, to: { x: from.x + Math.cos(angle) * reach, y: from.y + Math.sin(angle) * reach } };
    };

    return markTool(share, (pointer) => reaching(areaStart(pointer), pointer), (mark, pointer) => reaching(mark.from, pointer));
}

/**
 * The point at from's nearest 0, 45 or 90 degrees towards to, for Shift held. A diagonal takes
 * the longer side, so a corner on the grid leads to another one.
 */
export function straighten(from: Point, to: Point): Point
{
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    // Within 22.5 degrees of flat or upright, the line lies flat or stands up.
    const slack = Math.tan(Math.PI / 8);

    if (Math.abs(dy) <= Math.abs(dx) * slack)
        return { x: to.x, y: from.y };

    if (Math.abs(dx) <= Math.abs(dy) * slack)
        return { x: from.x, y: to.y };

    const side = Math.max(Math.abs(dx), Math.abs(dy));

    return { x: from.x + Math.sign(dx) * side, y: from.y + Math.sign(dy) * side };
}

/**
 * The game master's Reveal area: click its corners, which snap like walls do, and clicking the
 * first one again closes it. Everything inside counts as seen before, or, hiding, as never seen,
 * red while it is drawn. Shift keeps each side at 0, 45 or 90 degrees, for clean boxes.
 */
function revealTool(reveal: Reveal, hide: boolean, snap: number): MapTool
{
    let corners: Point[] = [];
    let hover: Point | null = null;

    const cornerAt = (pointer: ToolPointer) =>
    {
        const point = cornerPoint(pointer, snap);
        const last = corners.at(-1);

        return pointer.straight && last ? straighten(last, point) : point;
    };

    // Close enough to the first corner, in screen pixels, to close the shape on a click.
    const closes = (point: Point, zoom: number) => corners.length > 2 && distance(corners[0], point) * zoom < reach;

    const drop = () =>
    {
        const had = corners.length > 0;

        corners = [];

        return had;
    };

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            const point = cornerAt(pointer);
            const last = corners.at(-1);

            if (closes(pointer.world, pointer.zoom) || closes(point, pointer.zoom))
            {
                reveal(corners, hide);
                corners = [];
            }
            else if (!last || distance(last, point) * pointer.zoom >= 4)
                corners.push(point);

            return true;
        },
        move: (pointer) =>
        {
            hover = cornerAt(pointer);

            if (closes(pointer.world, pointer.zoom) || closes(hover, pointer.zoom))
                hover = corners[0];

        },
        key: (key) => key === 'Escape' && drop(),
        cancel: drop,
        draw: (ctx, zoom) =>
        {
            const colour = hide ? danger : highlight;
            const outline = hover && corners.length > 0 ? [...corners, hover] : corners;

            if (outline.length > 1)
            {
                ctx.beginPath();
                outline.forEach((corner, index) => (index === 0 ? ctx.moveTo(corner.x, corner.y) : ctx.lineTo(corner.x, corner.y)));
                ctx.closePath();
                ctx.fillStyle = faded(colour, 0.14);
                ctx.fill();
                ctx.setLineDash([6 / zoom, 4 / zoom]);
                ctx.strokeStyle = colour;
                ctx.lineWidth = 2 / zoom;
                ctx.stroke();
                ctx.setLineDash([]);
            }

            for (const corner of corners)
                dot(ctx, corner, 4 / zoom, colour);

            // The first corner grows when the next click would close the shape.
            if (corners.length > 0)
                dot(ctx, corners[0], (hover === corners[0] ? 7 : 5) / zoom, colour);

            if (hover && hover !== corners[0])
                dot(ctx, hover, 4 / zoom, ink);

        },
    };
}

/**
 * Reveal as a circle, for a torch thrown or a spell of light: drag from where it lands out to how
 * far it shines, in whole cells unless Alt is held. What it lights counts as seen before, stopped
 * by walls like a player's sight. Hiding forgets the whole circle, red while it is dragged.
 */
function revealCircleTool(reveal: Reveal, hide: boolean): MapTool
{
    let drag: { center: Point; radius: number } | null = null;

    const radiusAt = ({ world, free, scenario }: ToolPointer, center: Point) =>
    {
        const { grid } = scenario;
        const raw = distance(center, world);

        return free || grid.type === 'none' ? raw : Math.max(1, Math.round(raw / grid.size)) * grid.size;
    };

    return {
        cursor: 'crosshair',
        down: (pointer) =>
        {
            drag = { center: pointer.world, radius: radiusAt(pointer, pointer.world) };

            return true;
        },
        move: (pointer, pressed) =>
        {
            if (pressed && drag)
                drag.radius = radiusAt(pointer, drag.center);

        },
        up: ({ scenario }) =>
        {
            if (drag)
            {
                const { center, radius } = drag;
                const points = circlePoints(center, radius, 64);
                const edge = points.map((a, index) => ({ a, b: points[(index + 1) % points.length] }));

                // Hiding forgets the whole circle, walls or not.
                reveal(hide ? points : visibilityPolygon(center, [...sightSegments(scenario), ...edge]), hide);
            }

            drag = null;
        },
        cancel: () =>
        {
            const had = drag !== null;

            drag = null;

            return had;
        },
        draw: (ctx, zoom, { grid }) =>
        {
            if (!drag)
                return;

            const feet = Math.round((drag.radius / grid.size) * grid.feetPerCell);

            ctx.beginPath();
            ctx.arc(drag.center.x, drag.center.y, drag.radius, 0, Math.PI * 2);
            const colour = hide ? danger : highlight;

            ctx.fillStyle = faded(colour, 0.14);
            ctx.fill();
            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.strokeStyle = colour;
            ctx.lineWidth = 2 / zoom;
            ctx.stroke();
            ctx.setLineDash([]);
            drawPill(ctx, `${feet} ft`, drag.center, zoom, faded(ground, 0.9));
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

/** "the wall", "3 walls", for the erase dialog. Empty for none. */
function counted(count: number, noun: string): string
{
    if (count === 0)
        return '';

    return count === 1 ? `the ${noun}` : `${count} ${noun}s`;
}

/** A monster's outline in red, like a wall or a prop about to go. */
function strokeMonster(ctx: CanvasRenderingContext2D, monster: Token, radius: number, zoom: number)
{
    ctx.beginPath();
    ctx.arc(monster.x, monster.y, radius + 3 / zoom, 0, Math.PI * 2);
    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = danger;
    ctx.stroke();
}

/**
 * The eraser: click a wall, a prop or a monster to take it away, or drag a box from the floor and
 * everything in it goes when it is let go, once confirmed. Walls and props go as one step to undo;
 * a monster lives beside the map rather than in it, so a click on one asks first, and eraseMonsters
 * takes it off for good. What is about to go shows red.
 */
function eraseTool(change: Change, eraseMonsters: EraseMonsters): MapTool
{
    let hover: { wall?: Wall; prop?: Prop; monster?: Token } = {};
    let drag: Drag | null = null;
    // The monsters the last pointer saw, for drawing, which gets no pointer.
    let monsters: Token[] = [];

    // A monster on top, then the wall near the pointer before the prop under it, as walls are thin
    // and props are big.
    const under = (pointer: ToolPointer) =>
    {
        const { grid } = pointer.scenario;
        // The last drawn is the one on top.
        const monster = [...monsters].reverse().find((token) => distance(token, pointer.world) <= Math.max(tokenRadius(grid, token.size), tokenRadius(grid)));

        if (monster)
            return { monster };

        const wall = wallNear(pointer);

        return wall ? { wall } : { prop: propAt(pointer.scenario.props, pointer.world) };
    };

    /** The walls in the box, and the props and monsters with their middle in it. */
    const inBox = (scenario: Scenario) =>
    {
        if (!drag)
            return { walls: [], props: [], caught: [] };

        const box = boxOf(drag.start, drag.end);
        const inside = ({ x, y }: Point) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

        // A ring the box touches goes whole.
        const rings = new Set(scenario.walls.filter((wall) => wall.ring && wallInBox(wall, box)).map((wall) => wall.ring));

        return {
            walls: scenario.walls.filter((wall) => wallInBox(wall, box) || rings.has(wall.ring)),
            props: scenario.props.filter(inside),
            caught: monsters.filter(inside),
        };
    };

    return {
        get cursor()
        {
            return hover.wall || hover.prop || hover.monster ? 'pointer' : 'crosshair';
        },
        down: (pointer) =>
        {
            const { scenario } = pointer;

            monsters = pointer.monsters ?? [];

            const { wall, prop, monster } = under(pointer);

            hover = {};

            if (monster)
            {
                void confirmAction(`Remove ${monster.name} from the map?`, 'Remove').then((yes) =>
                {
                    if (yes)
                        eraseMonsters([monster.id]);

                });
            }
            else if (wall)
            {
                const gone = withRing(scenario.walls, wall);

                change({ ...scenario, walls: scenario.walls.filter((other) => !gone.includes(other)) });
            }
            else if (prop)
                change(withoutProp(scenario, prop.id));
            else
                drag = { start: pointer.world, end: pointer.world };

            return true;
        },
        move: (pointer, pressed) =>
        {
            monsters = pointer.monsters ?? [];

            if (pressed && drag)
                drag.end = pointer.world;

            hover = pressed ? {} : under(pointer);
        },
        up: (pointer) =>
        {
            const { scenario } = pointer;
            const { walls, props, caught } = inBox(scenario);
            const doomed = new Set([...walls, ...props].map((thing) => thing.id));
            const what = [counted(walls.length, 'wall'), counted(props.length, 'prop'), counted(caught.length, 'monster')]
                .filter(Boolean)
                .join(' and ');

            drag = null;

            // The dialog is modal, so nothing else changes the scenario while it asks.
            if (what)
            {
                void confirmAction(`Erase ${what} in the box?`, 'Erase').then((yes) =>
                {
                    if (!yes)
                        return;

                    if (doomed.size > 0)
                    {
                        change({
                            ...scenario,
                            walls: scenario.walls.filter((wall) => !doomed.has(wall.id)),
                            props: scenario.props.filter((prop) => !doomed.has(prop.id)),
                        });
                    }

                    if (caught.length > 0)
                        eraseMonsters(caught.map((monster) => monster.id));

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
            {
                for (const wall of withRing(scenario.walls, hover.wall))
                    strokeWall(ctx, wall, danger, 7 / zoom);
            }

            if (hover.prop)
                strokeProp(ctx, hover.prop, danger, 3 / zoom);

            if (hover.monster)
                strokeMonster(ctx, hover.monster, tokenRadius(scenario.grid, hover.monster.size), zoom);

            if (!drag)
                return;

            const { walls, props, caught } = inBox(scenario);

            for (const wall of walls)
                strokeWall(ctx, wall, danger, 7 / zoom);

            for (const prop of props)
                strokeProp(ctx, prop, danger, 3 / zoom);

            for (const monster of caught)
                strokeMonster(ctx, monster, tokenRadius(scenario.grid, monster.size), zoom);

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
                const prop = newProp(placing, scenario.grid, world, pointer.free);

                change({ ...scenario, props: [...scenario.props, prop] });
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
 * The GM view's doors, plus dragging the props marked Movable in Edit, like a cart. Every other
 * prop stays put, so a click on a barrel never moves it by accident. A door or a token under the
 * pointer goes first. Snaps like the props tool unless Alt is held, and lands as one step to undo.
 */
function movablePropTool(doors: MapTool, change: Change): MapTool
{
    let drag: { id: string; offset: Point; before: Scenario } | null = null;
    let moved = false;
    let hover = false;

    const movableAt = ({ scenario, world, onToken }: ToolPointer) =>
        onToken ? undefined : propAt(scenario.props.filter((prop) => prop.movable), world);

    return {
        get cursor()
        {
            return drag ? 'grabbing' : doors.cursor || (hover ? 'grab' : '');
        },
        down: (pointer) =>
        {
            if (doors.down(pointer))
                return true;

            const hit = movableAt(pointer);

            if (!hit)
                return false;

            drag = { id: hit.id, offset: { x: pointer.world.x - hit.x, y: pointer.world.y - hit.y }, before: pointer.scenario };

            return true;
        },
        move: (pointer, pressed) =>
        {
            doors.move(pointer, pressed);
            hover = movableAt(pointer) !== undefined;

            const { scenario, world, free } = pointer;
            const prop = drag && scenario.props.find((candidate) => candidate.id === drag?.id);

            if (!pressed || !drag || !prop)
                return;

            const center = { x: world.x - drag.offset.x, y: world.y - drag.offset.y };
            const next = { ...prop, ...(free ? center : snapCenter(scenario.grid, prop, center)) };

            moved = true;
            change({ ...scenario, props: scenario.props.map((other) => (other.id === prop.id ? next : other)) }, false);
        },
        up: (pointer) =>
        {
            if (drag && moved)
                change(pointer.scenario, true);

            drag = null;
            moved = false;
        },
        cancel: () =>
        {
            if (!drag)
                return false;

            // Only ever shown, never handed on as final, so this is all it takes.
            change(drag.before, false);
            drag = null;
            moved = false;

            return true;
        },
        draw: doors.draw,
    };
}

/**
 * The tool for an id, or null for plain panning and token dragging. placing is the library
 * picture the props tool places with each click, null to select and edit placed props. reveal
 * hears what Reveal uncovers or hides, which changes what was seen, not the scenario. snap is
 * how many points per cell side walls snap to, 0 for none. share hears the ruler and the area
 * tool as they are dragged.
 */
export function createTool(
    id: ToolId,
    change: Change,
    placing: PropPicture | null = null,
    reveal: Reveal = () => {},
    snap = 1,
    share: ShareMark = () => {},
    eraseMonsters: EraseMonsters = () => {},
): MapTool | null
{
    switch (id)
    {
        case 'walls':
            return wallTool(change, snap);
        case 'rings':
            return ringTool(change, snap);
        case 'erase':
            return eraseTool(change, eraseMonsters);
        case 'doors':
            // A ring is no door.
            return wallClickTool(
                (wall) => !wall.ring,
                (scenario, wall) => replaceWall(scenario, nextDoor(wall)),
                nextDoorLabel,
                change,
            );
        case 'open-doors':
            // Play mode: only doors and movable props react, so a press anywhere else still pans or
            // drags a token.
            return movablePropTool(
                wallClickTool(
                    (wall) => wall.door !== undefined,
                    (scenario, wall) => replaceWall(scenario, toggleDoor(wall)),
                    (wall) => (wall.door?.open ? 'Close door' : 'Open door'),
                    change,
                ),
                change,
            );
        case 'spawn':
            return spawnTool(change);
        case 'props':
            return propTool(change, placing);
        case 'measure':
            return measureTool(share);
        case 'area':
            return areaTool(share);
        case 'cone':
            return coneTool(share);
        case 'reveal':
        case 'hide':
            return revealTool(reveal, id === 'hide', snap);
        case 'reveal-circle':
        case 'hide-circle':
            return revealCircleTool(reveal, id === 'hide-circle');
        // Monsters come from their panel, dragged onto the map, so the map itself only pans.
        case 'select':
        case 'pick':
        case 'align':
        case 'monsters':
            return null;
    }
}
