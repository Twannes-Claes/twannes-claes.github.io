import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

/*
 * The running total of stored bytes behind the storage meter, so it never reads every file. It
 * counts the files something keeps: a prop, a map picture or a token picture. An upload on its
 * way, or one refused, is not counted, and is deleted with ctx.storage.delete as it is. A kept
 * file is deleted with dropFile, so the total stays true. pictures:tidy sets it from scratch.
 */

/** Every kept file's bytes together. */
export async function totalBytes(ctx: QueryCtx): Promise<number>
{
    return (await ctx.db.query('usage').first())?.bytes ?? 0;
}

/** Adds bytes to the total, or takes them off when negative, see storedPicture in pictures.ts. */
export async function count(ctx: MutationCtx, bytes: number)
{
    const row = await ctx.db.query('usage').first();

    if (row)
        await ctx.db.patch('usage', row._id, { bytes: Math.max(0, row.bytes + bytes) });
    else
        await ctx.db.insert('usage', { bytes: Math.max(0, bytes) });

}

/** Deletes a kept file and takes its bytes off the total. */
export async function dropFile(ctx: MutationCtx, storageId: Id<'_storage'>)
{
    const file = await ctx.db.system.get('_storage', storageId);

    if (!file)
        return;

    await ctx.storage.delete(storageId);
    await count(ctx, -file.size);
}
