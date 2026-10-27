import type { DiceRoll } from '../types';

/*
 * The 3D dice, see Tray3D in components/DicePanel.tsx: @3d-dice/dice-box-threejs, which brings
 * three.js and a physics engine, so it is only loaded once a screen shows the dice in 3D.
 */

export function loadDiceBox()
{
    return import('@3d-dice/dice-box-threejs');
}

/**
 * A roll as the library writes it, with the numbers the dice must land on after the @, which the
 * server rolled. A d100 is a tens die and a d10, as at the table: 00 and 0 make 100.
 */
export function notationOf({ sides, dice }: Pick<DiceRoll, 'sides' | 'dice'>): string
{
    if (sides !== 100)
        return `${dice.length}d${sides}@${dice.join(',')}`;

    const tens = dice.map((value) => (Math.floor(value / 10) % 10) * 10 || 100);
    const ones = dice.map((value) => value % 10 || 10);

    return `${dice.length}d100+${dice.length}d10@${[...tens, ...ones].join(',')}`;
}

/**
 * How big the library draws a roll's dice: full size up to four, then smaller with more, so their
 * area stays about the same and they fit side by side. A d100 is two dice, see notationOf.
 */
export function scaleOf({ sides, dice }: Pick<DiceRoll, 'sides' | 'dice'>): number
{
    const count = dice.length * (sides === 100 ? 2 : 1);

    return Math.round(Math.max(24, Math.min(50, 50 * Math.sqrt(4 / count))));
}

/** Plain plastic dice in the roller's ring colour with white numbers, no texture to download. */
export function colourSet(color: string)
{
    return { name: color, foreground: '#ffffff', background: color, outline: '#000000', texture: 'none', material: 'plastic' };
}
