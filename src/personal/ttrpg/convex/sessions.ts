import { ConvexError, v } from 'convex/values';

import { demoOgre, demoScenario } from '../content/scenarios';

import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireHost, requireSession } from './access';
import { scenarioValidator, systemValidator } from './schema';
import { refreshSight, tokensOf } from './sight';
import { dropFile, totalBytes } from './usage';

/** More maps than anyone plays in one session, and a cap on what one save can ask for. */
const maxScenarios = 100;

/** A name as typed, tidied and kept short enough for the dashboard. Empty when nothing was typed. */
function tidyName(name: string): string
{
    return name.trim().slice(0, 60);
}

/** Every scenario document of a session, which is a handful, so one batch reads them all. */
export function scenariosOf(ctx: QueryCtx, sessionId: Id<'sessions'>)
{
    return ctx.db
        .query('scenarios')
        .withIndex('by_sessionId_and_scenario_id', (q) => q.eq('sessionId', sessionId))
        .take(500);
}

/**
 * Deletes the session's map pictures that are not in keep, and their files, see addMap in
 * pictures.ts. Ones younger than spare stay too, see save.
 */
async function freeMaps(ctx: MutationCtx, sessionId: Id<'sessions'>, keep: Set<string>, spare = 0)
{
    const pictures = await ctx.db
        .query('mapPictures')
        .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
        .take(1000);

    for (const picture of pictures)
    {
        if (keep.has(picture.src) || picture._creationTime > Date.now() - spare)
            continue;

        await dropFile(ctx, picture.storageId);
        await ctx.db.delete('mapPictures', picture._id);
    }
}

/** The backgrounds the session's saved maps show. */
async function backgroundsOf(ctx: QueryCtx, sessionId: Id<'sessions'>): Promise<Set<string>>
{
    const docs = await scenariosOf(ctx, sessionId);

    return new Set(docs.flatMap((doc) => doc.scenario.background ?? []));
}

/**
 * A new host's first session: the demo map, so the dashboard does not start empty and there is
 * something to look around in and play with. Its picture lives with the site, see
 * content/scenarios.ts, so it stores nothing.
 */
export async function addExample(ctx: MutationCtx, ownerId: Id<'users'>): Promise<Id<'sessions'>>
{
    const scenario = { ...demoScenario, id: crypto.randomUUID() };
    const sessionId = await ctx.db.insert('sessions', {
        ownerId,
        name: `Demo: ${demoScenario.name}`,
        order: [scenario.id],
        updatedAt: Date.now(),
    });

    await ctx.db.insert('scenarios', { sessionId, scenario });
    // A real monster, so the GM can drag, hide or remove it once the session runs on this map.
    await ctx.db.insert('tokens', { sessionId, scenarioId: scenario.id, ...demoOgre(scenario.grid) });

    return sessionId;
}

/** The example session again, from the dashboard, for a host who deleted theirs or never had it. */
export const example = mutation({
    args: {},
    handler: async (ctx) => await addExample(ctx, await requireHost(ctx)),
});

/** The signed-in host's sessions, last edited first, for the dashboard. */
export const list = query({
    args: {},
    handler: async (ctx) =>
    {
        const ownerId = await requireHost(ctx);
        const sessions = await ctx.db
            .query('sessions')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
            .take(200);

        return sessions
            .map((session) => ({
                id: session._id,
                name: session.name,
                maps: session.order.length,
                updatedAt: session.updatedAt,
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt);
    },
});

export const create = mutation({
    args: { name: v.string() },
    handler: async (ctx, { name }) =>
    {
        const ownerId = await requireHost(ctx);

        return await ctx.db.insert('sessions', {
            ownerId,
            name: tidyName(name) || 'New session',
            order: [],
            updatedAt: Date.now(),
        });
    },
});

/** The host changes the game a session is played in, see GameSystem in types.ts. */
export const setSystem = mutation({
    args: { sessionId: v.id('sessions'), system: systemValidator },
    handler: async (ctx, { sessionId, system }) =>
    {
        await requireSession(ctx, sessionId);
        await ctx.db.patch('sessions', sessionId, { system });

        return null;
    },
});

export const rename = mutation({
    args: { sessionId: v.id('sessions'), name: v.string() },
    handler: async (ctx, { sessionId, name }) =>
    {
        await requireSession(ctx, sessionId);

        if (tidyName(name))
            await ctx.db.patch('sessions', sessionId, { name: tidyName(name) });

        return null;
    },
});

/**
 * Deletes a session with everything in it, the files of its map and token pictures too. Its
 * placed props stay, they belong to the host's library.
 */
export const remove = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        await requireSession(ctx, sessionId);
        await freeMaps(ctx, sessionId, new Set());

        for (const doc of await scenariosOf(ctx, sessionId))
            await ctx.db.delete('scenarios', doc._id);

        for (const token of await tokensOf(ctx, sessionId))
        {
            if (token.avatarId)
                await dropFile(ctx, token.avatarId);

            await ctx.db.delete('tokens', token._id);
        }

        const fog = await ctx.db
            .query('fog')
            .withIndex('by_sessionId_and_scenarioId', (q) => q.eq('sessionId', sessionId))
            .take(maxScenarios);

        for (const doc of fog)
            await ctx.db.delete('fog', doc._id);

        const guesses = await ctx.db
            .query('guesses')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
            .unique();

        if (guesses)
            await ctx.db.delete('guesses', guesses._id);

        const ping = await ctx.db
            .query('pings')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
            .unique();

        if (ping)
            await ctx.db.delete('pings', ping._id);

        const drafts = await ctx.db
            .query('drafts')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
            .take(100);

        for (const draft of drafts)
            await ctx.db.delete('drafts', draft._id);

        const decals = await ctx.db
            .query('decals')
            .withIndex('by_sessionId_and_scenarioId', (q) => q.eq('sessionId', sessionId))
            .take(200);

        for (const decal of decals)
            await ctx.db.delete('decals', decal._id);

        await ctx.db.delete('sessions', sessionId);

        return null;
    },
});

