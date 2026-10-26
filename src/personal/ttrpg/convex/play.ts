import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';

import type { Decal, Draft, Drawing, PlayerFight, Point, Scenario, SharedHit, SharedMark, Token } from '../types';
import { cleanConditions, isSave } from '../content/conditions';
import { maxDrawingPoints, maxDrawings, penWidths } from '../map/drawings';
import { distance } from '../map/geometry';
import { cleanStats, conditionsAt, downedPool, hitOn, withoutNumbers, withoutSaves } from '../map/health';
import { cleanFight, cleanRoll, hasRolled, nextTurn, upNext, withRoll } from '../map/initiative';
import { pathBlocked } from '../map/path';
import { monsterFrom } from '../map/presets';
import { anchorAt, footprintCenter, footprintKeys, resizedAt, ridesOn } from '../map/size';
import { spawnCells } from '../map/spawn';
import { startWalk } from '../map/walk';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireSession, requireUser } from './access';
import { saveCharacter } from './characters';
import { limit, spend } from './limits';
import { bloodSettingsValidator, conditionValidator, fogSettingsValidator, initiativeValidator, sizeValidator } from './schema';
import { refreshSight, tokensOf, tokensOn } from './sight';
import { bringCompanions, controllerOf, dropSummonsOf } from './summons';
import { dropFile } from './usage';
import { storedPicture } from './pictures';

/*
 * A session being played, see "Playing a session" in PLAN.md. The host starts it with a
 * password, players join with it from their phone, signed in anonymously, and every screen
 * follows the tokens live. Tokens are placed here, on the server, so two players joining at once
 * never get the same cell.
 */

/** A walk longer than this is not something anyone drew by hand. */
const maxPathPoints = 1000;
/** Players at one table, past any real group, so one password cannot fill the tokens or storage. */
const maxPlayers = 12;
/** Monsters and NPCs in one session, on all its maps. With the players it stays under tokensOf's 200. */
const maxMonsters = 150;

/** A 256 px WebP avatar from services/images.ts is about 20 KB. */
export const maxAvatarBytes = 512 * 1024;
const colourPattern = /^#[0-9a-f]{6}$/i;
/** A 400 by 300 cell map at two samples per cell, eight samples to a byte, see packSeen in map/fog.ts. */
const maxFogBytes = 64 * 1024;

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

/** A player held by the fight: everyone while the rolls come in, then all but whose turn it is. */
function waitsTurn(session: Doc<'sessions'>, tokenId: Id<'tokens'>): boolean
{
    const fight = session.initiative;

    // Without a roll by Begin, a player sits the fight out and moves freely.
    return fight !== undefined && (!fight.begun || (hasRolled(fight, tokenId) && fight.turn !== tokenId));
}

export function ownToken(ctx: QueryCtx, sessionId: Id<'sessions'>, userId: Id<'users'>)
{
    return ctx.db
        .query('tokens')
        .withIndex('by_sessionId_and_userId', (q) => q.eq('sessionId', sessionId).eq('userId', userId))
        .unique();
}

export async function scenarioOf(ctx: QueryCtx, sessionId: Id<'sessions'>, scenarioId: string): Promise<Scenario | null>
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
export function spawnSpots(
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
    // Summons waiting off the map come along to it, still off.
    const players = tokens.filter((token) => token.kind === 'player' && token.tray !== true);
    const monsters = tokens.filter((token) => token.kind === 'npc' && token.scenarioId === scenarioId && token.tray !== true);
    const spots = spawnSpots(scenario, players, monsters);

    for (const summon of tokens.filter((token) => token.kind === 'player' && token.tray === true))
        await ctx.db.patch('tokens', summon._id, { scenarioId });


    for (const [index, player] of players.entries())
    {
        await ctx.db.patch('tokens', player._id, {
            scenarioId,
            ...spots[index],
            path: undefined,
            movedAt: undefined,
        });
    }

    // A fight stays on the map it was fought on.
    await ctx.db.patch('sessions', session._id, { activeScenarioId: scenarioId, initiative: undefined });
    await refreshSight(ctx, session._id, scenario);
}

/**
 * A fight as a phone or the Player view hears of it, see PlayerFight: a monster's turn names it
 * only when players can see it. Null while there is none.
 */
async function fightFor(ctx: QueryCtx, session: Doc<'sessions'>, mine: Id<'tokens'> | null): Promise<PlayerFight | null>
{
    const fight = session.initiative;

    if (!fight || !session.activeScenarioId)
        return null;

    const here = await tokensOn(ctx, session._id, session.activeScenarioId);
    const current = here.find((token) => token._id === fight.turn);
    const shown = current && (current.kind === 'player' || (current.inSight === true && current.hidden !== true));
    const alive = (id: string) => here.some((token) => token._id === id);

    return {
        begun: fight.begun,
        rolled: mine !== null && hasRolled(fight, mine),
        turn: current ? (shown ? current._id : 'enemy') : null,
        upNext: mine !== null && session.upNext === true && upNext(fight, alive) === mine,
    };
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
            host,
            live: session.live === true,
            frozen: session.frozen === true,
            activeScenarioId: session.activeScenarioId ?? null,
            mine: mine ? mine._id : null,
            kicked: session.kicked?.includes(userId) === true,
            fogLook: session.fogLook ?? null,
            blood: session.blood ?? null,
            secretSaves: session.secretSaves === true,
            system: session.system ?? '5e',
            upNext: session.upNext === true,
            // The whole fight only for the GM view; everyone else hears only what concerns them.
            initiative: host ? (session.initiative ?? null) : null,
            fight: await fightFor(ctx, session, mine?._id ?? null),
            // Like the fight: the numbers only for the GM, an asked phone hears what to roll.
            check: host ? (session.check ?? null) : null,
            playerCheck:
                mine && session.check && session.check.asked.includes(mine._id)
                    ? { text: session.check.text, rolled: session.check.rolls.some((entry) => entry.tokenId === mine._id) }
                    : null,
            password: host ? (session.password ?? '') : null,
        };
    },
});

/**
 * The map being played, for players. Their host has it open in the editor already. Without the
 * props the GM hides, so the dev tools on a phone show nothing the table does not.
 */
export const scenario = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const session = await memberOf(ctx, sessionId);
        const scenario = session && session.activeScenarioId ? await scenarioOf(ctx, sessionId, session.activeScenarioId) : null;

        return scenario && { ...scenario, props: scenario.props.filter((prop) => prop.hidden !== true) };
    },
});

/**
 * The tokens on the map being played, live on every screen. Null for anyone not at the table.
 * Players only get the monsters a player can see and the GM has not hidden, so the dev tools on
 * a phone show nothing the table does not; the host gets them all, for the GM view. The same goes
 * for the numbers: a player gets their own token's, and of the rest only how hurt each looks. With
 * asPlayer the host gets what players get, for the Player view on the table screen, see
 * PlayerView.tsx.
 */
