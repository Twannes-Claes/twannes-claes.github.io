import type { FogSettings, Point, Scenario, Wall } from '../types';

import type { Area } from './geometry.ts';
import { inSight, insidePolygon, visibilityPolygon, type Segment } from './visibility.ts';

/*
 * The fog of war, see PLAN.md. Never seen is a smoky shadow, seen before is dimmed, seen now is
 * clear with a light haze far away. The fog is painted in world space on its own small canvas,
 * only when what is seen changes, so panning and zooming just draw that canvas again, stretched
 * and smoothed. The smoke drifts on top every frame, cut to the fog's shape.
 */

/**
 * Fog canvas pixels per grid cell. The fog is blurred over half a cell anyway, so more would
 * look the same and only cost time: the blur is most of the work, and at 2048 pixels across it
 * took about 100 ms, too slow to redo while a token walks.
 */
const fogCellPixels = 24;
/** And never more than this across, for a map with tiny cells. */
const maxFogSide = 2048;
/** Never seen. Opaque, so nothing of the map shows through, the smoke gives it depth. */
const shadow = '#0c0e13';
/** Cells around a token that stay fully clear before the haze starts. */
const clearCells = 6;
/** The smoke tile's side in pixels. */
const tileSize = 256;

/**
 * The fog as it looks until the game master changes it, see FogSettings.
 *
 * - fade: newly lit areas fade rather than pop, and a walking token's fog, redrawn every quarter
 *   cell, keeps chasing the newest one, so it trails the token and thins out like fog clearing.
 * - softness: a player sees from a small lamp rather than a point, their middle and four points
 *   around it, and a light blur smooths the steps between those views, see lampOf. Each view stops
 *   exactly at walls, so light ends crisply there, while past a wall's corner the views reach a
 *   little apart and the shadow fades, wider further away, like a real one.
 * - memory: how much of the shadow seen-before areas lose, so they show dimmed.
 */
export const defaultFogSettings: FogSettings = { fade: 600, softness: 0.5, memory: 0.55, haze: 0.25, smoke: 1 };

/** How far the lamp's points stand from the middle, and how much blur smooths them, in cells. */
function lampOf({ softness }: FogSettings): { spread: number; blur: number }
{
    return { spread: softness * 0.4, blur: softness * 0.4 };
}

/** What the party has seen, one flag per sample, two samples per grid cell across. */
export interface Explored
{
    columns: number;
    rows: number;
    /** Width of one sample in world pixels. */
    sample: number;
    seen: Uint8Array;
}

/** The canvases the fog is drawn with, sized for one scenario. */
export interface FogLayers
{
    /** World pixels to fog canvas pixels. */
    scale: number;
    fog: HTMLCanvasElement;
    /** The fog before the last change, blended out while the new one blends in. */
    previous: HTMLCanvasElement;
    /** The two blended, while a change fades in. */
    blend: HTMLCanvasElement;
    smoke: HTMLCanvasElement;
    /** The explored flags as pixels, one per sample, stretched and blurred onto the fog. */
    memory: HTMLCanvasElement;
    /**
     * The same as explored, drawn exactly: everything this screen lit, soft along shadows and
     * crisp at walls, see drawSight. The blurred memory is cut to it, so seen before never shows
     * past a wall. What only came as samples, from the server, is filled in as their squares.
     */
    shape: HTMLCanvasElement;
    /** The blurred memory cut to the shape, put together for each change of the fog. */
    remembered: HTMLCanvasElement;
    /** What every player sees now, soft, and one player's alone while it is drawn, see drawSight. */
    light: HTMLCanvasElement;
    sight: HTMLCanvasElement;
    pattern: CanvasPattern | null;
    /** When the fog last changed, on the clock frames are drawn with. */
    changedAt: number;
    /** Whether the last frame showed blend, halfway through a change, rather than fog itself. */
    blended: boolean;
}

/** How a frame shows the fog. */
export interface FogLook
{
    /** Blend changes in over settings.fade, off for people who reduce motion. */
    fade: boolean;
    /** 1 normally; lower while the game master peeks through it. */
    opacity: number;
    settings: FogSettings;
}

