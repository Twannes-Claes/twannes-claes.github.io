import type { Point } from '../types';

/** Below this a cross product counts as zero, so a point on a line is not lost to rounding. */
const epsilon = 1e-6;

/** Positive when b is to the left of the line from origin through a, negative to the right. */
function cross(origin: Point, a: Point, b: Point): number
{
    return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/** Whether a point already known to be on the line through a and b lies between them. */
function between(a: Point, b: Point, point: Point): boolean
{
    return (
        Math.min(a.x, b.x) - epsilon <= point.x &&
        point.x <= Math.max(a.x, b.x) + epsilon &&
        Math.min(a.y, b.y) - epsilon <= point.y &&
        point.y <= Math.max(a.y, b.y) + epsilon
    );
}

/**
 * Whether segment a b crosses or touches segment c d. Touching counts, so a step that passes
 * exactly over the end of a wall, like cutting the corner of a doorway, is blocked.
 */
export function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean
{
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);

    const straddles = (first: number, second: number) =>
        (first > epsilon && second < -epsilon) || (first < -epsilon && second > epsilon);

    if (straddles(abC, abD) && straddles(cdA, cdB))
        return true;

    return (
        (Math.abs(abC) <= epsilon && between(a, b, c)) ||
        (Math.abs(abD) <= epsilon && between(a, b, d)) ||
        (Math.abs(cdA) <= epsilon && between(c, d, a)) ||
        (Math.abs(cdB) <= epsilon && between(c, d, b))
    );
}

export function distance(a: Point, b: Point): number
{
    return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The spot on segment a b nearest to a point. */
export function closestOnSegment(point: Point, a: Point, b: Point): Point
{
    const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;

    if (length === 0)
        return a;

    const along = ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length;

    return lerp(a, b, Math.min(1, Math.max(0, along)));
}

/** How far a point is from the nearest spot on segment a b. */
export function distanceToSegment(point: Point, a: Point, b: Point): number
{
    return distance(point, closestOnSegment(point, a, b));
}

/** The point a fraction t of the way from a to b. */
export function lerp(a: Point, b: Point, t: number): Point
{
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function midpoint(a: Point, b: Point): Point
{
    return lerp(a, b, 0.5);
}

/** A box of the world, in world pixels: an area dragged with a tool or the part on screen. */
export interface Area
{
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** The box between two corners, whichever way it was dragged. */
export function boxOf(start: Point, end: Point): Area
{
    return {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        right: Math.max(start.x, end.x),
        bottom: Math.max(start.y, end.y),
    };
}

/** A point pulled inside a map, so nothing is walked, dragged or drawn off its edge. */
export function onMap({ width, height }: { width: number; height: number }, { x, y }: Point): Point
{
    return { x: Math.min(Math.max(x, 0), width), y: Math.min(Math.max(y, 0), height) };
}
