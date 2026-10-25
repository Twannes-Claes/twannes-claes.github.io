import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';

import type { Token } from '../types';
import { cleanStats } from '../map/health';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireUser } from './access';
import { dropDraftOf, ownToken, scenarioOf, spawnSpots, tokenOf } from './play';
import { sizeValidator } from './schema';
import { refreshSight, tokensOn } from './sight';
import { dropFile } from './usage';

/*
 * A player's summons and companions, see "Summons and companions" in PLAN.md: tokens of kind player
 * that belong to the player's own token through summonOf. So they see through the fog and walk like
 * players, on their owner's turn in a fight; they stay out of initiative and group checks. At 0 HP
 * one vanishes onto the tray, off the map like a monster, until its player summons it again. Signed in with Discord, they
 * are kept with the character as companions and come along, off, to the next table.
 */

/** A familiar, a mount, an animal companion and a summoned spell, at once. */
export const maxSummons = 4;

/** The player's own token a token answers to: itself, or the one that summoned it. */
export async function controllerOf(ctx: QueryCtx, token: Doc<'tokens'>, userId: Id<'users'>): Promise<Doc<'tokens'> | null>
{
    if (token.userId === userId)
        return token;

    const owner = token.summonOf ? await ctx.db.get('tokens', token.summonOf) : null;

    return owner && owner.userId === userId ? owner : null;
}

function summonsOf(ctx: QueryCtx, ownerId: Id<'tokens'>)
{
    return ctx.db
        .query('tokens')
        .withIndex('by_summonOf', (q) => q.eq('summonOf', ownerId))
        .take(maxSummons);
}

/** Takes a summon off the table, its own picture with it. A companion's stays with the character. */
async function dropSummon(ctx: MutationCtx, summon: Doc<'tokens'>)
{
    if (summon.avatarId)
        await dropFile(ctx, summon.avatarId);

    await ctx.db.delete('tokens', summon._id);
    await dropDraftOf(ctx, summon._id);
}

/** A player's summons leave with them, on leaving or being removed. */
export async function dropSummonsOf(ctx: MutationCtx, ownerId: Id<'tokens'>)
{
    for (const summon of await summonsOf(ctx, ownerId))
        await dropSummon(ctx, summon);

}

/** A summon's numbers at full health. Summons have no Perception of their own to check against. */
function summonStats(maxHp: number, ac: number)
{
    return cleanStats({ hp: maxHp, maxHp, tempHp: 0, ac, perception: 10 });
}

/** A saved character's companions come to the table with them, off, for the player to call. */
export async function bringCompanions(ctx: MutationCtx, owner: Doc<'tokens'>, characterId: Id<'characters'>)
{
    const companions = await ctx.db
        .query('companions')
        .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
        .take(maxSummons);

    for (const companion of companions)
    {
        await ctx.db.insert('tokens', {
            sessionId: owner.sessionId,
            kind: 'player',
            name: companion.name,
            color: owner.color,
            size: companion.size,
            speed: 30,
            avatar: companion.avatar,
            scenarioId: owner.scenarioId,
            x: owner.x,
            y: owner.y,
            tray: true,
            summonOf: owner._id,
            companionId: companion._id,
            ...summonStats(companion.maxHp, companion.ac),
        });
    }
}

/** Where a summon called beside its owner stands: the nearest free cells around them. */
async function besideOwner(ctx: QueryCtx, owner: Doc<'tokens'>, size: Token['size'])
{
    const scenario = await scenarioOf(ctx, owner.sessionId, owner.scenarioId);

    if (!scenario)
        throw new ConvexError('The map is not ready yet. Try again in a moment.');

    const here = await tokensOn(ctx, owner.sessionId, owner.scenarioId);
    const [spot] = spawnSpots({ ...scenario, spawn: { x: owner.x, y: owner.y } }, [{ size }], here);

    return { scenario, spot };
}

/** The player's summons, off ones too, with their numbers, for the phone's settings. */
export const mine = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }): Promise<Token[]> =>
    {
        const userId = await getAuthUserId(ctx);
        const own = userId ? await ownToken(ctx, sessionId, userId) : null;

        return own ? (await summonsOf(ctx, own._id)).map(tokenOf) : [];
    },
});

/**
 * A player calls a new summon beside their token. Signed in with Discord, it is kept with their
 * character for next time. Gives its id, for its picture to follow.
 */
export const add = mutation({
    args: { sessionId: v.id('sessions'), name: v.string(), size: sizeValidator, maxHp: v.number(), ac: v.number() },
    handler: async (ctx, { sessionId, name, size, maxHp, ac }) =>
    {
        const userId = await requireUser(ctx);
        const own = await ownToken(ctx, sessionId, userId);
        const summon = name.trim().slice(0, 30);

        if (!own)
            throw new ConvexError('Join the table first.');

        if (!summon)
            throw new ConvexError('Your companion needs a name.');

        if ((await summonsOf(ctx, own._id)).length >= maxSummons)
            throw new ConvexError(`You can have ${maxSummons} companions at most.`);

        const stats = summonStats(maxHp, ac);
        const { scenario, spot } = await besideOwner(ctx, own, size);
        const companionId = own.characterId
            ? await ctx.db.insert('companions', { characterId: own.characterId, name: summon, size, maxHp: stats.maxHp, ac: stats.ac })
            : undefined;

        const tokenId = await ctx.db.insert('tokens', {
            sessionId,
            kind: 'player',
            name: summon,
            color: own.color,
            size,
            speed: 30,
            scenarioId: own.scenarioId,
            ...spot,
            summonOf: own._id,
            companionId,
            ...stats,
        });

        await refreshSight(ctx, sessionId, scenario);

        return tokenId;
    },
});

