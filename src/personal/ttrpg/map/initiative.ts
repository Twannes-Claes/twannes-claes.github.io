import type { GameSystem, Initiative, Token } from '../types';

/*
 * Initiative, shared by the server, the GM view and the demo, see "Initiative" in PLAN.md. The
 * order is kept as a list rather than sorted from the rolls each time, so the GM's swaps stay. A
 * token that is gone, like a slain monster, keeps its place in the list until the next turn, so the
 * turn still knows where it was.
 */

/** A fight with no rolls yet, the turns not begun. */
export const newFight: Initiative = { begun: false, round: 0, order: [], turn: null };

/** The highest and lowest roll anyone types, past any modifier in the common systems. */
const rollLimit = 99;

/** A roll as a whole number in range, or null for one that is not a number. */
export function cleanRoll(roll: number): number | null
{
    return Number.isFinite(roll) ? Math.min(rollLimit, Math.max(-rollLimit, Math.round(roll))) : null;
}

/**
 * Whether a token with a roll goes before another with the same: players in D&D 5e, monsters in
 * Pathfinder 2e, as its rules say. Of the same kind, the one already in the order stays first.
 */
function winsTie(kind: Token['kind'], other: Token['kind'], system: GameSystem): boolean
{
    return kind !== other && kind === (system === 'pf2e' ? 'npc' : 'player');
}

/** The fight with a token's roll in it, or its new roll, slotted in by the roll and the ties. */
export function withRoll(fight: Initiative, token: Pick<Token, 'id' | 'kind'>, roll: number, kindOf: (id: string) => Token['kind'] | undefined, system: GameSystem): Initiative
{
    const order = fight.order.filter((entry) => entry.tokenId !== token.id);
    const at = order.findIndex((entry) =>
    {
        const kind = kindOf(entry.tokenId);

        return entry.roll < roll || (entry.roll === roll && kind !== undefined && winsTie(token.kind, kind, system));
    });
    const entry = { tokenId: token.id, roll };

    return { ...fight, order: at === -1 ? [...order, entry] : [...order.slice(0, at), entry, ...order.slice(at)] };
}

/** The fight without a token. If it was their turn, the turn goes on to the next. */
export function withoutRoll(fight: Initiative, tokenId: string, alive: (id: string) => boolean): Initiative
{
    const passed = fight.turn === tokenId ? nextTurn(fight, alive) : fight;

    return { ...passed, order: passed.order.filter((entry) => entry.tokenId !== tokenId) };
}

/** A token and its neighbour above or below swapped, for ties the GM settles otherwise. */
export function swapped(fight: Initiative, tokenId: string, up: boolean): Initiative
{
    const index = fight.order.findIndex((entry) => entry.tokenId === tokenId);
    const other = up ? index - 1 : index + 1;

    if (index === -1 || other < 0 || other >= fight.order.length)
        return fight;

    const order = [...fight.order];

    [order[index], order[other]] = [order[other], order[index]];

    return { ...fight, order };
}

/** The turns begun: round 1, the first in the order who is still here. */
export function begun(fight: Initiative, alive: (id: string) => boolean): Initiative
{
    const order = fight.order.filter((entry) => alive(entry.tokenId));

    return { ...fight, begun: true, round: 1, order, turn: order[0]?.tokenId ?? null };
}

/**
 * The turn passed to the next one in the order who is still here, a new round after the last.
 * Whoever is gone leaves the order now, once the turn no longer needs their place.
 */
export function nextTurn(fight: Initiative, alive: (id: string) => boolean): Initiative
{
    if (!fight.begun)
        return fight;

    const at = fight.order.findIndex((entry) => entry.tokenId === fight.turn);
    const after = fight.order.slice(at + 1).find((entry) => alive(entry.tokenId));
    const first = fight.order.find((entry) => alive(entry.tokenId));
    const order = fight.order.filter((entry) => alive(entry.tokenId));

    if (after)
        return { ...fight, order, turn: after.tokenId };

    return { ...fight, order, round: fight.round + 1, turn: first?.tokenId ?? null };
}

/** Who comes after the current turn, for the Up next heads-up. Null before the turns begin. */
export function upNext(fight: Initiative, alive: (id: string) => boolean): string | null
{
    const next = nextTurn(fight, alive).turn;

    return fight.begun && next !== fight.turn ? next : null;
}

/**
 * A fight as the GM's screen sent it, kept sane: whole rolls in range, each token once, a turn
 * that is in the order, a round that is a count.
 */
export function cleanFight(fight: Initiative): Initiative
{
    const seen = new Set<string>();
    const order = fight.order.slice(0, 200).flatMap(({ tokenId, roll }) =>
    {
        const clean = cleanRoll(roll);

        if (clean === null || seen.has(tokenId))
            return [];

        seen.add(tokenId);

        return [{ tokenId, roll: clean }];
    });
    const turn = fight.turn !== null && seen.has(fight.turn) ? fight.turn : null;

    return { begun: fight.begun, round: Math.min(9999, Math.max(0, Math.round(fight.round) || 0)), order, turn };
}

/** Whether a token is in the fight, its roll in. */
export function hasRolled(fight: Initiative, tokenId: string): boolean
{
    return fight.order.some((entry) => entry.tokenId === tokenId);
}
