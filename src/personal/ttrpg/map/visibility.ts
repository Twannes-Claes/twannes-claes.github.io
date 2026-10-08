import type { Point, Scenario, Wall } from '../types';

import { segmentsTouch } from './geometry.ts';

/** A wall as two points, the shape the sight maths works with. */
export interface Segment
{
    a: Point;
    b: Point;
}

/** How far either side of a wall's end the extra rays go, in radians. */
const glance = 1e-5;

/**
 * The walls that block sight, plus the edge of the map, so every ray hits something and the
 * polygon never runs off to infinity.
 */
export function sightSegments(scenario: Scenario): Segment[]
{
    const { width, height } = scenario;
    const corners = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
    ];
    const edges = corners.map((a, index) => ({ a, b: corners[(index + 1) % 4] }));

    const walls = scenario.walls
        .filter((wall) => wall.blocksSight)
        .map((wall) => ({ a: { x: wall.x1, y: wall.y1 }, b: { x: wall.x2, y: wall.y2 } }));

    return [...walls, ...edges];
}

/** How far along a ray from origin in direction (dx, dy) it meets the segment, or Infinity. */
function rayHit(origin: Point, dx: number, dy: number, { a, b }: Segment): number
{
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denominator = dx * ey - dy * ex;

    // Parallel: the ray runs along the wall or never meets it, and the walls at its ends stop it.
    if (Math.abs(denominator) < 1e-12)
        return Infinity;

    const ox = a.x - origin.x;
    const oy = a.y - origin.y;
    const along = (ox * ey - oy * ex) / denominator;
    const onWall = (ox * dy - oy * dx) / denominator;

    return along >= 0 && onWall >= 0 && onWall <= 1 ? along : Infinity;
}

/**
 * What can be seen from origin: a polygon, found by casting a ray at the end of every wall and a
 * hair either side of it, after Red Blob Games' 2D visibility article. The rays either side
 * slip past a wall's end to whatever lies behind it, which gives the shadow its edge.
 */
export function visibilityPolygon(origin: Point, segments: Segment[]): Point[]
{
    // ponytail: every ray tests every wall, O(walls²). Fine for a few hundred walls; past that,
    // sort the walls into a coarse grid and only test the ones along each ray.
    const angles: number[] = [];
    // Joined walls share their ends, and one set of rays per corner is enough.
    const corners = new Set<string>();

    for (const { a, b } of segments)
    {
        for (const end of [a, b])
        {
            const key = `${end.x},${end.y}`;

            if (corners.has(key))
                continue;

            corners.add(key);

            const angle = Math.atan2(end.y - origin.y, end.x - origin.x);

            angles.push(angle - glance, angle, angle + glance);
        }
    }

    angles.sort((first, second) => first - second);

    const polygon: Point[] = [];

    for (const angle of angles)
    {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let nearest = Infinity;

        for (const segment of segments)
            nearest = Math.min(nearest, rayHit(origin, dx, dy, segment));

        if (nearest !== Infinity)
            polygon.push({ x: origin.x + dx * nearest, y: origin.y + dy * nearest });

    }

    return polygon;
}

/** Whether a point lies inside a polygon, by counting how many edges a ray to the right crosses. */
export function insidePolygon(point: Point, polygon: Point[]): boolean
{
    let inside = false;

    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++)
    {
        const a = polygon[index];
        const b = polygon[previous];

        if (a.y > point.y !== b.y > point.y &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x)
            inside = !inside;

    }

    return inside;
}

/**
 * Whether b can be seen from a: no wall that blocks sight crosses the line between them. The same
 * as b being inside a's visibility polygon, without building it, which is how the server tells
 * which monsters players can see, see convex/sight.ts.
 */
export function inSight(walls: Wall[], a: Point, b: Point): boolean
{
    return !walls.some(
        (wall) => wall.blocksSight && segmentsTouch(a, b, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }),
    );
}