/** A player calls a summon onto the map beside them, or sends it off onto the tray. */
export const setOn = mutation({
    args: { tokenId: v.id('tokens'), on: v.boolean() },
    handler: async (ctx, { tokenId, on }) =>
    {
        const userId = await requireUser(ctx);
        const summon = await ctx.db.get('tokens', tokenId);
        const owner = summon?.summonOf ? await controllerOf(ctx, summon, userId) : null;

        if (!summon || !owner)
            throw new ConvexError('That is not your companion.');

        if (!on)
        {
            await ctx.db.patch('tokens', tokenId, { tray: true, path: undefined, movedAt: undefined });
            await dropDraftOf(ctx, tokenId);
        }
        else
        {
            const { spot } = await besideOwner(ctx, owner, summon.size);

            await ctx.db.patch('tokens', tokenId, { tray: undefined, scenarioId: owner.scenarioId, ...spot, path: undefined, movedAt: undefined });
        }

        const scenario = await scenarioOf(ctx, owner.sessionId, owner.scenarioId);

        if (scenario)
            await refreshSight(ctx, owner.sessionId, scenario);

        return null;
    },
});

/**
 * A player summons one again: back at full health, without conditions, beside them. For one that
 * fell at 0, which waits off the map, or a fresh one in place of a hurt one.
 */
export const resummon = mutation({
    args: { tokenId: v.id('tokens') },
    handler: async (ctx, { tokenId }) =>
    {
        const userId = await requireUser(ctx);
        const summon = await ctx.db.get('tokens', tokenId);
        const owner = summon?.summonOf ? await controllerOf(ctx, summon, userId) : null;

        if (!summon || !owner)
            throw new ConvexError('That is not your companion.');

        const { scenario, spot } = await besideOwner(ctx, owner, summon.size);

        await dropDraftOf(ctx, tokenId);
        await ctx.db.patch('tokens', tokenId, {
            ...summonStats(summon.maxHp ?? 1, summon.ac ?? 10),
            conditions: undefined,
            tray: undefined,
            scenarioId: owner.scenarioId,
            ...spot,
            path: undefined,
            movedAt: undefined,
        });
        await refreshSight(ctx, owner.sessionId, scenario);

        return null;
    },
});

/**
 * A player changes a summon as they level up: its name, max HP and AC, on their saved character
 * too. Its HP stays, never past the new max.
 */
export const edit = mutation({
    args: { tokenId: v.id('tokens'), name: v.string(), maxHp: v.number(), ac: v.number() },
    handler: async (ctx, { tokenId, name, maxHp, ac }) =>
    {
        const userId = await requireUser(ctx);
        const summon = await ctx.db.get('tokens', tokenId);
        const owner = summon?.summonOf ? await controllerOf(ctx, summon, userId) : null;
        const renamed = name.trim().slice(0, 30);

        if (!summon || !owner)
            throw new ConvexError('That is not your companion.');

        if (!renamed)
            throw new ConvexError('Your companion needs a name.');

        const stats = cleanStats({ hp: summon.hp ?? maxHp, maxHp, tempHp: summon.tempHp ?? 0, ac, perception: summon.perception ?? 10 });

        await ctx.db.patch('tokens', tokenId, { name: renamed, ...stats });

        if (summon.companionId && (await ctx.db.get('companions', summon.companionId)))
            await ctx.db.patch('companions', summon.companionId, { name: renamed, maxHp: stats.maxHp, ac: stats.ac });

        return null;
    },
});

/**
 * A player deletes a summon for good, from their saved character too. The GM taking one off the
 * table goes through kick in play.ts instead, which leaves the saved one.
 */
export const remove = mutation({
    args: { tokenId: v.id('tokens') },
    handler: async (ctx, { tokenId }) =>
    {
        const userId = await requireUser(ctx);
        const summon = await ctx.db.get('tokens', tokenId);
        const owner = summon?.summonOf ? await controllerOf(ctx, summon, userId) : null;

        if (!summon || !owner)
            throw new ConvexError('That is not your companion.');

        const companion = summon.companionId ? await ctx.db.get('companions', summon.companionId) : null;

        if (companion)
        {
            if (companion.avatarId)
                await dropFile(ctx, companion.avatarId);

            await ctx.db.delete('companions', companion._id);
        }

        await dropSummon(ctx, summon);

        const scenario = await scenarioOf(ctx, owner.sessionId, owner.scenarioId);

        if (scenario)
            await refreshSight(ctx, owner.sessionId, scenario);

        return null;
    },
});