export const tokens = query({
    args: { sessionId: v.id('sessions'), asPlayer: v.optional(v.boolean()) },
    handler: async (ctx, { sessionId, asPlayer }): Promise<Token[] | null> =>
    {
        const session = await memberOf(ctx, sessionId);

        if (!session)
            return null;

        const userId = await getAuthUserId(ctx);
        const host = session.ownerId === userId && asPlayer !== true;

        if (!session.activeScenarioId)
            return [];

        const here = await tokensOn(ctx, sessionId, session.activeScenarioId);
        const mine = here.find((token) => userId !== null && token.userId === userId);
        const hideSaves = !host && session.secretSaves === true;

        return here
            .filter((token) => host || token.kind === 'player' || (token.inSight === true && token.hidden !== true))
            .map((doc) =>
            {
                // Only the host can open a stat block, so only the host hears which.
                const token = { ...tokenOf(doc), presetId: host ? doc.presetId : undefined };
                const own = doc.userId === userId || (mine !== undefined && doc.summonOf === mine._id);

                const shown = host || own ? token : withoutNumbers(token);

                return hideSaves ? withoutSaves(shown) : shown;
            });
    },
});

/** A token as the host's screen gets it, everything but its storage and bookkeeping. */
export function tokenOf(doc: Doc<'tokens'>): Token
{
    const { kind, name, color, size, speed, avatar, x, y, path, movedAt, hidden, tray, conditions } = doc;
    const { hp, maxHp, tempHp, ac, perception, downs, presetId } = doc;

    return {
        id: doc._id,
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
        tray,
        hp,
        maxHp,
        tempHp,
        ac,
        perception,
        conditions,
        downs,
        presetId,
        summonOf: doc.summonOf,
    };
}

/**
 * Every monster of a session on all its maps, for its host: Edit and the GM view show a map's own
 * whether the session runs or not, see placeMonster.
 */
export const monsters = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        await requireSession(ctx, sessionId);

        return (await tokensOf(ctx, sessionId))
            .filter((doc) => doc.kind === 'npc')
            .map((doc) => ({ ...tokenOf(doc), scenarioId: doc.scenarioId }));
    },
});

/**
 * The game master sets any token's numbers, a player only their own, in the open: at a real
 * table they keep their own sheet too. Taken as given, see cleanStats in map/health.ts.
 */
export const setStats = mutation({
    args: {
        tokenId: v.id('tokens'),
        hp: v.number(),
        maxHp: v.number(),
        tempHp: v.number(),
        ac: v.number(),
        perception: v.number(),
    },
    handler: async (ctx, { tokenId, ...stats }) =>
    {
        const userId = await requireUser(ctx);
        const token = await ctx.db.get('tokens', tokenId);

        if (!token)
            throw new ConvexError('That token is gone.');

        const session = await sessionOf(ctx, token.sessionId);

        if (session.ownerId !== userId && !(await controllerOf(ctx, token, userId)))
            throw new ConvexError('That is not your token.');

        const clean = cleanStats(stats);

        await ctx.db.patch('tokens', tokenId, { ...clean, conditions: conditionsAt(token.conditions, clean.hp) });

        return null;
    },
});

/**
 * The game master sets any token's conditions, a player only their own, kept to the session's
 * list, see cleanConditions in content/conditions.ts.
 */
export const setConditions = mutation({
    args: { tokenId: v.id('tokens'), conditions: v.array(conditionValidator) },
    handler: async (ctx, { tokenId, conditions }) =>
    {
        const userId = await requireUser(ctx);
        const token = await ctx.db.get('tokens', tokenId);

        if (!token)
            throw new ConvexError('That token is gone.');

        const session = await sessionOf(ctx, token.sessionId);

        if (session.ownerId !== userId && !(await controllerOf(ctx, token, userId)))
            throw new ConvexError('That is not your token.');

        // A player who cannot see their death saves keeps the ones the GM set.
        const kept = session.ownerId !== userId && session.secretSaves === true ? (token.conditions ?? []).filter(isSave) : [];
        const sent = conditions.slice(0, 50).filter((condition) => kept.length === 0 || !isSave(condition));

        await ctx.db.patch('tokens', tokenId, { conditions: cleanConditions(session.system ?? '5e', [...kept, ...sent]) });

        return null;
    },
});

/**
 * The host sets any token's size, a player's too, from the right-click menu. It moves onto the
 * grid for its new footprint; landing on someone is the GM's call, as with dragging.
 */
export const setSize = mutation({
    args: { tokenId: v.id('tokens'), size: sizeValidator },
    handler: async (ctx, { tokenId, size }) =>
    {
        const token = await ctx.db.get('tokens', tokenId);

        if (!token)
            throw new ConvexError('That token is gone.');

        await requireSession(ctx, token.sessionId);
        const scenario = await scenarioOf(ctx, token.sessionId, token.scenarioId);
        const at = scenario ? resizedAt(scenario.grid, token, size) : token;

        await ctx.db.patch('tokens', tokenId, { size, x: at.x, y: at.y });

        if (scenario)
            await refreshSight(ctx, token.sessionId, scenario);

        return null;
    },
});

/** Wrong passwords a session takes in a minute before it takes no more tries until it is over. */
const maxMisses = 10;
const missWindow = 60 * 1000;

/**
 * Whether a password opens a live session, counting the wrong ones. The count is per session, not
 * per player, since anyone can sign in anonymously as many players as they like. Past maxMisses
 * every try is refused for the rest of the minute, the right password too, so guessing runs at
 * ten a minute at most. A wrong password returns false rather than throwing, which would undo the
 * count.
 */
async function tryPassword(ctx: MutationCtx, session: Doc<'sessions'>, password: string): Promise<boolean>
{
    const guesses = await ctx.db
        .query('guesses')
        .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
        .unique();
    const now = Date.now();
    const counting = guesses !== null && guesses.since > now - missWindow;

    if (counting && guesses.misses >= maxMisses)
        throw new ConvexError('Too many wrong passwords. Wait a minute and try again.');

    if (session.live === true && password.trim() === session.password)
        return true;

    if (!guesses)
        await ctx.db.insert('guesses', { sessionId: session._id, misses: 1, since: now });
    else
        await ctx.db.patch('guesses', guesses._id, counting ? { misses: guesses.misses + 1 } : { misses: 1, since: now });

    return false;
}

/**
 * Whether a password opens a live session, so the join page can ask it before the character. Null
 * for a wrong one; otherwise the anonymous players at the table, so someone whose phone forgot them
 * can take their character back, see rejoin.
 */
export const check = mutation({
    args: { sessionId: v.id('sessions'), password: v.string() },
    handler: async (ctx, { sessionId, password }) =>
    {
        await requireUser(ctx);

        if (!(await tryPassword(ctx, await sessionOf(ctx, sessionId), password)))
            return null;

        const players = (await tokensOf(ctx, sessionId)).filter((token) => token.kind === 'player');
        const open = [];

        for (const player of players)
        {
            if (await takeable(ctx, player))
                open.push({ id: player._id, name: player.name, color: player.color, avatar: player.avatar });

        }

        return open;
    },
});

/**
 * Whether someone else may take a player's token back with rejoin: only an anonymous player's. One
 * signed in with Discord gets theirs back by signing in again, so nobody can take it over.
 */
