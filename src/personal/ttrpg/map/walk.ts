import type { Point } from '../types';

import { distance, lerp } from './geometry.ts';

/*
 * A token walking its path, played the same on every screen from the path and the moment it
 * was confirmed, see Token in types.ts. Nothing is sent while it walks.
 */

/** Milliseconds per cell walked: brisk, but slow enough to follow on the table screen. */
const stepTime = 220;
/** Even a one cell step takes this long, so it never looks like a jump. */
const shortest = 300;
/** How long a token takes to get up to speed, and to slow down before it stops. */
const rampTime = 200;

export interface Walk
{
    points: Point[];
    start: number;
    duration: number;
    /** The cells walked, for the little bob on each step. */
    steps: number;
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

    return { points: rounded(points), start, duration: Math.max(shortest, steps * stepTime), steps };
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
 * Where a walking token is at a moment, how high it is in its bob, 0 to 1, and whether the walk
 * is over.
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

    return { point, lift: Math.abs(Math.sin(along * walk.steps * Math.PI)), done: time - walk.start >= walk.duration };
}
