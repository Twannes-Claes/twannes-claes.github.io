import type { GameSystem, Spell, SpellElement } from '../types';

import { faded } from './colours.ts';
import { distance } from './geometry.ts';
import { coneSpread } from './tools.ts';

/*
 * Spell effects, drawn by a fragment shader over a ruler's shape for a few seconds, see Spell in
 * types.ts. The shader paints a small WebGL2 canvas off screen, as big as the shape on screen or
 * half, and at most shaderSize across, which the map's own 2D canvas then draws like a picture: one
 * stretch per effect, inside the frame budget in PLAN.md's renderer notes. Its noise is seeded
 * by the cast's time, so every screen plays the same one. Without WebGL2, and with reduced
 * motion, only a glow over the shape shows.
 */

/** How long a spell effect plays, in milliseconds. */
export const spellLife = 3000;

const life = spellLife / 1000;

/** The shader's canvas, its largest picture in pixels each way. */
const shaderSize = 1024;

/**
 * Shader pixels per screen pixel. Fire, acid and radiant are soft and lose nothing at half, which
 * costs a quarter; ice cracks and bolts are sharp, so they get every pixel.
 */
const shaderScale: Record<SpellElement, number> = { fire: 0.5, frost: 1, lightning: 1, acid: 0.5, radiant: 0.5 };

// A triangle over the whole canvas, with no buffers, and where each pixel lies in the shape's
// own cells: from at 0, pointing along x. Row 0 of a picture is its top, so y runs downwards.
const vertexSource = `#version 300 es
uniform vec4 u_box;
out vec2 v_pos;

void main()
{
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));

    v_pos = vec2(mix(u_box.x, u_box.z, corner.x), mix(u_box.w, u_box.y, corner.y));
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

// Premultiplied: a colour with little alpha adds light, as fire and lightning should; more alpha
// covers the map, as ice and acid do.
const fragmentSource = `#version 300 es
precision highp float;

in vec2 v_pos;
out vec4 colour;

uniform int u_kind;
uniform int u_element;
uniform int u_bolts;
uniform float u_reach;
uniform float u_spread;
uniform float u_time;
uniform float u_front;
uniform float u_fade;
uniform float u_seed;

float hash(vec2 p)
{
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);

    return fract(p.x * p.y);
}

float noise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p)
{
    float sum = 0.0;
    float amp = 0.5;

    for (int i = 0; i < 5; i++)
    {
        sum += amp * noise(p);
        p = p * 2.03 + vec2(1.7, 9.2);
        amp *= 0.5;
    }

    return sum;
}

// The nearest and second nearest of points scattered one per cell, and the nearest one's cell.
vec2 voronoi(vec2 p, out vec2 id)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;

    id = vec2(0.0);

    for (int y = -1; y <= 1; y++)
        for (int x = -1; x <= 1; x++)
        {
            vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(hash(i + g + u_seed), hash(i + g + u_seed + 17.0));
            float d = length(g + o - f);

            if (d < d1)
            {
                d2 = d1;
                d1 = d;
                id = i + g;
            }
            else if (d < d2)
                d2 = d;
        }

    return vec2(d1, d2);
}

// fbm with three octaves, enough for a line's wiggle at a third less cost.
float wiggle(vec2 p)
{
    return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + vec2(1.7, 9.2)) + 0.125 * noise(p * 4.12 + vec2(5.1, 2.3));
}

// Where a bolt is at x along it: jagged, wandering more the further out it goes, and crinkling all
// the time.
float zig(float x, float own, float fi, float full)
{
    return ((wiggle(vec2(x * 1.3, own * 3.7 + fi * 11.0)) - 0.4375) * 2.1 + (noise(vec2(x * 9.0, u_time * 20.0 + fi)) - 0.5) * 0.1) * sqrt(x / full);
}

// 1 below edge, 0 above it, soft over the width before it.
float below(float edge, float soft, float x)
{
    return 1.0 - smoothstep(edge - soft, edge, x);
}