async function takeable(ctx: QueryCtx, token: Doc<'tokens'>): Promise<boolean>
{
    const user = token.userId ? await ctx.db.get('users', token.userId) : null;

    return user?.isAnonymous === true;
}

/**
 * A player whose phone forgot them, after a closed browser or cleared data, signs in as someone
 * new. Rather than make a second character beside the first, they take theirs back after the
 * password. The phone it was on then gets the join form, where it can take it back in turn. Null
 * for a wrong password, see tryPassword.
 */
export const rejoin = mutation({
    args: { sessionId: v.id('sessions'), password: v.string(), tokenId: v.id('tokens') },
    handler: async (ctx, { sessionId, password, tokenId }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);

        if (session.kicked?.includes(userId))
            throw new ConvexError('The GM removed you from this table.');

        if (!(await tryPassword(ctx, session, password)))
            return null;

        const token = await ctx.db.get('tokens', tokenId);

        if (!token || token.sessionId !== sessionId || token.kind !== 'player')
            throw new ConvexError('That character has left the table.');

        if (!(await takeable(ctx, token)))
            throw new ConvexError('That player signed in with Discord. They sign in again to get it back.');

        if (await ownToken(ctx, sessionId, userId))
            throw new ConvexError('You are at the table already.');

        await ctx.db.patch('tokens', tokenId, { userId });
        await dropDraftOf(ctx, tokenId);

        return tokenId;
    },
});

/**
 * A player joins with the password and their character, and appears at the spawn point. Null for
 * a wrong password, see tryPassword.
 */
export const join = mutation({
    args: {
        sessionId: v.id('sessions'),
        password: v.string(),
        name: v.string(),
        color: v.string(),
        maxHp: v.number(),
        ac: v.number(),
        perception: v.number(),
        size: sizeValidator,
        /** A saved character the player picked, which this join changes, see characters.ts. */
        characterId: v.optional(v.id('characters')),
    },
    handler: async (ctx, { sessionId, password, name, color, maxHp, ac, perception, size, characterId }) =>
    {
        const userId = await requireUser(ctx);
        // Joining at full health, with no temp HP yet.
        const stats = cleanStats({ hp: maxHp, maxHp, tempHp: 0, ac, perception });
        const session = await sessionOf(ctx, sessionId);
        const character = name.trim().slice(0, 30);

        if (session.live !== true || !session.activeScenarioId)
            throw new ConvexError('The session has not started yet.');

        if (session.kicked?.includes(userId))
            throw new ConvexError('The GM removed you from this table.');

        if (!(await tryPassword(ctx, session, password)))
            return null;

        await limit(ctx, userId, 'make');

        if (!character)
            throw new ConvexError('Your character needs a name.');

        if (!colourPattern.test(color))
            throw new ConvexError('Pick a ring colour.');

        // Signed in with Discord, the character is kept for next time, picture and all.
        const saved = await saveCharacter(ctx, userId, characterId, { name: character, color, size, maxHp: stats.maxHp, ac: stats.ac, perception: stats.perception });
        const kept = saved ? { characterId: saved._id, ...(saved.avatar ? { avatar: saved.avatar } : {}) } : {};
        const existing = await ownToken(ctx, sessionId, userId);

        if (existing)
        {
            const stood = await scenarioOf(ctx, sessionId, existing.scenarioId);
            const at = stood ? resizedAt(stood.grid, existing, size) : existing;

            await ctx.db.patch('tokens', existing._id, { name: character, color, size, x: at.x, y: at.y, ...stats, ...kept });

            return existing._id;
        }

        const scenario = await scenarioOf(ctx, sessionId, session.activeScenarioId);

        if (!scenario)
            throw new ConvexError('The map is not ready yet. Try again in a moment.');

        const all = await tokensOf(ctx, sessionId);

        if (all.filter((token) => token.kind === 'player' && !token.summonOf).length >= maxPlayers)
            throw new ConvexError('The table is full.');

        const here = all.filter((token) => token.scenarioId === session.activeScenarioId && token.tray !== true);
        const [spot] = spawnSpots(scenario, [{ size }], here);

        const tokenId = await ctx.db.insert('tokens', {
            sessionId,
            userId,
            kind: 'player',
            name: character,
            color,
            size,
            speed: 30,
            scenarioId: session.activeScenarioId,
            ...spot,
            ...stats,
            ...kept,
        });

        if (saved)
        {
            const owner = await ctx.db.get('tokens', tokenId);

            if (owner)
                await bringCompanions(ctx, owner, saved._id);

        }

        await refreshSight(ctx, sessionId, scenario);

        return tokenId;
    },
});

/**
 * Puts a stored picture on the player's token, or with tokenId one of their summons, and deletes
 * the one before. Only the /avatar route in http.ts calls it, with a file it already checked and
 * stored, so a player never gets an upload address of their own to fill storage with. The file is
 * deleted when it cannot be kept: from someone who has not joined, or refused by storedPicture in
 * pictures.ts.
 */
export const keepAvatar = internalMutation({
    args: { sessionId: v.id('sessions'), userId: v.id('users'), storageId: v.id('_storage'), tokenId: v.optional(v.string()) },
    handler: async (ctx, { sessionId, userId, storageId, tokenId }) =>
    {
        const own = await ownToken(ctx, sessionId, userId);
        const summonId = tokenId ? ctx.db.normalizeId('tokens', tokenId) : null;
        const summon = summonId ? await ctx.db.get('tokens', summonId) : null;
        const token = tokenId ? (summon && own && summon.summonOf === own._id ? summon : null) : own;

        if (!token)
        {
            await ctx.storage.delete(storageId);

            return 'not joined';
        }

        const avatar = await storedPicture(ctx, storageId, maxAvatarBytes);

        if (!avatar)
            return 'refused';

        if (token.avatarId && token.avatarId !== storageId)
            await dropFile(ctx, token.avatarId);

        // A saved character or companion keeps the file for next time; the token only shows it.
        const character = token.characterId ? await ctx.db.get('characters', token.characterId) : null;
        const companion = token.companionId ? await ctx.db.get('companions', token.companionId) : null;
        const keeper = character ?? companion;

        if (keeper)
        {
            if (keeper.avatarId && keeper.avatarId !== storageId)
                await dropFile(ctx, keeper.avatarId);

            if (character)
                await ctx.db.patch('characters', character._id, { avatar, avatarId: storageId });
            else if (companion)
                await ctx.db.patch('companions', companion._id, { avatar, avatarId: storageId });

            await ctx.db.patch('tokens', token._id, { avatar, avatarId: undefined });

            return 'kept';
        }

        await ctx.db.patch('tokens', token._id, { avatar, avatarId: storageId });

        return 'kept';
    },
});

