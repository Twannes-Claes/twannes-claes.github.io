import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, type MutationCtx } from './_generated/server';
import { requireHost } from './access';

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

/** A map's background, which belongs to its scenario rather than the prop library. */
export const addMap = mutation({
    args: { storageId: v.id('_storage') },
    handler: async (ctx, { storageId }) =>
    {
        await requireHost(ctx);

        return await storedPicture(ctx, storageId);
    },
});

/** A prop picture, kept in the host's library for every session. Null for a refused file. */
export const addProp = mutation({
    args: { storageId: v.id('_storage'), name: v.string(), width: v.number(), height: v.number() },
    handler: async (ctx, { storageId, name, width, height }) =>
    {
        const ownerId = await requireHost(ctx);
        const src = await storedPicture(ctx, storageId);

        if (!src)
            return null;

        const picture = { ownerId, storageId, name: name.trim().slice(0, 60) || 'Prop', src, width, height };
        const id = await ctx.db.insert('pictures', picture);

        return { id, name: picture.name, src, width, height };
    },
});
