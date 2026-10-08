import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';

import type { Point, Scenario, Token } from '../types';
import { distance } from '../map/geometry';
import { pathBlocked } from '../map/path';
import { anchorAt, footprintCenter, footprintKeys } from '../map/size';
import { spawnCells } from '../map/spawn';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireSession, requireUser } from './access';
import { fogSettingsValidator, sizeValidator } from './schema';
import { refreshSight, tokensOf } from './sight';
import { storedPicture } from './pictures';

/*
 * A session being played, see "Playing a session" in PLAN.md. The host starts it with a
 * password, players join with it from their phone, signed in anonymously, and every screen
 * follows the tokens live. Tokens are placed here, on the server, so two players joining at once
 * never get the same cell.
 */

/** A walk longer than this is not something anyone drew by hand. */
const maxPathPoints = 1000;
/** Players at one table, well past any real group, so one password cannot fill the tokens table. */
const maxPlayers = 30;
/** Monsters and NPCs in one session, on all its maps. With the players it stays under tokensOf's 200. */
const maxMonsters = 150;
/** A 256 px WebP avatar from services/images.ts is about 20 KB. */
const maxAvatarBytes = 512 * 1024;
const colourPattern = /^#[0-9a-f]{6}$/i;
/** A 400 by 300 cell map at two samples per cell, one byte each. */
const maxFogBytes = 512 * 1024;

/**
 * Whether a point is on the scenario, give or take two cells: a big creature's middle can stand
 * past a ragged edge of the grid. Also false for NaN and Infinity, which validators let through.
 */
function onScenario({ width, height, grid }: Scenario, { x, y }: Point): boolean
{
    const margin = grid.size * 2;

    return x >= -margin && y >= -margin && x <= width + margin && y <= height + margin;
}

async function sessionOf(ctx: QueryCtx, sessionId: Id<'sessions'>): Promise<Doc<'sessions'>>
{
    const session = await ctx.db.get('sessions', sessionId);

    if (!session)
        throw new ConvexError('That session does not exist.');

    return session;
}

function ownToken(ctx: QueryCtx, sessionId: Id<'sessions'>, userId: Id<'users'>)
{
    return ctx.db
        .query('tokens')
        .withIndex('by_sessionId_and_userId', (q) => q.eq('sessionId', sessionId).eq('userId', userId))
        .unique();
}

async function scenarioOf(ctx: QueryCtx, sessionId: Id<'sessions'>, scenarioId: string): Promise<Scenario | null>
{
    const doc = await ctx.db
        .query('scenarios')
        .withIndex('by_sessionId_and_scenario_id', (q) =>
            q.eq('sessionId', sessionId).eq('scenario.id', scenarioId),
        )
        .unique();

    return doc ? doc.scenario : null;
}

function fogOf(ctx: QueryCtx, sessionId: Id<'sessions'>, scenarioId: string)
{
    return ctx.db
        .query('fog')
        .withIndex('by_sessionId_and_scenarioId', (q) => q.eq('sessionId', sessionId).eq('scenarioId', scenarioId))
        .unique();
}

/** Forgets what was seen of a map. A new epoch, so every screen forgets too, see SharedFog. */
function forgetFog(ctx: MutationCtx, doc: Doc<'fog'>)
{
    return ctx.db.patch('fog', doc._id, { epoch: doc.epoch + 1, seen: new ArrayBuffer(doc.seen.byteLength) });
}

/**
 * The session, for its host or a player who joined it. Null for anyone else, and for a session
 * that is gone: the pages follow these queries live, so they show a message rather than fail.
 */
async function memberOf(ctx: QueryCtx, sessionId: Id<'sessions'>): Promise<Doc<'sessions'> | null>
{
    const userId = await getAuthUserId(ctx);
    const session = await ctx.db.get('sessions', sessionId);

    if (!userId || !session)
        return null;

    return session.ownerId === userId || (await ownToken(ctx, sessionId, userId)) ? session : null;
}

