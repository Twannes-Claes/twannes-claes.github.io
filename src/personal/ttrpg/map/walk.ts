import type { Point } from '../types';

import { distance, lerp } from './geometry.ts';

/*
 * A token walking its path, played the same on every screen from the path and the moment it
 * was confirmed, see Token in types.ts. Nothing is sent while it walks.
 */

/** Milliseconds per cell walked: steady, so the table can follow it on the big screen. */
const stepTime = 380;
/** Even a one cell step takes this long, so it never looks like a jump. */
const shortest = 450;
/** How long a token takes to get up to speed, and to slow down before it stops. */
const rampTime = 250;
/** How long a token takes to rise as it sets off, and to settle as it arrives. */
const liftTime = 250;

export interface Walk
{
    points: Point[];
    start: number;
    duration: number;
}

/**
 * Cuts every corner of a path once, keeping its two ends, so a walk across a grid curves round
 * its turns instead of zigzagging from cell centre to cell centre. The curve stays within a
 * quarter of a step of the path drawn.
 */
function rounded(points: Point[]): Point[]
{
    if (points.length < 3)
        return points;

    const curve = [points[0]];

    for (let index = 0; index < points.length - 1; index++)
    {
        if (index > 0)
            curve.push(lerp(points[index], points[index + 1], 0.25));

        if (index < points.length - 2)
            curve.push(lerp(points[index], points[index + 1], 0.75));

    }

    curve.push(points[points.length - 1]);

    return curve;
}

export function startWalk(points: Point[], start: number, cellSize: number): Walk
{
    let length = 0;

    for (let index = 1; index < points.length; index++)
        length += distance(points[index - 1], points[index]);

    const steps = length / cellSize;

    return { points: rounded(points), start, duration: Math.max(shortest, steps * stepTime) };
}

/**
 * How far along the walk a token is, 0 to 1, after some milliseconds of it: speeding up gently
 * for rampTime, walking at an even pace, and slowing down as gently before it stops. A short
 * step that never reaches full pace speeds up for one half and slows down for the other.
 */
function progress(elapsed: number, duration: number): number
{
    const ramp = Math.min(rampTime, duration / 2);
    const t = Math.min(duration, Math.max(0, elapsed));
    // The pace that covers the whole walk in time, given the slower ends.
    const pace = 1 / (duration - ramp);

    if (t < ramp)
        return (pace * t * t) / (2 * ramp);

    if (t <= duration - ramp)
        return pace * (t - ramp / 2);

    return 1 - (pace * (duration - t) ** 2) / (2 * ramp);
}

/**
 * Where a walking token is at a moment, how high it is lifted off the map, 0 to 1, and whether
 * the walk is over. It rises as it sets off, stays up as it walks and settles as it arrives, like a
 * piece picked up and put down, rather than hopping on every cell.
 */
export function walkAt(walk: Walk, time: number): { point: Point; lift: number; done: boolean }
{
    const along = progress(time - walk.start, walk.duration);
    const { points } = walk;
    let left = 0;

    for (let index = 1; index < points.length; index++)
        left += distance(points[index - 1], points[index]);

    left *= along;

    let point = points[points.length - 1];

    for (let index = 1; index < points.length; index++)
    {
        const stretch = distance(points[index - 1], points[index]);

        if (left <= stretch)
        {
            point = lerp(points[index - 1], points[index], stretch === 0 ? 1 : left / stretch);
            break;
        }

        left -= stretch;
    }

    const elapsed = time - walk.start;
    const up = Math.min(1, Math.max(0, Math.min(elapsed, walk.duration - elapsed) / liftTime));

    return { point, lift: (1 - Math.cos(Math.PI * up)) / 2, done: elapsed >= walk.duration };
}
