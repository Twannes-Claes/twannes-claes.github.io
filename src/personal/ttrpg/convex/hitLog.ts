import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v, type Infer } from 'convex/values';

import type { LoggedHit } from '../types';
import { undoneOn } from '../map/health';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireSession } from './access';
import { scenarioOf } from './play';
import { tokenValidator } from './schema';
import { refreshSight } from './sight';

/*
 * The GM's log of the fight's hits, and undo for the last one, for a mistyped number, see Hit log
 * and undo in PLAN.md. Only kept while a fight is on, and for the GM only.
 */

/** Hits a fight keeps, older ones are deleted, like the dice log. */
const maxHits = 20;

function newest(ctx: QueryCtx, sessionId: Id<'sessions'>, count: number)
{
    return ctx.db
        .query('hitLog')
        .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
        .order('desc')
        .take(count);
}

/** A token as it stood, its stored fields without its id or a walk, to put back on undo. */
export function standing(token: Doc<'tokens'>): Infer<typeof tokenValidator>
{
    const fields = Object.keys(tokenValidator.fields) as (keyof Infer<typeof tokenValidator>)[];
    const stood = Object.fromEntries(fields.map((key) => [key, token[key]])) as Infer<typeof tokenValidator>;

    return { ...stood, path: undefined, movedAt: undefined };
}

/** Adds a hit of the fight on, see hit in play.ts, and drops the oldest past maxHits. */
export async function logHit(ctx: MutationCtx, hit: Omit<Doc<'hitLog'>, '_id' | '_creationTime'>)
{
    await ctx.db.insert('hitLog', hit);

    for (const doc of (await newest(ctx, hit.sessionId, maxHits * 2)).slice(maxHits))
        await ctx.db.delete('hitLog', doc._id);
}

/** Every hit of a session, when its fight ends. */
export async function clearHitLog(ctx: MutationCtx, sessionId: Id<'sessions'>)
{
    for (const doc of await newest(ctx, sessionId, maxHits * 2))
        await ctx.db.delete('hitLog', doc._id);
}

/** The fight's hits, newest first, for the GM only. */
export const list = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }): Promise<LoggedHit[]> =>
    {
        const userId = await getAuthUserId(ctx);
        const session = await ctx.db.get('sessions', sessionId);

        if (!userId || session?.ownerId !== userId)
            return [];

        const docs = await newest(ctx, sessionId, maxHits);

        return docs.map(({ _id, by, color, kind, amount, targets }) => ({
            id: _id,
            by,
            color,
            kind,
            amount,
            targets: targets.map(({ name, color, killed, trayed }) => ({ name, color, died: killed !== undefined || trayed === true })),
        }));
    },
});

/**
 * Takes back the newest hit: each target's numbers, see undoneOn in map/health.ts, a killed
 * monster back where it fell, in its place in the order, a summon back from its tray, and the
 * blood it left. A token removed since stays gone. A press on a hit already taken back is refused,
 * so a double press takes back one; the panel holds the next Undo until the line has folded away.
 */
export const undo = mutation({
    args: { sessionId: v.id('sessions'), hitId: v.id('hitLog') },
    handler: async (ctx, { sessionId, hitId }) =>
    {
        const session = await requireSession(ctx, sessionId);
        const [doc] = await newest(ctx, sessionId, 1);

        if (!doc || doc._id !== hitId)
            throw new ConvexError('Only the last hit can be undone.');

        let fight = session.initiative;
        let revived = false;

        for (const target of doc.targets)
        {
            if (target.decalId && (await ctx.db.get('decals', target.decalId)))
                await ctx.db.delete('decals', target.decalId);

            if (target.killed)
            {
                // Its own picture went with it, see dropToken in play.ts. ponytail: it comes back
                // without one; keep the file while the hit can be undone if that matters.
                const { avatarId, ...rest } = target.killed;
                const tokenId = await ctx.db.insert('tokens', avatarId ? { ...rest, avatar: undefined } : rest);
                const was = target.tokenId as string;

                fight = fight && {
                    ...fight,
                    order: fight.order.map((entry) => (entry.tokenId === was ? { ...entry, tokenId } : entry)),
                    turn: fight.turn === was ? tokenId : fight.turn,
                };
                revived = true;
                continue;
            }

            const token = await ctx.db.get('tokens', target.tokenId);
            const back = token && target.before && target.after ? undoneOn(token, target.before, target.after) : null;

            if (token && back)
                await ctx.db.patch('tokens', token._id, target.trayed ? { ...back, tray: undefined } : back);
        }

        await ctx.db.delete('hitLog', doc._id);

        if (revived)
        {
            await ctx.db.patch('sessions', sessionId, { initiative: fight });

            const scenario = session.activeScenarioId ? await scenarioOf(ctx, sessionId, session.activeScenarioId) : null;

            if (scenario)
                await refreshSight(ctx, sessionId, scenario);
        }

        return null;
    },
});