/** The player or companion riding a token where it stands, see ridesOn in map/size.ts. */
async function ridersOf(ctx: QueryCtx, carrier: Doc<'tokens'>, grid: Scenario['grid'])
{
    const owner = carrier.summonOf ? await ctx.db.get('tokens', carrier.summonOf) : null;
    const companions = await ctx.db
        .query('tokens')
        .withIndex('by_summonOf', (q) => q.eq('summonOf', carrier._id))
        .take(10);
    const mount = (doc: Doc<'tokens'>) => ({ ...doc, id: doc._id as string, summonOf: doc.summonOf as string | undefined });

    return [...(owner ? [owner] : []), ...companions].filter((other) => other.scenarioId === carrier.scenarioId && ridesOn(grid, mount(other), mount(carrier)));
}

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

        await limit(ctx, userId, 'move');

        const session = await sessionOf(ctx, token.sessionId);
        const host = session.ownerId === userId;

        if (!host)
        {
            // A summon walks on its owner's turn, see summons.ts.
            const owner = await controllerOf(ctx, token, userId);

            if (!owner)
                throw new ConvexError('That is not your token.');

            if (session.live !== true || session.frozen === true)
                throw new ConvexError('Movement is paused by the GM.');

            if (waitsTurn(session, owner._id))
                throw new ConvexError('Wait for your turn.');

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

        const now = Date.now();
        // A monster the players see, walking: it stays seen until it gets where it goes, and sight
        // is judged again then, see settleSight. Out of sight by then, phones see it walk off.
        const walk = token.kind === 'npc' && token.inSight === true && path ? startWalk(path, now, scenario.grid.size) : null;
        const leavingUntil = walk ? now + walk.duration : undefined;

        await ctx.db.patch('tokens', tokenId, { x, y, path, movedAt: path ? now : undefined, leavingUntil });
        await dropDraftOf(ctx, tokenId);

        // Whoever rides it comes along: the familiar on a shoulder, the player on their horse.
        for (const rider of await ridersOf(ctx, token, scenario.grid))
        {
            await ctx.db.patch('tokens', rider._id, { x, y, path, movedAt: path ? now : undefined });
            await dropDraftOf(ctx, rider._id);
        }

        await refreshSight(ctx, token.sessionId, scenario);

        // A moment past leavingUntil, so the walk counts as over when sight is judged again.
        if (walk)
            await ctx.scheduler.runAfter(walk.duration + 200, internal.play.settleSight, { sessionId: token.sessionId, scenarioId: scenario.id });

        return null;
    },
});

/** Judges sight again once a monster's walk has ended, see leavingUntil in convex/schema.ts. */
export const settleSight = internalMutation({
    args: { sessionId: v.id('sessions'), scenarioId: v.string() },
    handler: async (ctx, { sessionId, scenarioId }) =>
    {
        const scenario = await scenarioOf(ctx, sessionId, scenarioId);

        if (scenario)
            await refreshSight(ctx, sessionId, scenario);

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
        await ctx.db.patch('sessions', sessionId, { live: true, password: secret, frozen: false, kicked: undefined, initiative: undefined, check: undefined });

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

        // Every map starts clean, the blood of the last night mopped up.
        for (const doc of await decalsOf(ctx, sessionId))
            await ctx.db.delete('decals', doc._id);

        await clearDrawings(ctx, sessionId);

        return null;
    },
});

/**
 * A player leaves the table: their token and its picture go. Unlike a kick they can join again
 * with the password, as anyone else could.
 */
export const leave = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const userId = await requireUser(ctx);
        const token = await ownToken(ctx, sessionId, userId);

        if (!token)
            return null;

        if (token.avatarId)
            await dropFile(ctx, token.avatarId);

        await ctx.db.delete('tokens', token._id);
        await dropDraftOf(ctx, token._id);
        await dropSummonsOf(ctx, token._id);

        const scenario = await scenarioOf(ctx, sessionId, token.scenarioId);

        if (scenario)
            await refreshSight(ctx, sessionId, scenario);

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

        if (token.kind !== 'player' || (!token.userId && !token.summonOf))
            throw new ConvexError('Only players can be removed.');

        if (token.avatarId)
            await dropFile(ctx, token.avatarId);

        await ctx.db.delete('tokens', tokenId);
        await dropDraftOf(ctx, tokenId);
        await dropSummonsOf(ctx, tokenId);

        const scenario = await scenarioOf(ctx, token.sessionId, token.scenarioId);

        if (scenario)
            await refreshSight(ctx, token.sessionId, scenario);

        // A summon only leaves the table; a saved one comes back with its player next time.
        if (!token.userId)
            return null;

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
 * The host drags a preset onto a map, or with no point onto its tray, in Edit, whether the session
 * runs or not, see monsterFrom in map/presets.ts and Monster staging in PLAN.md.
 */
export const placeMonster = mutation({
    args: {
        sessionId: v.id('sessions'),
        scenarioId: v.string(),
        presetId: v.id('presets'),
        at: v.union(v.object({ x: v.number(), y: v.number() }), v.null()),
        stack: v.optional(v.boolean()),
    },
    handler: async (ctx, { sessionId, scenarioId, presetId, at, stack }) =>
    {
        const session = await requireSession(ctx, sessionId);
        const preset = await ctx.db.get('presets', presetId);
        const scenario = await scenarioOf(ctx, sessionId, scenarioId);

        if (!preset || preset.ownerId !== session.ownerId)
            throw new ConvexError('That preset is gone.');

        if (!scenario)
            throw new ConvexError('That map is not saved yet. Wait for Saved and try again.');

        if (at && !onScenario(scenario, at))
            throw new ConvexError('That is off the map.');

        const all = await tokensOf(ctx, sessionId);

        if (all.filter((token) => token.kind === 'npc').length >= maxMonsters)
            throw new ConvexError(`A session holds at most ${maxMonsters} monsters.`);

        const here = all.filter((token) => token.scenarioId === scenarioId);
        const names = new Set(here.map((token) => token.name));

        // One on the tray stands on the spawn point until it is dragged onto the map.
        const monster = monsterFrom(preset, scenario, at ?? scenario.spawn, names, stack ? [] : here.filter((token) => token.tray !== true));

        await ctx.db.insert('tokens', { sessionId, scenarioId, presetId, ...monster, tray: at ? undefined : true });

        return null;
    },
});