/**
 * Where tokens arriving at a scenario stand: around its spawn point, clear of everyone already
 * there. On the spawn point itself when the walls leave no room.
 */
function spawnSpots(
    scenario: Scenario,
    arriving: Pick<Token, 'size'>[],
    staying: Pick<Token, 'x' | 'y' | 'size'>[],
): Point[]
{
    const { grid, walls, spawn } = scenario;
    const taken = new Set(
        staying.flatMap((token) => [...footprintKeys(grid, anchorAt(grid, token, token.size), token.size)]),
    );
    const cells = spawnCells(grid, walls, scenario, spawn, arriving.length, taken);

    return arriving.map((token, index) =>
        cells[index] ? footprintCenter(grid, cells[index], token.size) : spawn,
    );
}

/** Sends every player to a scenario, around its spawn point. Monsters stay on their own map. */
async function respawn(ctx: MutationCtx, session: Doc<'sessions'>, scenarioId: string)
{
    const scenario = await scenarioOf(ctx, session._id, scenarioId);

    if (!scenario)
        throw new ConvexError('That map is not saved yet. Wait for Saved and try again.');

    const tokens = await tokensOf(ctx, session._id);
    const players = tokens.filter((token) => token.kind === 'player');
    const monsters = tokens.filter((token) => token.kind === 'npc' && token.scenarioId === scenarioId);
    const spots = spawnSpots(scenario, players, monsters);

    for (const [index, player] of players.entries())
    {
        await ctx.db.patch('tokens', player._id, {
            scenarioId,
            ...spots[index],
            path: undefined,
            movedAt: undefined,
        });
    }

    await ctx.db.patch('sessions', session._id, { activeScenarioId: scenarioId });
    await refreshSight(ctx, session._id, scenario);
}

/**
 * Where a session stands, for its host and for a phone that opened the join link: whether it is
 * live, and the caller's own token. The password only goes to the host. Null for a link to a
 * session that is gone, which the page says rather than fails on.
 */
export const status = query({
    args: { sessionId: v.string() },
    handler: async (ctx, args) =>
    {
        const userId = await getAuthUserId(ctx);
        const sessionId = ctx.db.normalizeId('sessions', args.sessionId);
        const session = sessionId ? await ctx.db.get('sessions', sessionId) : null;

        if (!userId || !sessionId || !session)
            return null;

        const host = session.ownerId === userId;
        const mine = await ownToken(ctx, sessionId, userId);

        return {
            sessionId,
            name: session.name,
            live: session.live === true,
            frozen: session.frozen === true,
            activeScenarioId: session.activeScenarioId ?? null,
            mine: mine ? mine._id : null,
            kicked: session.kicked?.includes(userId) === true,
            fogLook: session.fogLook ?? null,
            password: host ? (session.password ?? '') : null,
        };
    },
});

/** The map being played, for players. Their host has it open in the editor already. */
export const scenario = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const session = await memberOf(ctx, sessionId);

        return session && session.activeScenarioId ? await scenarioOf(ctx, sessionId, session.activeScenarioId) : null;
    },
});

/**
 * The tokens on the map being played, live on every screen. Null for anyone not at the table.
 * Players only get the monsters a player can see and the GM has not hidden, so the dev tools on
 * a phone show nothing the table does not; the host gets them all, for Peek.
 */
export const tokens = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }): Promise<Token[] | null> =>
    {
        const session = await memberOf(ctx, sessionId);

        if (!session)
            return null;

        const host = session.ownerId === (await getAuthUserId(ctx));
        const all = await tokensOf(ctx, sessionId);

        return all
            .filter((token) => token.scenarioId === session.activeScenarioId)
            .filter((token) => host || token.kind === 'player' || (token.inSight === true && token.hidden !== true))
            .map(({ _id, kind, name, color, size, speed, avatar, x, y, path, movedAt, hidden }) => ({
                id: _id,
                kind,
                name,
                color,
                size,
                speed,
                avatar,
                x,
                y,
                path,
                movedAt,
                hidden,
            }));
    },
});

