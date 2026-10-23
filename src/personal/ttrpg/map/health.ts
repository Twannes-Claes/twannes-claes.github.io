import type { BloodSettings, HealthState, HitKind, Stats, Token } from '../types';

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

/**
 * HP after an attack or a heal of amount. Damage takes temp HP first, then HP down to 0. Healing
 * raises HP up to max and never touches temp HP, as in 5e.
 */
export function applyHit(stats: { hp: number; maxHp: number; tempHp?: number }, kind: HitKind, amount: number)
{
    const { hp, maxHp, tempHp = 0 } = stats;

    if (kind === 'heal')
        return { hp: Math.min(maxHp, hp + amount), tempHp };

    const absorbed = Math.min(tempHp, amount);

    return { hp: Math.max(0, hp - (amount - absorbed)), tempHp: tempHp - absorbed };
}

/**
 * What a hit does to a token: its HP after, null for one without numbers, which takes nothing,
 * whether it dies of it, a monster brought to 0, and whether it goes down, a player brought to 0
 * from above it, or a monster that goes down at 0. One at 0 is down and stays; hit again there,
 * it goes down no further.
 */
export function hitOn(token: Pick<Token, 'kind' | 'hp' | 'maxHp' | 'tempHp' | 'downs'>, kind: HitKind, amount: number)
{
    const { hp, maxHp, tempHp } = token;
    const after = hp !== undefined && maxHp !== undefined ? applyHit({ hp, maxHp, tempHp }, kind, amount) : null;
    const zero = after !== null && after.hp === 0;
    const goesDown = token.kind === 'player' || token.downs === true;

    return { after, died: zero && !goesDown, downed: zero && goesDown && hp !== 0 };
}

/** How much wider than its token the pool a player goes down in is, so it shows around them. */
export const downedPool = 1.6;

/** All the blood, until the game master turns some off. */
export const defaultBlood: BloodSettings = { ground: true, wounds: true };

/** How hurt a token looks, from its numbers or, without them, what the server said. */
export function stateOf(token: Pick<Token, 'hp' | 'maxHp' | 'state'>): HealthState | undefined
{
    return token.hp !== undefined && token.maxHp ? healthState(token.hp, token.maxHp) : token.state;
}

/**
 * A token as a screen that may not see its numbers gets it: only how hurt it looks. Whether a
 * monster goes down at 0 stays home too, as it tells whether a hit can kill it.
 */
export function withoutNumbers<T extends Token>(token: T): T
{
    const hidden = { hp: undefined, maxHp: undefined, tempHp: undefined, ac: undefined, perception: undefined, downs: undefined };

    return { ...token, ...hidden, state: stateOf(token) };
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