/** The host renames a monster, changes its ring, or whether it goes down at 0 instead of dying. */
export const setMonster = mutation({
    args: { tokenId: v.id('tokens'), name: v.string(), color: v.string(), downs: v.boolean() },
    handler: async (ctx, { tokenId, name, color, downs }) =>
    {
        await requireMonster(ctx, tokenId);
        const monster = name.trim().slice(0, 30);

        if (!monster)
            throw new ConvexError('The monster needs a name.');

        if (!colourPattern.test(color))
            throw new ConvexError('Pick a ring colour.');

        await ctx.db.patch('tokens', tokenId, { name: monster, color, downs: downs ? true : undefined });

        return null;
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

/**
 * The host puts a monster on its map's tray, hidden, or with a point takes it off onto the map
 * there, hidden or not as the host says. See Monster staging in PLAN.md.
 */
export const stage = mutation({
    args: { tokenId: v.id('tokens'), at: v.union(v.object({ x: v.number(), y: v.number() }), v.null()), hidden: v.boolean() },
    handler: async (ctx, { tokenId, at, hidden }) =>
    {
        const token = await requireMonster(ctx, tokenId);
        const scenario = await scenarioOf(ctx, token.sessionId, token.scenarioId);

        if (!scenario)
            throw new ConvexError('That map is not saved yet. Wait for Saved and try again.');

        if (at && !onScenario(scenario, at))
            throw new ConvexError('That is off the map.');

        const walk = { path: undefined, movedAt: undefined, leavingUntil: undefined };

        await ctx.db.patch('tokens', tokenId, at ? { ...at, ...walk, tray: undefined, hidden } : { ...walk, tray: true, hidden: true, inSight: false });
        await dropDraftOf(ctx, tokenId);
        await refreshSight(ctx, token.sessionId, scenario);

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
            await dropFile(ctx, token.avatarId);

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
 * whose grid changed starts over with the new size. With forget, the host hid some again: it
 * replaces what was seen and raises the epoch, so every screen starts over from it.
 */
export const saveFog = mutation({
    args: {
        sessionId: v.id('sessions'),
        scenarioId: v.string(),
        epoch: v.number(),
        columns: v.number(),
        rows: v.number(),
        seen: v.bytes(),
        forget: v.optional(v.boolean()),
    },
    handler: async (ctx, { sessionId, scenarioId, epoch, columns, rows, seen, forget }) =>
    {
        await requireSession(ctx, sessionId);

        if (!Number.isInteger(columns) || !Number.isInteger(rows) || Math.ceil((columns * rows) / 8) !== seen.byteLength)
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

        if (doc.columns !== columns || doc.rows !== rows || doc.seen.byteLength !== seen.byteLength)
        {
            await ctx.db.patch('fog', doc._id, { columns, rows, seen });

            return null;
        }

        if (forget)
        {
            await ctx.db.patch('fog', doc._id, { seen, epoch: doc.epoch + 1 });

            return null;
        }

        const merged = new Uint8Array(doc.seen);
        const incoming = new Uint8Array(seen);
        let more = false;

        incoming.forEach((bits, index) =>
        {
            if ((bits | merged[index]) !== merged[index])
            {
                merged[index] |= bits;
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

/** The host keeps death saves off the players' screens, or shows them again. */
export const setSecretSaves = mutation({
    args: { sessionId: v.id('sessions'), secret: v.boolean() },
    handler: async (ctx, { sessionId, secret }) =>
    {
        await requireSession(ctx, sessionId);
        await ctx.db.patch('sessions', sessionId, { secretSaves: secret });

        return null;
    },
});

/** The host sets which blood every screen at the table shows. */
export const setBlood = mutation({
    args: { sessionId: v.id('sessions'), blood: bloodSettingsValidator },
    handler: async (ctx, { sessionId, blood }) =>
    {
        await requireSession(ctx, sessionId);
        await ctx.db.patch('sessions', sessionId, { blood });

        return null;
    },
});

/** The host turns Up next on or off, see PLAN.md. */
export const setUpNext = mutation({
    args: { sessionId: v.id('sessions'), upNext: v.boolean() },
    handler: async (ctx, { sessionId, upNext: on }) =>
    {
        await requireSession(ctx, sessionId);
        await ctx.db.patch('sessions', sessionId, { upNext: on });

        return null;
    },
});

/**
 * The host starts, runs and ends a fight, sending it whole, worked out on their screen with
 * map/initiative.ts. Null ends it. A player's roll landing at the same moment can be lost; their
 * phone then asks for it again.
 */
export const setInitiative = mutation({
    args: { sessionId: v.id('sessions'), initiative: v.union(initiativeValidator, v.null()) },
    handler: async (ctx, { sessionId, initiative }) =>
    {
        await requireSession(ctx, sessionId);
        await ctx.db.patch('sessions', sessionId, { initiative: initiative ? cleanFight(initiative) : undefined });

        return null;
    },
});

/** Each token on the map being played by id, with its kind, for ties and who is still here. */
async function kindsOn(ctx: QueryCtx, session: Doc<'sessions'>): Promise<Map<string, Token['kind']>>
{
    const here = session.activeScenarioId ? await tokensOn(ctx, session._id, session.activeScenarioId) : [];

    return new Map(here.map((token) => [token._id as string, token.kind]));
}

/**
 * A player's roll for their own token, slotted into the order. A second roll is left to the GM, and
 * so is a late one once the turns have begun.
 */
export const rollInitiative = mutation({
    args: { sessionId: v.id('sessions'), roll: v.number() },
    handler: async (ctx, { sessionId, roll }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);
        const own = await ownToken(ctx, sessionId, userId);
        const value = cleanRoll(roll);

        if (!own || !session.initiative || own.scenarioId !== session.activeScenarioId)
            throw new ConvexError('There is no fight to roll for.');

        if (value === null)
            throw new ConvexError('Type the number you rolled.');

        if (session.initiative.begun)
            throw new ConvexError('The turns have begun. Ask the GM to add your roll.');

        if (hasRolled(session.initiative, own._id))
            return null;

        const kinds = await kindsOn(ctx, session);
        const fight = withRoll(session.initiative, { id: own._id, kind: own.kind }, value, (id) => kinds.get(id), session.system ?? '5e');

        await ctx.db.patch('sessions', sessionId, { initiative: fight });

        return null;
    },
});

/** A player ends their own turn. Quietly nothing when it is not theirs, like a second press. */
export const endTurn = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);
        const own = await ownToken(ctx, sessionId, userId);

        if (!own || !session.initiative || session.initiative.turn !== own._id)
            return null;

        const kinds = await kindsOn(ctx, session);

        await ctx.db.patch('sessions', sessionId, { initiative: nextTurn(session.initiative, (id) => kinds.has(id)) });

        return null;
    },
});

/**
 * The host sends a group check to the players they picked, a new one replacing the last, or with
 * null closes it.
 */
export const setCheck = mutation({
    args: { sessionId: v.id('sessions'), check: v.union(v.object({ text: v.string(), asked: v.array(v.string()) }), v.null()) },
    handler: async (ctx, { sessionId, check }) =>
    {
        await requireSession(ctx, sessionId);

        if (!check)
        {
            await ctx.db.patch('sessions', sessionId, { check: undefined });

            return null;
        }

        const text = check.text.trim().slice(0, 200);
        const asked = [...new Set(check.asked)].slice(0, maxPlayers);

        if (!text)
            throw new ConvexError('Write what to roll.');

        if (asked.length === 0)
            throw new ConvexError('Pick who rolls.');

        await ctx.db.patch('sessions', sessionId, { check: { text, asked, rolls: [] } });

        return null;
    },
});

/** A player's roll for the group check. A second one is quietly nothing, like a second press. */
export const rollCheck = mutation({
    args: { sessionId: v.id('sessions'), roll: v.number() },
    handler: async (ctx, { sessionId, roll }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);
        const own = await ownToken(ctx, sessionId, userId);
        const value = cleanRoll(roll);

        if (!own || !session.check || !session.check.asked.includes(own._id))
            throw new ConvexError('There is no check to roll for.');

        if (value === null)
            throw new ConvexError('Type the number you rolled.');

        if (session.check.rolls.some((entry) => entry.tokenId === own._id))
            return null;

        await ctx.db.patch('sessions', sessionId, { check: { ...session.check, rolls: [...session.check.rolls, { tokenId: own._id, roll: value }] } });

        return null;
    },
});

/**
 * The host ends the session: phones say so, and the players leave the table with their tokens and
 * pictures, so the next start begins with nobody there. Monsters stay, they belong to the maps.
 */
export const end = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const session = await requireSession(ctx, sessionId);
        const players = (await tokensOf(ctx, sessionId)).filter((token) => token.kind === 'player');

        for (const player of players)
        {
            if (player.avatarId)
                await dropFile(ctx, player.avatarId);

            await ctx.db.delete('tokens', player._id);
            await dropDraftOf(ctx, player._id);
        }

        await ctx.db.patch('sessions', sessionId, { live: false, frozen: false, initiative: undefined, check: undefined });

        const scenario = session.activeScenarioId ? await scenarioOf(ctx, sessionId, session.activeScenarioId) : null;

        // With the players gone, no monster is in their sight any more.
        if (scenario)
            await refreshSight(ctx, sessionId, scenario);

        await clearDrawings(ctx, sessionId);

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

/** How soon after one ping the next is taken, so a held finger or a stuck key cannot flood screens. */
const pingGap = 500;

/**
 * The last ping on the map being played, for the host and the players. Every screen flashes one
 * when it changes, never the one already there when the page opens, so the clock stays out of
 * this query.
 */
export const ping = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const session = await memberOf(ctx, sessionId);
        const doc = session
            ? await ctx.db
                .query('pings')
                .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
                .unique()
            : null;

        if (!session || !doc || !session.live || doc.scenarioId !== session.activeScenarioId)
            return null;

        return { x: doc.x, y: doc.y, color: doc.color, at: doc.at };
    },
});

/** The host or a player at the table flashes a spot on the map being played, on every screen. */
export const sendPing = mutation({
    args: { sessionId: v.id('sessions'), x: v.number(), y: v.number() },
    handler: async (ctx, { sessionId, x, y }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);
        const scenarioId = session.activeScenarioId;
        const mine = session.ownerId === userId ? null : await ownToken(ctx, sessionId, userId);

        if (session.ownerId !== userId && !mine)
            throw new ConvexError('Join the session to ping.');

        const scenario = scenarioId && session.live ? await scenarioOf(ctx, sessionId, scenarioId) : null;

        if (!scenarioId || !scenario || !onScenario(scenario, { x, y }))
            return null;

        const doc = await ctx.db
            .query('pings')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
            .unique();
        const at = Date.now();
        const ping = { sessionId, scenarioId, x, y, at, ...(mine ? { color: mine.color } : {}) };

        if (!doc)
            await ctx.db.insert('pings', ping);
        else if (at - doc.at >= pingGap)
            await ctx.db.replace('pings', doc._id, ping);

        return null;
    },
});

/** The most tokens one attack or heal reaches, a whole party and then some. */
const maxTargets = 20;
/** Decals a session keeps, more than a night of fighting leaves. Past it, new ones are not kept. */
const maxDecals = 200;

/** A session's decals, or only those of one of its maps. */
function decalsOf(ctx: QueryCtx, sessionId: Id<'sessions'>, scenarioId?: string)
{
    return ctx.db
        .query('decals')
        .withIndex('by_sessionId_and_scenarioId', (q) =>
            scenarioId === undefined ? q.eq('sessionId', sessionId) : q.eq('sessionId', sessionId).eq('scenarioId', scenarioId),
        )
        .take(maxDecals);
}

/**
 * What killed monsters left on the map being played, for everyone at the table. Players only get
 * those of monsters they saw die, like lastHit; asPlayer gives the host what players get.
 */
export const decals = query({
    args: { sessionId: v.id('sessions'), asPlayer: v.optional(v.boolean()) },
    handler: async (ctx, { sessionId, asPlayer }): Promise<Decal[]> =>
    {
        const session = await memberOf(ctx, sessionId);
        const userId = await getAuthUserId(ctx);

        if (!session || !session.live || !session.activeScenarioId)
            return [];

        const host = session.ownerId === userId && asPlayer !== true;
        const docs = await decalsOf(ctx, sessionId, session.activeScenarioId);

        return docs.filter((doc) => host || doc.seen).map(({ _id, x, y, size, scale }) => ({ id: _id, x, y, size, scale }));
    },
});

/** The host clears the decals off the map being played. */
export const clearDecals = mutation({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }) =>
    {
        const session = await requireSession(ctx, sessionId);

        if (!session.activeScenarioId)
            return null;

        for (const doc of await decalsOf(ctx, sessionId, session.activeScenarioId))
            await ctx.db.delete('decals', doc._id);

        return null;
    },
});