/**
 * Everything the editor opens with: the session's name, its scenarios in order and the host's
 * prop library. Read once, the editor holds the truth while it is open and saves it back.
 * Also the sizes for the storage meter in components/PropLibrary.tsx: each prop's own, and the
 * rest of the deployment's kept files together, maps and tokens and all, see usage.ts.
 * And the size of each of the session's map pictures, for the tip of the background button.
 */
export const load = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const session = await requireSession(ctx, sessionId);
        const docs = await scenariosOf(ctx, sessionId);
        const byId = new Map(docs.map((doc) => [doc.scenario.id, doc.scenario]));
        const pictures = await ctx.db
            .query('pictures')
            .withIndex('by_ownerId', (q) => q.eq('ownerId', session.ownerId))
            .take(1000);
        const library = pictures.map((picture) => ({
            id: picture._id,
            name: picture.name,
            src: picture.src,
            width: picture.width,
            height: picture.height,
            bytes: picture.bytes,
        }));
        const total = await totalBytes(ctx);
        const maps = await ctx.db
            .query('mapPictures')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
            .take(1000);
        const backgrounds = [];

        for (const { src, storageId } of maps)
            backgrounds.push({ src, bytes: (await ctx.db.system.get('_storage', storageId))?.size ?? 0 });

        return {
            name: session.name,
            scenarios: session.order.flatMap((id) => byId.get(id) ?? []),
            library,
            backgrounds,
            otherBytes: total - library.reduce((sum, picture) => sum + picture.bytes, 0),
        };
    },
});

/**
 * The editor's autosave: the scenario ids in order, and only the scenarios that changed since the
 * last save. Scenarios missing from the order were deleted. A map picture no saved map shows is
 * deleted too, unless it is in held: the backgrounds the editor's undo and redo can still bring
 * back. Those go when the editor closes, see release.
 */
export const save = mutation({
    args: {
        sessionId: v.id('sessions'),
        order: v.array(v.string()),
        changed: v.array(scenarioValidator),
        held: v.array(v.string()),
    },
    handler: async (ctx, { sessionId, order, changed, held }) =>
    {
        const session = await requireSession(ctx, sessionId);

        if (order.length > maxScenarios)
            throw new ConvexError(`A session holds at most ${maxScenarios} maps.`);

        if (new Set(order).size !== order.length || changed.some((scenario) => !order.includes(scenario.id)))
            throw new ConvexError('The maps did not save. Reload the page and try again.');

        const docs = await scenariosOf(ctx, sessionId);
        const byId = new Map(docs.map((doc) => [doc.scenario.id, doc]));

        for (const scenario of changed)
        {
            const doc = byId.get(scenario.id);

            if (doc)
                await ctx.db.replace('scenarios', doc._id, { sessionId, scenario });
            else
                await ctx.db.insert('scenarios', { sessionId, scenario });

        }

        for (const doc of docs)
        {
            if (!order.includes(doc.scenario.id))
                await ctx.db.delete('scenarios', doc._id);

        }

        // Every query at a live table reads the session, so a write to it makes each screen run
        // them all again. Only a new order writes it, or the list's date going stale: the list
        // shows the day, so once an hour keeps it true.
        const now = Date.now();

        if (order.join() !== session.order.join() || now - session.updatedAt > 60 * 60 * 1000)
            await ctx.db.patch('sessions', sessionId, { order, updatedAt: now });


        // A picture that finished uploading while this save was on its way is not in it yet.
        const keep = new Set([...(await backgroundsOf(ctx, sessionId)), ...held]);

        await freeMaps(ctx, sessionId, keep, 10 * 60 * 1000);

        // A door opened or a wall moved on the map being played changes what players see.
        const played = changed.find((scenario) => scenario.id === session.activeScenarioId);

        if (played && session.live === true)
            await refreshSight(ctx, sessionId, played);

        return null;
    },
});

/**
 * When the editor closes, its undo goes with it, so the map pictures only undo could bring back
 * are deleted now, see save.
 */
export const release = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        await requireSession(ctx, sessionId);
        await freeMaps(ctx, sessionId, await backgroundsOf(ctx, sessionId));

        return null;
    },
});
