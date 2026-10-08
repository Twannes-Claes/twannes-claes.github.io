import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { isHost, isOwner, requireAccount, requireOwner } from './access';

/** Name, picture and email of a user, for the lists the owner sees. */
async function profile(ctx: QueryCtx, userId: Id<'users'>)
{
    const user = await ctx.db.get('users', userId);

    return {
        userId,
        name: user?.name ?? 'Unknown',
        image: user?.image ?? null,
        email: user?.email ?? null,
    };
}

/**
 * The signed-in user and what they may do: the owner, a host, someone who asked to host, or a
 * guest who has not asked yet. Null when signed out, or signed in only as a player.
 */
export const me = query({
    args: {},
    handler: async (ctx) =>
    {
        const userId = await getAuthUserId(ctx);

        if (!userId)
            return null;

        // A player who joined on this browser, see play.ts, still has to sign in to host.
        if ((await ctx.db.get('users', userId))?.isAnonymous)
            return null;

        const request = await ctx.db
            .query('hostRequests')
            .withIndex('by_userId', (q) => q.eq('userId', userId))
            .unique();

        let role: 'owner' | 'host' | 'asked' | 'guest' = request ? 'asked' : 'guest';

        if (isOwner(userId))
            role = 'owner';
        else if (await isHost(ctx, userId))
            role = 'host';

        return { ...(await profile(ctx, userId)), role };
    },
});

/** Asks the owner to become a host. Asking twice, or as a host, changes nothing. */
export const ask = mutation({
    args: {},
    handler: async (ctx) =>
    {
        const userId = await requireAccount(ctx);
        const asked = await ctx.db
            .query('hostRequests')
            .withIndex('by_userId', (q) => q.eq('userId', userId))
            .unique();

        if (!asked && !(await isHost(ctx, userId)))
            await ctx.db.insert('hostRequests', { userId, requestedAt: Date.now() });

        return null;
    },
});

/** For the owner: who asked to host, and who already is one. */
export const overview = query({
    args: {},
    handler: async (ctx) =>
    {
        await requireOwner(ctx);

        const requests = await ctx.db.query('hostRequests').take(100);
        const hosts = await ctx.db.query('hosts').take(100);

        return {
            requests: await Promise.all(requests.map((request) => profile(ctx, request.userId))),
            hosts: await Promise.all(hosts.map((host) => profile(ctx, host.userId))),
        };
    },
});

/** For the owner: approving makes a host, either way the request is gone. */
export const answer = mutation({
    args: { userId: v.id('users'), approve: v.boolean() },
    handler: async (ctx, { userId, approve }) =>
    {
        await requireOwner(ctx);

        const request = await ctx.db
            .query('hostRequests')
            .withIndex('by_userId', (q) => q.eq('userId', userId))
            .unique();

        if (request)
            await ctx.db.delete('hostRequests', request._id);

        if (approve && !(await isHost(ctx, userId)))
            await ctx.db.insert('hosts', { userId, approvedAt: Date.now() });

        return null;
    },
});

/** For the owner: takes hosting away again. Their sessions stay, for if they come back. */
export const remove = mutation({
    args: { userId: v.id('users') },
    handler: async (ctx, { userId }) =>
    {
        await requireOwner(ctx);

        const host = await ctx.db
            .query('hosts')
            .withIndex('by_userId', (q) => q.eq('userId', userId))
            .unique();

        if (host)
            await ctx.db.delete('hosts', host._id);

        return null;
    },
});
