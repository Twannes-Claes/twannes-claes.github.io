import { getAuthUserId } from '@convex-dev/auth/server';
import { httpRouter } from 'convex/server';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { httpAction } from './_generated/server';
import { auth } from './auth';
import { pictureTypes } from './pictures';
import { maxAvatarBytes } from './play';

/** The address Discord sends people back to after signing in, and the players' picture upload. */
const http = httpRouter();

auth.addHttpRoutes(http);

/** The site calls from its own address, on another domain than this one. */
const cors = { 'Access-Control-Allow-Origin': '*' };

/** What keepAvatar in play.ts says, as the answer the browser gets. */
const statusOf = { 'kept': 204, 'refused': 422, 'not joined': 403 } as const;

/**
 * A player's token picture, sent by uploadAvatar in services/backend.ts. Everything that can be
 * checked is checked before the file is stored: signed in, a picture, and small enough, so a
 * player cannot fill storage the way an open upload address would let them. keepAvatar then
 * checks they joined, and swaps it for their old picture. Answers 204 when kept, 422 when the
 * picture was refused, 403 for someone not at the table, and 400, 401, 413 or 415 before storing.
 */
http.route({
    path: '/avatar',
    method: 'POST',
    handler: httpAction(async (ctx, request) =>
    {
        const answer = (status: number) => new Response(null, { status, headers: cors });
        const userId = await getAuthUserId(ctx);
        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('session');
        // A summon's picture names the summon, see summons.ts; without it, the player's own.
        const tokenId = searchParams.get('token') ?? undefined;
        // From the account page, a saved character's or summon's picture, see characters.ts.
        const characterId = searchParams.get('character') ?? undefined;
        const companionId = searchParams.get('companion') ?? undefined;

        if (!userId)
            return answer(401);

        if (!sessionId && !characterId && !companionId)
            return answer(400);

        if (!pictureTypes.includes(request.headers.get('Content-Type') ?? ''))
            return answer(415);

        // Without a length the body is not read at all, so nothing big is taken in to find out.
        if (Number(request.headers.get('Content-Length') ?? Infinity) > maxAvatarBytes)
            return answer(413);

        const picture = await request.blob();

        if (picture.size > maxAvatarBytes)
            return answer(413);

        const storageId = await ctx.storage.store(picture);
        const keep = sessionId
            ? ctx.runMutation(internal.play.keepAvatar, { sessionId: sessionId as Id<'sessions'>, userId, storageId, tokenId })
            : ctx.runMutation(internal.characters.keepPicture, { userId, storageId, characterId, companionId });
        const result = await keep
            .catch(async () =>
            {
                // A session id that is not one fails the arguments check, before keepAvatar can
                // delete the file itself.
                await ctx.storage.delete(storageId);

                return 'not joined' as const;
            });

        return answer(statusOf[result]);
    }),
});

/** The browser's check before the upload, since it sends a sign-in token to another domain. */
http.route({
    path: '/avatar',
    method: 'OPTIONS',
    handler: httpAction(async () =>
        new Response(null, {
            status: 204,
            headers: {
                ...cors,
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Max-Age': '86400',
            },
        })),
});

export default http;