/**
 * The last attack or heal on the map being played, for everyone at the table. Players only get
 * the targets they could see then, so a hit on a hidden monster gives nothing away. With asPlayer
 * the host gets what players get, like tokens.
 */
export const lastHit = query({
    args: { sessionId: v.id('sessions'), asPlayer: v.optional(v.boolean()) },
    handler: async (ctx, { sessionId, asPlayer }): Promise<SharedHit | null> =>
    {
        const session = await memberOf(ctx, sessionId);
        const userId = await getAuthUserId(ctx);
        const doc = session
            ? await ctx.db
                .query('hits')
                .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
                .unique()
            : null;

        if (!session || !doc || !session.live || doc.scenarioId !== session.activeScenarioId)
            return null;

        const host = session.ownerId === userId && asPlayer !== true;
        const targets = doc.targets.filter((target) => host || target.seen).map(({ x, y, size, died }) => ({ x, y, size, died }));

        return targets.length > 0 ? { at: doc.at, kind: doc.kind, targets } : null;
    },
});

/**
 * Deals amount of damage to tokens, or heals them, see applyHit in map/health.ts. The game master
 * reaches any token on the map being played. A player only tokens they can see, attacks monsters
 * and players, heals players, and does nothing while the table is frozen. A monster brought to 0
 * dies and leaves the map, and a decal where it fell; a player is down and stays, in a pool. A
 * token without numbers takes nothing, but still shows the hit.
 */
