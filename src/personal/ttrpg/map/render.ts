import type { CreatureSize, Grid, Point, Scenario, Token } from '../types';

import { toWorld, type Camera } from './camera.ts';
import { drawFog, type FogLayers, type FogLook } from './fog.ts';
import { cellAt, cellCenter, cellCorners, hexRadius } from './grid.ts';
import { cellsAcross } from './size.ts';

/** Around the map, darker than any floor, so the edge of the map reads. */
const outside = '#121113';
/** The floor of a map without a picture, like the demo. */
const floor = '#3a3530';
const wallColour = '#fcf8ec';
const doorColour = '#d8a657';
const spawnColour = '#a77ee0';

/** The canvas in CSS pixels, and how many device pixels each one has. */
export interface Viewport
{
    width: number;
    height: number;
    dpr: number;
}

/** Everything one frame shows. */
export interface Scene
{
    scenario: Scenario;
    /** The background picture once it has loaded, null before that or without one. */
    background: CanvasImageSource | null;
    /** A prop's picture once it has loaded, null before that. */
    picture: (src: string) => CanvasImageSource | null;
    /**
     * lift is how high a walking token is in its bob, 0 to 1, see map/walk.ts. alpha is how far a
     * token has faded in, 0 to 1, see fadeTokens in map/view.ts.
     */
    tokens: (Token & { lift?: number; alpha?: number })[];
    /** Edit mode: walls and the spawn point show. */
    editing: boolean;
    /** On a phone, the player's own token, which gets a pulsing ring. */
    own: string | null;
    /** False for people who reduce motion: the ring around the own token stands still. */
    motion: boolean;
    /** Null when the fog is off, like in edit mode. */
    fog: FogLayers | null;
    fogLook: FogLook;
    /** Milliseconds, drives the drifting smoke. */
    time: number;
}

/** A token's radius, a little smaller than the cells it covers. */
export function tokenRadius(grid: Grid, size: CreatureSize = 'medium'): number
{
    return grid.size * 0.4 * cellsAcross(size);
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

    ctx.beginPath();
    ctx.roundRect(left, top, width, height, height / 2);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.fillStyle = '#fcf8ec';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + width / 2, top + height / 2 + 1 / zoom);
}

/** A rectangle of the world, in world pixels. */
interface Area
{
    left: number;
    top: number;
    right: number;
    bottom: number;
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
    token: Token & { lift?: number },
    base: number,
    avatar: CanvasImageSource | null,
)
{
    // A walking token grows a touch and its shadow drops on every step, a small hop.
    const lift = token.lift ?? 0;
    const radius = base * (1 + lift * 0.06);

    ctx.save();
    ctx.shadowColor = 'rgb(0 0 0 / 0.5)';
    ctx.shadowBlur = radius * (0.4 + lift * 0.3);
    ctx.shadowOffsetY = radius * (0.1 + lift * 0.15);
    ctx.beginPath();
    ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1e1d1f';
    ctx.fill();
    ctx.restore();

    if (avatar)
    {
        ctx.save();
        ctx.clip();
        ctx.drawImage(avatar, token.x - radius, token.y - radius, radius * 2, radius * 2);
        ctx.restore();
    }

    ctx.lineWidth = radius * 0.18;
    ctx.strokeStyle = token.color;
    ctx.stroke();

    if (avatar)
        return;

    ctx.fillStyle = '#fcf8ec';
    ctx.font = `600 ${radius * 0.9}px 'Onest Variable', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(token.name.slice(0, 1).toUpperCase(), token.x, token.y + radius * 0.05);
}

/**
 * A soft ring in the token's colour around a phone's own token, so the player finds themselves at
 * a glance. It breathes out and fades every two seconds, or stays put without motion.
 */
function drawPulse(ctx: CanvasRenderingContext2D, token: Token, base: number, time: number, motion: boolean)
{
    const phase = motion ? (time % 2000) / 2000 : 0.3;

    ctx.save();
    ctx.globalAlpha *= 0.8 * (1 - phase);
    ctx.beginPath();
    ctx.arc(token.x, token.y, base * (1.15 + phase * 0.45), 0, Math.PI * 2);
    ctx.lineWidth = base * 0.12;
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
    ctx.strokeStyle = spawnColour;
    ctx.lineWidth = radius * 0.12;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = spawnColour;
    ctx.fill();
}

/**
 * Draws one frame: the background or a plain floor, the grid, the walls, the tokens and the fog.
 * Everything is drawn in world pixels under one transform, and only the part of the grid on
 * screen is drawn, which keeps a big map cheap when zoomed in.
 */
export function render(
    ctx: CanvasRenderingContext2D,
    { scenario, background, picture, tokens, editing, own, motion, fog, fogLook, time }: Scene,
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

        ctx.strokeStyle = kind === 'wall' ? wallColour : doorColour;
        ctx.lineWidth = (kind === 'wall' ? 3 : 5) / camera.zoom;
        ctx.setLineDash(kind === 'open' ? [6 / camera.zoom, 6 / camera.zoom] : []);
        ctx.stroke();
    }

    ctx.setLineDash([]);

    if (editing)
        drawSpawn(ctx, scenario.spawn, tokenRadius(grid));

    for (const token of tokens)
    {
        ctx.globalAlpha = token.alpha ?? 1;

        if (token.id === own)
            drawPulse(ctx, token, tokenRadius(grid, token.size), time, motion);

        drawToken(ctx, token, tokenRadius(grid, token.size), token.avatar ? picture(token.avatar) : null);
    }

    ctx.globalAlpha = 1;

    if (fog)
        drawFog(ctx, fog, scenario, time, fogLook);

}
