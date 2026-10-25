import type { Drawing, Point } from '../types';

import { distance, distanceToSegment } from './geometry.ts';

/*
 * Lines drawn freehand on the map in play, see Drawing. Shared by the map's tools and the server,
 * which keeps to the same limits so every line stays a small document.
 */

/** The most points one line keeps, about 3600 screen pixels of it; drawing on past it adds nothing. */
export const maxDrawingPoints = 600;

/** How thick a line can be on screen, in pixels, and how thick one starts. */
export const penWidths = { min: 2, max: 20, start: 4 };

/** The most lines one person keeps in a session; a new one past it takes their oldest away. */
export const maxDrawings = 20;

/** How far the pointer moves before a line takes another point, in screen pixels. */
const step = 6;

/** The line with a point added once the pointer moved far enough from its last, or the same line. */
export function extendLine(points: Point[], at: Point, zoom: number): Point[]
{
    const last = points[points.length - 1];

    if (points.length >= maxDrawingPoints || (last && distance(last, at) < step / zoom))
        return points;

    return [...points, at];
}

/** The lines this screen may erase that pass within reach of a point, all in world pixels. */
export function drawingsAt(drawings: Drawing[], at: Point, reach: number): string[]
{
    // A line of one point is a dot, measured against itself.
    const near = ({ points }: Drawing) => points.some((point, index) => distanceToSegment(at, points[index - 1] ?? point, point) <= reach);

    return drawings.filter((drawing) => drawing.erasable && near(drawing)).map((drawing) => drawing.id);
}

/** A line in its colour, the same width on screen at any zoom. */
export function drawLine(ctx: CanvasRenderingContext2D, points: Point[], zoom: number, colour: string, width: number)
{
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (const point of points)
        ctx.lineTo(point.x, point.y);

    ctx.strokeStyle = colour;
    ctx.lineWidth = width / zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}