export const hit = mutation({
    args: {
        sessionId: v.id('sessions'),
        tokenIds: v.array(v.id('tokens')),
        kind: v.union(v.literal('attack'), v.literal('heal')),
        amount: v.number(),
    },
    handler: async (ctx, { sessionId, tokenIds, kind, amount }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);
        const host = session.ownerId === userId;
        const scenarioId = session.activeScenarioId;

        const own = host ? null : await ownToken(ctx, sessionId, userId);

        if (!host && !own)
            throw new ConvexError('Join the session to attack or heal.');

        await limit(ctx, userId, 'hit');

        if (!session.live || !scenarioId)
            throw new ConvexError('The session is not running.');

        if (!host && session.frozen === true)
            throw new ConvexError('The GM froze the table.');

        if (own && waitsTurn(session, own._id))
            throw new ConvexError('Wait for your turn.');

        const points = Number.isFinite(amount) ? Math.min(9999, Math.max(0, Math.round(amount))) : 0;
        const targets = [];
        let room = maxDecals - (await decalsOf(ctx, sessionId)).length;

        for (const tokenId of new Set(tokenIds.slice(0, maxTargets)))
        {
            const token = await ctx.db.get('tokens', tokenId);

            if (!token || token.sessionId !== sessionId || token.scenarioId !== scenarioId || token.tray === true)
                continue;

            const seen = token.kind === 'player' || (token.inSight === true && token.hidden !== true);

            if (!host && !seen)
                continue;

            const { after, died, downed } = hitOn(token, kind, points);

            targets.push({ x: token.x, y: token.y, size: token.size, seen, died });

            // A summon brought to 0 vanishes off the map, for its player to summon again, see summons.ts.
            if (died && token.summonOf)
            {
                await dropDraftOf(ctx, tokenId);
                await ctx.db.patch('tokens', tokenId, { ...after, tray: true, path: undefined, movedAt: undefined });
            }
            else if (died)
            {
                if (token.avatarId)
                    await dropFile(ctx, token.avatarId);

                await dropDraftOf(ctx, tokenId);
                await ctx.db.delete('tokens', tokenId);
            }
            else if (after)
                await ctx.db.patch('tokens', tokenId, after);

            // Blood where a monster fell, or under a player going down, staying once they are up.
            if ((died || downed) && room-- > 0)
            {
                const pool = { sessionId, scenarioId, x: token.x, y: token.y, size: token.size, seen };

                await ctx.db.insert('decals', downed ? { ...pool, scale: downedPool } : pool);
            }

        }

        if (targets.length === 0)
            return null;

        const doc = await ctx.db
            .query('hits')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
            .unique();
        const row = { sessionId, scenarioId, kind, at: Date.now(), targets };

        if (doc)
            await ctx.db.replace('hits', doc._id, row);
        else
            await ctx.db.insert('hits', row);

        return null;
    },
});

/** How long a path drawn but not walked shows without a change, so one left behind still goes. */
const draftLife = 5 * 60 * 1000;

function draftOf(ctx: QueryCtx, tokenId: Id<'tokens'>)
{
    return ctx.db
        .query('drafts')
        .withIndex('by_tokenId', (q) => q.eq('tokenId', tokenId))
        .unique();
}

export async function dropDraftOf(ctx: MutationCtx, tokenId: Id<'tokens'>)
{
    const doc = await draftOf(ctx, tokenId);

    if (doc)
        await ctx.db.delete('drafts', doc._id);

}

/**
 * The paths players are drawing on the map being played, or waiting to walk, for everyone at the
 * table but whoever draws each one, whose own screen shows it already. Only players' paths are
 * shared: a monster's is the GM's plan, and only the GM view shows it. With asPlayer the host
 * gets the ones they draw too: the Player view on the table screen runs as the host, but does
 * not show what the GM view draws, see PlayerView.tsx.
 */
export const drafts = query({
    args: { sessionId: v.id('sessions'), asPlayer: v.optional(v.boolean()) },
    handler: async (ctx, { sessionId, asPlayer }): Promise<Draft[]> =>
    {
        const session = await memberOf(ctx, sessionId);
        const userId = await getAuthUserId(ctx);

        if (!session || !session.live)
            return [];

        const docs = await ctx.db
            .query('drafts')
            .withIndex('by_sessionId', (q) => q.eq('sessionId', sessionId))
            .take(maxPlayers * 2);

        return docs
            .filter((doc) => doc.scenarioId === session.activeScenarioId && (asPlayer === true || doc.userId !== userId))
            .map(({ tokenId, points, feet }) => ({ id: tokenId, points, feet }));
    },
});

/**
 * A player's path as it is drawn, or null once it is walked or dropped. The host draws for any
 * player, a player only for their own token, while the session is live and not frozen.
 */
export const draw = mutation({
    args: {
        tokenId: v.id('tokens'),
        points: v.union(v.array(v.object({ x: v.number(), y: v.number() })), v.null()),
        feet: v.number(),
    },
    handler: async (ctx, { tokenId, points, feet }) =>
    {
        const userId = await requireUser(ctx);
        const token = await ctx.db.get('tokens', tokenId);

        if (!token || token.kind !== 'player')
            return null;

        const session = await sessionOf(ctx, token.sessionId);
        const host = session.ownerId === userId;

        const owner = host ? null : await controllerOf(ctx, token, userId);

        if (!host && !owner)
            throw new ConvexError('That is not your token.');

        const allowed = session.live === true && token.scenarioId === session.activeScenarioId && (host || (session.frozen !== true && !waitsTurn(session, owner?._id ?? tokenId)));
        const scenario = points && allowed ? await scenarioOf(ctx, token.sessionId, token.scenarioId) : null;

        if (!points || !scenario)
        {
            await dropDraftOf(ctx, tokenId);

            return null;
        }

        if (points.length > maxPathPoints)
            throw new ConvexError('That path is too long.');

        // Over the rate the path only shows a moment late, so nothing is said.
        if (!(await spend(ctx, userId, 'drag')))
            return null;

        if (!points.every((point) => onScenario(scenario, point)))
            throw new ConvexError('That is off the map.');

        const doc = await draftOf(ctx, tokenId);
        const draft = {
            sessionId: token.sessionId,
            scenarioId: token.scenarioId,
            tokenId,
            userId,
            points,
            feet: Math.round(clamp(feet, 0, 100000)),
            at: Date.now(),
        };

        if (doc)
        {
            await ctx.db.replace('drafts', doc._id, draft);

            return null;
        }

        const draftId = await ctx.db.insert('drafts', draft);

        await ctx.scheduler.runAfter(draftLife, internal.play.dropDraft, { draftId });

        return null;
    },
});

/** Drops a path nobody has changed in a while, or checks again when it last changed. */
export const dropDraft = internalMutation({
    args: { draftId: v.id('drafts') },
    handler: async (ctx, { draftId }) =>
    {
        const doc = await ctx.db.get('drafts', draftId);

        if (!doc)
            return null;

        const left = doc.at + draftLife - Date.now();

        if (left > 0)
            await ctx.scheduler.runAfter(left, internal.play.dropDraft, { draftId });
        else
            await ctx.db.delete('drafts', draftId);

        return null;
    },
});

/** How long a ruler or area shows without a change, so one left by a closed phone still goes. */
const markLife = 60 * 1000;

/**
 * The rulers and areas of effect being dragged out on the map being played, for everyone at the
 * table but whoever drags each one, whose own screen draws it. With asPlayer the host gets their
 * own too, for the Player view on the table screen, like drafts.
 */
