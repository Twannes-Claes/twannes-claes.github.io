import type { HealthState, Stats, Token } from '../types';

/*
 * Hit points, shared by the server and every screen, see "Health and stats" in PLAN.md. The game
 * master and a token's own player see its numbers; everyone else only how hurt it looks.
 */

/** Unhurt at full, then hurt, bloodied at half or less, critical at a quarter, down at 0. */
export function healthState(hp: number, maxHp: number): HealthState
{
    if (hp <= 0)
        return 'down';

    if (hp >= maxHp)
        return 'unhurt';

    if (hp * 4 <= maxHp)
        return 'critical';

    return hp * 2 <= maxHp ? 'bloodied' : 'hurt';
}

/** How hurt a token looks, from its numbers or, without them, what the server said. */
export function stateOf(token: Pick<Token, 'hp' | 'maxHp' | 'state'>): HealthState | undefined
{
    return token.hp !== undefined && token.maxHp ? healthState(token.hp, token.maxHp) : token.state;
}

/** A token as a screen that may not see its numbers gets it: only how hurt it looks. */
export function withoutNumbers<T extends Token>(token: T): T
{
    const hidden = { hp: undefined, maxHp: undefined, tempHp: undefined, ac: undefined, perception: undefined };

    return { ...token, ...hidden, state: stateOf(token) };
}

/** A token's numbers in one line, like 23+5/30 HP · AC 15 · PP 13. Empty for one without. */
export function statsLine(token: Token): string
{
    if (token.hp === undefined || token.maxHp === undefined)
        return '';

    const temp = token.tempHp ? `+${token.tempHp}` : '';

    return `${token.hp}${temp}/${token.maxHp} HP · AC ${token.ac ?? 0} · PP ${token.perception ?? 0}`;
}

/** The highest number each stat takes, past any creature in the common systems. HP stops at max. */
const statLimits = { maxHp: 9999, tempHp: 999, ac: 50, perception: 50 };

/** Stats as whole numbers in range, so a typo or a crafted call cannot store nonsense. */
export function cleanStats(stats: Stats): Stats
{
    const clean = (value: number, high: number, low = 0) =>
        Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value))) : low;
    const maxHp = clean(stats.maxHp, statLimits.maxHp, 1);

    return {
        hp: clean(stats.hp, maxHp),
        maxHp,
        tempHp: clean(stats.tempHp, statLimits.tempHp),
        ac: clean(stats.ac, statLimits.ac),
        perception: clean(stats.perception, statLimits.perception),
    };
}
