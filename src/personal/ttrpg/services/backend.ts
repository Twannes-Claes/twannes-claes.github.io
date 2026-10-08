import { ConvexReactClient } from 'convex/react';
import { ConvexError } from 'convex/values';

import type { Store } from '../types';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

import { convexUrl } from './config';
import { baseName, toWebp } from './images';

/*
 * The connection to Convex. Only ever reached through a dynamic import(), see pages/, so Convex
 * stays out of the portfolio bundle, the prerender and the demo.
 */

export const client = new ConvexReactClient(convexUrl);

/** The text of an error the server meant for people, see convex/, or a general one. */
export function explain(reason: unknown, fallback: string): string
{
    return reason instanceof ConvexError && typeof reason.data === 'string' ? reason.data : fallback;
}

/** Why the server gave null for an upload, see storedPicture in convex/pictures.ts. */
const refused = 'That file is not a picture, or it is too big.';

/** Map and prop pictures are shrunk to this before uploading: sharp on a 4K screen. */
const maxSide = 4096;

/**
 * Sends a picture to Convex storage, to a one-time address from convex/pictures.ts, or from
 * convex/play.ts for a player's token.
 */
export async function upload(blob: Blob, address?: string): Promise<Id<'_storage'>>
{
    address ??= await client.mutation(api.pictures.uploadUrl, {});

    const response = await fetch(address, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
    });

    if (!response.ok)
        throw new Error('The picture did not upload. Check the connection and try again.');

    const { storageId } = (await response.json()) as { storageId: Id<'_storage'> };

    return storageId;
}

/** The editor's store for one saved session, see Store in types.ts. */
export function sessionStore(sessionId: Id<'sessions'>): Store
{
    return {
        uploadProp: async (file) =>
        {
            const { blob, width, height } = await toWebp(file, maxSide);
            const storageId = await upload(blob);

            const picture = await client.mutation(api.pictures.addProp, {
                storageId,
                name: baseName(file),
                width,
                height,
            });

            if (!picture)
                throw new Error(refused);

            return picture;
        },
        uploadMap: async (picture) =>
        {
            const { blob, width, height } = await toWebp(picture, maxSide);
            const src = await client.mutation(api.pictures.addMap, { storageId: await upload(blob) });

            if (!src)
                throw new Error(refused);

            return { src, width, height };
        },
        save: async (scenarios, changed) =>
        {
            const order = scenarios.map((scenario) => scenario.id);

            await client.mutation(api.sessions.save, { sessionId, order, changed });
        },
    };
}
