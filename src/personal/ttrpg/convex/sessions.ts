import { ConvexError, v } from 'convex/values';

import { demoOgre, demoScenario } from '../content/scenarios';

import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireHost, requireSession } from './access';
import { scenarioValidator } from './schema';
import { refreshSight, tokensOf } from './sight';

/** More maps than anyone plays in one session, and a cap on what one save can ask for. */
const maxScenarios = 100;

/** A name as typed, tidied and kept short enough for the dashboard. Empty when nothing was typed. */
function tidyName(name: string): string
{
    return name.trim().slice(0, 60);
}

/** Every scenario document of a session, which is a handful, so one batch reads them all. */
function scenariosOf(ctx: QueryCtx, sessionId: Id<'sessions'>)
{
    return ctx.db
        .query('scenarios')
        .withIndex('by_sessionId_and_scenario_id', (q) => q.eq('sessionId', sessionId))
        .take(500);
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
        name: `Example: ${demoScenario.name}`,
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
 * Deletes a session and its scenarios.
 * ponytail: their uploaded map pictures stay in storage. Clean up files no scenario uses if the
 * free 1 GB ever runs short.
 */
export const remove = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        await requireSession(ctx, sessionId);

        for (const doc of await scenariosOf(ctx, sessionId))
            await ctx.db.delete('scenarios', doc._id);

        for (const token of await tokensOf(ctx, sessionId))
            await ctx.db.delete('tokens', token._id);

        const fog = await ctx.db
            .query('fog')
            .withIndex('by_sessionId_and_scenarioId', (q) => q.eq('sessionId', sessionId))
            .take(maxScenarios);

        for (const doc of fog)
            await ctx.db.delete('fog', doc._id);

        await ctx.db.delete('sessions', sessionId);

        return null;
    },
});

/**
 * Everything the editor opens with: the session's name, its scenarios in order and the host's
 * prop library. Read once, the editor holds the truth while it is open and saves it back.
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

        return {
            name: session.name,
            scenarios: session.order.flatMap((id) => byId.get(id) ?? []),
            library: pictures.map((picture) => ({
                id: picture._id,
                name: picture.name,
                src: picture.src,
                width: picture.width,
                height: picture.height,
            })),
        };
    },
});

/**
 * The editor's autosave: the scenario ids in order, and only the scenarios that changed since the
 * last save. Scenarios missing from the order were deleted.
 */
export const save = mutation({
    args: {
        sessionId: v.id('sessions'),
        order: v.array(v.string()),
        changed: v.array(scenarioValidator),
    },
    handler: async (ctx, { sessionId, order, changed }) =>
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

        await ctx.db.patch('sessions', sessionId, { order, updatedAt: Date.now() });

        // A door opened or a wall moved on the map being played changes what players see.
        const played = changed.find((scenario) => scenario.id === session.activeScenarioId);

        if (played && session.live === true)
            await refreshSight(ctx, sessionId, played);

        return null;
    },
});