/**
 * Whether a password opens a live session, so the join page can ask it before the character.
 * ponytail: nothing slows down guessing. Fine for a password said out loud at a table; count
 * tries per user if sessions ever hold anything worth guessing for.
 */
export const check = query({
    args: { sessionId: v.id('sessions'), password: v.string() },
    handler: async (ctx, { sessionId, password }) =>
    {
        await requireUser(ctx);

        const session = await sessionOf(ctx, sessionId);

        return session.live === true && password.trim() === session.password;
    },
});

/** A player joins with the password and their character, and appears at the spawn point. */
export const join = mutation({
    args: { sessionId: v.id('sessions'), password: v.string(), name: v.string(), color: v.string() },
    handler: async (ctx, { sessionId, password, name, color }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);
        const character = name.trim().slice(0, 30);

        if (session.live !== true || !session.activeScenarioId)
            throw new ConvexError('The session has not started yet.');

        if (session.kicked?.includes(userId))
            throw new ConvexError('The GM removed you from this table.');

        if (password.trim() !== session.password)
            throw new ConvexError('That is not the password.');

        if (!character)
            throw new ConvexError('Your character needs a name.');

        if (!colourPattern.test(color))
            throw new ConvexError('Pick a ring colour.');

        const existing = await ownToken(ctx, sessionId, userId);

        if (existing)
        {
            await ctx.db.patch('tokens', existing._id, { name: character, color });

            return existing._id;
        }

        const scenario = await scenarioOf(ctx, sessionId, session.activeScenarioId);

        if (!scenario)
            throw new ConvexError('The map is not ready yet. Try again in a moment.');

        const all = await tokensOf(ctx, sessionId);

        if (all.filter((token) => token.kind === 'player').length >= maxPlayers)
            throw new ConvexError('The table is full.');

        const here = all.filter((token) => token.scenarioId === session.activeScenarioId);
        const [spot] = spawnSpots(scenario, [{ size: 'medium' }], here);

        const tokenId = await ctx.db.insert('tokens', {
            sessionId,
            userId,
            kind: 'player',
            name: character,
            color,
            size: 'medium',
            speed: 30,
            scenarioId: session.activeScenarioId,
            ...spot,
        });

        await refreshSight(ctx, sessionId, scenario);

        return tokenId;
    },
});

/** A one-time address for a player to upload their token's picture to. */
export const avatarUrl = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const userId = await requireUser(ctx);

        if (!(await ownToken(ctx, sessionId, userId)))
            throw new ConvexError('Join the session first.');

        return await ctx.storage.generateUploadUrl();
    },
});

/**
 * Puts an uploaded picture on the player's token, in place of the one before. False when the
 * file was refused, see storedPicture in pictures.ts.
 */
export const setAvatar = mutation({
    args: { sessionId: v.id('sessions'), storageId: v.id('_storage') },
    handler: async (ctx, { sessionId, storageId }) =>
    {
        const userId = await requireUser(ctx);
        const token = await ownToken(ctx, sessionId, userId);

        if (!token)
            throw new ConvexError('Join the session first.');

        const avatar = await storedPicture(ctx, storageId, maxAvatarBytes);

        if (!avatar)
            return false;

        if (token.avatarId && token.avatarId !== storageId)
            await ctx.storage.delete(token.avatarId);

        await ctx.db.patch('tokens', token._id, { avatar, avatarId: storageId });

        return true;
    },
});

/**
 * A token moves. A player walks their own along the path they drew, while the session is live
 * and not frozen. The host moves any token, with a path to walk or dragged straight there.
 */
