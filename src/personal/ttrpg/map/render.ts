import { faEyeSlash, faShieldHalved, faSkull, type IconDefinition } from '@fortawesome/free-solid-svg-icons';

import type { CreatureSize, Decal, Grid, HealthState, Point, Scenario, Token } from '../types';
import { conditionKind, type ConditionKind } from '../content/conditions.ts';

import { toWorld, type Camera } from './camera.ts';
import { accent, blood, bloodDark, danger, door as doorColour, faded, ground, heal, highlight, ink, shield } from './colours.ts';
import { drawFog, type FogLayers, type FogLook } from './fog.ts';
import { distance, type Area } from './geometry.ts';
import { cellAt, cellCenter, cellCorners, hexRadius } from './grid.ts';
import { healthState, stateOf } from './health.ts';
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

/**
 * A drop of blood a badly hurt token left as it walked, see map/view.ts: seed shapes it, and
 * alpha fades it out.
 */
export interface Drop extends Point
{
    radius: number;
    seed: number;
    alpha: number;
}

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
    /**
     * On the ground, under the fog: what killed monsters left, alpha fading them in and out, and
     * the drops of the badly hurt.
     */
    decals?: (Decal & { alpha?: number; scale?: number })[];
    drops?: Drop[];
    /** False when the GM turned off the red and the drips on hurt tokens. The skull stays. */
    wounds?: boolean;
    /** The token whose turn it is in a fight, which gets a glowing ring, see Initiative. */
    turn?: string | null;
}

/**
 * A number from 0 to 1 that a text and a salt always give, so a decal or a drip has the same
 * shape on every screen without anyone sending it. FNV-1a.
 */
function seeded(text: string, salt: number): number
{
    let hash = 2166136261 ^ salt;

    for (const char of text)
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);

    return (hash >>> 0) / 4294967296;
}

/**
 * A pool of blood about a creature's size with splashes around it, shaped by its id: what a killed
 * monster left, or, scale times as wide, the one a downed player lies in.
 */
function drawDecal(ctx: CanvasRenderingContext2D, decal: Decal, grid: Grid, scale = 1)
{
    const radius = tokenRadius(grid, decal.size) * scale;
    const random = (salt: number) => seeded(decal.id, salt);

    // Overlapping circles in one path fill as one shape, so where they overlap is no darker.
    ctx.beginPath();

    for (let index = 0; index < 11; index++)
    {
        const pool = index < 5;
        const angle = random(index) * Math.PI * 2;
        const reach = radius * (pool ? 0.4 * random(index + 20) : 0.85 + 0.45 * random(index + 20));
        const size = radius * (pool ? 0.4 + 0.25 * random(index + 40) : 0.05 + 0.07 * random(index + 40));
        const x = decal.x + Math.cos(angle) * reach;
        const y = decal.y + Math.sin(angle) * reach;

        ctx.moveTo(x + size, y);
        ctx.arc(x, y, size, 0, Math.PI * 2);
    }

    ctx.fillStyle = bloodFill(ctx, decal.x, decal.y, radius * 1.1, 0.8);
    ctx.fill();
}

/** Blood dark where it lies thick at the middle, thinning to red towards reach and past it. */
function bloodFill(ctx: CanvasRenderingContext2D, x: number, y: number, reach: number, alpha: number): CanvasGradient
{
    const fill = ctx.createRadialGradient(x, y, 0, x, y, reach);

    fill.addColorStop(0, faded(bloodDark, alpha));
    fill.addColorStop(1, faded(blood, alpha));

    return fill;
}

/**
 * A drop of blood a walking token left: an uneven blob of three circles close together, and up to
 * three specks scattered round it, never in a row, so a trail reads as blood rather than as
 * footprints. One shape, so where they overlap is no darker.
 */
