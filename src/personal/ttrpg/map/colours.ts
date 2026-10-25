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
/** A line the draw tool's eraser is about to take: a loud red, drawn see-through. */
export const erasing = '#ff1a1a';
/** Healing, the app's green for what worked. */
export const heal = '#6fcf8e';
/** AC, the cool grey-blue of a steel shield. */
export const steel = '#a9bdd6';
/** The ring colours a player is offered first, which read well on any map. */
export const ringColours = ['#683c9b', '#2f8f55', '#c27c2c', '#2c7cc2', '#b4443c', '#c2b22c'];
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
