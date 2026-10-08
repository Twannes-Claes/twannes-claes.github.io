import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const sizeValidator = v.union(
    v.literal('tiny'),
    v.literal('small'),
    v.literal('medium'),
    v.literal('large'),
    v.literal('huge'),
    v.literal('gargantuan'),
);

/** How the fog looks, see FogSettings in types.ts. */
export const fogSettingsValidator = v.object({
    fade: v.number(),
    softness: v.number(),
    memory: v.number(),
    haze: v.number(),
    smoke: v.number(),
});

/**
 * A scenario as the editor keeps it, see Scenario in types.ts. The saving and loading calls in
 * components/SessionEditor.tsx only type check while the two match.
 */
export const scenarioValidator = v.object({
    id: v.string(),
    name: v.string(),
    width: v.number(),
    height: v.number(),
    background: v.union(v.string(), v.null()),
    grid: v.object({
        type: v.union(v.literal('square'), v.literal('hex'), v.literal('none')),
        hexOrientation: v.union(v.literal('pointy'), v.literal('flat')),
        size: v.number(),
        offsetX: v.number(),
        offsetY: v.number(),
        feetPerCell: v.number(),
        diagonals: v.optional(v.union(v.literal('alternate'), v.literal('equal'))),
        color: v.string(),
        opacity: v.number(),
        visible: v.boolean(),
    }),
    props: v.array(
        v.object({
            id: v.string(),
            src: v.string(),
            x: v.number(),
            y: v.number(),
            width: v.number(),
            height: v.number(),
            rotation: v.number(),
        }),
    ),
    // ponytail: at most 8192 walls, Convex's array limit. A huge imported map past it would need
    // its walls in a table of their own.
    walls: v.array(
        v.object({
            id: v.string(),
            x1: v.number(),
            y1: v.number(),
            x2: v.number(),
            y2: v.number(),
            blocksSight: v.boolean(),
            blocksMove: v.boolean(),
            door: v.optional(v.object({ open: v.boolean() })),
        }),
    ),
    spawn: v.object({ x: v.number(), y: v.number() }),
});

/**
 * The tables, see PLAN.md. The users and sign-in tables come from Convex Auth. A host row is the
 * permission to make sessions; the owner, set with OWNER_ID, is always one, see access.ts.
 */
export default defineSchema({
    ...authTables,
    hosts: defineTable({ userId: v.id('users'), approvedAt: v.number() }).index('by_userId', [
        'userId',
    ]),
    hostRequests: defineTable({ userId: v.id('users'), requestedAt: v.number() }).index(
        'by_userId',
        ['userId'],
    ),
    sessions: defineTable({
        ownerId: v.id('users'),
        name: v.string(),
        /** The scenario ids in the order the editor lists them. */
        order: v.array(v.string()),
        updatedAt: v.number(),
        /** Started and not ended: players can join and move. */
        live: v.optional(v.boolean()),
        /** Asked when joining. Only the session's host reads it, see play.ts. */
        password: v.optional(v.string()),
        /** Players cannot move, see Freeze in PLAN.md. */
        frozen: v.optional(v.boolean()),
        /** The scenario everyone plays on. */
        activeScenarioId: v.optional(v.string()),
        /** Players the host removed, who cannot join again until the session starts again. */
        kicked: v.optional(v.array(v.id('users'))),
        /** How the fog looks on every screen. Missing is the look in map/fog.ts. */
        fogLook: v.optional(fogSettingsValidator),
    }).index('by_ownerId', ['ownerId']),
    /**
     * Who stands where while a session is played. Players' tokens carry their anonymous user, so a
     * phone that comes back finds its own. Not part of the scenario, so a move never rewrites the map.
     */
    tokens: defineTable({
        sessionId: v.id('sessions'),
        userId: v.optional(v.id('users')),
        kind: v.union(v.literal('player'), v.literal('npc')),
        name: v.string(),
        color: v.string(),
        size: sizeValidator,
        speed: v.number(),
        /** A 256 px picture in Convex storage. */
        avatar: v.optional(v.string()),
        /** The stored file behind avatar, deleted when the picture is replaced. */
        avatarId: v.optional(v.id('_storage')),
        scenarioId: v.string(),
        x: v.number(),
        y: v.number(),
        path: v.optional(v.array(v.object({ x: v.number(), y: v.number() }))),
        movedAt: v.optional(v.number()),
        /** A monster the host keeps off the players' screens, whatever they can see. */
        hidden: v.optional(v.boolean()),
        /** A monster a player can see right now, kept by sight.ts. Others are not sent to players. */
        inSight: v.optional(v.boolean()),
    }).index('by_sessionId_and_userId', ['sessionId', 'userId']),
    /**
     * What the party has seen of each scenario of a session, see SharedFog in types.ts. Its own
     * table, so the frequent fog saves never rewrite the scenario.
     */
    fog: defineTable({
        sessionId: v.id('sessions'),
        scenarioId: v.string(),
        epoch: v.number(),
        columns: v.number(),
        rows: v.number(),
        seen: v.bytes(),
    }).index('by_sessionId_and_scenarioId', ['sessionId', 'scenarioId']),
    // One document per scenario, so saving a change to one map never rewrites the others.
    scenarios: defineTable({ sessionId: v.id('sessions'), scenario: scenarioValidator }).index(
        'by_sessionId_and_scenario_id',
        ['sessionId', 'scenario.id'],
    ),
    /** The prop library of each game master. */
    pictures: defineTable({
        ownerId: v.id('users'),
        storageId: v.id('_storage'),
        name: v.string(),
        src: v.string(),
        width: v.number(),
        height: v.number(),
    }).index('by_ownerId', ['ownerId']),
});
