import { ConvexError, v } from 'convex/values';

import type { Track } from '../types';

import { videoId } from '../content/music';

import { mutation, query } from './_generated/server';
import { requireHost } from './access';
import { limit } from './limits';

/*
 * The GM's music, YouTube links with a name each, kept for all their sessions like the presets,
 * see Music in PLAN.md. Only the video id is stored; the editor's tab plays it, see
 * components/MusicPanel.tsx.
 */

const maxTracks = 200;

/** The host's links, by name. */
export const list = query({
    args: {},
    handler: async (ctx): Promise<Track[]> =>
    {
        const ownerId = await requireHost(ctx);
        const tracks = await ctx.db
            .query('music')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
            .take(maxTracks);

        return tracks
            .map(({ _id, name, videoId }) => ({ id: _id, name, videoId }))
            .sort((a, b) => a.name.localeCompare(b.name));
    },
});

/** Adds a link to the host's music, or with an id renames or relinks one of theirs. */
export const save = mutation({
    args: { trackId: v.optional(v.id('music')), name: v.string(), link: v.string() },
    handler: async (ctx, { trackId, name, link }) =>
    {
        const ownerId = await requireHost(ctx);

        await limit(ctx, ownerId, 'make');

        const id = videoId(link);

        if (!id)
            throw new ConvexError('That is not a YouTube video link.');

        const track = { name: name.trim().slice(0, 60) || 'Music', videoId: id };

        if (trackId)
        {
            const was = await ctx.db.get('music', trackId);

            if (!was || was.ownerId !== ownerId)
                throw new ConvexError('That link is gone. Add it again.');

            await ctx.db.patch('music', trackId, track);

            return null;
        }

        const kept = await ctx.db
            .query('music')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
            .take(maxTracks);

        if (kept.length >= maxTracks)
            throw new ConvexError(`The music holds at most ${maxTracks} links.`);

        await ctx.db.insert('music', { ownerId, ...track });

        return null;
    },
});

/** Takes a link out of the host's music. */
export const remove = mutation({
    args: { trackId: v.id('music') },
    handler: async (ctx, { trackId }) =>
    {
        const ownerId = await requireHost(ctx);

        await limit(ctx, ownerId, 'make');

        const track = await ctx.db.get('music', trackId);

        // Already gone, from another tab, is the same as done.
        if (track && track.ownerId === ownerId)
            await ctx.db.delete('music', trackId);

        return null;
    },
});
