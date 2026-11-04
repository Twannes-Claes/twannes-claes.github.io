import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';

import type { ChatMessage } from '../types';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireUser } from './access';
import { limit } from './limits';
import { storedPicture, sweepDelay } from './pictures';
import { gmColorOf, ownToken } from './play';
import { dropFile } from './usage';

/*
 * The table chat, see Chat and handouts in PLAN.md. Whispers and handouts for one player are
 * filtered here, so no other phone is ever sent them.
 */

/** Messages a session keeps, like the dice log, older ones are deleted. */
const maxMessages = 50;

/** Handouts are kept apart from the chat, so a busy table does not push the clue off a phone. */
const maxHandouts = 30;

const maxText = 1000;

function latest(ctx: QueryCtx, sessionId: Id<'sessions'>, handout: boolean, count: number)
{
    return ctx.db
        .query('messages')
        .withIndex('by_sessionId_and_handout', (q) => q.eq('sessionId', sessionId).eq('handout', handout))
        .order('desc')
        .take(count);
}

/** Deletes the messages of a session past the newest keep, with their pictures. */
async function trim(ctx: MutationCtx, sessionId: Id<'sessions'>, handout: boolean, keep: number)
{
    for (const doc of (await latest(ctx, sessionId, handout, keep + 100)).slice(keep))
    {
        if (doc.storageId)
            await dropFile(ctx, doc.storageId);

        await ctx.db.delete('messages', doc._id);
    }
}

/** Every message and handout of a session, when it ends or is deleted. */
export async function clearChat(ctx: MutationCtx, sessionId: Id<'sessions'>)
{
    await trim(ctx, sessionId, false, 0);
    await trim(ctx, sessionId, true, 0);
}

/**
 * The chat oldest first, for the host and the players. The host gets every whisper, but players'
 * to each other when the table keeps those private, a player what is for everyone and the
 * whispers and handouts they sent or got, and with asPlayer the table
 * screen only what is for everyone.
 */
export const list = query({
    args: { sessionId: v.id('sessions'), asPlayer: v.optional(v.boolean()) },
    handler: async (ctx, { sessionId, asPlayer }): Promise<ChatMessage[]> =>
    {
        const userId = await getAuthUserId(ctx);
        const session = await ctx.db.get('sessions', sessionId);

        if (!userId || !session)
            return [];

        const host = session.ownerId === userId;
        const mine = host ? null : await ownToken(ctx, sessionId, userId);

        if (!host && !mine)
            return [];

        const gm = gmColorOf(session);
        const docs = [...(await latest(ctx, sessionId, false, maxMessages)), ...(await latest(ctx, sessionId, true, maxHandouts))];
        // A player's whisper to another player, kept from the host when the table says so.
        const between = (doc: Doc<'messages'>) => doc.to !== undefined && doc.userId !== session.ownerId;
        const shown = docs.filter((doc) => (!doc.to && !doc.toGm) || (host ? asPlayer !== true && !(session.privateWhispers === true && between(doc)) : doc.to === mine?._id || doc.userId === userId));

        return shown
            .sort((a, b) => a._creationTime - b._creationTime)
            .map((doc) => ({
                id: doc._id,
                name: doc.name,
                // The GM's own lines and whispers to the GM in the GM's colour as it is now.
                color: doc.color ?? gm,
                text: doc.text,
                to: doc.to,
                toGm: doc.toGm === true,
                toName: doc.toName,
                toColor: doc.toGm ? gm : doc.toColor,
                handout: doc.handout,
                byGm: doc.userId === session.ownerId,
                picture: doc.picture,
                // A player who joins again on a new sign-in has a new account, so their own lines
                // are also known by their character. Only where a line sits, never who sees it.
                mine: doc.userId === userId || (mine !== null && doc.userId !== session.ownerId && doc.name === mine.name),
            }));
    },
});

/**
 * Sends to everyone or, as a whisper, to one player or from a player to the host. Only the host
 * sends handouts, with a picture uploaded through pictures.uploadUrl. A player sends a picture
 * uploaded through uploadUrl here. False when that picture was refused, see storedPicture.
 */
export const send = mutation({
    args: {
        sessionId: v.id('sessions'),
        text: v.string(),
        to: v.optional(v.id('tokens')),
        toGm: v.optional(v.boolean()),
        handout: v.optional(v.boolean()),
        storageId: v.optional(v.id('_storage')),
    },
    handler: async (ctx, { sessionId, text, to, toGm, handout = false, storageId }) =>
    {
        const userId = await requireUser(ctx);
        const session = await ctx.db.get('sessions', sessionId);
        const host = session?.ownerId === userId;
        const mine = host ? null : await ownToken(ctx, sessionId, userId);

        if (!session || (!host && !mine))
            throw new ConvexError('Join the session to chat.');

        if (!host && handout)
            throw new ConvexError('Only the GM sends handouts.');

        // The host is the GM, so only a player whispers to the GM.
        const gm = !host && toGm === true;
        const player = to && !gm ? await ctx.db.get('tokens', to) : null;

        if (to && !gm && (!player || player.sessionId !== sessionId || player.kind !== 'player' || player._id === mine?._id))
            throw new ConvexError('That player has left.');

        const clean = text.trim().slice(0, maxText);

        if (!clean && !storageId)
            throw new ConvexError('Write something first.');

        await limit(ctx, userId, 'chat');

        const picture = storageId ? await storedPicture(ctx, storageId) : undefined;
        // A player's picture is a line of the chat, gone with the oldest. The GM's is a handout.
        const kept = handout || (host && storageId !== undefined);

        if (picture === null)
            return false;

        await ctx.db.insert('messages', {
            sessionId,
            userId,
            name: mine ? mine.name : 'GM',
            color: mine?.color,
            text: clean,
            to: player?._id,
            toGm: gm || undefined,
            toName: player?.name,
            toColor: player?.color,
            handout: kept,
            storageId,
            picture,
        });
        await trim(ctx, sessionId, kept, kept ? maxHandouts : maxMessages);

        return true;
    },
});

/** The host takes a message or a handout out of the chat, with its picture. */
export const remove = mutation({
    args: { messageId: v.id('messages') },
    handler: async (ctx, { messageId }) =>
    {
        const userId = await requireUser(ctx);
        const doc = await ctx.db.get('messages', messageId);
        const session = doc ? await ctx.db.get('sessions', doc.sessionId) : null;

        if (!doc || session?.ownerId !== userId)
            return null;

        if (doc.storageId)
            await dropFile(ctx, doc.storageId);

        await ctx.db.delete('messages', messageId);

        return null;
    },
});

/**
 * An address for a player to upload a picture for the chat to, ten every ten minutes ('picture' in
 * limits.ts). A file nothing claims is swept away, see pictures.sweep.
 */
export const uploadUrl = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const userId = await requireUser(ctx);
        const session = await ctx.db.get('sessions', sessionId);

        if (!session || (session.ownerId !== userId && !(await ownToken(ctx, sessionId, userId))))
            throw new ConvexError('Join the session to chat.');

        await limit(ctx, userId, 'picture');
        await ctx.scheduler.runAfter(sweepDelay, internal.pictures.sweep, { since: Date.now() });

        return await ctx.storage.generateUploadUrl();
    },
});
