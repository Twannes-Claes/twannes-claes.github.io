import { ConvexReactClient } from 'convex/react';
import { ConvexError } from 'convex/values';

import type { Store } from '../types';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

import { convexUrl } from './config';
import { baseName, fingerprint, toWebp } from './images';

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

/** Map pictures are shrunk to this before uploading: sharp on a 4K screen. */
const maxSide = 4096;

/**
 * Props are a few cells on the map, so half that is still sharp zoomed in, at a quarter of the
 * storage for a big one.
 */
const propSide = 2048;

/** Sends a host's picture to Convex storage, to a one-time address from convex/pictures.ts. */
export async function upload(blob: Blob): Promise<Id<'_storage'>>
{
    const address = await client.mutation(api.pictures.uploadUrl, {});
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

/** Where the HTTP routes in convex/http.ts answer: the deployment's address on .site, not .cloud. */
const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL || convexUrl.replace(/\.cloud$/, '.site');

/**
 * Sends a player's token picture to the /avatar route in convex/http.ts, which checks it before it
 * is stored and deletes their old one. authToken is the anonymous sign in, from useAuthToken. False
 * when the picture was refused.
 */
export async function uploadAvatar(sessionId: string, picture: Blob, authToken: string | null): Promise<boolean>
{
    const response = await fetch(`${siteUrl}/avatar?session=${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken ?? ''}`, 'Content-Type': picture.type },
        body: picture,
    });

    if (response.status === 413 || response.status === 415 || response.status === 422)
        return false;

    if (!response.ok)
        throw new Error('The picture did not upload. Check the connection and try again.');

    return true;
}

/** The editor's store for one saved session, see Store in types.ts. */
export function sessionStore(sessionId: Id<'sessions'>): Store
{
    return {
        uploadProp: async (file) =>
        {
            // A picture already in the library is given back as it is, without sending it again.
            const hash = await fingerprint(file);
            const twin = await client.query(api.pictures.findProp, { hash });

            if (twin)
                return twin;

            const { blob, width, height, scale } = await toWebp(file, propSide);
            const storageId = await upload(blob);

            // The size before shrinking, which sets how big it lands on the map, see placedSize in
            // map/props.ts, so a shrunk prop lands as big as the picture it came from.
            const picture = await client.mutation(api.pictures.addProp, {
                storageId,
                name: baseName(file),
                width: Math.round(width / scale),
                height: Math.round(height / scale),
                hash,
            });

            if (!picture)
                throw new Error(refused);

            return picture;
        },
        removeProp: async (picture) =>
        {
            await client.mutation(api.pictures.removeProp, { pictureId: picture.id as Id<'pictures'> });
        },
        uploadMap: async (picture) =>
        {
            const { blob, width, height } = await toWebp(picture, maxSide);
            const storageId = await upload(blob);
            const src = await client.mutation(api.pictures.addMap, { sessionId, storageId });

            if (!src)
                throw new Error(refused);

            return { src, width, height };
        },
        save: async (scenarios, changed, held) =>
        {
            const order = scenarios.map((scenario) => scenario.id);

            await client.mutation(api.sessions.save, { sessionId, order, changed, held });
        },
        release: async () =>
        {
            await client.mutation(api.sessions.release, { sessionId });
        },
    };
}
