import type { Scenario } from '../types';
import { inSight } from '../map/visibility';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

/** Every token of a session, a table full at most. */
export function tokensOf(ctx: QueryCtx, sessionId: Id<'sessions'>)
{
    return ctx.db
        .query('tokens')
        .withIndex('by_sessionId_and_userId', (q) => q.eq('sessionId', sessionId))
        .take(200);
}

/** The tokens on one map of a session, so a move re-reads only the map being played. */
export function tokensOn(ctx: QueryCtx, sessionId: Id<'sessions'>, scenarioId: string)
{
    return ctx.db
        .query('tokens')
        .withIndex('by_sessionId_and_scenarioId', (q) => q.eq('sessionId', sessionId).eq('scenarioId', scenarioId))
        .take(200);
}

/**
 * Marks which monsters on a scenario a player can see right now, so the players' tokens query
 * leaves out the rest without reading the map, see play.ts. Run by every write that changes
 * sight: a move, a join, a respawn, a new monster, a removed player, a door or wall saved.
 * ponytail: it judges from where tokens end up. A monster glimpsed only halfway along a walk is
 * not sent; check points along the path if that ever matters at the table. One walking out of
 * sight stays seen until its walk ends, see leavingUntil.
 */
export async function refreshSight(ctx: MutationCtx, sessionId: Id<'sessions'>, scenario: Scenario)
{
    const here = await tokensOn(ctx, sessionId, scenario.id);
    const eyes = here.filter((token) => token.kind === 'player');

    for (const token of here)
    {
        if (token.kind !== 'npc')
            continue;

        const seen = eyes.some((eye) => inSight(scenario.walls, eye, token)) || (token.leavingUntil ?? 0) > Date.now();

        if (seen !== (token.inSight === true))
            await ctx.db.patch('tokens', token._id, { inSight: seen });

    }
}
