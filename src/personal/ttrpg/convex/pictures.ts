import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireHost, requireSession } from './access';
import { scenariosOf } from './sessions';

/*
 * Uploading map and prop pictures. The browser asks for an upload address, sends the file there
 * itself, then registers it here. Convex storage addresses do not expire, so scenarios keep the
 * address itself, like any other picture, see types.ts.
 */

/** A 4096 px WebP from services/images.ts stays well under this. */
const maxPictureBytes = 15 * 1024 * 1024;

/**
 * The public address of an uploaded picture. Anyone with an upload address can send any file, so
 * what arrived is checked here: a missing file, one that is not a picture or one too big gives
 * null, and is deleted. Null rather than an error, since an error would undo the delete too.
 */
export async function storedPicture(
    ctx: MutationCtx,
    storageId: Id<'_storage'>,
    maxBytes = maxPictureBytes,
): Promise<string | null>
{
    const file = await ctx.db.system.get('_storage', storageId);
    const src = await ctx.storage.getUrl(storageId);

    if (file && src && file.contentType?.startsWith('image/') && file.size <= maxBytes)
        return src;

    if (file)
        await ctx.storage.delete(storageId);

    return null;
}

/** A one-time address to upload one file to. */
export const uploadUrl = mutation({
    args: {},
    handler: async (ctx) =>
    {
        await requireHost(ctx);

        return await ctx.storage.generateUploadUrl();
    },
});

/**
 * A map's background, which belongs to its session rather than the prop library. Recorded with
 * the session, so it is deleted once no map of it can use it again, see freeMaps in sessions.ts.
 */
export const addMap = mutation({
    args: { sessionId: v.id('sessions'), storageId: v.id('_storage') },
    handler: async (ctx, { sessionId, storageId }) =>
    {
        await requireSession(ctx, sessionId);
        const src = await storedPicture(ctx, storageId);

        if (src)
            await ctx.db.insert('mapPictures', { sessionId, storageId, src });

        return src;
    },
});

/** The picture in the host's library with this content, as the editor shows it, or null. */
async function twinOf(ctx: QueryCtx, ownerId: Id<'users'>, hash: string)
{
    const twin = await ctx.db
        .query('pictures')
        .withIndex('by_ownerId_and_hash', (q) => q.eq('ownerId', ownerId).eq('hash', hash))
        .first();

    if (!twin)
        return null;

    const file = await ctx.db.system.get('_storage', twin.storageId);
    const { _id: id, name, src, width, height } = twin;

    return { id, name, src, width, height, bytes: file?.size ?? 0 };
}

/**
 * The prop already in the library with the same content as a picture about to be uploaded, so the
 * browser skips sending it again, see uploadProp in services/backend.ts. Pictures from before the
 * hash existed are never matched.
 */
export const findProp = query({
    args: { hash: v.string() },
    handler: async (ctx, { hash }) => await twinOf(ctx, await requireHost(ctx), hash),
});

/**
 * A prop picture, kept in the host's library for every session. Null for a refused file. When the
 * same picture went in meanwhile, from another tab, the new file is deleted and that one given.
 */
export const addProp = mutation({
    args: {
        storageId: v.id('_storage'),
        name: v.string(),
        width: v.number(),
        height: v.number(),
        hash: v.string(),
    },
    handler: async (ctx, { storageId, name, width, height, hash }) =>
    {
        const ownerId = await requireHost(ctx);
        const twin = await twinOf(ctx, ownerId, hash);

        if (twin)
        {
            await ctx.storage.delete(storageId);

            return twin;
        }

        const src = await storedPicture(ctx, storageId);

        if (!src)
            return null;

        const picture = { ownerId, storageId, name: name.trim().slice(0, 60) || 'Prop', src, width, height, hash };
        const id = await ctx.db.insert('pictures', picture);
        const file = await ctx.db.system.get('_storage', storageId);

        return { id, name: picture.name, src, width, height, bytes: file?.size ?? 0 };
    },
});

