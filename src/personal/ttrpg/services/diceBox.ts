import type DiceBox from '@3d-dice/dice-box-threejs';

import type { DiceRoll } from '../types';

/*
 * The 3D dice, see Tray3D in components/DicePanel.tsx: @3d-dice/dice-box-threejs, which brings
 * three.js and a physics engine, so it is only loaded once a screen shows the dice in 3D.
 */

export function loadDiceBox()
{
    return import('@3d-dice/dice-box-threejs');
}

/** A number within a share of 1 either way, to vary a throw by. */
function vary(share: number)
{
    return 1 + (Math.random() * 2 - 1) * share;
}

/**
 * The library throws every die of a roll from one spot, a few degrees apart, and mostly from the
 * same side. This mirrors each roll to any side and moves, turns and spins each die a little, so
 * no two throws look alike. Mirrored across an axis, the spin about the other one turns with it.
 */
export function spreadThrows(box: DiceBox)
{
    const work = box.startClickThrow.bind(box);

    box.startClickThrow = (notation) =>
    {
        const thrown = work(notation);
        const flipX = Math.random() < 0.5 ? -1 : 1;
        const flipY = Math.random() < 0.5 ? -1 : 1;
        const { containerWidth: width, containerHeight: height } = box.display;

        for (const { pos, velocity, angle } of thrown?.vectors ?? [])
        {
            const turn = ((Math.random() * 2 - 1) * Math.PI) / 12;
            const speed = vary(0.15);
            const { x, y } = velocity;

            // Kept inside the walls the library starts the dice at.
            pos.x = Math.max(-0.9 * width, Math.min(0.9 * width, flipX * pos.x + (Math.random() - 0.5) * 0.3 * width));
            pos.y = Math.max(-0.9 * height, Math.min(0.9 * height, flipY * pos.y + (Math.random() - 0.5) * 0.3 * height));
            velocity.x = flipX * (x * Math.cos(turn) - y * Math.sin(turn)) * speed;
            velocity.y = flipY * (x * Math.sin(turn) + y * Math.cos(turn)) * speed;
            angle.x *= flipY * vary(0.3);
            angle.y *= flipX * vary(0.3);
        }

        return thrown;
    };
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
