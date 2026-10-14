import type { CreatureSize, Grid, Point, Scenario, Token } from '../types';

import { toWorld, type Camera } from './camera.ts';
import { door as doorColour, faded, ground, highlight, ink } from './colours.ts';
import { drawFog, type FogLayers, type FogLook } from './fog.ts';
import type { Area } from './geometry.ts';
import { cellAt, cellCenter, cellCorners, hexRadius } from './grid.ts';
import { cellsAcross } from './size.ts';

/** Around the map, darker than any floor, so the edge of the map reads. */
const outside = '#121113';
/** The floor of a map without a picture, like the demo. */
const floor = '#3a3530';

/** The canvas in CSS pixels, and how many device pixels each one has. */
export interface Viewport
{
    width: number;
    height: number;
    dpr: number;
}

/** A token as it shows mid walk: lift is how high it is off the map, 0 to 1, see map/walk.ts. */
export type Lifted = Token & { lift?: number };

/** Everything one frame shows. */
export interface Scene
{
    scenario: Scenario;
    /** The background picture once it has loaded, null before that or without one. */
    background: CanvasImageSource | null;
    /** A prop's picture once it has loaded, null before that. */
    picture: (src: string) => CanvasImageSource | null;
    /** alpha is how far a token has faded in, 0 to 1, see fadeTokens in map/view.ts. */
    tokens: (Lifted & { alpha?: number })[];
    /** Edit mode: walls and the spawn point show. */
    editing: boolean;
    /** On a phone, the player's own token, which gets a pulsing ring. */
    own: string | null;
    /** When the own token last came to rest, on the clock frames are drawn with. Its ring waits a
     * moment after that, so it never starts the instant a walk ends. */
    ownRestedAt: number;
    /** False for people who reduce motion: the ring around the own token stands still. */
    motion: boolean;
    /** Null when the fog is off, like in edit mode. */
    fog: FogLayers | null;
    fogLook: FogLook;
    /** Milliseconds, drives the drifting smoke. */
    time: number;
    /** Drawn in world pixels just before the tokens: the path one is about to walk, under them. */
    beneath?: () => void;
}

/** A token's radius, 60 percent across the cells it covers, so the grid shows around it. */
export function tokenRadius(grid: Grid, size: CreatureSize = 'medium'): number
{
    return grid.size * 0.3 * cellsAcross(size);
}

/**
 * A path through the middle of every cell walked, with a dot on each step, the way a token is
 * about to go or is going. Sizes are in screen pixels, so it reads the same at any zoom.
 */
export function drawRoute(ctx: CanvasRenderingContext2D, points: Point[], zoom: number, colour: string)
{
    if (points.length < 2)
        return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (const point of points.slice(1))
        ctx.lineTo(point.x, point.y);

    ctx.strokeStyle = colour;
    ctx.lineWidth = 4 / zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    for (const point of points.slice(1))
    {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
    }
}

/**
 * The step a path cannot take, from its end to the finger in ground nobody has seen: dashed and
 * faint, with a label saying why. A straight line that ignores walls, so it gives none away.
 */
export function drawUnknownStep(ctx: CanvasRenderingContext2D, from: Point, to: Point, zoom: number)
{
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.setLineDash([8 / zoom, 8 / zoom]);
    ctx.strokeStyle = faded(ink, 0.6);
    ctx.lineWidth = 3 / zoom;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
    drawPill(ctx, 'Unknown', to, zoom, ground);
}

/**
 * A ping, progress 0 to 1 through its life: a dot, and three rings spreading from it one after
 * another and fading, the same size on screen at any zoom. With motion reduced, one still ring
 * fades out instead. In the player's colour, or the app's own for the GM.
 */
