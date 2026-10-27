/*
 * The colours the map draws with, the canvas side of the --ttrpg-* colours in styles/ttrpg.css,
 * so the map and the panels over it read as one app. The fog has its own, see map/fog.ts.
 */

/** Text, walls and the ruler: the warm white of the app's ink. */
export const ink = '#fcf8ec';
/** The app's background, behind a token's picture and under labels. */
export const ground = '#1e1d1f';
/** The app's accent before anyone picks their own, see components/useLook.ts. */
export const defaultAccent = '#683c9b';

/** The accent made light and a little more vivid, as six-digit hex. */
export function lift(colour: string): string
{
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const range = max - Math.min(r, g, b);
    const middle = max - range / 2;
    const sector = max === r ? (g - b) / range : max === g ? (b - r) / range + 2 : (r - g) / range + 4;
    const hue = range === 0 ? 0 : sector * 60;
    const saturation = range === 0 ? 0 : Math.min(1, range / (1 - Math.abs(2 * middle - 1)) + 0.18);
    const lightness = 0.69;
    const spread = saturation * Math.min(lightness, 1 - lightness);
    const channel = (n: number) =>
    {
        const k = (n + hue / 30 + 12) % 12;
        const value = lightness - spread * Math.max(-1, Math.min(k - 3, 9 - k, 1));

        return Math.round(value * 255).toString(16).padStart(2, '0');
    };

    return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Around a map the GM gave no colour of its own, darker than any floor, so its edge reads. */
export const defaultOutside = '#121113';
/** What the GM can pick for around a map: dark and light greys, then the light theme's cream. */
export const outsideColours = [defaultOutside, '#2a2730', '#4a4540', '#8a857c', '#d8d2c4', '#fcf8ec'];

/** The app's accent, for a path being drawn. Whoever looks picks it, see paintAccent. */
export let accent = defaultAccent;
/** The accent lifted, so it shows on a dark map: tool previews, handles, the spawn point. */
export let highlight = lift(defaultAccent);

/** Draws with the accent picked on this screen, redrawing the map, see map/view.ts. */
export function paintAccent(colour: string)
{
    accent = colour;
    highlight = lift(colour);
    window.dispatchEvent(new Event('ttrpg-paint'));
}

export const door = '#d8a657';
/** What a tool is about to take away, like walls in the eraser's box. */
export const danger = '#e0565b';
/** A line the draw tool's eraser is about to take: a loud red, drawn see-through. */
export const erasing = '#ff1a1a';
/** Healing, the app's green for what worked. */
export const heal = '#6fcf8e';
/** AC, the cool grey-blue of a steel shield. */
export const steel = '#a9bdd6';
/** The ring colours a player is offered first, which read well on any map. */
export const ringColours = [defaultAccent, '#2f8f55', '#c27c2c', '#2c7cc2', '#b4443c', '#c2b22c'];
/** Temp HP, a light blue that reads on a dark label: it takes the hits first. */
export const tempHp = '#8db9f2';
/** A path past the token's speed. */
export const tooFar = '#b4443c';
/** Dark and a little brown, as blood looks on the ground. */
export const blood = '#7a1016';
/** Blood where it lies thick, at the middle of a drop or a pool. */
export const bloodDark = '#3a0407';

/** One of the colours above see-through, as eight-digit hex, which every canvas reads. */
export function faded(colour: string, alpha: number): string
{
    return colour + Math.round(alpha * 255).toString(16).padStart(2, '0');
}