export const move = mutation({
    args: {
        tokenId: v.id('tokens'),
        x: v.number(),
        y: v.number(),
        path: v.optional(v.array(v.object({ x: v.number(), y: v.number() }))),
    },
    handler: async (ctx, { tokenId, x, y, path }) =>
    {
        const userId = await requireUser(ctx);
        const token = await ctx.db.get('tokens', tokenId);

        if (!token)
            throw new ConvexError('That token is gone.');

        const session = await sessionOf(ctx, token.sessionId);
        const host = session.ownerId === userId;

        if (!host)
        {
            if (token.userId !== userId)
                throw new ConvexError('That is not your token.');

            if (session.live !== true || session.frozen === true)
                throw new ConvexError('Movement is paused by the GM.');

            if (token.scenarioId !== session.activeScenarioId)
                throw new ConvexError('That map is not being played.');
        }

        const scenario = await scenarioOf(ctx, token.sessionId, token.scenarioId);

        if (!scenario)
            throw new ConvexError('That map is not saved yet. Wait for Saved and try again.');

        if (path && path.length > maxPathPoints)
            throw new ConvexError('That path is too long.');

        if (path && (path.length < 2 || path[path.length - 1].x !== x || path[path.length - 1].y !== y))
            throw new ConvexError('That path does not end where the token goes.');

        if (![...(path ?? []), { x, y }].every((point) => onScenario(scenario, point)))
            throw new ConvexError('That is off the map.');

        // The game master's hand goes anywhere. A player walks from their token and around walls,
        // the way the view lets them draw it, see map/view.ts. Their speed is the GM's to judge.
        if (!host)
        {
            if (!path)
                throw new ConvexError('Draw the path to walk.');

            if (distance(path[0], token) > scenario.grid.size)
                throw new ConvexError('That path does not start at your token.');

            if (pathBlocked(scenario.walls, path))
                throw new ConvexError('A wall is in the way.');
        }

        await ctx.db.patch('tokens', tokenId, { x, y, path, movedAt: path ? Date.now() : undefined });
        await refreshSight(ctx, token.sessionId, scenario);

        return null;
    },
});

/**
 * The host starts the session on a map, with the password players join with. Fresh fog forgets
 * what was seen of every map, for a new night; without it the party picks up where it was.
 */
export const start = mutation({
    args: { sessionId: v.id('sessions'), password: v.string(), scenarioId: v.string(), freshFog: v.boolean() },
    handler: async (ctx, { sessionId, password, scenarioId, freshFog }) =>
    {
        const session = await requireSession(ctx, sessionId);

        const secret = password.trim();

        if (!secret)
            throw new ConvexError('Pick a password for the players.');

        if (secret.length > 50)
            throw new ConvexError('Keep the password under 50 characters.');

        // Starting again forgives whoever was removed: they still need the password.
        await ctx.db.patch('sessions', sessionId, { live: true, password: secret, frozen: false, kicked: undefined });

        if (session.activeScenarioId !== scenarioId)
            await respawn(ctx, session, scenarioId);

        const seen = freshFog
            ? await ctx.db
                .query('fog')
                .withIndex('by_sessionId_and_scenarioId', (q) => q.eq('sessionId', sessionId))
                .take(100)
            : [];

        for (const doc of seen)
            await forgetFog(ctx, doc);

        return null;
    },
});

/**
 * The host removes a player from the table: their token and its picture go, and they cannot join
 * again until the session starts again, see start.
 */
export const kick = mutation({
    args: { tokenId: v.id('tokens') },
    handler: async (ctx, { tokenId }) =>
    {
        const token = await ctx.db.get('tokens', tokenId);

        if (!token)
            return null;

        const session = await requireSession(ctx, token.sessionId);

        if (token.kind !== 'player' || !token.userId)
            throw new ConvexError('Only players can be removed.');

        if (token.avatarId)
            await ctx.storage.delete(token.avatarId);

        await ctx.db.delete('tokens', tokenId);

        const scenario = await scenarioOf(ctx, token.sessionId, token.scenarioId);

        if (scenario)
            await refreshSight(ctx, token.sessionId, scenario);

        // One entry per removal by hand, and emptied on every start, so the list stays short.
        await ctx.db.patch('sessions', session._id, { kicked: [...(session.kicked ?? []), token.userId] });

        return null;
    },
});

