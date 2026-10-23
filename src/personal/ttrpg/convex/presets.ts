import { ConvexError, v } from 'convex/values';

import type { Preset } from '../types';

import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { requireHost } from './access';
import { maxAvatarBytes } from './play';
import { storedPicture } from './pictures';
import { dropFile } from './usage';

/*
 * The game master's monster presets, stat blocks in Markdown with a picture, kept for all their
 * sessions like the props, see "Monster presets" in PLAN.md. Monsters only come onto a map from
 * one, see placeMonster in play.ts. The server keeps the Markdown as written.
 */

/** Far past the longest stat block, a dragon with lair and legendary actions. */
const maxMarkdown = 20_000;
// ponytail: every preset is listed whole, fine for a library of a few hundred. Past that, list
// names only and load one stat block when it is opened.
const maxPresets = 300;
const colourPattern = /^#[0-9a-f]{6}$/i;

/** The host's presets, by name. */
export const list = query({
    args: {},
    handler: async (ctx): Promise<Preset[]> =>
    {
        const ownerId = await requireHost(ctx);
        const presets = await ctx.db
            .query('presets')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
            .take(maxPresets);

        return presets
            .map(({ _id, name, markdown, downs, color, avatar }) => ({ id: _id, name, markdown, downs, color, avatar }))
            .sort((a, b) => a.name.localeCompare(b.name));
    },
});

/**
 * Adds a preset to the host's library, or with an id changes one of theirs. A new picture, uploaded
 * first, replaces the old one. Gives its id.
 */
export const save = mutation({
    args: {
        presetId: v.optional(v.id('presets')),
        name: v.string(),
        markdown: v.string(),
        downs: v.boolean(),
        color: v.string(),
        storageId: v.optional(v.id('_storage')),
    },
    handler: async (ctx, { presetId, name, markdown, downs, color, storageId }) =>
    {
        const ownerId = await requireHost(ctx);
        const preset = { name: name.trim().slice(0, 60) || 'Monster', markdown, downs, color };

        if (markdown.length > maxMarkdown)
            throw new ConvexError('That stat block is too long.');

        if (!colourPattern.test(color))
            throw new ConvexError('Pick a ring colour.');

        const was = presetId ? await ctx.db.get('presets', presetId) : null;

        if (presetId && (!was || was.ownerId !== ownerId))
            throw new ConvexError('That preset is gone. Save it as a new one.');

        if (!was)
        {
            const kept = await ctx.db
                .query('presets')
                .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
                .take(maxPresets);

            if (kept.length >= maxPresets)
                throw new ConvexError(`The library holds at most ${maxPresets} presets.`);
        }

        const avatar = storageId ? await storedPicture(ctx, storageId, maxAvatarBytes) : null;

        // Null rather than an error, which would undo deleting the refused file, see storedPicture.
        if (storageId && !avatar)
            return null;

        const picture = avatar ? { avatar, avatarId: storageId } : {};

        if (!was)
            return await ctx.db.insert('presets', { ownerId, ...preset, ...picture });

        if (avatar)
        {
            if (was.avatarId)
                await dropFile(ctx, was.avatarId);

            await repaint(ctx, was._id, avatar);
        }

        await ctx.db.patch('presets', was._id, { ...preset, ...picture });

        return was._id;
    },
});

/**
 * Gives the monsters placed from a preset its new picture, or none. One that came with its own
 * picture, from before presets, keeps it.
 */
async function repaint(ctx: MutationCtx, presetId: Id<'presets'>, avatar: string | undefined)
{
    // ponytail: the session limit of monsters per preset in practice, far under mutation limits.
    const placed = await ctx.db
        .query('tokens')
        .withIndex('by_presetId', (q) => q.eq('presetId', presetId))
        .take(1000);

    for (const token of placed)
    {
        if (!token.avatarId)
            await ctx.db.patch('tokens', token._id, { avatar });

    }

    return placed;
}

/**
 * Takes a preset out of the library, and its picture with it. Monsters placed from it stay, showing
 * their initial in place of the picture.
 */
export const remove = mutation({
    args: { presetId: v.id('presets') },
    handler: async (ctx, { presetId }) =>
    {
        const ownerId = await requireHost(ctx);
        const preset = await ctx.db.get('presets', presetId);

        // Already gone, from another tab, is the same as done.
        if (!preset || preset.ownerId !== ownerId)
            return null;

        for (const token of await repaint(ctx, presetId, undefined))
            await ctx.db.patch('tokens', token._id, { presetId: undefined });

        if (preset.avatarId)
            await dropFile(ctx, preset.avatarId);

        await ctx.db.delete('presets', presetId);

        return null;
    },
});