void main()
{
    vec2 p = v_pos;
    float r = length(p);
    float a = atan(p.y, p.x);
    float R = u_reach;
    float t = u_time;
    // How far outside the shape, in cells, and how far out along it, 0 at its start to 1 at its
    // edge.
    float d;
    float reach;

    if (u_kind == 0)
    {
        d = r - R;
        reach = r / R;
    }
    else if (u_kind == 1)
    {
        d = max(r - R, (abs(a) - u_spread) * r);
        reach = r / R;
    }
    else
    {
        d = max(max(-p.x, p.x - R), abs(p.y) - 0.5);
        reach = p.x / R;
    }

    float inside = clamp(-d / 0.06, 0.0, 1.0);
    float shown = below(u_front, 0.12, reach);
    float body = inside * shown;
    float rim = exp(-abs(d) * 10.0) * shown;
    vec3 c = vec3(0.0);
    float alpha = 0.0;

    if (u_element == 0)
    {
        // Fire: flame billowing out from where it started and burning down, after a white-hot
        // burst.
        // The pattern swells by shrinking its coordinates, as flowing away from a point pinches it.
        vec2 q = p / (1.0 + t * 0.35) * 1.3 + u_seed;
        vec2 warp = vec2(fbm(q + vec2(0.0, t * 0.9)), fbm(q + vec2(5.2, -t * 0.7)));
        float n = fbm(q * 1.6 + warp * 2.2 - vec2(t * 0.4, t * 0.6));
        float burst = 1.0 - smoothstep(0.0, 0.5, t);
        // Tongues lick a little past the edge.
        float heat = n * 1.3 + (1.0 - reach) * 0.35 - 0.15 - t * 0.1 - max(0.0, d + 0.15) * 3.0;

        heat += burst * (exp(-reach * 2.0) * 1.2 + exp(-abs(reach - u_front) * 12.0) * 0.8) * inside;
        // Never a gap inside: at least a red glow, dying down with it.
        heat = max(heat, 0.3 * inside * (1.0 - t / 4.5));
        heat = clamp(heat * shown, 0.0, 1.6);

        vec3 flame = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.6, 0.1), smoothstep(0.3, 0.75, heat));

        flame = mix(flame, vec3(1.0, 0.95, 0.7), smoothstep(0.8, 1.3, heat));
        c = flame * smoothstep(0.0, 0.3, heat) + vec3(1.0, 0.35, 0.05) * 0.12 * body;
        alpha = smoothstep(0.05, 0.8, heat) * 0.55;
    }
    else if (u_element == 1)
    {
        // Frost: a blast of cold as it lands, a white flash and a ring of frost rushing out, ice
        // racing after it along a ragged edge, cracked into crystals, feathered and streaked out
        // from where it started, under a cold mist that keeps rolling over it.
        float burst = 1.0 - smoothstep(0.0, 0.7, t);
        float grow = 1.0 - pow(1.0 - min(1.0, t / 0.5), 3.0);
        float edge = reach + fbm(p * 2.0 + u_seed) * 0.35 - 0.15;
        float frozen = below(grow, 0.14, edge) * inside;
        float creeping = exp(-abs(edge - grow) * 18.0) * inside * (1.0 - grow * 0.6);
        float wave = exp(-abs(reach - min(1.2, t / 0.4)) * 12.0) * burst * shown;
        float flash = exp(-reach * 2.0) * (1.0 - smoothstep(0.0, 0.35, t)) * inside;
        // Noise on the direction rather than the angle, which would leave a seam where it wraps.
        vec2 out_ = u_kind == 2 ? vec2(p.y * 4.0, 0.0) : p / max(r, 0.001) * 5.0;
        float shards = pow(noise(out_ + u_seed), 3.0) * (0.4 + burst);
        // Cold air curling over the ice the whole time, thickest as it lands, spilling a little
        // past the edge.
        vec2 drift = vec2(fbm(p * 0.8 + vec2(t * 0.3, 0.0)), fbm(p * 0.8 + vec2(3.7, -t * 0.25)));
        float wisp = fbm(p * 0.8 + drift * 2.0 + vec2(t * 0.45, -t * 0.3) + u_seed);
        float mist = smoothstep(0.4, 0.75, wisp) * (0.45 + 0.55 * exp(-t * 1.2)) * below(0.2, 0.3, d + (wisp - 0.5) * 0.3) * shown;
        vec2 id;
        vec2 v = voronoi(p * 1.3, id);
        // At least a pixel and a half soft, so a big area's cracks stay smooth.
        float cracks = below(0.05, max(0.05, fwidth(v.y - v.x) * 1.5), v.y - v.x);
        float veins = pow(1.0 - abs(fbm(p * 3.0 + u_seed) * 2.0 - 1.0), 10.0);
        float sheen = fbm(p * 1.5 + vec2(t * 0.15, 0.0));
        vec3 ice = mix(vec3(0.2, 0.5, 0.95), vec3(0.85, 0.95, 1.0), sheen);
        vec3 white = vec3(0.9, 0.97, 1.0);

        // The mist veils the cracks it passes over.
        c = (ice * 0.55 + white * (cracks * 0.5 + veins * 0.35 + (1.0 - reach) * 0.25 + shards * 0.35) * (1.0 - mist * 0.6)) * frozen;
        c += vec3(0.7, 0.9, 1.0) * (creeping * 1.1 + rim * frozen * 0.7 + wave * 1.2) + white * flash * 1.2 + vec3(0.85, 0.93, 1.0) * mist * 0.9;
        alpha = clamp(frozen * (0.6 + cracks * 0.25) + mist * 0.45 + wave * 0.3, 0.0, 1.0);
    }
    else if (u_element == 2)
    {
        // Lightning: forking bolts out from where it started, each striking on its own beat,
        // shooting out and dimming until it strikes anew, with crackle running over the area and
        // arcs crawling along its edge. A bolt is never thinner than a pixel, so a big area does
        // not break it into dots.
        float live = 1.0 - smoothstep(2.0, 2.4, t);
        float strike = floor(t * 14.0);
        float flash = hash(vec2(strike, u_seed)) > 0.55 ? exp(-fract(t * 14.0) * 3.0) : 0.15;
        float thin = max(0.0025, length(fwidth(p)));
        float core = 0.0;
        float halo = 0.0;

        for (int i = 0; i < 8; i++)
        {
            if (i >= u_bolts)
                break;

            float fi = float(i);
            float beat = t * (8.0 + 6.0 * hash(vec2(fi, u_seed))) + hash(vec2(fi + 2.0, u_seed));
            float own = floor(beat);
            float age = fract(beat);
            float h = hash(vec2(fi * 7.3 + u_seed, own));

            // Some beats it holds back.
            if (h < 0.15)
                continue;

            float turn = u_kind == 0 ? h * 6.2832 : (u_kind == 1 ? (hash(vec2(own, fi + u_seed)) * 2.0 - 1.0) * u_spread : 0.0);
            float full = R * (u_kind == 2 ? 1.0 : 0.6 + 0.4 * hash(vec2(fi, own + 3.1)));
            float span = max(0.001, full * smoothstep(0.0, 0.2, age));
            vec2 q = vec2(cos(turn) * p.x + sin(turn) * p.y, -sin(turn) * p.x + cos(turn) * p.y);

            // Too far from it, or its fork, to light this pixel.
            if (q.x < -0.6 || q.x > span + 0.6 || abs(q.y) > 1.6 + full * 0.4)
                continue;

            // The nearest point of the bolt, so its ends are round rather than cut straight across.
            float x = clamp(q.x, 0.0, span);
            float gap = length(vec2(q.x - x, q.y - zig(x, own, fi, full)));
            float bright = (1.0 - x / full * 0.5) * (1.0 - age * 0.6);

            core += 4.8 * thin / (gap + thin) * bright;
            halo += exp(-gap * 9.0) * bright;

            // A fork leaves partway along and wanders off to one side.
            float start = (0.25 + 0.35 * hash(vec2(fi + 5.0, own))) * full;

            if (span > start)
            {
                float fx = clamp(q.x, start, span);
                float past = (fx - start) / full;
                float side = hash(vec2(fi, own + 9.0)) > 0.5 ? 1.0 : -1.0;
                float bend = side * past * full * 0.5 + (wiggle(vec2(fx * 2.4, own * 5.3 + fi * 3.0)) - 0.4375) * 1.05 * past;
                float forkGap = length(vec2(q.x - fx, q.y - zig(fx, own, fi, full) - bend));
                float dying = (1.0 - (fx - start) / (full - start)) * bright;

                core += 2.4 * thin / (forkGap + thin) * dying;
                halo += exp(-forkGap * 9.0) * 0.5 * dying;
            }
        }

        float near = clamp(1.0 - d / 0.3, 0.0, 1.0);
        // Sparks jump to a new pattern 20 times a second rather than drift, which reads as sliding.
        float spark = floor(t * 20.0);
        float crackle = pow(1.0 - abs(fbm(p * 2.0 + spark * 7.3 + u_seed) * 2.0 - 1.0), 40.0) * smoothstep(0.5, 0.7, noise(p * 1.2 + vec2(spark * 3.1, u_seed))) * (0.3 + flash);
        float crawl = exp(-abs(d + (noise(p * 4.0 + spark * 1.7) - 0.5) * 0.12) * 40.0) * smoothstep(0.35, 0.6, noise(p * 2.0 + vec2(spark * 5.9, 0.0)));
        float heart = u_kind == 2 ? 0.0 : exp(-r * 2.0) * flash;
        float lit = exp(-reach * 1.5) * flash * 0.25 + 0.06;
        vec3 blue = vec3(0.35, 0.55, 1.0);
        vec3 white = vec3(0.9, 0.95, 1.0);

        core = min(core, 4.0) * near;
        halo *= near;
        c = (blue * ((lit + heart * 0.7 + crackle * 0.5) * inside + halo * 0.45) + white * core * 0.5 + mix(blue, white, 0.5) * crawl * 0.9) * shown * live;
        c += blue * rim * 0.3;
        alpha = clamp(core * 0.15 + halo * 0.1 + 0.06 * inside, 0.0, 1.0) * shown * live;
    }
    else if (u_element == 3)
    {
        // Acid: a murky green cloud filling the shape, lumpy and rolling, each billow shaded like
        // smoke, specks popping and the edge fizzing where it eats at the ground. Matte, with a
        // grain, as a gas has no shine.
        vec2 q = p * 0.9 + u_seed;
        vec2 warp = vec2(fbm(q + vec2(t * 0.5, t * 0.2)), fbm(q + vec2(4.7, -t * 0.45)));
        vec2 at = q * 1.3 + warp * 2.5 + vec2(-t * 0.4, t * 0.25);
        float fume = fbm(at);
        // The same cloud a step towards the light: where it is thinner there, the billow is lit.
        float shade = clamp((fume - fbm(at + vec2(0.12))) * 4.0 + 0.5, 0.0, 1.0);
        float grain = noise(p * 14.0 + t * 2.0) * 0.15;
        // Full inside, frayed by the vapour itself near the edge.
        float filled = below(0.0, 0.25, d + (fume - 0.5) * 0.3) * shown;
        float thick = (0.6 + fume * 0.5) * filled;
        vec2 id;
        vec2 v = voronoi(p * 2.5 - vec2(0.0, t * 0.5), id);
        float pops = below(0.07, 0.07, v.x) * step(0.75, hash(id)) * pow(max(0.0, sin(t * 4.0 + hash(id) * 30.0)), 12.0);
        float fizz = exp(-abs(d) * 14.0) * pow(noise(p * 10.0 + t * 5.0), 3.0) * shown;
        vec3 murk = mix(vec3(0.08, 0.2, 0.02), vec3(0.42, 0.62, 0.08), smoothstep(0.3, 0.75, fume)) * (0.7 + shade * 0.5 - grain);

        c = murk * thick + vec3(0.6, 0.85, 0.2) * pops * 0.5 * filled + vec3(0.7, 0.95, 0.3) * fizz * 0.6;
        alpha = thick * 0.7;
    }
    else
    {
        // Radiant: a blinding golden flash as it lands and two rings of light rushing out, then a
        // blaze of shimmering rays round a pulsing heart, motes rising and a halo spilling past
        // the edge.
        float burst = 1.0 - smoothstep(0.0, 0.8, t);
        float flash = (1.0 - smoothstep(0.0, 0.3, t)) * (0.35 + 0.8 * exp(-reach * 2.0)) * inside;
        float heart = (u_kind == 2 ? exp(-abs(p.y) * 3.0) * 0.6 : exp(-r * 1.6)) * (1.15 + 0.35 * sin(t * 5.0));
        float rays = u_kind == 2 ? pow(fbm(vec2(p.x * 0.5 - t * 0.6, p.y * 5.0)), 1.5) : pow(0.5 + 0.5 * sin(a * 7.0 + t * 0.5), 3.0) * 0.5 + pow(0.5 + 0.5 * sin(a * 13.0 - t * 0.8 + 1.3), 5.0) * 0.4 + pow(0.5 + 0.5 * sin(a * 29.0 + t * 1.1), 8.0) * 0.3;
        // A soft, wide layer under the sharp rays, like light blooming round them.
        float bloom = u_kind == 2 ? rays : pow(0.5 + 0.5 * sin(a * 7.0 + t * 0.5), 1.5) * 0.25;
        float wave = exp(-abs(reach - min(1.0, t / 0.5)) * 14.0) * burst;
        float echo = exp(-abs(reach - clamp((t - 0.25) / 0.6, 0.0, 1.0)) * 18.0) * (1.0 - smoothstep(0.25, 1.1, t)) * step(0.25, t);
        float halo = exp(-max(d, 0.0) * 8.0) * (1.0 - inside) * shown;
        vec2 id;
        vec2 v = voronoi(p * 3.0 - vec2(0.0, t * 0.9), id);
        float motes = below(0.07, 0.07, v.x) * step(0.45, hash(id)) * pow(0.5 + 0.5 * sin(t * 6.0 + hash(id) * 40.0), 6.0);
        vec3 gold = vec3(1.0, 0.82, 0.45);
        vec3 white = vec3(1.0, 0.97, 0.88);

        rays *= (1.0 - reach * 0.5) * (0.75 + 0.25 * noise(vec2(r * 2.0 - t * 1.5, 0.5)));
        c = (gold * (0.18 + rays * 0.9 + bloom) + white * (heart * 1.1 + wave * 1.1 + echo * 0.7 + motes * 1.3)) * body;
        c += gold * (rim * 0.5 + halo * 0.3) + white * flash * 0.75;
        alpha = clamp((0.1 + heart * 0.3) * body + flash * 0.2, 0.0, 1.0);
    }

    // Gone before the box's edge, so no glow is cut off in a straight line.
    colour = vec4(c, alpha) * u_fade * below(0.3, 0.15, d);
}`;

const uniformNames = ['u_box', 'u_kind', 'u_element', 'u_bolts', 'u_reach', 'u_spread', 'u_time', 'u_front', 'u_fade', 'u_seed'] as const;

interface Painter
{
    gl: WebGL2RenderingContext;
    canvas: HTMLCanvasElement;
    uniforms: Record<(typeof uniformNames)[number], WebGLUniformLocation | null>;
}

/** The shader, made on the first cast; null once it could not be. */
let painter: Painter | null | undefined;

function painterOf(): Painter | null
{
    if (painter !== undefined)
        return painter?.gl.isContextLost() ? null : painter;

    painter = null;

    const canvas = document.createElement('canvas');

    canvas.width = shaderSize;
    canvas.height = shaderSize;

    const gl = canvas.getContext('webgl2', { antialias: false, depth: false });
    const program = gl?.createProgram();

    if (!gl || !program)
        return null;

    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const)
    {
        const shader = gl.createShader(type);

        if (!shader)
            return null;

        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        gl.attachShader(program, shader);
    }

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        return null;

    gl.useProgram(program);
    painter = { gl, canvas, uniforms: Object.fromEntries(uniformNames.map((name) => [name, gl.getUniformLocation(program, name)])) as Painter['uniforms'] };

    return painter;
}

const elements: SpellElement[] = ['fire', 'frost', 'lightning', 'acid', 'radiant'];

/** The glow each element shows without the shader. */
const glows: Record<SpellElement, string> = { fire: '#ff6a1a', frost: '#8fd3ff', lightning: '#9bb8ff', acid: '#7cc832', radiant: '#ffe28a' };

/**
 * A spell effect seconds into its life, in world pixels, over its ruler's shape: a circle, a cone,
 * or a line one cell wide. Each spreads out from where it starts, then fades.
 */
export function drawSpell(ctx: CanvasRenderingContext2D, spell: Spell, seconds: number, cell: number, zoom: number, system: GameSystem, motion: boolean)
{
    const { kind, from, to, element } = spell;
    const reach = Math.max(1, distance(from, to)) / cell;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const spread = kind === 'cone' ? coneSpread(system) : kind === 'area' ? Math.PI : 0;
    const front = motion ? 1 - (1 - Math.min(1, seconds / 0.35)) ** 3 : 1;
    const fade = Math.max(0, Math.min(1, (life - seconds) / 0.6, motion ? 1 : seconds / 0.6));
    const shader = motion ? painterOf() : null;

    ctx.save();
    ctx.translate(from.x, from.y);
    ctx.rotate(angle);
    ctx.scale(cell, cell);

    if (!shader)
    {
        ctx.beginPath();

        if (kind === 'ruler')
            ctx.rect(0, -0.5, reach, 1);
        else
        {
            if (kind === 'cone')
                ctx.moveTo(0, 0);

            ctx.arc(0, 0, reach, -spread, spread);
            ctx.closePath();
        }

        ctx.fillStyle = faded(glows[element], 0.35 * fade);
        ctx.fill();
        ctx.strokeStyle = faded(glows[element], 0.8 * fade);
        ctx.lineWidth = 2 / zoom / cell;
        ctx.stroke();
        ctx.restore();

        return;
    }

    // The shape's box in its own cells, with room for the glow round its edge.
    const room = 0.3;
    const side = kind === 'ruler' ? 0.5 : kind === 'cone' ? reach * Math.sin(spread) : reach;
    const box = [kind === 'area' ? -reach - room : -room, -side - room, reach + room, side + room];
    const pixels = cell * zoom * (window.devicePixelRatio || 1) * shaderScale[element];
    const across = (box[2] - box[0]) * pixels;
    const down = (box[3] - box[1]) * pixels;
    const shrink = Math.min(1, shaderSize / Math.max(across, down));
    const width = Math.max(1, Math.ceil(across * shrink));
    const height = Math.max(1, Math.ceil(down * shrink));
    const { gl, canvas, uniforms } = shader;

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform4f(uniforms.u_box, box[0], box[1], box[2], box[3]);
    gl.uniform1i(uniforms.u_kind, kind === 'area' ? 0 : kind === 'cone' ? 1 : 2);
    gl.uniform1i(uniforms.u_element, elements.indexOf(element));
    gl.uniform1i(uniforms.u_bolts, kind === 'ruler' ? 2 : Math.min(8, Math.max(3, Math.round(reach * (kind === 'area' ? 1.5 : 0.8)))));
    gl.uniform1f(uniforms.u_reach, reach);
    gl.uniform1f(uniforms.u_spread, spread);
    gl.uniform1f(uniforms.u_time, seconds);
    gl.uniform1f(uniforms.u_front, front);
    gl.uniform1f(uniforms.u_fade, fade);
    gl.uniform1f(uniforms.u_seed, (spell.at % 997) * 0.37);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // The viewport sits at the canvas's bottom left, which is the bottom of its picture.
    ctx.drawImage(canvas, 0, shaderSize - height, width, height, box[0], box[1], box[2] - box[0], box[3] - box[1]);
    ctx.restore();
}