export const marks = query({
    args: { sessionId: v.id('sessions'), asPlayer: v.optional(v.boolean()) },
    handler: async (ctx, { sessionId, asPlayer }): Promise<SharedMark[]> =>
    {
        const session = await memberOf(ctx, sessionId);
        const userId = await getAuthUserId(ctx);

        if (!session || !session.live)
            return [];

        const docs = await ctx.db
            .query('marks')
            .withIndex('by_sessionId_and_userId', (q) => q.eq('sessionId', sessionId))
            .take(maxPlayers + 1);

        return docs
            .filter((doc) => doc.scenarioId === session.activeScenarioId && (asPlayer === true || doc.userId !== userId))
            .map(({ _id, kind, from, to, color }) => ({ id: _id, kind, from, to, color }));
    },
});

/**
 * Someone at the table drags out a ruler or an area, or lets go of it with null. The host and
 * players who joined, on the map being played, while the session is live. Frozen or not: measuring
 * is talking, not moving.
 */
export const mark = mutation({
    args: {
        sessionId: v.id('sessions'),
        mark: v.union(
            v.object({
                kind: v.union(v.literal('ruler'), v.literal('area'), v.literal('cone')),
                from: v.object({ x: v.number(), y: v.number() }),
                to: v.object({ x: v.number(), y: v.number() }),
            }),
            v.null(),
        ),
    },
    handler: async (ctx, { sessionId, mark }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);
        const token = session.ownerId === userId ? null : await ownToken(ctx, sessionId, userId);
        const doc = await ctx.db
            .query('marks')
            .withIndex('by_sessionId_and_userId', (q) => q.eq('sessionId', sessionId).eq('userId', userId))
            .unique();
        const finite = mark !== null && [mark.from.x, mark.from.y, mark.to.x, mark.to.y].every(Number.isFinite);
        const atTable = session.ownerId === userId || token !== null;

        if (!mark || !finite || !atTable || session.live !== true || !session.activeScenarioId)
        {
            if (doc)
                await ctx.db.delete('marks', doc._id);

            return null;
        }

        if (!(await spend(ctx, userId, 'drag')))
            return null;

        const row = {
            sessionId,
            scenarioId: session.activeScenarioId,
            userId,
            ...mark,
            color: token?.color,
            at: Date.now(),
        };

        if (doc)
        {
            await ctx.db.replace('marks', doc._id, row);

            return null;
        }

        const markId = await ctx.db.insert('marks', row);

        await ctx.scheduler.runAfter(markLife, internal.play.dropMark, { markId });

        return null;
    },
});

/** Every line drawn in a session, on any map, oldest first. */
async function drawingsOf(ctx: QueryCtx, sessionId: Id<'sessions'>): Promise<Doc<'drawings'>[]>
{
    const docs = await ctx.db
        .query('drawings')
        .withIndex('by_sessionId_and_key', (q) => q.eq('sessionId', sessionId))
        .take(maxDrawings * (maxPlayers + 1));

    return docs.sort((a, b) => a._creationTime - b._creationTime);
}

/** Wipes every line drawn in a session, so none outlives the night it was drawn in. */
async function clearDrawings(ctx: MutationCtx, sessionId: Id<'sessions'>)
{
    for (const doc of await drawingsOf(ctx, sessionId))
        await ctx.db.delete('drawings', doc._id);
}

/**
 * The lines drawn on the map being played, for the host and the players, the drawer's own too:
 * once let go, only this shows it. Each says whether the asker may erase it.
 */
export const drawings = query({
    args: { sessionId: v.id('sessions') },
    handler: async (ctx, { sessionId }): Promise<Drawing[]> =>
    {
        const session = await memberOf(ctx, sessionId);
        const userId = await getAuthUserId(ctx);

        if (!session || !session.live)
            return [];

        const host = session.ownerId === userId;

        return (await drawingsOf(ctx, sessionId))
            .filter((doc) => doc.scenarioId === session.activeScenarioId)
            .map((doc) => ({ id: doc._id, points: doc.points, color: doc.color, width: doc.width, erasable: host || doc.userId === userId }));
    },
});

/**
 * Someone at the table starts a line with a key their screen made up, or sends its points so far.
 * The host and players who joined, on the map being played, while the session is live. Frozen or
 * not, like a ruler. The pen counts only for a new line: one keeps how it started.
 */
export const drawLine = mutation({
    args: {
        sessionId: v.id('sessions'),
        key: v.string(),
        points: v.array(v.object({ x: v.number(), y: v.number() })),
        pen: v.object({ color: v.optional(v.string()), width: v.number() }),
    },
    handler: async (ctx, { sessionId, key, points, pen }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);
        const token = session.ownerId === userId ? null : await ownToken(ctx, sessionId, userId);
        const atTable = session.ownerId === userId || token !== null;
        const fine = key.length > 0 && key.length <= 64 && points.length > 0 && points.length <= maxDrawingPoints && points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

        // Refused out loud, so the drawer's screen drops the line it still shows, see drawTool.
        if (!fine || !atTable || session.live !== true || !session.activeScenarioId)
            throw new ConvexError('That line could not be drawn.');

        await limit(ctx, userId, 'drag');

        const doc = await ctx.db
            .query('drawings')
            .withIndex('by_sessionId_and_key', (q) => q.eq('sessionId', sessionId).eq('key', key))
            .unique();

        if (doc)
        {
            if (doc.userId !== userId)
                throw new ConvexError('That line could not be drawn.');

            await ctx.db.patch('drawings', doc._id, { points });

            return null;
        }

        // Past the limit the oldest go, so drawing never just stops working.
        const own = (await drawingsOf(ctx, sessionId)).filter((other) => other.userId === userId);

        for (const old of own.slice(0, Math.max(0, own.length - maxDrawings + 1)))
            await ctx.db.delete('drawings', old._id);

        const color = pen.color !== undefined && colourPattern.test(pen.color) ? pen.color : token?.color;
        const width = Number.isFinite(pen.width) ? Math.min(Math.max(pen.width, penWidths.min), penWidths.max) : penWidths.start;

        await ctx.db.insert('drawings', { sessionId, scenarioId: session.activeScenarioId, userId, key, color, width, points });

        return null;
    },
});

/** Erases lines: a player only their own, the host any. */
export const eraseDrawings = mutation({
    args: { sessionId: v.id('sessions'), drawingIds: v.array(v.id('drawings')) },
    handler: async (ctx, { sessionId, drawingIds }) =>
    {
        const userId = await requireUser(ctx);
        const session = await sessionOf(ctx, sessionId);

        for (const drawingId of drawingIds.slice(0, maxDrawings * (maxPlayers + 1)))
        {
            const doc = await ctx.db.get('drawings', drawingId);

            if (doc && doc.sessionId === sessionId && (doc.userId === userId || session.ownerId === userId))
                await ctx.db.delete('drawings', drawingId);
        }

        return null;
    },
});

/** Drops a ruler or area that has not changed for markLife, or looks again once it would have. */
export const dropMark = internalMutation({
    args: { markId: v.id('marks') },
    handler: async (ctx, { markId }) =>
    {
        const doc = await ctx.db.get('marks', markId);

        if (!doc)
            return null;

        const left = doc.at + markLife - Date.now();

        if (left > 0)
            await ctx.scheduler.runAfter(left, internal.play.dropMark, { markId });
        else
            await ctx.db.delete('marks', markId);

        return null;
    },
});