/** A monster of the session, for its host. */
async function requireMonster(ctx: MutationCtx, tokenId: Id<'tokens'>): Promise<Doc<'tokens'>>
{
    const token = await ctx.db.get('tokens', tokenId);

    if (!token)
        throw new ConvexError('That monster is gone.');

    await requireSession(ctx, token.sessionId);

    if (token.kind !== 'npc')
        throw new ConvexError('That is a player, not a monster.');

    return token;
}

/**
 * The host adds a monster or NPC to the map being played, lined up with the grid around a point,
 * the middle of their screen. The picture is uploaded first, see pictures.ts. Null when it was
 * refused.
 */
export const addMonster = mutation({
    args: {
        sessionId: v.id('sessions'),
        name: v.string(),
        color: v.string(),
        size: sizeValidator,
        hidden: v.boolean(),
        x: v.number(),
        y: v.number(),
        storageId: v.optional(v.id('_storage')),
    },
    handler: async (ctx, { sessionId, name, color, size, hidden, x, y, storageId }) =>
    {
        const session = await requireSession(ctx, sessionId);
        const monster = name.trim().slice(0, 30);

        if (session.live !== true || !session.activeScenarioId)
            throw new ConvexError('Start the session first.');

        const scenario = await scenarioOf(ctx, sessionId, session.activeScenarioId);

        if (!scenario)
            throw new ConvexError('That map is not saved yet. Wait for Saved and try again.');

        if (!monster)
            throw new ConvexError('The monster needs a name.');

        if (!colourPattern.test(color))
            throw new ConvexError('Pick a ring colour.');

        if (!onScenario(scenario, { x, y }))
            throw new ConvexError('That is off the map.');

        const all = await tokensOf(ctx, sessionId);

        if (all.filter((token) => token.kind === 'npc').length >= maxMonsters)
            throw new ConvexError(`A session holds at most ${maxMonsters} monsters.`);

        const avatar = storageId ? await storedPicture(ctx, storageId, maxAvatarBytes) : null;

        if (storageId && !avatar)
            return null;

        const { grid } = scenario;
        const spot = grid.type === 'none' ? { x, y } : footprintCenter(grid, anchorAt(grid, { x, y }, size), size);

        const tokenId = await ctx.db.insert('tokens', {
            sessionId,
            kind: 'npc',
            name: monster,
            color,
            size,
            speed: 30,
            avatar: avatar ?? undefined,
            avatarId: avatar ? storageId : undefined,
            hidden,
            scenarioId: session.activeScenarioId,
            ...spot,
        });

        await refreshSight(ctx, sessionId, scenario);

        return tokenId;
    },
});

/** The host hides a monster from the players' screens, or shows it again. */
export const hide = mutation({
    args: { tokenId: v.id('tokens'), hidden: v.boolean() },
    handler: async (ctx, { tokenId, hidden }) =>
    {
        await requireMonster(ctx, tokenId);
        await ctx.db.patch('tokens', tokenId, { hidden });

        return null;
    },
});

/** The host takes a monster off the map, picture and all. */
export const removeMonster = mutation({
    args: { tokenId: v.id('tokens') },
    handler: async (ctx, { tokenId }) =>
    {
        const token = await requireMonster(ctx, tokenId);

        if (token.avatarId)
            await ctx.storage.delete(token.avatarId);

        await ctx.db.delete('tokens', tokenId);

        return null;
    },
});

