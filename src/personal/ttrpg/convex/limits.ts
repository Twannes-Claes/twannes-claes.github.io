import { ConvexError, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';

const minute = 60 * 1000;

/**
 * How often one player may do each thing, as tries per window, well above what a table does. They
 * keep a script from eating the free plan's quota. Pings and wrong passwords have their own, see
 * pingGap and tryPassword in play.ts.
 */
const rates = {
    /** Joining, making characters and companions, calling summons, music links. */
    make: { max: 30, window: 10 * minute },
    /** Map, prop and player pictures. */
    upload: { max: 60, window: 10 * minute },
    move: { max: 60, window: minute },
    hit: { max: 60, window: minute },
    /** Dice rolls, see dice.ts. */
    roll: { max: 30, window: minute },
    /** Paths, rulers and lines, sent every 150 ms while dragging, see view.ts. */
    drag: { max: 600, window: minute },
};

export type Rate = keyof typeof rates;

/**
 * Counts one try at something for a player, or says no once they are over its rate for the rest
 * of the window. Per player: someone signing in anonymously again and again starts over.
 */
export async function spend(ctx: MutationCtx, userId: Id<'users'>, rate: Rate): Promise<boolean>
{
    const { max, window } = rates[rate];
    const doc = await ctx.db
        .query('limits')
        .withIndex('by_userId_and_rate', (q) => q.eq('userId', userId).eq('rate', rate))
        .unique();
    const now = Date.now();
    const counting = doc !== null && doc.since > now - window;

    if (counting && doc.count >= max)
        return false;

    if (!doc)
        await ctx.db.insert('limits', { userId, rate, count: 1, since: now });
    else
        await ctx.db.patch('limits', doc._id, counting ? { count: doc.count + 1 } : { count: 1, since: now });

    return true;
}

/** Like spend, but refuses out loud. */
export async function limit(ctx: MutationCtx, userId: Id<'users'>, rate: Rate)
{
    if (!(await spend(ctx, userId, rate)))
        throw new ConvexError('Too many tries. Wait a moment and try again.');
}

/** spend for the /avatar route in http.ts, before it stores anything. */
export const spendOn = internalMutation({
    args: { userId: v.id('users'), rate: v.literal('upload') },
    handler: (ctx, { userId, rate }) => spend(ctx, userId, rate),
});