export function drawPing(ctx: CanvasRenderingContext2D, at: Point & { color?: string }, progress: number, zoom: number, motion: boolean)
{
    const colour = at.color ?? highlight;
    const fade = 1 - progress;
    const rings = motion ? [0, 0.2, 0.4].map((delay) => (progress - delay) / 0.6) : [0.5];

    ctx.lineWidth = 3 / zoom;

    for (const ring of rings.filter((step) => step > 0 && step < 1))
    {
        ctx.beginPath();
        ctx.arc(at.x, at.y, (8 + ring * 52) / zoom, 0, Math.PI * 2);
        ctx.strokeStyle = faded(colour, (motion ? 1 - ring : 1) * fade);
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(at.x, at.y, 6 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = faded(colour, fade);
    ctx.fill();
}

/** A small rounded label, such as the feet a path costs, the same size at any zoom. */
export function drawPill(
    ctx: CanvasRenderingContext2D,
    text: string,
    at: Point,
    zoom: number,
    colour: string,
)
{
    const fontSize = 14 / zoom;
    const height = 26 / zoom;

    ctx.font = `600 ${fontSize}px 'JetBrains Mono Variable', ui-monospace, monospace`;

    const width = ctx.measureText(text).width + 20 / zoom;
    // Above and to the right of the point, so a finger on a phone does not cover it.
    const left = at.x + 14 / zoom;
    const top = at.y - height - 14 / zoom;

    // The look of the page's tooltips and messages, see .ttrpg-tip in styles/ttrpg.css.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, 8 / zoom);
    ctx.shadowColor = 'rgb(0 0 0 / 0.5)';
    ctx.shadowBlur = 16 / zoom;
    ctx.shadowOffsetY = 6 / zoom;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = faded(ink, 0.2);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + width / 2, top + height / 2 + 1 / zoom);
}

function drawSquareGrid(ctx: CanvasRenderingContext2D, grid: Grid, area: Area)
{
    const { size, offsetX, offsetY } = grid;

    ctx.beginPath();

    for (let x = offsetX + Math.ceil((area.left - offsetX) / size) * size; x <= area.right; x += size)
    {
        ctx.moveTo(x, area.top);
        ctx.lineTo(x, area.bottom);
    }

    for (let y = offsetY + Math.ceil((area.top - offsetY) / size) * size; y <= area.bottom; y += size)
    {
        ctx.moveTo(area.left, y);
        ctx.lineTo(area.right, y);
    }

    ctx.stroke();
}

/**
 * Outlines every hex that shows. The cells under the area's corners bound the q and r to try;
 * in axial coordinates the area is a slanted shape, so that range holds a few extra hexes,
 * which are skipped by their centre.
 */
function drawHexGrid(ctx: CanvasRenderingContext2D, grid: Grid, area: Area)
{
    const corners = [
        cellAt(grid, { x: area.left, y: area.top }),
        cellAt(grid, { x: area.right, y: area.top }),
        cellAt(grid, { x: area.left, y: area.bottom }),
        cellAt(grid, { x: area.right, y: area.bottom }),
    ];
    const qs = corners.map((cell) => cell.q);
    const rs = corners.map((cell) => cell.r);
    const radius = hexRadius(grid);

    ctx.beginPath();

    for (let q = Math.min(...qs) - 1; q <= Math.max(...qs) + 1; q++)
    {
        for (let r = Math.min(...rs) - 1; r <= Math.max(...rs) + 1; r++)
        {
            const center = cellCenter(grid, { q, r });

            if (
                center.x < area.left - radius ||
                center.x > area.right + radius ||
                center.y < area.top - radius ||
                center.y > area.bottom + radius
            )
                continue;

            const [first, ...rest] = cellCorners(grid, { q, r });

            ctx.moveTo(first.x, first.y);

            for (const corner of rest)
                ctx.lineTo(corner.x, corner.y);

            ctx.closePath();
        }
    }

    ctx.stroke();
}

/**
 * A round token with a ring in its colour, showing its picture, or its initial while it has none
 * or it is still loading. The shadow lifts it off the map.
 */
function drawToken(
    ctx: CanvasRenderingContext2D,
    token: Lifted,
    base: number,
    avatar: CanvasImageSource | null,
)
{
    // A walking token grows a touch and its shadow drops, as if picked up off the map.
    const lift = token.lift ?? 0;
    const radius = base * (1 + lift * 0.06);

    ctx.save();
    ctx.shadowColor = 'rgb(0 0 0 / 0.5)';
    ctx.shadowBlur = radius * (0.4 + lift * 0.3);
    ctx.shadowOffsetY = radius * (0.1 + lift * 0.15);
    ctx.beginPath();
    ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = token.color;
    ctx.fill();
    ctx.restore();

    // The ring is a frame around the picture rather than a line over its edge, lit from above.
    const inner = radius * 0.82;
    const light = ctx.createLinearGradient(token.x, token.y - radius, token.x, token.y + radius);

    light.addColorStop(0, 'rgb(255 255 255 / 0.35)');
    light.addColorStop(0.5, 'rgb(255 255 255 / 0)');
    light.addColorStop(1, 'rgb(0 0 0 / 0.3)');
    ctx.fillStyle = light;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(token.x, token.y, inner, 0, Math.PI * 2);
    ctx.fillStyle = ground;
    ctx.fill();

    if (avatar)
    {
        ctx.save();
        ctx.clip();
        ctx.drawImage(avatar, token.x - inner, token.y - inner, inner * 2, inner * 2);
        ctx.restore();
    }

    // Hairlines inside and outside the ring, so it reads on a light map and the picture sits in it.
    ctx.lineWidth = radius * 0.04;
    ctx.strokeStyle = 'rgb(0 0 0 / 0.45)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(token.x, token.y, radius - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();

    if (avatar)
        return;

    ctx.fillStyle = ink;
    ctx.font = `600 ${inner * 0.9}px 'Onest Variable', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(token.name.slice(0, 1).toUpperCase(), token.x, token.y + inner * 0.05);
}

/** How long the own token stands still before its ring first shows, how long one pulse lasts, and
 * how often one starts. */
const pulseDelay = 1000;
const pulseTime = 2400;
const pulseEvery = 4000;

/**
 * A soft ring in the token's colour around a phone's own token, so the player finds themselves at
 * a glance. A moment after the token comes to rest it fades in, drifts out and fades away, then
 * rests before the next, every four seconds; it stays put without motion. rested is how long the
 * token has stood still.
 */
function drawPulse(ctx: CanvasRenderingContext2D, token: Token, base: number, rested: number, motion: boolean)
{
    const cycle = (rested - pulseDelay) % pulseEvery;

    if (motion && (rested < pulseDelay || cycle > pulseTime))
        return;

    const phase = motion ? cycle / pulseTime : 0.5;
    // Eased out, so it leaves the token quickly and settles as it fades.
    const spread = 1 - (1 - phase) ** 2;

    ctx.save();
    ctx.globalAlpha *= 0.45 * Math.sin(Math.PI * phase);
    ctx.beginPath();
    ctx.arc(token.x, token.y, base * (1.1 + spread * 0.4), 0, Math.PI * 2);
    ctx.lineWidth = base * 0.08;
    ctx.strokeStyle = token.color;
    ctx.stroke();
    ctx.restore();
}

/** Where players appear: a dashed ring with a dot, in the accent colour. */
function drawSpawn(ctx: CanvasRenderingContext2D, at: Point, radius: number)
{
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.setLineDash([radius * 0.35, radius * 0.25]);
    ctx.strokeStyle = highlight;
    ctx.lineWidth = radius * 0.12;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = highlight;
    ctx.fill();
}

/**
 * Draws one frame: the background or a plain floor, the grid, the walls, the tokens and the fog.
 * Everything is drawn in world pixels under one transform, and only the part of the grid on
 * screen is drawn, which keeps a big map cheap when zoomed in.
 */
export function render(
    ctx: CanvasRenderingContext2D,
    { scenario, background, picture, tokens, editing, own, ownRestedAt, motion, fog, fogLook, time, beneath }: Scene,
    camera: Camera,
    viewport: Viewport,
)
{
    const { width, height, grid } = scenario;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = outside;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const scale = viewport.dpr * camera.zoom;

    ctx.setTransform(scale, 0, 0, scale, viewport.dpr * camera.x, viewport.dpr * camera.y);

    if (background)
        ctx.drawImage(background, 0, 0, width, height);
    else
    {
        ctx.fillStyle = floor;
        ctx.fillRect(0, 0, width, height);
    }

    // The part of the map on screen.
    const topLeft: Point = toWorld(camera, { x: 0, y: 0 });
    const bottomRight: Point = toWorld(camera, { x: viewport.width, y: viewport.height });
    const area: Area = {
        left: Math.max(0, topLeft.x),
        top: Math.max(0, topLeft.y),
        right: Math.min(width, bottomRight.x),
        bottom: Math.min(height, bottomRight.y),
    };

    if (grid.visible && grid.type !== 'none' && area.left < area.right && area.top < area.bottom)
    {
        ctx.save();
        // Hexes along the edge stick out of the map otherwise.
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.clip();
        ctx.strokeStyle = grid.color;
        ctx.globalAlpha = grid.opacity;
        // One CSS pixel at any zoom.
        ctx.lineWidth = 1 / camera.zoom;

        if (grid.type === 'hex')
            drawHexGrid(ctx, grid, area);
        else
            drawSquareGrid(ctx, grid, area);

        ctx.restore();
    }

    // Props over the grid, so trees and tables are not cut by its lines.
    for (const prop of scenario.props)
    {
        const image = picture(prop.src);

        if (!image)
            continue;

        ctx.save();
        ctx.translate(prop.x, prop.y);
        ctx.rotate(prop.rotation);
        ctx.drawImage(image, -prop.width / 2, -prop.height / 2, prop.width, prop.height);
        ctx.restore();
    }

    ctx.lineCap = 'round';

    // On a picture the walls are part of the art, so their lines only show while editing. A
    // plain floor, like the demo, needs them to show anything at all. Walls in one stroke, then
    // doors in their own colour, dashed while open.
    const kinds = background && !editing ? [] : (['wall', 'closed', 'open'] as const);

    for (const kind of kinds)
    {
        ctx.beginPath();

        for (const wall of scenario.walls)
        {
            const wallKind = wall.door ? (wall.door.open ? 'open' : 'closed') : 'wall';

            if (wallKind !== kind)
                continue;

            ctx.moveTo(wall.x1, wall.y1);
            ctx.lineTo(wall.x2, wall.y2);
        }

        ctx.strokeStyle = kind === 'wall' ? ink : doorColour;
        ctx.lineWidth = (kind === 'wall' ? 3 : 5) / camera.zoom;
        ctx.setLineDash(kind === 'open' ? [6 / camera.zoom, 6 / camera.zoom] : []);
        ctx.stroke();
    }

    ctx.setLineDash([]);

    if (editing)
        drawSpawn(ctx, scenario.spawn, tokenRadius(grid));

    beneath?.();

    for (const token of tokens)
    {
        ctx.globalAlpha = token.alpha ?? 1;

        // Not while it walks: the lift and the trail of fog say enough, and a ring would chase it.
        if (token.id === own && token.lift === undefined)
            drawPulse(ctx, token, tokenRadius(grid, token.size), time - ownRestedAt, motion);

        drawToken(ctx, token, tokenRadius(grid, token.size), token.avatar ? picture(token.avatar) : null);
    }

    ctx.globalAlpha = 1;

    if (fog)
        drawFog(ctx, fog, scenario, time, fogLook);

}
