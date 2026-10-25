import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireHost, requireSession } from './access';
import { scenariosOf } from './sessions';
import { count, dropFile, totalBytes } from './usage';

/*
 * Uploading map and prop pictures. The browser asks for an upload address, sends the file there
 * itself, then registers it here. Convex storage addresses do not expire, so scenarios keep the
 * address itself, like any other picture, see types.ts.
 */

/** A 4096 px WebP from services/images.ts stays well under this. */
const maxPictureBytes = 15 * 1024 * 1024;

/**
 * What services/images.ts sends: WebP, or PNG from a browser that cannot make WebP. JPEG for good
 * measure. Never SVG, which can carry script and would be served as a page from storage.
 */
export const pictureTypes = ['image/webp', 'image/png', 'image/jpeg'];

/**
 * Whether a stored file already belongs to a prop, a map, a token or a preset. A storage id is part
 * of the file's public address, so without this a host could register someone else's file as their
 * own and then delete it.
 */
async function claimed(ctx: QueryCtx, storageId: Id<'_storage'>): Promise<boolean>
{
    const prop = await ctx.db
        .query('pictures')
        .withIndex('by_storageId', (q) => q.eq('storageId', storageId))
        .first();
    const map = await ctx.db
        .query('mapPictures')
        .withIndex('by_storageId', (q) => q.eq('storageId', storageId))
        .first();
    const avatar = await ctx.db
        .query('tokens')
        .withIndex('by_avatarId', (q) => q.eq('avatarId', storageId))
        .first();
    const preset = await ctx.db
        .query('presets')
        .withIndex('by_avatarId', (q) => q.eq('avatarId', storageId))
        .first();
    const character = await ctx.db
        .query('characters')
        .withIndex('by_avatarId', (q) => q.eq('avatarId', storageId))
        .first();
    const companion = await ctx.db
        .query('companions')
        .withIndex('by_avatarId', (q) => q.eq('avatarId', storageId))
        .first();

    return prop !== null || map !== null || avatar !== null || preset !== null || character !== null || companion !== null;
}

/**
 * The public address of an uploaded picture. Anyone with an upload address can send any file, so
 * what arrived is checked here: a missing file, one that is not a picture or one too big gives
 * null, and is deleted. A file that already belongs to something gives null and stays, see
 * claimed. A kept file counts towards the storage meter, see usage.ts, since every caller keeps
 * it. Null rather than an error, since an error would undo the delete too.
 */
export async function storedPicture(
    ctx: MutationCtx,
    storageId: Id<'_storage'>,
    maxBytes = maxPictureBytes,
): Promise<string | null>
{
    if (await claimed(ctx, storageId))
        return null;

    const file = await ctx.db.system.get('_storage', storageId);
    const src = await ctx.storage.getUrl(storageId);

    if (file && src && pictureTypes.includes(file.contentType ?? '') && file.size <= maxBytes)
    {
        await count(ctx, file.size);

        return src;
    }

    if (file)
        await ctx.storage.delete(storageId);

    return null;
}

/**
 * When sweep runs after an upload address is made. The address lasts an hour, and the file is
 * registered seconds after it arrives, so by then anything sent with it is either kept or left.
 */
const sweepDelay = 75 * 60 * 1000;

/** How old an unclaimed file must be for sweep to delete it, so a registration on its way lands. */
const sweepGrace = 10 * 60 * 1000;

/**
 * A one-time address to upload one file to. A file sent there and never registered, from a closed
 * tab or a save that failed after the upload, is deleted by sweep.
 */
export const uploadUrl = mutation({
    args: {},
    handler: async (ctx) =>
    {
        await requireHost(ctx);
        await ctx.scheduler.runAfter(sweepDelay, internal.pictures.sweep, { since: Date.now() });

        return await ctx.storage.generateUploadUrl();
    },
});

/**
 * Deletes the files stored since an upload address was made that nothing claimed, see uploadUrl.
 * Every address gets its own sweep, starting just before its file, so the first 100 always hold
 * it. Player pictures come through the /avatar route in http.ts instead, which deletes its own.
 */
export const sweep = internalMutation({
    args: { since: v.number() },
    handler: async (ctx, { since }) =>
    {
        const files = await ctx.db.system
            .query('_storage')
            .withIndex('by_creation_time', (q) =>
                q.gte('_creationTime', since).lt('_creationTime', Date.now() - sweepGrace),
            )
            .take(100);

        for (const file of files)
        {
            if (!(await claimed(ctx, file._id)))
                await ctx.storage.delete(file._id);

        }

        return null;
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

    const { _id: id, name, src, width, height, bytes } = twin;

    return { id, name, src, width, height, bytes };
}

/**
 * The prop already in the library with the same content as a picture about to be uploaded, so the
 * browser skips sending it again, see uploadProp in services/backend.ts.
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

        // Before the twin, which deletes the file it was given.
        if (await claimed(ctx, storageId))
            return null;

        const twin = await twinOf(ctx, ownerId, hash);

        if (twin)
        {
            await ctx.storage.delete(storageId);

            return twin;
        }

        const src = await storedPicture(ctx, storageId);

        if (!src)
            return null;

        const bytes = (await ctx.db.system.get('_storage', storageId))?.size ?? 0;
        const picture = { ownerId, storageId, name: name.trim().slice(0, 60) || 'Prop', src, width, height, hash, bytes };
        const id = await ctx.db.insert('pictures', picture);

        return { id, name: picture.name, src, width, height, bytes };
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

        await dropFile(ctx, picture.storageId);
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
        const pictures = await ctx.db
            .query('pictures')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
            .take(1000);
        const propBytes = pictures.reduce((sum, picture) => sum + picture.bytes, 0);

        return { propBytes, otherBytes: (await totalBytes(ctx)) - propBytes };
    },
});