/**
 * Takes a prop picture out of the host's library and deletes its file, which frees the storage.
 * Its placed copies on every map of the host go too, as they would only leave a hole. The open
 * editor takes them off its own maps as well, see removePicture in MapEditor.tsx, because it
 * saves a changed map back whole.
 */
export const removeProp = mutation({
    args: { pictureId: v.id('pictures') },
    handler: async (ctx, { pictureId }) =>
    {
        const ownerId = await requireHost(ctx);
        const picture = await ctx.db.get('pictures', pictureId);

        // Already gone, from another tab, is the same as done.
        if (!picture || picture.ownerId !== ownerId)
            return null;

        const sessions = await ctx.db
            .query('sessions')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
            .take(200);

        for (const session of sessions)
        {
            for (const doc of await scenariosOf(ctx, session._id))
            {
                const props = doc.scenario.props.filter((prop) => prop.src !== picture.src);

                if (props.length < doc.scenario.props.length)
                    await ctx.db.patch('scenarios', doc._id, { scenario: { ...doc.scenario, props } });

            }
        }

        await ctx.storage.delete(picture.storageId);
        await ctx.db.delete('pictures', pictureId);

        return null;
    },
});

/** How much is stored, for the meter on the dashboard: the host's own props, and everything else. */
export const usage = query({
    args: {},
    handler: async (ctx) =>
    {
        const ownerId = await requireHost(ctx);
        const files = await ctx.db.system.query('_storage').take(10000);
        const sizes = new Map(files.map((file) => [file._id, file.size]));
        const pictures = await ctx.db
            .query('pictures')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
            .take(1000);
        const propBytes = pictures.reduce((sum, picture) => sum + (sizes.get(picture.storageId) ?? 0), 0);
        const total = files.reduce((sum, file) => sum + file.size, 0);

        return { propBytes, otherBytes: total - propBytes };
    },
});


/** Most rows tidy reads from a table. A table that holds more stops it, see tidy. */
const tidyLimit = 10000;

/**
 * Run once, with `npx convex run pictures:tidy`, for the files stored before deleting a map,
 * a background or a session freed them. Map pictures still in use are recorded with their
 * session, so they are freed from now on, see freeMaps in sessions.ts, and every other file
 * nothing uses is deleted. Files from the last day stay, as an upload may be on its way. A table
 * too big to read whole stops it before it deletes anything, since a file used from the rows it
 * did not read would look unused. Gives the bytes it freed.
 */
export const tidy = internalMutation({
    args: {},
    handler: async (ctx) =>
    {
        const pictures = await ctx.db.query('pictures').take(tidyLimit);
        const tokens = await ctx.db.query('tokens').take(tidyLimit);
        const recorded = await ctx.db.query('mapPictures').take(tidyLimit);
        const scenarios = await ctx.db.query('scenarios').take(tidyLimit);
        const files = await ctx.db.system.query('_storage').take(tidyLimit);

        if ([pictures, tokens, recorded, scenarios, files].some((rows) => rows.length === tidyLimit))
            throw new Error('Too many rows to read at once, nothing was deleted.');

        const used = new Set<string>([
            ...pictures.map((picture) => picture.storageId),
            ...tokens.flatMap((token) => token.avatarId ?? []),
            ...recorded.map((picture) => picture.storageId),
        ]);
        const sessionOf = new Map(scenarios.flatMap(({ sessionId, scenario }) => (scenario.background ? [[scenario.background, sessionId] as const] : [])));
        let freed = 0;

        for (const file of files)
        {
            if (used.has(file._id))
                continue;

            const src = (await ctx.storage.getUrl(file._id)) ?? '';
            const sessionId = sessionOf.get(src);

            if (sessionId)

                await ctx.db.insert('mapPictures', { sessionId, storageId: file._id, src });

            else if (file._creationTime < Date.now() - 24 * 60 * 60 * 1000)
            {
                await ctx.storage.delete(file._id);
                freed += file.size;
            }
        }

        return freed;
    },
});
