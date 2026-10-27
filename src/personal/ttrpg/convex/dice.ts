import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';

import type { DiceRoll } from '../types';
import { diceSides, maxDice, rollDice } from '../map/dice';
import { cleanRoll } from '../map/initiative';

import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { requireUser } from './access';
import { limit } from './limits';
import { ownToken } from './play';

/*
 * The dice roller, see Dice in PLAN.md. Rolled here, so nobody picks their own numbers, and kept
 * as a short log every screen at the table follows.
 */

/** Rolls a session keeps, older ones are deleted, so the log stays small on the free plan. */
const maxRolls = 20;

/** Every roll of a session, when it ends or is deleted. */
export async function clearRolls(ctx: MutationCtx, sessionId: Id<'sessions'>)
{
    const docs = await ctx.db
        .query('rolls')
        .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
        .take(maxRolls * 2);

    for (const doc of docs)
        await ctx.db.delete('rolls', doc._id);
}

/**
 * The last rolls, newest first, for the host and the players. Only the host gets hidden ones, and
 * not with asPlayer, as the table screen runs as the host, like decals.
 */
export const list = query({
    args: { sessionId: v.id('sessions'), asPlayer: v.optional(v.boolean()) },
    handler: async (ctx, { sessionId, asPlayer }): Promise<DiceRoll[]> =>
    {
        const userId = await getAuthUserId(ctx);
        const session = await ctx.db.get('sessions', sessionId);

        if (!userId || !session)
            return [];

        const host = session.ownerId === userId && asPlayer !== true;

        if (session.ownerId !== userId && !(await ownToken(ctx, sessionId, userId)))
            return [];

        const docs = await ctx.db
            .query('rolls')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
            .order('desc')
            .take(maxRolls);

        return docs.filter((doc) => host || !doc.hidden).map(({ _id, name, color, sides, count, modifier, edge, hidden, dice, total }) => ({ id: _id, name, color, sides, count, modifier, edge, hidden, dice, total }));
    },
});

/** The host or a player at the table rolls. Only the host rolls hidden. */
export const roll = mutation({
    args: {
        sessionId: v.id('sessions'),
        sides: v.number(),
        count: v.number(),
        modifier: v.number(),
        edge: v.optional(v.union(v.literal('advantage'), v.literal('disadvantage'))),
        hidden: v.optional(v.boolean()),
    },
    handler: async (ctx, { sessionId, sides, count, modifier, edge, hidden }) =>
    {
        const userId = await requireUser(ctx);
        const session = await ctx.db.get('sessions', sessionId);
        const host = session?.ownerId === userId;
        const mine = host ? null : await ownToken(ctx, sessionId, userId);

        if (!session || (!host && !mine))
            throw new ConvexError('Join the session to roll.');

        if (!diceSides.includes(sides) || !Number.isInteger(count) || count < 1 || count > maxDice)
            throw new ConvexError('Pick the dice to roll.');

        await limit(ctx, userId, 'roll');

        const ask = { sides, count, modifier: cleanRoll(modifier) ?? 0, edge: sides === 20 && count === 1 ? edge : undefined };

        await ctx.db.insert('rolls', {
            sessionId,
            name: mine ? mine.name : 'GM',
            color: mine?.color,
            ...ask,
            ...rollDice(ask, Math.random),
            hidden: host && hidden ? true : undefined,
        });

        const old = await ctx.db
            .query('rolls')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
            .order('desc')
            .take(maxRolls * 2);

        for (const doc of old.slice(maxRolls))
            await ctx.db.delete('rolls', doc._id);

        return null;
    },
});
