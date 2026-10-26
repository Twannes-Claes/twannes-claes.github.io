import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';

import type { CreatureSize } from '../types';
import { cleanStats } from '../map/health';

import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireAccount } from './access';
import { limit } from './limits';
import { storedPicture } from './pictures';
import { maxAvatarBytes } from './play';
import { sizeValidator } from './schema';
import { maxSummons } from './summons';
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

        const withCompanions = await Promise.all(
            characters.map(async ({ _id, name, color, size, maxHp, ac, perception, avatar }) =>
            {
                const companions = await ctx.db
                    .query('companions')
                    .withIndex('by_characterId', (q) => q.eq('characterId', _id))
                    .take(10);

                return { id: _id, name, color, size, maxHp, ac, perception, avatar, companions: companions.map((c) => ({ id: c._id, name: c.name, size: c.size, maxHp: c.maxHp, ac: c.ac, avatar: c.avatar })) };
            }),
        );

        return withCompanions.sort((a, b) => a.name.localeCompare(b.name));
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
 * A player deletes a saved character, its picture and its saved summons. A token at a table joined
 * as it keeps playing, with its initial in place of the picture.
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

        // Its summons go with it, see summons.ts; at a table they stay until the session ends.
        const companions = await ctx.db
            .query('companions')
            .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
            .take(10);

        for (const companion of companions)
        {
            if (companion.avatarId)
                await dropFile(ctx, companion.avatarId);

            await ctx.db.delete('companions', companion._id);
        }


        const tokens = await ctx.db
            .query('tokens')
            .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
            .take(100);

        for (const token of tokens)
            await ctx.db.patch('tokens', token._id, { characterId: undefined, avatar: token.avatarId ? token.avatar : undefined });


        return null;
    },
});

/** Checks a name the way join in play.ts does. */
function cleanName(name: string): string
{
    const clean = name.trim().slice(0, 30);

    if (!clean)
        throw new ConvexError('It needs a name.');

    return clean;
}

const colourPattern = /^#[0-9a-f]{6}$/i;

async function ownCharacter(ctx: QueryCtx, userId: Id<'users'>, characterId: Id<'characters'>): Promise<Doc<'characters'>>
{
    const character = await ctx.db.get('characters', characterId);

    if (!character || character.userId !== userId)
        throw new ConvexError('That character is gone.');

    return character;
}

/** A player makes a character from their account, or changes one, for the next table they join. */
export const save = mutation({
    args: {
        characterId: v.optional(v.id('characters')),
        name: v.string(),
        color: v.string(),
        size: sizeValidator,
        maxHp: v.number(),
        ac: v.number(),
        perception: v.number(),
    },
    handler: async (ctx, { characterId, name, color, size, maxHp, ac, perception }) =>
    {
        const userId = await requireAccount(ctx);
        const stats = cleanStats({ hp: maxHp, maxHp, tempHp: 0, ac, perception });

        if (!colourPattern.test(color))
            throw new ConvexError('Pick a ring colour.');

        await limit(ctx, userId, 'make');

        if (characterId)
            await ownCharacter(ctx, userId, characterId);

        const saved = await saveCharacter(ctx, userId, characterId, { name: cleanName(name), color, size, maxHp: stats.maxHp, ac: stats.ac, perception: stats.perception });

        if (!saved)
            throw new ConvexError(`You can keep ${maxCharacters} characters at most.`);

        return saved._id;
    },
});

/** A player makes a saved summon for a character, or changes one, for the next table they join. */
export const saveCompanion = mutation({
    args: {
        characterId: v.id('characters'),
        companionId: v.optional(v.id('companions')),
        name: v.string(),
        size: sizeValidator,
        maxHp: v.number(),
        ac: v.number(),
    },
    handler: async (ctx, { characterId, companionId, name, size, maxHp, ac }) =>
    {
        const userId = await requireAccount(ctx);

        await ownCharacter(ctx, userId, characterId);
        await limit(ctx, userId, 'make');

        const stats = cleanStats({ hp: maxHp, maxHp, tempHp: 0, ac, perception: 10 });
        const fields = { name: cleanName(name), size, maxHp: stats.maxHp, ac: stats.ac };

        if (companionId)
        {
            const companion = await ctx.db.get('companions', companionId);

            if (!companion || companion.characterId !== characterId)
                throw new ConvexError('That companion is gone.');

            await ctx.db.patch('companions', companionId, fields);

            return companionId;
        }

        const kept = await ctx.db
            .query('companions')
            .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
            .take(maxSummons);

        if (kept.length >= maxSummons)
            throw new ConvexError(`A character can have ${maxSummons} companions at most.`);

        return await ctx.db.insert('companions', { characterId, ...fields });
    },
});

/** A player deletes a saved summon and its picture. One at a table stays until the session ends. */
export const removeCompanion = mutation({
    args: { companionId: v.id('companions') },
    handler: async (ctx, { companionId }) =>
    {
        const userId = await requireAccount(ctx);
        const companion = await ctx.db.get('companions', companionId);

        if (!companion)
            throw new ConvexError('That companion is gone.');

        await ownCharacter(ctx, userId, companion.characterId);

        if (companion.avatarId)
            await dropFile(ctx, companion.avatarId);

        await ctx.db.delete('companions', companionId);

        return null;
    },
});

/**
 * A picture for a saved character or summon, from the account page through /avatar in http.ts.
 * Deletes the file when it cannot be kept, and the old picture when it can.
 */
export const keepPicture = internalMutation({
    args: { userId: v.id('users'), storageId: v.id('_storage'), characterId: v.optional(v.string()), companionId: v.optional(v.string()) },
    handler: async (ctx, { userId, storageId, characterId, companionId }) =>
    {
        const companionKey = companionId ? ctx.db.normalizeId('companions', companionId) : null;
        const companion = companionKey ? await ctx.db.get('companions', companionKey) : null;
        const characterKey = companion?.characterId ?? (characterId ? ctx.db.normalizeId('characters', characterId) : null);
        const character = characterKey ? await ctx.db.get('characters', characterKey) : null;
        const keeper = companionId ? companion : character;

        if (!keeper || !character || character.userId !== userId)
        {
            await ctx.storage.delete(storageId);

            return 'not joined';
        }

        const avatar = await storedPicture(ctx, storageId, maxAvatarBytes);

        if (!avatar)
            return 'refused';

        if (keeper.avatarId && keeper.avatarId !== storageId)
            await dropFile(ctx, keeper.avatarId);

        if (companion)
        {
            // ponytail: a summon already at a table keeps showing the old address until the next
            // join; tokens have no index on companionId to find it by.
            await ctx.db.patch('companions', companion._id, { avatar, avatarId: storageId });

            return 'kept';
        }

        await ctx.db.patch('characters', character._id, { avatar, avatarId: storageId });

        // Tokens at a table joined as it only show the address, which just changed.
        const tokens = await ctx.db
            .query('tokens')
            .withIndex('by_characterId', (q) => q.eq('characterId', character._id))
            .take(100);

        for (const token of tokens)
            await ctx.db.patch('tokens', token._id, { avatar });

        return 'kept';
    },
});