/** One token's sight. */
export interface Viewer
{
    origin: Point;
    polygon: Point[];
}

export function createExplored(scenario: Scenario): Explored
{
    const sample = scenario.grid.size / 2;
    const columns = Math.ceil(scenario.width / sample);
    const rows = Math.ceil(scenario.height / sample);

    return { columns, rows, sample, seen: new Uint8Array(columns * rows) };
}

/** Whether the party has seen a point, by the sample it falls in. Off the map counts as unseen. */
export function wasSeen({ columns, rows, sample, seen }: Explored, { x, y }: Point): boolean
{
    const column = Math.floor(x / sample);
    const row = Math.floor(y / sample);

    return column >= 0 && column < columns && row >= 0 && row < rows && seen[row * columns + column] === 1;
}

/** Marks every sample whose centre lies in the polygon as seen. True when any was new. */
export function markSeen(explored: Explored, polygon: Point[]): boolean
{
    const { columns, rows, sample, seen } = explored;
    const xs = polygon.map((point) => point.x);
    const ys = polygon.map((point) => point.y);
    const firstColumn = Math.max(0, Math.floor(Math.min(...xs) / sample));
    const lastColumn = Math.min(columns - 1, Math.floor(Math.max(...xs) / sample));
    const firstRow = Math.max(0, Math.floor(Math.min(...ys) / sample));
    const lastRow = Math.min(rows - 1, Math.floor(Math.max(...ys) / sample));
    let changed = false;

    for (let row = firstRow; row <= lastRow; row++)
    {
        for (let column = firstColumn; column <= lastColumn; column++)
        {
            const index = row * columns + column;
            const center = { x: (column + 0.5) * sample, y: (row + 0.5) * sample };

            if (seen[index] === 0 && insidePolygon(center, polygon))
            {
                seen[index] = 1;
                changed = true;
            }
        }
    }

    return changed;
}

/** Marks every sample whose centre lies in a box as seen, for the game master's Reveal area. */
export function markArea(
    explored: Explored,
    area: Area,
)
{
    const { columns, rows, sample, seen } = explored;
    // A sample counts once the box reaches its centre, the same rule markSeen uses.
    const firstColumn = Math.max(0, Math.ceil(area.left / sample - 0.5));
    const lastColumn = Math.min(columns - 1, Math.floor(area.right / sample - 0.5));
    const firstRow = Math.max(0, Math.ceil(area.top / sample - 0.5));
    const lastRow = Math.min(rows - 1, Math.floor(area.bottom / sample - 0.5));

    for (let row = firstRow; row <= lastRow; row++)
        seen.fill(1, row * columns + firstColumn, row * columns + lastColumn + 1);

}

