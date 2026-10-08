import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

/*
 * Who may do what, checked at the start of every call, see PLAN.md. Mutations get a QueryCtx
 * here too, since these only read.
 */

/** The signed-in user, or an error for the page to show. */
export async function requireUser(ctx: QueryCtx): Promise<Id<'users'>>
{
    const userId = await getAuthUserId(ctx);

    if (!userId)
        throw new ConvexError('Sign in first.');

    return userId;
}

/**
 * A user signed in with Discord. Players are signed in anonymously, see auth.ts, and anyone can
 * make as many of those as they like, so they may not ask to host.
 */
export async function requireAccount(ctx: QueryCtx): Promise<Id<'users'>>
{
    const userId = await requireUser(ctx);

    if ((await ctx.db.get('users', userId))?.isAnonymous)
        throw new ConvexError('Sign in with Discord first.');

    return userId;
}

/**
 * The owner approves hosts. Set once with `npx convex env set OWNER_ID <your user id>`, see
 * README.md.
 */
export function isOwner(userId: Id<'users'>): boolean
{
    return userId === process.env.OWNER_ID;
}

export async function isHost(ctx: QueryCtx, userId: Id<'users'>): Promise<boolean>
{
    if (isOwner(userId))
        return true;

    const host = await ctx.db
        .query('hosts')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique();

    return host !== null;
}

export async function requireHost(ctx: QueryCtx): Promise<Id<'users'>>
{
    const userId = await requireUser(ctx);

    if (!(await isHost(ctx, userId)))
        throw new ConvexError('Only hosts can do that.');

    return userId;
}

export async function requireOwner(ctx: QueryCtx): Promise<Id<'users'>>
{
    const userId = await requireUser(ctx);

    if (!isOwner(userId))
        throw new ConvexError('Only the owner can do that.');

    return userId;
}

/** A session of the signed-in host. Someone else's reads as missing, so ids do not leak. */
export async function requireSession(ctx: QueryCtx, sessionId: Id<'sessions'>)
{
    const userId = await requireHost(ctx);
    const session = await ctx.db.get('sessions', sessionId);

    if (!session || session.ownerId !== userId)
        throw new ConvexError('That session does not exist.');

    return session;
}
