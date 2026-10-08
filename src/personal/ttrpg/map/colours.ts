/*
 * The colours the map draws with, the canvas side of the --ttrpg-* colours in styles/ttrpg.css,
 * so the map and the panels over it read as one app. The fog has its own, see map/fog.ts.
 */

/** Text, walls and the ruler: the warm white of the app's ink. */
export const ink = '#fcf8ec';
/** The app's background, behind a token's picture and under labels. */
export const ground = '#1e1d1f';
/** The app's accent, for a path being drawn. */
export const accent = '#683c9b';
/** The accent lifted, so it shows on a dark map: tool previews, handles, the spawn point. */
export const highlight = '#a77ee0';
export const door = '#d8a657';
/** What a tool is about to take away, like walls in the eraser's box. */
export const danger = '#e0565b';
/** A path past the token's speed. */
export const tooFar = '#b4443c';

/** One of the colours above see-through, as eight-digit hex, which every canvas reads. */
export function faded(colour: string, alpha: number): string
{
    return colour + Math.round(alpha * 255).toString(16).padStart(2, '0');
}
