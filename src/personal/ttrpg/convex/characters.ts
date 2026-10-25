import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';

import type { CreatureSize } from '../types';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { requireAccount } from './access';
import { dropFile } from './usage';

/*
 * A player's saved characters, see "Player accounts" in PLAN.md. Only a player signed in with
 * Discord keeps them: joining a table saves the character, and next time it fills the join form.
 * The character owns its picture; a token joined as it only shows the address, so ending a
 * session never deletes it.
 */

/** Far past any one player's party of alts. */
const maxCharacters = 20;

/** What the join form sends, already checked by join in play.ts. */
interface CharacterFields
{
    name: string;
    color: string;
    size: CreatureSize;
    maxHp: number;
    ac: number;
    perception: number;
}

/** The signed-in player's characters, by name. Null for an anonymous player, who keeps none. */
export const mine = query({
    args: {},
    handler: async (ctx) =>
    {
        const userId = await getAuthUserId(ctx);

        if (!userId || (await ctx.db.get('users', userId))?.isAnonymous)
            return null;

        const characters = await ctx.db
            .query('characters')
            .withIndex('by_userId', (q) => q.eq('userId', userId))
            .take(maxCharacters);

        return characters
            .map(({ _id, name, color, size, maxHp, ac, perception, avatar }) => ({ id: _id, name, color, size, maxHp, ac, perception, avatar }))
            .sort((a, b) => a.name.localeCompare(b.name));
    },
});

/**
 * Keeps what a player joined as: the character they picked, changed to what they sent, or a new
 * one. Null for an anonymous player, and once they have as many as they may keep.
 */
export async function saveCharacter(ctx: MutationCtx, userId: Id<'users'>, characterId: Id<'characters'> | undefined, fields: CharacterFields): Promise<Doc<'characters'> | null>
{
    if ((await ctx.db.get('users', userId))?.isAnonymous)
        return null;

    const picked = characterId ? await ctx.db.get('characters', characterId) : null;

    if (picked && picked.userId === userId)
    {
        await ctx.db.patch('characters', picked._id, fields);

        return { ...picked, ...fields };
    }

    const kept = await ctx.db
        .query('characters')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .take(maxCharacters);

    if (kept.length >= maxCharacters)
        return null;

    const id = await ctx.db.insert('characters', { userId, ...fields });

    return await ctx.db.get('characters', id);
}

/**
 * A player deletes a saved character and its picture. A token at a table joined as it keeps
 * playing, with its initial in place of the picture.
 */
export const remove = mutation({
    args: { characterId: v.id('characters') },
    handler: async (ctx, { characterId }) =>
    {
        const userId = await requireAccount(ctx);
        const character = await ctx.db.get('characters', characterId);

        if (!character || character.userId !== userId)
            throw new ConvexError('That character is gone.');

        if (character.avatarId)
            await dropFile(ctx, character.avatarId);

        await ctx.db.delete('characters', characterId);

        const tokens = await ctx.db
            .query('tokens')
            .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
            .take(100);

        for (const token of tokens)
            await ctx.db.patch('tokens', token._id, { characterId: undefined, avatar: token.avatarId ? token.avatar : undefined });


        return null;
    },
});