/** Area is world pixels, like markArea's. */
function shapeContext(layers: FogLayers): CanvasRenderingContext2D
{
    const ctx = context(layers.shape);

    ctx.setTransform(layers.scale, 0, 0, layers.scale, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.fillStyle = '#000';

    return ctx;
}

/** The part of a polygon on the same side of a wall's line as a point. */
function keepSide(polygon: Point[], wall: Wall, point: Point): Point[]
{
    const side = (at: Point) => (wall.x2 - wall.x1) * (at.y - wall.y1) - (wall.y2 - wall.y1) * (at.x - wall.x1);
    const keep = Math.sign(side(point));

    if (keep === 0)
        return polygon;

    const kept: Point[] = [];

    polygon.forEach((current, index) =>
    {
        const next = polygon[(index + 1) % polygon.length];
        const a = side(current) * keep;
        const b = side(next) * keep;

        if (a >= 0)
            kept.push(current);

        if (a >= 0 !== b >= 0)
        {
            const t = a / (a - b);

            kept.push({ x: current.x + (next.x - current.x) * t, y: current.y + (next.y - current.y) * t });
        }
    });

    return kept;
}

/** Adds the game master's Reveal area box to the sharp shape. */
export function shapeArea(layers: FogLayers, area: Area)
{
    shapeContext(layers).fillRect(area.left, area.top, area.right - area.left, area.bottom - area.top);
}

/**
 * Adds samples, by index: what was seen on another screen, or here before a reload, which only
 * comes as samples. Softened like the light, but a square near a wall is cut to the side of that
 * wall its middle is on, so seen before never reaches past a wall here either.
 * ponytail: every square is checked against every wall, once per reload. Bucket the walls by
 * cell if a huge imported map ever opens slowly.
 */
export function shapeSamples(
    layers: FogLayers,
    scenario: Scenario,
    explored: Explored,
    indices: Iterable<number>,
    settings: FogSettings,
)
{
    const ctx = shapeContext(layers);
    const { columns, sample } = explored;
    const soft = scenario.grid.size * lampOf(settings).blur;
    // How far from its middle a softened square reaches.
    const reach = sample / 2 + soft * 2;
    const walls = scenario.walls.filter((wall) => wall.blocksSight);
    const byWalls: { x: number; y: number; middle: Point; close: Wall[] }[] = [];

    ctx.filter = `blur(${soft * layers.scale}px)`;
    ctx.beginPath();

    for (const index of indices)
    {
        const x = (index % columns) * sample;
        const y = Math.floor(index / columns) * sample;
        const middle = { x: x + sample / 2, y: y + sample / 2 };
        const close = walls.filter(
            (wall) =>
                Math.max(wall.x1, wall.x2) >= middle.x - reach &&
                Math.min(wall.x1, wall.x2) <= middle.x + reach &&
                Math.max(wall.y1, wall.y2) >= middle.y - reach &&
                Math.min(wall.y1, wall.y2) <= middle.y + reach,
        );

        // Squares in the open go in one path, and one fill.
        if (close.length === 0)
            ctx.rect(x, y, sample, sample);
        else
            byWalls.push({ x, y, middle, close });

    }

    ctx.fill();

    for (const { x, y, middle, close } of byWalls)
    {
        const room = close.reduce((area, wall) => keepSide(area, wall, middle), [
            { x: middle.x - reach, y: middle.y - reach },
            { x: middle.x + reach, y: middle.y - reach },
            { x: middle.x + reach, y: middle.y + reach },
            { x: middle.x - reach, y: middle.y + reach },
        ]);

        if (room.length < 3)
            continue;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(room[0].x, room[0].y);

        for (const point of room.slice(1))
            ctx.lineTo(point.x, point.y);

        ctx.closePath();
        ctx.clip();
        ctx.fillRect(x, y, sample, sample);
        ctx.restore();
    }

    ctx.filter = 'none';
}

/** Forgets the sharp shape, when the fog is reset. */
export function clearShape(layers: FogLayers)
{
    const ctx = context(layers.shape);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layers.shape.width, layers.shape.height);
}

function canvas(width: number, height: number): HTMLCanvasElement
{
    const created = document.createElement('canvas');

    created.width = width;
    created.height = height;

    return created;
}

/** The 2D context of a canvas this file created, which always has one. */
function context(target: HTMLCanvasElement): CanvasRenderingContext2D
{
    return target.getContext('2d') as CanvasRenderingContext2D;
}

export function createFogLayers(scenario: Scenario, explored: Explored, settings: FogSettings): FogLayers
{
    const scale = Math.min(
        1,
        fogCellPixels / scenario.grid.size,
        maxFogSide / Math.max(scenario.width, scenario.height),
    );
    const width = Math.ceil(scenario.width * scale);
    const height = Math.ceil(scenario.height * scale);

    const layers: FogLayers = {
        scale,
        fog: canvas(width, height),
        previous: canvas(width, height),
        blend: canvas(width, height),
        smoke: canvas(width, height),
        memory: canvas(explored.columns, explored.rows),
        shape: canvas(width, height),
        remembered: canvas(width, height),
        light: canvas(width, height),
        sight: canvas(width, height),
        pattern: null,
        changedAt: -Infinity,
        blended: false,
    };

    // What was seen before these layers existed, like the server's fog arriving first, only
    // has its samples to go by.
    const seen: number[] = [];

    explored.seen.forEach((flag, index) =>
    {
        if (flag)
            seen.push(index);

    });
    shapeSamples(layers, scenario, explored, seen, settings);

    return layers;
}

