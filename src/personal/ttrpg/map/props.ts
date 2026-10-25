import type { Grid, Point, Prop, PropPicture } from '../types';

import { cellAt, cellCenter } from './grid.ts';

/** How far the turn handle sits above a prop, in screen pixels. */
const turnHandleGap = 28;

/**
 * The size a picture gets on the map when it is placed: one cell along its longest side, however
 * big the picture is, so a huge one never covers the map. Scaling it up afterwards is one drag.
 */
export function placedSize(picture: PropPicture, grid: Grid): { width: number; height: number }
{
    const scale = grid.size / Math.max(picture.width, picture.height);

    return { width: picture.width * scale, height: picture.height * scale };
}

/** A new prop of a picture, centred on a point, snapped to the grid unless free. */
export function newProp(picture: PropPicture, grid: Grid, at: Point, free: boolean): Prop
{
    const prop: Prop = { id: crypto.randomUUID(), src: picture.src, ...at, ...placedSize(picture, grid), rotation: 0 };

    return free ? prop : { ...prop, ...snapCenter(grid, prop, at) };
}

/** A world point in the prop's own frame: measured from its centre, turned back by its rotation. */
export function toLocal(prop: Prop, point: Point): Point
{
    const dx = point.x - prop.x;
    const dy = point.y - prop.y;
    const cos = Math.cos(-prop.rotation);
    const sin = Math.sin(-prop.rotation);

    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

export function fromLocal(prop: Prop, local: Point): Point
{
    const cos = Math.cos(prop.rotation);
    const sin = Math.sin(prop.rotation);

    return { x: prop.x + local.x * cos - local.y * sin, y: prop.y + local.x * sin + local.y * cos };
}

/** A prop's four corners in the world, turned with it, clockwise from the top left. */
export function propCorners(prop: Prop): Point[]
{
    return [
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
    ].map((corner) => fromLocal(prop, { x: (corner.x * prop.width) / 2, y: (corner.y * prop.height) / 2 }));
}

/** The topmost prop under a point, turned or not. */
export function propAt(props: Prop[], point: Point): Prop | undefined
{
    for (let index = props.length - 1; index >= 0; index--)
    {
        const local = toLocal(props[index], point);

        if (Math.abs(local.x) <= props[index].width / 2 && Math.abs(local.y) <= props[index].height / 2)
            return props[index];

    }

    return undefined;
}

/** Where the scale handle (bottom right corner) and the turn handle (above the top) are. */
export function propHandles(prop: Prop, zoom: number): { scale: Point; turn: Point }
{
    return {
        scale: fromLocal(prop, { x: prop.width / 2, y: prop.height / 2 }),
        turn: fromLocal(prop, { x: 0, y: -prop.height / 2 - turnHandleGap / zoom }),
    };
}

/** Snaps one axis: to a cell's middle for an odd number of cells, to a grid line for an even one. */
function snapAxis(value: number, offset: number, size: number, extent: number): number
{
    const cells = Math.max(1, Math.round(extent / size));

    if (cells % 2 === 1)
        return offset + (Math.floor((value - offset) / size) + 0.5) * size;

    return offset + Math.round((value - offset) / size) * size;
}

/**
 * Where a prop's centre lands on the grid. On a square grid its edges line up with grid lines
 * where they can, so a two-cell table covers two whole cells; the box around a turned prop is
 * what counts. On a hex grid it sits in the middle of a hex.
 */
export function snapCenter(grid: Grid, prop: Prop, center: Point): Point
{
    if (grid.type === 'none')
        return center;

    if (grid.type === 'hex')
        return cellCenter(grid, cellAt(grid, center));

    const cos = Math.abs(Math.cos(prop.rotation));
    const sin = Math.abs(Math.sin(prop.rotation));

    return {
        x: snapAxis(center.x, grid.offsetX, grid.size, prop.width * cos + prop.height * sin),
        y: snapAxis(center.y, grid.offsetY, grid.size, prop.width * sin + prop.height * cos),
    };
}

/** Scales a size so its longest side is a whole number of half cells, at least one half. */
export function snapSize(grid: Grid, width: number, height: number): { width: number; height: number }
{
    const longest = Math.max(width, height);
    const target = Math.max(0.5, Math.round((longest / grid.size) * 2) / 2) * grid.size;

    return { width: (width * target) / longest, height: (height * target) / longest };
}