/** What the party has seen of the map being played, for everyone at the table. */
export const fog = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const session = await memberOf(ctx, sessionId);
        const doc = session && session.activeScenarioId ? await fogOf(ctx, sessionId, session.activeScenarioId) : null;

        return doc ? { scenarioId: doc.scenarioId, epoch: doc.epoch, columns: doc.columns, rows: doc.rows, seen: doc.seen } : null;
    },
});

/**
 * The host's table screen adds what it has seen, merged with what was seen before, so a save
 * never takes anything away. A save from before a reset, with an older epoch, is dropped. A map
 * whose grid changed starts over with the new size.
 */
export const saveFog = mutation({
    args: {
        sessionId: v.id('sessions'),
        scenarioId: v.string(),
        epoch: v.number(),
        columns: v.number(),
        rows: v.number(),
        seen: v.bytes(),
    },
    handler: async (ctx, { sessionId, scenarioId, epoch, columns, rows, seen }) =>
    {
        await requireSession(ctx, sessionId);

        if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns * rows !== seen.byteLength)
            throw new ConvexError('That fog does not fit the map.');

        if (seen.byteLength > maxFogBytes)
            throw new ConvexError('That map is too big to remember the fog of.');

        const doc = await fogOf(ctx, sessionId, scenarioId);

        if (!doc)
        {
            await ctx.db.insert('fog', { sessionId, scenarioId, epoch: 0, columns, rows, seen });

            return null;
        }

        if (doc.epoch !== epoch)
            return null;

        if (doc.columns !== columns || doc.rows !== rows)
        {
            await ctx.db.patch('fog', doc._id, { columns, rows, seen });

            return null;
        }

        const merged = new Uint8Array(doc.seen);
        const incoming = new Uint8Array(seen);
        let more = false;

        incoming.forEach((flag, index) =>
        {
            if (flag && !merged[index])
            {
                merged[index] = 1;
                more = true;
            }
        });

        if (more)
            await ctx.db.patch('fog', doc._id, { seen: merged.buffer });

        return null;
    },
});

/** The host forgets what everyone has seen of the map being played. */
export const resetFog = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const session = await requireSession(ctx, sessionId);
        const doc = session.activeScenarioId ? await fogOf(ctx, sessionId, session.activeScenarioId) : null;

        if (doc)
            await forgetFog(ctx, doc);

        return null;
    },
});

/** A number kept between two others, and a number at all: NaN becomes the lowest. */
function clamp(value: number, low: number, high: number): number
{
    return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low;
}

/** The host sets how the fog looks, for every screen at the table. */
export const setFogLook = mutation({
    args: { sessionId: v.id('sessions'), look: fogSettingsValidator },
    handler: async (ctx, { sessionId, look }) =>
    {
        await requireSession(ctx, sessionId);
        await ctx.db.patch('sessions', sessionId, {
            fogLook: {
                fade: clamp(look.fade, 0, 3000),
                softness: clamp(look.softness, 0, 1),
                memory: clamp(look.memory, 0, 1),
                haze: clamp(look.haze, 0, 1),
                smoke: clamp(look.smoke, 0, 1),
            },
        });

        return null;
    },
});

/** The host ends the session: phones say so, and nobody joins or moves until it starts again. */
export const end = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        await requireSession(ctx, sessionId);
        await ctx.db.patch('sessions', sessionId, { live: false, frozen: false });

        return null;
    },
});

export const freeze = mutation({
    args: { sessionId: v.id('sessions'), frozen: v.boolean() },
    handler: async (ctx, { sessionId, frozen }) =>
    {
        await requireSession(ctx, sessionId);
        await ctx.db.patch('sessions', sessionId, { frozen });

        return null;
    },
});

/** The host switches the map everyone plays on. Every player starts over at its spawn point. */
export const open = mutation({
    args: { sessionId: v.id('sessions'), scenarioId: v.string() },
    handler: async (ctx, { sessionId, scenarioId }) =>
    {
        const session = await requireSession(ctx, sessionId);

        await respawn(ctx, session, scenarioId);

        return null;
    },
});