/** Repaints the fog from what has been seen and what the tokens see now. */
export function composeFog(
    layers: FogLayers,
    scenario: Scenario,
    explored: Explored,
    viewers: Viewer[],
    segments: Segment[],
    settings: FogSettings,
)
{
    const { scale, fog, memory, previous } = layers;
    const ctx = context(fog);
    // Half a cell of soft edge between seen and unseen.
    const blur = `blur(${scenario.grid.size * 0.5 * scale}px)`;
    const previousCtx = context(previous);

    // What shows right now, kept to blend from, see drawFog. A walking token changes the fog
    // faster than a change blends in, so that is often a blend, not the last fog: starting from
    // the last fog instead made the fog jump ahead at every step.
    previousCtx.globalCompositeOperation = 'copy';
    previousCtx.drawImage(layers.blended ? layers.blend : fog, 0, 0);
    layers.changedAt = performance.now();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, fog.width, fog.height);

    const memoryCtx = context(memory);
    const pixels = memoryCtx.createImageData(explored.columns, explored.rows);

    explored.seen.forEach((seen, index) =>
    {
        pixels.data[index * 4 + 3] = seen * 255;
    });
    memoryCtx.putImageData(pixels, 0, 0);

    const near = scenario.grid.size * clearCells;
    const far = Math.max(near * 2, scenario.width, scenario.height);
    const lightCtx = context(layers.light);

    lightCtx.setTransform(1, 0, 0, 1, 0, 0);
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.clearRect(0, 0, fog.width, fog.height);

    // Each player's light on its own, then added up.
    for (const viewer of viewers)
    {
        drawSight(layers, scenario, segments, viewer, near, far, settings);
        lightCtx.drawImage(layers.sight, 0, 0);
    }

    // What is lit now is seen from now on, soft along its shadows like the light itself.
    const shapeCtx = context(layers.shape);

    shapeCtx.setTransform(1, 0, 0, 1, 0, 0);
    shapeCtx.globalCompositeOperation = 'source-over';
    shapeCtx.drawImage(layers.light, 0, 0);

    // Seen before: the samples stretched and blurred, then cut to that shape, so the soft edge
    // of the coarse samples never reaches past a wall.
    const rememberedCtx = context(layers.remembered);

    rememberedCtx.setTransform(1, 0, 0, 1, 0, 0);
    rememberedCtx.globalCompositeOperation = 'source-over';
    rememberedCtx.clearRect(0, 0, fog.width, fog.height);
    rememberedCtx.filter = blur;
    rememberedCtx.imageSmoothingEnabled = true;
    rememberedCtx.drawImage(
        memory,
        0,
        0,
        explored.columns * explored.sample * scale,
        explored.rows * explored.sample * scale,
    );
    rememberedCtx.filter = 'none';
    rememberedCtx.globalCompositeOperation = 'destination-in';
    rememberedCtx.drawImage(layers.shape, 0, 0);
    rememberedCtx.globalCompositeOperation = 'source-over';

    // Both cut holes in the shadow rather than paint on it.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = settings.memory;
    ctx.drawImage(layers.remembered, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(layers.light, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
}

/** The same polygon, wound the same way round as every other, so a path of several unites them. */
function clockwise(polygon: Point[]): Point[]
{
    let area = 0;

    polygon.forEach((point, index) =>
    {
        const next = polygon[(index + 1) % polygon.length];

        area += (next.x - point.x) * (next.y + point.y);
    });

    return area > 0 ? polygon : [...polygon].reverse();
}

/**
 * One player's light on layers.sight: what their lamp sees, see lampOf, brightest close by.
 * The views are added up, so where all five reach it is fully lit and where only some do it is
 * partly, the soft edge of a shadow. The light blur that smooths the steps is cut off where the
 * furthest view ends, so it never crosses a wall.
 * ponytail: five sight polygons per player per fog change, each testing every wall against
 * every wall. Fine for the few hundred walls of a hand drawn map; for a huge import, cut the
 * lamp to three points, or sort the walls into a grid in map/visibility.ts.
 */
function drawSight(
    layers: FogLayers,
    scenario: Scenario,
    segments: Segment[],
    { origin, polygon }: Viewer,
    near: number,
    far: number,
    settings: FogSettings,
)
{
    const ctx = context(layers.sight);
    const lamp = lampOf(settings);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.clearRect(0, 0, layers.sight.width, layers.sight.height);

    const spread = scenario.grid.size * lamp.spread;
    // A lamp point past a wall the player stands against would light the other side.
    const around = [0, 1, 2, 3]
        .map((quarter) =>
        {
            const angle = Math.PI / 4 + (quarter * Math.PI) / 2;

            return { x: origin.x + Math.cos(angle) * spread, y: origin.y + Math.sin(angle) * spread };
        })
        .filter((eye) => inSight(scenario.walls, origin, eye));
    const views = [polygon, ...around.map((eye) => visibilityPolygon(eye, segments))]
        .filter((view) => view.length >= 3)
        .map(clockwise);

    if (views.length === 0)
        return;

    const trace = (view: Point[]) =>
    {
        ctx.moveTo(view[0].x, view[0].y);

        for (const point of view.slice(1))
            ctx.lineTo(point.x, point.y);

        ctx.closePath();
    };

    const light = ctx.createRadialGradient(origin.x, origin.y, near, origin.x, origin.y, far);

    light.addColorStop(0, 'rgb(0 0 0 / 1)');
    light.addColorStop(1, `rgb(0 0 0 / ${1 - settings.haze})`);
    ctx.setTransform(layers.scale, 0, 0, layers.scale, 0, 0);
    ctx.save();
    ctx.beginPath();
    views.forEach(trace);
    ctx.clip();
    ctx.filter = lamp.blur > 0 ? `blur(${scenario.grid.size * lamp.blur * layers.scale}px)` : 'none';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 / views.length;
    ctx.fillStyle = light;

    for (const view of views)
    {
        ctx.beginPath();
        trace(view);
        ctx.fill();
    }

    ctx.restore();
}

/** Smooth 0 to 1 noise in a square that tiles, so the smoke repeats without a seam. */
function smokeTile(): HTMLCanvasElement
{
    const size = tileSize;
    const tile = canvas(size, size);
    const ctx = context(tile);
    const pixels = ctx.createImageData(size, size);
    /** Coarse to fine: lattice cells across the tile, and how much each layer adds. */
    const octaves = [
        { cells: 4, weight: 0.55 },
        { cells: 8, weight: 0.3 },
        { cells: 16, weight: 0.15 },
    ].map((octave) => ({
        ...octave,
        values: Array.from({ length: octave.cells * octave.cells }, () => Math.random()),
    }));
    const smooth = (t: number) => t * t * (3 - 2 * t);

    for (let y = 0; y < size; y++)
    {
        for (let x = 0; x < size; x++)
        {
            let noise = 0;

            for (const { cells, weight, values } of octaves)
            {
                const fx = (x / size) * cells;
                const fy = (y / size) * cells;
                const x0 = Math.floor(fx);
                const y0 = Math.floor(fy);
                // Wrapping the lattice at the edge is what makes the tile seamless.
                const x1 = (x0 + 1) % cells;
                const y1 = (y0 + 1) % cells;
                const tx = smooth(fx - x0);
                const ty = smooth(fy - y0);
                const top = values[y0 * cells + x0] * (1 - tx) + values[y0 * cells + x1] * tx;
                const bottom = values[y1 * cells + x0] * (1 - tx) + values[y1 * cells + x1] * tx;

                noise += (top * (1 - ty) + bottom * ty) * weight;
            }

            const index = (y * size + x) * 4;

            pixels.data[index] = 70;
            pixels.data[index + 1] = 78;
            pixels.data[index + 2] = 96;
            pixels.data[index + 3] = Math.round(noise ** 2.2 * 255);
        }
    }

    ctx.putImageData(pixels, 0, 0);

    return tile;
}

let sharedTile: HTMLCanvasElement | null = null;

/**
 * Draws the fog over the map, under the world transform the caller set. Two layers of the smoke
 * tile at different sizes drift in different directions, then are cut to the fog's shape, so
 * the smoke is thick in the shadow, faint where it was seen before and gone where it is lit.
 * Fog and smoke are put together on the small canvas first, so only one picture is stretched
 * over the whole screen each frame: on a 4K screen that stretch is the slow part.
 */
export function drawFog(
    ctx: CanvasRenderingContext2D,
    layers: FogLayers,
    scenario: Scenario,
    time: number,
    look: FogLook,
)
{
    const { smoke, blend, previous } = layers;
    const smokeCtx = context(smoke);
    // Never below 0: a fog redrawn during a frame is stamped a moment after that frame's clock,
    // and the browser ignores an alpha below 0, which drew both fogs whole for one frame.
    const { fade } = look.settings;
    const progress = look.fade && fade > 0 ? Math.min(1, Math.max(0, (time - layers.changedAt) / fade)) : 1;
    let fog = layers.fog;

    // Halfway through a change, the old fog blends out under the new one.
    if (progress < 1)
    {
        const blendCtx = context(blend);

        // Added up rather than laid over each other, so the two shares always make one whole:
        // laid over, a shadow half faded out and half in came out a quarter see-through, and
        // as each fade starts from the last one, see composeFog, that grew until the map showed.
        blendCtx.globalCompositeOperation = 'copy';
        blendCtx.globalAlpha = 1 - progress;
        blendCtx.drawImage(previous, 0, 0);
        blendCtx.globalCompositeOperation = 'lighter';
        blendCtx.globalAlpha = progress;
        blendCtx.drawImage(layers.fog, 0, 0);
        blendCtx.globalCompositeOperation = 'source-over';
        blendCtx.globalAlpha = 1;
        fog = blend;
    }

    layers.blended = progress < 1;

    sharedTile ??= smokeTile();
    layers.pattern ??= smokeCtx.createPattern(sharedTile, 'repeat');

    smokeCtx.setTransform(1, 0, 0, 1, 0, 0);
    smokeCtx.globalCompositeOperation = 'source-over';
    smokeCtx.clearRect(0, 0, smoke.width, smoke.height);

    if (layers.pattern)
    {
        // In cells, so the smoke looks the same whatever the fog canvas's resolution: how wide
        // one tile of smoke is, and how many cells a second it drifts.
        const drift = [
            { across: 11, x: 0.18, y: 0.07, alpha: 0.45 },
            { across: 20, x: -0.12, y: 0.15, alpha: 0.3 },
        ];
        const cell = scenario.grid.size * layers.scale;
        const seconds = time / 1000;

        smokeCtx.fillStyle = layers.pattern;

        for (const layer of drift)
        {
            layers.pattern.setTransform(
                new DOMMatrix()
                    .translate(seconds * layer.x * cell, seconds * layer.y * cell)
                    .scale((layer.across * cell) / tileSize),
            );
            smokeCtx.globalAlpha = layer.alpha * look.settings.smoke;
            smokeCtx.fillRect(0, 0, smoke.width, smoke.height);
        }

        smokeCtx.globalAlpha = 1;
        smokeCtx.globalCompositeOperation = 'destination-in';
        smokeCtx.drawImage(fog, 0, 0);
    }

    // The fog goes under the smoke.
    smokeCtx.globalCompositeOperation = 'destination-over';
    smokeCtx.drawImage(fog, 0, 0);
    smokeCtx.globalCompositeOperation = 'source-over';

    // The browser's plain smoothing: its 'high' setting cost four times as much on a 4K screen
    // and looks no different on fog that is blurred anyway.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.globalAlpha = look.opacity;
    ctx.drawImage(smoke, 0, 0, scenario.width, scenario.height);
    ctx.globalAlpha = 1;
}
