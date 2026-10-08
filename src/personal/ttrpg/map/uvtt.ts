import type { Point, Scenario, Wall } from '../types';

/*
 * Universal VTT files, the .dd2vtt that Dungeondraft and Dungeon Alchemist export: one JSON file
 * with the map picture, its grid and its walls. Positions in the file are in grid cells from the
 * map's origin; a scenario wants world pixels, so everything is multiplied by pixels_per_grid.
 * The file comes from whoever drops it, so its shape is checked before anything is read.
 */

interface UvttPoint
{
    x: number;
    y: number;
}

interface UvttPortal
{
    bounds: UvttPoint[];
    closed: boolean;
}

interface UvttFile
{
    resolution: { map_origin: UvttPoint; map_size: UvttPoint; pixels_per_grid: number };
    line_of_sight?: UvttPoint[][];
    objects_line_of_sight?: UvttPoint[][];
    portals?: UvttPortal[];
    image: string;
}

function isPoint(value: unknown): value is UvttPoint
{
    return (
        typeof value === 'object' &&
        value !== null &&
        Number.isFinite((value as UvttPoint).x) &&
        Number.isFinite((value as UvttPoint).y)
    );
}

function isLines(value: unknown): value is UvttPoint[][]
{
    return (
        value === undefined ||
        (Array.isArray(value) && value.every((line) => Array.isArray(line) && line.every(isPoint)))
    );
}

function isUvtt(value: unknown): value is UvttFile
{
    if (typeof value !== 'object' || value === null)
        return false;

    const file = value as UvttFile;
    const resolution = file.resolution as UvttFile['resolution'] | undefined;
    const portals = file.portals as unknown;

    return (
        typeof resolution === 'object' &&
        resolution !== null &&
        isPoint(resolution.map_origin) &&
        isPoint(resolution.map_size) &&
        Number.isFinite(resolution.pixels_per_grid) &&
        resolution.pixels_per_grid > 0 &&
        typeof file.image === 'string' &&
        isLines(file.line_of_sight) &&
        isLines(file.objects_line_of_sight) &&
        (portals === undefined ||
            (Array.isArray(portals) &&
                portals.every(
                    (portal: UvttPortal) =>
                        Array.isArray(portal.bounds) &&
                        portal.bounds.length >= 2 &&
                        portal.bounds.every(isPoint),
                )))
    );
}

/** The picture's type from its first bytes, since the file does not say. PNG unless known. */
function pictureType(base64: string): string
{
    if (base64.startsWith('/9j/'))
        return 'image/jpeg';

    if (base64.startsWith('UklGR'))
        return 'image/webp';

    return 'image/png';
}

/**
 * Turns the text of a .dd2vtt file into a scenario: the picture as a data address, a square grid
 * lined up with it, a wall for every stretch of every line of sight, and doors from the portals.
 * Closed doors block sight and movement, open ones block neither. Throws an Error with a message
 * fit to show when the file is not a Universal VTT map.
 */
export function scenarioFromUvtt(text: string, id: string, name: string): Scenario
{
    let parsed: unknown;

    try
    {
        parsed = JSON.parse(text);
    }
    catch
    {
        throw new Error('That file is not a Universal VTT map: it is not JSON.');
    }

    if (!isUvtt(parsed))
        throw new Error('That file is not a Universal VTT map, its grid, picture or walls are missing.');

    const { map_origin: origin, map_size: size, pixels_per_grid: cell } = parsed.resolution;
    const toWorld = (point: UvttPoint): Point => ({
        x: (point.x - origin.x) * cell,
        y: (point.y - origin.y) * cell,
    });
    const walls: Wall[] = [];

    const addWall = (from: UvttPoint, to: UvttPoint, wall: Partial<Wall> = {}) =>
    {
        const a = toWorld(from);
        const b = toWorld(to);

        // Skips zero-length stretches, which the exporters write where a line doubles back.
        if (a.x === b.x && a.y === b.y)
            return;

        walls.push({
            id: `wall-${walls.length}`,
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
            blocksSight: true,
            blocksMove: true,
            ...wall,
        });
    };

    for (const line of [...(parsed.line_of_sight ?? []), ...(parsed.objects_line_of_sight ?? [])])
    {
        for (let index = 1; index < line.length; index++)
            addWall(line[index - 1], line[index]);

    }

    for (const portal of parsed.portals ?? [])
    {
        const closed = portal.closed !== false;

        addWall(portal.bounds[0], portal.bounds[portal.bounds.length - 1], {
            blocksSight: closed,
            blocksMove: closed,
            door: { open: !closed },
        });
    }

    const width = size.x * cell;
    const height = size.y * cell;

    return {
        id,
        name,
        width,
        height,
        background: `data:${pictureType(parsed.image)};base64,${parsed.image}`,
        grid: {
            type: 'square',
            hexOrientation: 'pointy',
            size: cell,
            offsetX: 0,
            offsetY: 0,
            feetPerCell: 5,
            color: '#000000',
            opacity: 0.25,
            visible: true,
        },
        props: [],
        walls,
        // The middle of the map until the editor lets the game master place it, in phase 2.
        spawn: { x: width / 2, y: height / 2 },
    };
}
