import type { DiceAsk, DiceRoll } from '../types';

/** The dice the roller offers, see components/DicePanel.tsx. */
export const diceSides = [4, 6, 8, 10, 12, 20, 100];
/** The most dice in one roll, a fireball and then some. */
export const maxDice = 20;

/**
 * Rolls on the server, see roll in convex/dice.ts, so a phone cannot pick its own numbers. With
 * an edge it rolls the d20 twice and keeps the higher or the lower.
 */
export function rollDice({ sides, count, modifier, edge }: DiceAsk, random: () => number): Pick<DiceRoll, 'dice' | 'total'>
{
    const dice = Array.from({ length: edge ? 2 : count }, () => 1 + Math.floor(random() * sides));
    const kept = edge ? (edge === 'advantage' ? Math.max(...dice) : Math.min(...dice)) : dice.reduce((sum, die) => sum + die, 0);

    return { dice, total: kept + modifier };
}

/** A roll as people say it, like 2d6+3 or d20 with advantage. */
export function diceName({ sides, count, modifier, edge }: DiceAsk): string
{
    const plus = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '';

    return `${count > 1 ? count : ''}d${sides}${plus}${edge ? `, ${edge}` : ''}`;
}