function drawDrop(ctx: CanvasRenderingContext2D, { x, y, radius, seed, alpha }: Drop)
{
    const random = (salt: number) => seeded(String(seed), salt);
    const specks = Math.floor(random(0) * 4);

    ctx.beginPath();

    for (let index = 0; index < 3 + specks; index++)
    {
        const blob = index < 3;
        const turn = random(index + 10) * Math.PI * 2;
        const reach = radius * (blob ? 0.35 * random(index + 20) : 1.4 + random(index + 20));
        const size = radius * (blob ? 0.6 + 0.3 * random(index + 30) : 0.1 + 0.15 * random(index + 30));
        const partX = x + Math.cos(turn) * reach;
        const partY = y + Math.sin(turn) * reach;

        ctx.moveTo(partX + size, partY);
        ctx.arc(partX, partY, size, 0, Math.PI * 2);
    }

    ctx.fillStyle = bloodFill(ctx, x, y, radius * 1.2, 0.85 * alpha);
    ctx.fill();
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

/** One target's part of an attack or a heal, where it stood, see SharedHit. */
export interface HitEffect extends Point
{
    radius: number;
    /** Death is an attack that brought a monster to 0. */
    kind: 'attack' | 'heal' | 'death';
}

/**
 * An attack or a heal on a token, progress 0 to 1 through its life. An attack flashes red with
 * three claw slashes drawn across it, a death adds a skull rising from it, and a heal is a soft
 * green glow with pluses floating up. With motion reduced, only the flash or the glow, fading.
 */
export function drawHit(ctx: CanvasRenderingContext2D, hit: HitEffect, progress: number, zoom: number, motion: boolean)
{
    const { x, y, radius } = hit;
    const fade = 1 - progress;

    ctx.save();

    if (hit.kind === 'heal')
    {
        const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * (motion ? 1 + progress * 0.6 : 1.3));

        glow.addColorStop(0, faded(heal, 0.6 * fade));
        glow.addColorStop(1, faded(heal, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.6, 0, Math.PI * 2);
        ctx.fill();

        if (motion)
        {
            const arm = 5 / zoom;

            ctx.strokeStyle = heal;
            ctx.lineWidth = 3 / zoom;
            ctx.lineCap = 'round';

            // Each plus starts a little after the one before, and rises as it fades.
            for (const [across, delay] of [[-0.5, 0], [0.15, 0.15], [0.55, 0.3]])
            {
                const step = (progress - delay) / (1 - delay);

                if (step <= 0)
                    continue;

                const px = x + across * radius;
                const py = y + radius * 0.4 - step * radius * 1.4;

                ctx.globalAlpha = 1 - step;
                ctx.beginPath();
                ctx.moveTo(px - arm, py);
                ctx.lineTo(px + arm, py);
                ctx.moveTo(px, py - arm);
                ctx.lineTo(px, py + arm);
                ctx.stroke();
            }
        }

        ctx.restore();

        return;
    }

    ctx.beginPath();
    ctx.arc(x, y, radius * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = faded(danger, 0.4 * fade);
    ctx.fill();

    if (motion)
    {
        ctx.lineCap = 'round';

        // Three slashes, each drawn across in a fifth of the life, a little after the one before.
        for (const [index, offset] of [-0.35, 0, 0.35].entries())
        {
            const drawn = Math.min(1, Math.max(0, (progress - index * 0.08) / 0.2));

            if (drawn === 0)
                continue;

            const from = { x: x - radius * 0.7 + offset * radius, y: y - radius * 0.8 };
            const to = { x: from.x + radius * 0.7 * drawn, y: from.y + radius * 1.6 * drawn };

            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.lineWidth = 6 / zoom;
            ctx.strokeStyle = faded(danger, fade);
            ctx.stroke();
            ctx.lineWidth = 2 / zoom;
            ctx.strokeStyle = faded(ink, fade);
            ctx.stroke();
        }
    }

    if (hit.kind === 'death')
    {
        ctx.fillStyle = faded(ink, fade);
        drawIcon(ctx, faSkull, { x, y: y - (motion ? progress * radius : 0) }, radius);
    }

    ctx.restore();
}

/**
 * A token picked as a target for an attack or a heal: a red ring around it with four ticks, like
 * a sight, the same width on screen at any zoom.
 */
export function drawTarget(ctx: CanvasRenderingContext2D, at: Point, radius: number, zoom: number)
{
    const ring = radius + 6 / zoom;

    ctx.save();
    ctx.strokeStyle = danger;
    ctx.lineWidth = 3 / zoom;
    ctx.beginPath();
    ctx.arc(at.x, at.y, ring, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath();

    for (const angle of [0, 0.5, 1, 1.5])
    {
        const dx = Math.cos(angle * Math.PI);
        const dy = Math.sin(angle * Math.PI);

        ctx.moveTo(at.x + dx * (ring - 4 / zoom), at.y + dy * (ring - 4 / zoom));
        ctx.lineTo(at.x + dx * (ring + 6 / zoom), at.y + dy * (ring + 6 / zoom));
    }

    ctx.stroke();
    ctx.restore();
}

/** A small rounded label, such as the feet a path costs, the same size at any zoom. */
export function drawPill(
    ctx: CanvasRenderingContext2D,
    text: string,
    at: Point,
    zoom: number,
    colour: string,
    scale = 1,
)
{
    // One screen pixel, times scale, so the pill keeps its size on screen at any zoom.
    const unit = scale / zoom;

    // Above and to the right of the point, so a finger on a phone does not cover it.
    drawPillAt(ctx, text, { x: at.x + 14 * unit, y: at.y - 14 * unit - 26 * unit }, unit, colour);
}

/** Font Awesome's icons as Path2D, made when first needed, since only the browser has one. */
const iconPaths = new Map<IconDefinition, Path2D>();

/** An icon in the current fill, its longer side size across, centred on a point. */
function drawIcon(ctx: CanvasRenderingContext2D, icon: IconDefinition, at: Point, size: number)
{
    const [width, height, , , path] = icon.icon;
    const scale = size / Math.max(width, height);
    let shape = iconPaths.get(icon);

    if (!shape)
    {
        shape = new Path2D(Array.isArray(path) ? path.join(' ') : path);
        iconPaths.set(icon, shape);
    }

    ctx.save();
    ctx.translate(at.x - (width * scale) / 2, at.y - (height * scale) / 2);
    ctx.scale(scale, scale);
    ctx.fill(shape);
    ctx.restore();
}

/**
 * A pill with its top left at a point, or its top middle with centred, and an icon before the
 * label if given. unit is one screen pixel in world pixels. The text is ink unless text says
 * otherwise. Hands back the pill's width, to set another beside it.
 */
function drawPillAt(
    ctx: CanvasRenderingContext2D,
    label: string,
    at: Point,
    unit: number,
    colour: string,
    { centred = false, text = ink, icon }: { centred?: boolean; text?: string; icon?: IconDefinition } = {},
): number
{
    const fontSize = 14 * unit;
    const height = 26 * unit;
    // The icon and the gap after it.
    const before = icon ? fontSize + 5 * unit : 0;

    ctx.font = `600 ${fontSize}px 'JetBrains Mono Variable', ui-monospace, monospace`;

    const width = ctx.measureText(label).width + before + 20 * unit;
    const left = centred ? at.x - width / 2 : at.x;
    const top = at.y;

    // The look of the page's tooltips and messages, see .ttrpg-tip in styles/ttrpg.css.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(left, top, width, height, 8 * unit);
    ctx.shadowColor = 'rgb(0 0 0 / 0.5)';
    ctx.shadowBlur = 16 * unit;
    ctx.shadowOffsetY = 6 * unit;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = unit;
    ctx.strokeStyle = faded(ink, 0.2);
    ctx.stroke();
    ctx.fillStyle = text;

    if (icon)
        drawIcon(ctx, icon, { x: left + 10 * unit + fontSize / 2, y: top + height / 2 }, fontSize);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, left + (width + before) / 2, top + height / 2 + unit);

    return width;
}

/** The colour of a token's HP under it: warmer and redder the more hurt it is. */
const healthText: Record<HealthState, string> = {
    unhurt: ink,
    hurt: doorColour,
    bloodied: danger,
    critical: danger,
    down: faded(ink, 0.5),
};

/**
 * A token's HP in a pill under it, like 23/30, for the screens that have its numbers: the GM
 * view for every token, a phone for its own. Nothing for a token without them.
 */
export function drawHealth(ctx: CanvasRenderingContext2D, token: Lifted, radius: number, zoom: number, scale = 1)
{
    if (token.hp === undefined || token.maxHp === undefined)
        return;

    const unit = scale / zoom;
    const state = healthState(token.hp, token.maxHp);

    const at = { x: token.x, y: token.y + radius + 4 * unit };
    const width = drawPillAt(ctx, `${token.hp}/${token.maxHp}`, at, unit, ground, { centred: true, text: healthText[state] });

    // Temp HP rides beside it as a blue shield, and goes once spent.
    if (token.tempHp)
        drawPillAt(ctx, String(token.tempHp), { x: at.x + width / 2 + 3 * unit, y: at.y }, unit, shield, { icon: faShieldHalved });
}

/**
 * How far up the picture the red of a wound reaches, as a share of it, and how deep it is at the
 * bottom, for each state. Critical reaches past the top, so the whole picture is red.
 */
const woundLook: Record<Exclude<HealthState, 'unhurt' | 'down'>, { reach: number; alpha: number }> = {
    hurt: { reach: 0.4, alpha: 0.35 },
    bloodied: { reach: 0.7, alpha: 0.55 },
    critical: { reach: 1.3, alpha: 0.7 },
};

/** How long one drip takes to run down a badly hurt token. */
const dripTime = 2200;

/**
 * Blood running down a bloodied token's picture, two drips, three when critical. Each starts at
 * its own moment, from the token's id, so a row of hurt tokens does not drip in step. Still,
 * halfway down, when motion is reduced. Inside the clip of the picture.
 */
function drawDrips(ctx: CanvasRenderingContext2D, token: Lifted, inner: number, critical: boolean, time: number, motion: boolean)
{
    for (const [index, across] of (critical ? [-0.4, 0.15, 0.5] : [-0.3, 0.4]).entries())
    {
        const phase = motion ? (time / dripTime + seeded(token.id, index)) % 1 : 0.5;
        const x = token.x + across * inner;
        const y = token.y - inner * 0.1 + phase * inner * 0.9;

        ctx.beginPath();
        ctx.ellipse(x, y, inner * 0.06, inner * 0.11, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(150 18 24 / ${0.85 * Math.sin(Math.PI * phase)})`;
        ctx.fill();
    }
}

/**
 * How hurt a token looks, over its picture: red rising from the bottom as it gets hurt, blood
 * dripping once it is bloodied, and a downed one darkened with a skull. Everyone sees this,
 * numbers or not, see map/health.ts. Without wounds, as the GM can set, only the skull.
 */
function drawWound(ctx: CanvasRenderingContext2D, token: Lifted, inner: number, time: number, motion: boolean, wounds: boolean)
{
    const state = stateOf(token);

    if (!state || state === 'unhurt' || (!wounds && state !== 'down'))
        return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(token.x, token.y, inner, 0, Math.PI * 2);
    ctx.clip();

    if (state === 'down')
    {
        ctx.fillStyle = 'rgb(18 17 19 / 0.7)';
        ctx.fill();
        ctx.fillStyle = faded(ink, 0.85);
        drawIcon(ctx, faSkull, token, inner * 1.1);
        ctx.restore();

        return;
    }

    const { reach, alpha } = woundLook[state];
    const bottom = token.y + inner;
    const wound = ctx.createLinearGradient(token.x, bottom, token.x, bottom - inner * 2 * reach);

    wound.addColorStop(0, `rgb(150 18 24 / ${alpha})`);
    wound.addColorStop(1, 'rgb(150 18 24 / 0)');
    ctx.fillStyle = wound;
    ctx.fill();

    if (state !== 'hurt')
        drawDrips(ctx, token, inner, state === 'critical', time, motion);

    ctx.restore();
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
    time: number,
    motion: boolean,
    wounds: boolean,
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

    if (!avatar)
    {
        ctx.fillStyle = ink;
        ctx.font = `600 ${inner * 0.9}px 'Onest Variable', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(token.name.slice(0, 1).toUpperCase(), token.x, token.y + inner * 0.05);
    }

    drawWound(ctx, token, inner, time, motion, wounds);

    if (token.hidden)
        drawHidden(ctx, token, inner, radius);

    // Every value over every badge, so the next badge down never covers one.
    const badges = conditionBadges(token, base);

    for (const badge of badges)
        drawBadge(ctx, badge);

    for (const badge of badges)
        drawBadgeValue(ctx, badge);

}

/**
 * A monster the GM keeps from the players, as only the GM's screens get it: dimmed, an eye struck
 * through over it, unless the skull of a downed one is there already, and a dashed line around it.
 */
function drawHidden(ctx: CanvasRenderingContext2D, token: Lifted, inner: number, radius: number)
{
    ctx.save();
    ctx.beginPath();
    ctx.arc(token.x, token.y, inner, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(18 17 19 / 0.5)';
    ctx.fill();

    if (stateOf(token) !== 'down')
    {
        ctx.fillStyle = faded(ink, 0.8);
        drawIcon(ctx, faEyeSlash, token, inner * 0.9);
    }

    ctx.beginPath();
    ctx.arc(token.x, token.y, radius * 1.1, 0, Math.PI * 2);
    ctx.setLineDash([radius * 0.18, radius * 0.12]);
    ctx.lineWidth = radius * 0.06;
    ctx.strokeStyle = faded(ink, 0.7);
    ctx.stroke();
    ctx.restore();
}

/** A condition on a token as it shows: a small round badge on its ring, see conditionBadges. */
export interface Badge extends Point
{
    tokenId: string;
    radius: number;
    kind: ConditionKind;
    value?: number;
}

/** Degrees clockwise from the right: a side's lowest badge, above the HP under the token. */
const badgeLowest = 35;
/** And the highest, once a side is full, so the top two still have room between them. */
const badgeHighest = -70;
/** Between two badges on a side, while they fit. */
const badgeStep = 40;

/**
 * Where a token's conditions sit: badges down its right side, then down its left in the mirrored
 * slots, so both sides line up and the bottom stays free for the HP. A side has three slots from
 * the bottom up, the first at the upper right, and more once there are over six, closer together
 * and smaller so they never overlap. One the app does not know is left out.
 */
export function conditionBadges(token: Token, radius: number): Badge[]
{
    const shown = (token.conditions ?? []).flatMap((condition) =>
    {
        const kind = conditionKind(condition.id);

        return kind ? [{ kind, value: condition.value }] : [];
    });
    const slots = Math.max(3, Math.ceil(shown.length / 2));
    const step = Math.min(badgeStep, (badgeLowest - badgeHighest) / (slots - 1));
    const size = radius * Math.min(0.3, 0.95 * Math.sin(((step / 2) * Math.PI) / 180));

    return shown.map(({ kind, value }, index) =>
    {
        const right = ((badgeLowest - (slots - 1 - (index % slots)) * step) * Math.PI) / 180;
        // The left mirrors the right across the token's middle.
        const angle = index < slots ? right : Math.PI - right;

        return { tokenId: token.id, x: token.x + Math.cos(angle) * radius, y: token.y + Math.sin(angle) * radius, radius: size, kind, value };
    });
}

/** The badge on top under a point, the last token drawn winning, for its name on hover or tap. */
export function conditionBadgeAt(tokens: Token[], grid: Grid, at: Point): Badge | undefined
{
    return tokens
        .flatMap((token) => conditionBadges(token, tokenRadius(grid, token.size)))
        .reverse()
        .find((badge) => distance(badge, at) <= badge.radius * 1.2);
}

/** A badge's label, like Frightened 2. */
export function badgeName(badge: Badge): string
{
    return badge.value === undefined ? badge.kind.name : `${badge.kind.name} ${badge.value}`;
}

/** The icon on the app's dark. */
function drawBadge(ctx: CanvasRenderingContext2D, { x, y, radius, kind }: Badge)
{
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = ground;
    ctx.fill();
    ctx.lineWidth = radius * 0.12;
    ctx.strokeStyle = faded(ink, 0.6);
    ctx.stroke();
    ctx.fillStyle = ink;
    drawIcon(ctx, kind.icon, { x, y }, radius * 1.1);
}

/** A badge's value, if it has one, in a small accent dot at its bottom right. */
function drawBadgeValue(ctx: CanvasRenderingContext2D, { x, y, radius, value }: Badge)
{
    if (value === undefined)
        return;

    const dot = { x: x + radius * 0.75, y: y + radius * 0.75 };

    ctx.beginPath();
    ctx.arc(dot.x, dot.y, radius * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.font = `700 ${radius * 0.8}px 'JetBrains Mono Variable', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), dot.x, dot.y + radius * 0.05);
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
/** A glowing ring in the app's light purple just outside a token, for whose turn it is. */
function drawTurn(ctx: CanvasRenderingContext2D, token: Token, radius: number)
{
    ctx.save();
    ctx.beginPath();
    ctx.arc(token.x, token.y, radius * 1.14, 0, Math.PI * 2);
    ctx.lineWidth = radius * 0.1;
    ctx.strokeStyle = highlight;
    ctx.shadowColor = highlight;
    ctx.shadowBlur = radius * 0.6;
    ctx.stroke();
    ctx.restore();
}

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
    { scenario, background, picture, tokens, editing, own, ownRestedAt, motion, fog, fogLook, time, beneath, decals = [], drops = [], wounds = true, turn = null }: Scene,
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

    for (const decal of decals)
    {
        ctx.globalAlpha = decal.alpha ?? 1;
        drawDecal(ctx, decal, grid, decal.scale);
    }

    ctx.globalAlpha = 1;

    for (const drop of drops)
        drawDrop(ctx, drop);

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

        if (token.id === turn)
            drawTurn(ctx, token, tokenRadius(grid, token.size));

        drawToken(ctx, token, tokenRadius(grid, token.size), token.avatar ? picture(token.avatar) : null, time, motion, wounds);
    }

    ctx.globalAlpha = 1;

    if (fog)
        drawFog(ctx, fog, scenario, time, fogLook);

}
