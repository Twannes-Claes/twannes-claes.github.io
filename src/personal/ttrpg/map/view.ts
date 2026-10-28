import type { BloodSettings, Cell, CreatureSize, Decal, Draft, Drawing, FogSettings, GameSystem, Mark, Pen, Point, Prop, PropPicture, Scenario, SharedFog, SharedHit, SharedMark, Token } from '../types';

import { buzz } from '../services/haptics.ts';

import { centerOn, fitCamera, panBy, toWorld, zoomAt, type Camera } from './camera.ts';
import {
    clearShape,
    composeFog,
    createExplored,
    createFogLayers,
    defaultFogSettings,
    markSeen,
    packedFlag,
    packSeen,
    shapePolygon,
    shapeSamples,
    wasSeen,
    type Explored,
    type FogLayers,
} from './fog.ts';
import { accent, ground, highlight, tooFar } from './colours.ts';
import { distance, lerp, midpoint, onMap } from './geometry.ts';
import { defaultBlood, stateOf } from './health.ts';
import { extendPath, lineFeet, pathBlocked, pathFeet } from './path.ts';
import {
    badgeName,
    conditionBadgeAt,
    drawnAcross,
    drawHealth,
    drawHit,
    drawPill,
    drawPing,
    drawFootprint,
    drawRoute,
    drawSelected,
    drawTarget,
    drawUnknownStep,
    perched,
    render,
    shownRadius,
    tokenRadius,
    type Drop,
    type HitEffect,
    type Lifted,
    type Scene,
    type Viewport,
} from './render.ts';
import { propAt } from './props.ts';
import { anchorAt, footprint, footprintCenter, footprintKeys, landingAt, partners } from './size.ts';
import { drawLine, penWidths } from './drawings.ts';
import { createTool, drawBox, drawMark, drawPropGhost, fingerGap, type MapTool, type ToolId, type ToolPointer } from './tools.ts';
import { insidePolygon, sightSegments, visibilityPolygon, type Segment } from './visibility.ts';
import { startWalk, walkAt, type Walk } from './walk.ts';

/** How far the map zooms out and in, relative to the zoom that just fits it on screen. */
const zoomOutLimit = 0.5;
const zoomInLimit = 8;
/** A phone opens on its own token with about this many cells across the screen: the room around it. */
const ownCells = 8;
/**
 * The smoke drifts slowly, so while nothing else moves the map is drawn this many times a second
 * rather than at the screen's own rate, which on a big 120 or 144 Hz screen hogs the graphics
 * card for nothing. Panning, dragging, walks and fog changes still draw every frame.
 */
const smokeFps = 30;
/** How long a companion takes to get on or off its rider's ring, see perched in map/render.ts. */
const mountTime = 300;
/** How long the table screen waits after the fog last changed before it saves it: not every step of a walk. */
const exploredDelay = 1500;
/** How long a press is held still before it pings, a little under a phone's own long press. */
const holdDelay = 450;
/** How long a ping flashes. */
const pingLife = 1600;
/** How long an attack or a heal plays on its targets. */
const hitLife = 900;
/** How long past its end a walk still plays for a token that only now arrives, see setTokens. */
const arrivalSlack = 2000;
/** At most this often a path being drawn goes to the server, so a fast drag sends a few updates, not one per cell. */
const draftGap = 150;
/**
 * A badly hurt token walking leaves a drop of blood about every this many cells. Each lasts
 * dropLife, fading over the last dropFade, and a screen keeps at most maxDrops.
 */
const dropGap = 0.45;
const dropLife = 30 * 1000;
const dropFade = 8 * 1000;
const maxDrops = 400;
/** A downed body moved leaves a smear: a drop about every this many cells, so they run together. */
const smearGap = 0.15;
/** How long a new pool of blood takes to spread out, and a cleared one to fade. */
const decalSpread = 2500;
const decalFade = 1200;

/** A path a player drew and let go of, waiting for Move or Cancel. */
export interface PendingMove
{
    id: string;
    /** Centre to centre, from where the token stands to where it would end. */
    points: Point[];
    feet: number;
    /** It would end where someone already stands, so it cannot be taken. */
    blocked: boolean;
}

export interface MapViewOptions
{
    /** A token dragged freely, in edit mode or with Alt in play mode, landed here. */
    onTokenMove?: (id: string, to: Point) => void;
    /** Monsters the erase tool took, already asked about, to take off the map. */
    onMonstersErase?: (ids: string[]) => void;
    /** A player let go of a path they drew, see PendingMove. */
    onPathEnd?: (move: PendingMove) => void;
    /** Called with the scenario a tool changed, see map/tools.ts. */
    onScenarioChange?: (scenario: Scenario) => void;
    /** Twice a second while frames are drawn, for the ?debug display. */
    onStats?: (stats: FrameStats) => void;
    /** Every frame drawn: the world point in the middle of the screen, where monsters are added. */
    onView?: (center: Point) => void;
    /** A right click with nothing half done: the page puts the tool away, see MapTool.cancel. */
    onToolCancel?: () => void;
    /** The path waiting for its Move or Cancel was dropped, by a right click or a new path. */
    onPathCancel?: () => void;
    /** A long press on an empty spot in play mode, to flash it on every screen, see ping. */
    onPing?: (at: Point) => void;
    /** A player's path as it changes, to show on every other screen, or null once it goes, see Draft. */
    onDraft?: (id: string, points: Point[] | null, feet: number) => void;
    /** This screen's ruler or area as it is dragged, to show on every other screen, see Mark. */
    onMark?: (mark: Mark | null) => void;
    /** This screen's line as it is drawn, by a key it made up, see Drawing. */
    onDrawLine?: (key: string, points: Point[], pen: Pen) => Promise<void> | void;
    /** Lines the eraser went over, see Drawing. */
    onEraseDrawings?: (ids: string[]) => void;
    /** A token pressed while picking targets, to add or take off, see setTargets. */
    onTarget?: (id: string) => void;
    /** The tokens the Select tool picks now, by a click, Shift and a click, or a box, see setSelection. */
    onSelect?: (ids: string[]) => void;
    /**
     * A right click on a token, with nothing half done, at that point of the page.
     * True when the page opened its menu, otherwise the click cancels as usual, see contextMenu.
     */
    onTokenMenu?: (id: string, client: Point) => boolean;
    /** The same for a prop with no token on it, see onTokenMenu. */
    onPropMenu?: (id: string, client: Point) => boolean;
    /**
     * A while after more of the map was seen, what has been seen in all, to share, see SharedFog.
     * At once with forget when the game master hid some, so every screen forgets it too.
     */
    onExplored?: (fog: SharedFog, forget?: boolean) => void;
}

/** How the drawing keeps up, measured on this device. */
export interface FrameStats
{
    fps: number;
    /** Average time spent building a frame, on the main thread. */
    frameMs: number;
    /** The slowest frame in that time. */
    worstMs: number;
}

export interface MapView
{
    /** Shows a scenario. A new one is fitted to the screen, an edit of the same one is not. */
    setScenario: (scenario: Scenario) => void;
    /** A token whose movedAt changed walks its path, see map/walk.ts. */
    setTokens: (tokens: Token[]) => void;
    /**
     * Edit shows walls and the spawn point, and every token drags freely. Play shows the map as
     * the players see it: players draw paths, monsters only show where a player can see them.
     */
    setMode: (mode: 'edit' | 'play') => void;
    /** placing is the library picture the props tool places, see createTool in map/tools.ts. */
    setTool: (id: ToolId, placing?: PropPicture | null, snap?: number) => void;
    /** The path waiting for Move or Cancel, drawn until it is decided. */
    setPending: (move: PendingMove | null) => void;
    /** Frozen, players cannot draw paths; the game master still drags anything. */
    setFrozen: (frozen: boolean) => void;
    /** The game master looks through the fog, monsters included, while this is on. */
    setPeek: (peek: boolean) => void;
    /** Flashes a spot: rings spread from it for a moment, in a player's colour or the GM's. */
    ping: (at: Point, color?: string) => void;
    /** Plays an attack or a heal on where its targets stood, see drawHit in map/render.ts. */
    hit: (hit: SharedHit) => void;
    /**
     * Picking targets for an attack or a heal, with the ones picked so far ringed, or null when
     * not. While picking, a press on a token goes to onTarget rather than moving it.
     */
    setTargets: (ids: string[] | null) => void;
    /**
     * The Select tool in Edit, with the tokens picked so far ringed, or null without it. A press on
     * a token picks it and drags every picked one together, see onSelect; on empty ground it boxes.
     */
    setSelection: (ids: string[] | null) => void;
    /**
     * A monster dragged from the presets or the tray, drawn where it would land, lifted, hidden
     * like it will be, over the cells it will take, on someone only with stack. Null once it leaves
     * the map or lands.
     */
    setGhost: (ghost: { monster: Pick<Token, 'name' | 'color' | 'avatar' | 'size'>; at: Point; stack: boolean } | null) => void;
    /** A prop dragged from the library, drawn where it would land. Null once it leaves or lands. */
    setPropGhost: (prop: Prop | null) => void;
    /** What killed monsters left on the map, see Decal. */
    setDecals: (decals: Decal[]) => void;
    /** Which blood shows, see BloodSettings. */
    setBlood: (blood: BloodSettings) => void;
    /** The session's game, which shapes a cone, see drawMark in map/tools.ts. */
    setSystem: (system: GameSystem) => void;
    /** The token whose turn it is in a fight, ringed, or null. */
    setTurn: (id: string | null) => void;
    /** The world point under a point of the page, like where a preset was dropped. */
    worldAt: (client: Point) => Point;
    /** Other screens' paths, drawn faintly in their token's colour, see Draft. */
    setDrafts: (drafts: Draft[]) => void;
    /** Other screens' rulers and areas, in their player's colour, see Mark. */
    setMarks: (marks: SharedMark[]) => void;
    /** Every line drawn on the map, this screen's too, see Drawing. */
    setDrawings: (drawings: Drawing[]) => void;
    /** How this screen's next line looks, see Pen. */
    setPen: (pen: Pen) => void;
    /**
     * On a player's phone, their own token: with their summons the only ones they can draw a path
     * from. Every other press pans. Null is the game master's screen, where every token answers, the Player view on
     * the table screen too.
     */
    setOwn: (id: string | null) => void;
    /** Forgets everything seen before. */
    resetFog: () => void;
    /** Adds what the party has seen, from the server. A new epoch forgets what was seen first. */
    setShared: (fog: SharedFog | null) => void;
    /** How the fog looks, see FogSettings. */
    setFogSettings: (settings: FogSettings) => void;
    /**
     * Whose fog this is: the GM previewing a map with test players, or the live table. A change
     * forgets what this screen saw, so what the test players uncovered never reaches the party.
     */
    setFogSource: (source: 'preview' | 'live') => void;
    destroy: () => void;
}

/** A path being drawn: anchor cells on a grid, or free points without one. */
interface Route
{
    id: string;
    pointerId: number;
    cells: Cell[];
    points: Point[];
    /** The finger, while it is in ground nobody has seen, which the path does not go into. */
    unknown?: Point;
    /** The finger drawing it, whose feet show just above it, see fingerGap in map/tools.ts. */
    finger?: Point;
}

/**
 * Puts a scenario on a canvas and lets people move around it: drag with a mouse or one finger,
 * pinch with two, scroll or pinch a trackpad to zoom, drag tokens, draw paths. Plain DOM and
 * canvas rather than React, so a drag never re-renders a component, see components/MapCanvas.tsx.
 * It draws on the next frame after something changed, and keeps drawing every frame only while
 * the smoke drifts or a token walks.
 */
export function createMapView(canvas: HTMLCanvasElement, options: MapViewOptions = {}): MapView
{
    const context = canvas.getContext('2d');

    if (!context)
        throw new Error('This browser cannot draw on a canvas.');

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scenario: Scenario | null = null;
    let segments: Segment[] = [];
    /** Backgrounds and prop pictures by address, loaded once each. */
    const pictures = new Map<string, HTMLImageElement>();
    let tokens: Token[] = [];
    let fogEnabled = false;
    let explored: Explored | null = null;
    let fogSettings = defaultFogSettings;
    let fogSource: 'preview' | 'live' | null = null;
    let shared: SharedFog | null = null;
    /** The epoch of the shared fog last taken in, see SharedFog. Null before any on this map. */
    let sharedEpoch: number | null = null;
    let exploredTimer = 0;
    let layers: FogLayers | null = null;
    /** What the players see right now, one polygon each, for showing monsters. */
    let lit: Point[][] = [];
    let camera: Camera = { x: 0, y: 0, zoom: 1 };
    let fitZoom = 1;
    let fittedId: string | null = null;
    /** The scenario a phone last centred on its own token in, so it does that once per map. */
    let focusedId: string | null = null;
    let viewport: Viewport = { width: 0, height: 0, dpr: 1 };
    let frame = 0;
    /** When a frame was last drawn, and whether something asked for the next one at once. */
    let drawnAt = 0;
    let urgent = false;
    /** Where each finger or the mouse was last seen, by pointer id, for panning and pinching. */
    const pointers = new Map<number, Point>();
    /**
     * The token being dragged freely, the pointer dragging it and where it started, with every
     * token going along and where each started: the tokens picked with the Select tool, or itself.
     */
    let dragging: { id: string; pointerId: number; from: Point; group: { id: string; from: Point }[] } | null = null;
    /** The tokens picked with the Select tool in Edit, or null without it, see setSelection. */
    let selection: string[] | null = null;
    /** A monster dragged from the presets or the tray over the map, see setGhost. */
    let ghost: { monster: Pick<Token, 'name' | 'color' | 'avatar' | 'size'>; at: Point; stack: boolean } | null = null;
    /** A prop dragged from the library over the map, see setPropGhost. */
    let propGhost: Prop | null = null;
    /** A box being dragged on empty ground with the Select tool, in world pixels. */
    let boxing: { pointerId: number; start: Point; end: Point; add: boolean } | null = null;
    let route: Route | null = null;
    let pending: PendingMove | null = null;
    /** Set when a right button press already cancelled a move, so its menu event does not too. */
    let menuHandled = false;
    let frozen = false;
    let peek = false;
    let own: string | null = null;
    /** Frames drawn since stats were last reported, and their cost. */
    const stats = { since: 0, frames: 0, spent: 0, worst: 0 };
    /** Tokens on their way, by id. */
    const walks = new Map<string, Walk>();
    /** The tokens the last frame showed, by id, so one that is gone can still fade out. */
    let lastShown = new Map<string, Lifted>();
    /** Tokens fading in or out, by id: since when, which way, and the token as it last showed. */
    const fading = new Map<string, { at: number; in: boolean; token?: Lifted }>();
    /** Companions getting on or off their rider, by id: since when, and how they showed before. */
    const mounting = new Map<string, { at: number; from: Lifted }>();
    /** The tokens the last frame drew, by id, perched or not, so one that changes can ease. */
    let lastDrawn = new Map<string, Lifted>();
    /** The companions riding last frame, before easing, which gives every eased one a radius. */
    let lastRiders = new Set<string>();
    /** The companions riding once every walk ends, getting on ones too, see easeMounts. */
    let boarding = new Set<string>();
    /** Where the players stood, to a quarter cell, the last time a walk redrew the fog. */
    let walkFogKey = '';
    let tool: MapTool | null = null;
    /** The pointer a tool took on press, which keeps going to the tool until it lifts. */
    let toolPointerId: number | null = null;
    /** The mouse panning with its middle button, which shows the closed hand while it does. */
    let middlePan: number | null = null;
    /** A press held still on an empty spot, which pings once it has been held for holdDelay. */
    let hold: { pointerId: number; from: Point; timer: number } | null = null;
    /** The pings flashing now, with when each started on the clock frames are drawn with. */
    let pings: { x: number; y: number; color?: string; start: number }[] = [];
    /** The attacks and heals playing now, like pings. */
    let hits: (HitEffect & { start: number })[] = [];
    /** The tokens picked as targets, or null when not picking, see setTargets. */
    let targets: string[] | null = null;
    /** The decals, with since when each shows, and the cleared ones, with since when they fade. */
    let decals: (Decal & { at: number })[] = [];
    let clearedDecals: (Decal & { at: number })[] = [];
    /** The blood badly hurt tokens left as they moved, with when, and where each left its last. */
    let drops: (Drop & { start: number })[] = [];
    const lastDrop = new Map<string, Point>();
    let blood = defaultBlood;
    let system: GameSystem = '5e';
    /** The token whose turn it is, see setTurn. */
    let turn: string | null = null;
    /**
     * Where the mouse rests or a finger last pressed, in world pixels, and the condition badge
     * there, whose name shows beside it, see showBadgeAt.
     */
    let badgePoint: Point | null = null;
    let badgeKey = '';
    /** When the phone's own token last stopped walking, for its ring, see drawPulse in map/render.ts. */
    let ownRestedAt = performance.now();
    /** Other screens' paths, see setDrafts. */
    let drafts: Draft[] = [];
    /** Other screens' rulers and areas, see setMarks. */
    let marks: SharedMark[] = [];
    /** When this screen last sent its mark, the send waiting for draftGap to pass, and whether
     * one is out, to take back when the tool changes mid drag. */
    let markSentAt = 0;
    let markTimer = 0;
    let marked = false;
    /** The lines drawn on the map, see setDrawings. */
    let drawings: Drawing[] = [];
    let pen: Pen = { width: penWidths.start };
    /** When this screen last sent its line, and the send waiting for draftGap to pass. */
    let lineSentAt = 0;
    let lineTimer = 0;
    /** The token whose path this screen last shared, and how that path looked, see shareDraft. */
    let drafted: string | null = null;
    let draftKey = '';
    /** When this screen last sent its path, and the send waiting for draftGap to pass. */
    let draftSentAt = 0;
    let draftTimer = 0;

    /** Drops a press that was on its way to a ping. */
    const letGo = () =>
    {
        if (hold)
            window.clearTimeout(hold.timer);

        hold = null;
    };

    /** A picture ready to draw, or null while it loads; it asks for a frame once it has. */
    const loaded = (src: string): HTMLImageElement | null =>
    {
        let image = pictures.get(src);

        if (!image)
        {
            image = new Image();
            image.onload = () => redraw();
            image.src = src;
            pictures.set(src, image);
        }

        return image.complete && image.naturalWidth > 0 ? image : null;
    };

    const walksNow = (id: string) => walks.has(id);

    /** Tokens where they show at a moment: walking ones partway along their path. */
    const tokensAt = (time: number): Lifted[] =>
        tokens.map((token) =>
        {
            const walk = walks.get(token.id);

            if (!walk)
                return token;

            const { point, lift, done } = walkAt(walk, time);

            if (done)
            {
                walks.delete(token.id);

                if (token.id === own)
                    ownRestedAt = time;
            }

            return { ...token, ...point, lift: done ? 0 : lift };
        });

    /** How far a fade has come, 0 to 1. */
    const fadeProgress = (at: number, time: number) =>
        fogSettings.fade > 0 ? Math.min(1, Math.max(0, (time - at) / fogSettings.fade)) : 1;

    /** Starts a token fading. One fading the other way turns round from where it is, no jump. */
    const startFade = (id: string, fadingIn: boolean, time: number, token?: Lifted) =>
    {
        const current = fading.get(id);
        const at =
            current && current.in !== fadingIn ? time - (1 - fadeProgress(current.at, time)) * fogSettings.fade : time;

        fading.set(id, { at, in: fadingIn, token: token ?? current?.token });
    };

    /**
     * A companion getting on or off its rider glides between its own space and the rider's ring,
     * and grows or shrinks on the way, rather than jumping. It eases from where it last showed,
     * so turning round halfway does not jump either. Reduced motion moves it at once. One getting
     * on or off, or walking to get on, is drawn over its rider, rather than sliding under it.
     */
    const easeMounts = (visible: Lifted[], time: number, grid: Scenario['grid']): Lifted[] =>
    {
        const radiusOf = (token: Lifted) => token.radius ?? tokenRadius(grid, token.size);
        const moving = new Set<string>();

        boarding = new Set(perched(tokens, grid).flatMap((token) => (token.radius === undefined ? [] : [token.id])));

        const eased = visible.map((token) =>
        {
            const before = lastDrawn.get(token.id);

            if (calm.matches)
                return token;

            if (before && lastRiders.has(token.id) !== (token.radius !== undefined))
                mounting.set(token.id, { at: time, from: before });

            const mount = mounting.get(token.id);

            if (!mount)
                return token;

            moving.add(token.id);
            const step = Math.min(1, (time - mount.at) / mountTime);

            if (step === 1)
                mounting.delete(token.id);

            const ease = 1 - (1 - step) ** 3;
            const from = radiusOf(mount.from);

            return { ...token, ...lerp(mount.from, token, ease), radius: from + (radiusOf(token) - from) * ease };
        });

        lastDrawn = new Map(eased.map((token) => [token.id, token]));
        lastRiders = new Set(visible.filter((token) => token.radius !== undefined).map((token) => token.id));

        const onTop = (token: Lifted) => moving.has(token.id) || boarding.has(token.id);

        return [...eased.filter((token) => !onTop(token)), ...eased.filter(onTop)];
    };

    /**
     * Everything that comes or goes on the map fades like the fog clears, over the same time: a
     * monster walking into sight, one the GM hides, a player joining or removed, Peek, another
     * map. Gone tokens keep showing where they were last while they fade out. Reduced motion
     * shows and hides them at once.
     */
    const fadeTokens = (visible: Lifted[], time: number) =>
    {
        const now = new Map(visible.map((token) => [token.id, token]));

        if (calm.matches)
        {
            lastShown = now;
            fading.clear();

            return visible;
        }

        for (const token of visible)
        {
            if (!lastShown.has(token.id))
                startFade(token.id, true, time);

        }

        for (const [id, token] of lastShown)
        {
            if (!now.has(id))
                startFade(id, false, time, token);

        }

        lastShown = now;

        const alphaOf = (id: string) =>
        {
            const fade = fading.get(id);

            if (!fade)
                return 1;

            const done = fadeProgress(fade.at, time);

            if (done >= 1)
                fading.delete(id);

            return fade.in ? done : 1 - done;
        };

        const going = [...fading]
            .filter(([id, fade]) => !fade.in && !now.has(id))
            .flatMap(([id, fade]) => (fade.token ? [{ ...fade.token, alpha: alphaOf(id) }] : []));

        return [...visible.map((token) => ({ ...token, alpha: alphaOf(token.id) })), ...going];
    };

    /** Monsters stay hidden from players until a player can see them, and while the GM hides them. */
    const seenByPlayers = (token: Token) =>
        token.kind === 'player' || (!token.hidden && lit.some((polygon) => insidePolygon(token, polygon)));

    /**
     * Hands what has been seen on to be shared, once it has stopped changing for a moment, or at
     * once when the game master hid some.
     */
    const shareExplored = (forget = false) =>
    {
        const { onExplored } = options;

        if (!onExplored || !scenario || !explored)
            return;

        const { id } = scenario;
        const { columns, rows, seen } = explored;

        const send = () => onExplored({ scenarioId: id, epoch: sharedEpoch ?? 0, columns, rows, seen: packSeen(seen) }, forget);

        clearTimeout(exploredTimer);

        if (forget)
            send();
        else
            exploredTimer = window.setTimeout(send, exploredDelay);

    };

    /** Takes in the shared fog for this map, when it fits the explored mask. */
    const applyShared = () =>
    {
        if (!shared || !scenario || shared.scenarioId !== scenario.id)
            return;

        explored ??= createExplored(scenario);

        if (shared.columns !== explored.columns || shared.rows !== explored.rows || shared.seen.byteLength !== Math.ceil(explored.seen.length / 8))
            return;

        if (sharedEpoch !== null && shared.epoch !== sharedEpoch)
        {
            explored.seen.fill(0);

            if (layers)
                clearShape(layers);

        }

        sharedEpoch = shared.epoch;

        // What another screen saw, or this one before a reload, only comes as samples.
        const added: number[] = [];
        const packed = new Uint8Array(shared.seen);

        explored.seen.forEach((flag, index) =>
        {
            if (!flag && explored && packedFlag(packed, index))
            {
                explored.seen[index] = 1;
                added.push(index);
            }
        });

        if (layers)
            shapeSamples(layers, scenario, explored, added, fogSettings);

    };

    /** Works out what the players see now, adds it to what was seen, and repaints the fog. */
    const refreshFog = (shown: Token[] = tokens) =>
    {
        if (!fogEnabled || !scenario)
            return;

        explored ??= createExplored(scenario);
        layers ??= createFogLayers(scenario, explored, fogSettings);

        const viewers = shown
            .filter((token) => token.kind === 'player')
            .map((token) =>
            {
                const origin = { x: token.x, y: token.y };

                return { origin, polygon: visibilityPolygon(origin, segments) };
            });

        let more = false;

        for (const viewer of viewers)
            more = markSeen(explored, viewer.polygon) || more;

        if (more)
            shareExplored();

        lit = viewers.map((viewer) => viewer.polygon);
        composeFog(layers, scenario, explored, viewers, segments, fogSettings);
        redraw();
    };

    /** The path being drawn or waiting, in its token's ring colour, red past the token's speed. */
    const pathShown = (current: Scenario) =>
    {
        const shown = route
            ? { id: route.id, points: route.points, feet: routeFeet(current, route) }
            : pending;

        if (!shown)
            return null;

        const token = tokens.find((candidate) => candidate.id === shown.id);
        const over = token !== undefined && shown.feet > token.speed;

        return { ...shown, over, colour: over ? tooFar : (token?.color ?? accent) };
    };

    /**
     * Hands this screen's ruler or area on as it is dragged, at most every draftGap like a path,
     * the latest one once its turn comes. Letting go goes at once. Only in play: an edit tool never
     * makes one, and the fog being on means the session's map is shown.
     */
    const shareMark = (mark: Mark | null) =>
    {
        if (!options.onMark || (mark && !fogEnabled))
            return;

        window.clearTimeout(markTimer);
        markTimer = 0;

        const wait = markSentAt + draftGap - performance.now();

        if (mark && wait > 0)
        {
            markTimer = window.setTimeout(() => shareMark(mark), wait);

            return;
        }

        markSentAt = performance.now();
        marked = mark !== null;
        options.onMark(mark);
    };

    /** Hands this screen's line on as it grows, at most every draftGap like a ruler. Letting go goes at once. */
    const shareLine = (key: string, points: Point[], final: boolean) =>
    {
        if (!options.onDrawLine)
            return;

        window.clearTimeout(lineTimer);

        const wait = lineSentAt + draftGap - performance.now();

        if (!final && wait > 0)
        {
            lineTimer = window.setTimeout(() => shareLine(key, points, false), wait);

            return;
        }

        lineSentAt = performance.now();

        const sent = Promise.resolve(options.onDrawLine(key, points, pen));

        // A refused line is dropped by the tool, see drawTool, and the map shows it gone.
        sent.catch(() => redraw());

        return sent;
    };

    /**
     * Hands a player's path on whenever it changes, so other screens show it being drawn, and
     * null once it goes. A monster's path stays on this screen, see drafts in convex/play.ts.
     */
    const shareDraft = (path: Draft | null) =>
    {
        const end = path?.points[path.points.length - 1];
        const player = path && tokens.find((token) => token.id === path.id)?.kind === 'player';
        const key = path && end && player && path.points.length > 1 ? `${path.id} ${path.points.length} ${end.x} ${end.y} ${path.feet}` : '';

        if (!options.onDraft || key === draftKey)
            return;

        // A path growing waits its turn, and the latest one goes when it comes. Dropping it, or
        // starting another token's, goes at once.
        const wait = draftSentAt + draftGap - performance.now();

        if (key && drafted === path?.id && wait > 0)
        {
            draftTimer ||= window.setTimeout(() =>
            {
                draftTimer = 0;
                shareDraft(scenario ? pathShown(scenario) : null);
            }, wait);

            return;
        }

        draftSentAt = performance.now();

        if (drafted && (!key || drafted !== path?.id))
            options.onDraft(drafted, null, 0);

        if (key && path)
            options.onDraft(path.id, path.points, path.feet);

        drafted = key && path ? path.id : null;
        draftKey = key;
    };

    /**
     * How big a path's feet pill is: full size until a cell is smaller on screen than the pill is
     * tall, then shrinking with the cells, to two thirds at most, so it never hides the map zoomed out.
     */
    const pillScale = () => Math.min(1, Math.max(2 / 3, ((scenario?.grid.size ?? 0) * camera.zoom) / 40));

    /** The path's labels, over the tokens: its feet beside its end, or why it cannot go on. */
    const drawPathLabels = (shown: NonNullable<ReturnType<typeof pathShown>>) =>
    {
        const end = shown.points[shown.points.length - 1];

        if (route?.unknown)
            drawUnknownStep(context, end, route.unknown, camera.zoom);

        if (shown.points.length > 1)
            // The pill stays dark unless the path is too long: a light ring colour would hide its words.
            drawPill(context, `${shown.feet} ft`, route?.finger ? { x: route.finger.x, y: route.finger.y - fingerGap / camera.zoom } : end, camera.zoom, shown.over ? tooFar : ground, pillScale(), route?.finger !== undefined);

    };

    /** Adds one frame's cost to the stats, and hands them on twice a second. */
    const measure = (time: number, spent: number) =>
    {
        if (!options.onStats)
            return;

        // After a pause, like the map sitting still, start counting afresh.
        if (time - stats.since > 1000)
            Object.assign(stats, { since: time, frames: 0, spent: 0, worst: 0 });

        stats.frames++;
        stats.spent += spent;
        stats.worst = Math.max(stats.worst, spent);

        if (time - stats.since < 500)
            return;

        options.onStats({
            fps: Math.round((stats.frames * 1000) / (time - stats.since)),
            frameMs: stats.spent / stats.frames,
            worstMs: stats.worst,
        });
        Object.assign(stats, { since: time, frames: 0, spent: 0, worst: 0 });
    };

    /**
     * One drop of blood at a token: scattered over its lower half as if dripping off it, bigger
     * when it is critical. A smear, from a downed body being moved, is bigger still and closer
     * under it, so the drops run together into a streak.
     */
    const bleed = (at: Point, size: CreatureSize, time: number, heavy: boolean, smear: boolean) =>
    {
        if (!scenario)
            return;

        const radius = tokenRadius(scenario.grid, size);
        const spot = Math.random() * Math.PI;
        const reach = radius * (smear ? 0.25 : 0.5) * Math.random();

        drops.push({
            x: at.x + Math.cos(spot) * reach,
            y: at.y + Math.sin(spot) * reach,
            radius: radius * (smear ? 0.13 : heavy ? 0.08 : 0.06) * (0.8 + Math.random() * 0.4),
            seed: Math.random(),
            alpha: 1,
            start: time,
        });
        drops = drops.slice(-maxDrops);
    };

    /**
     * Blood behind every badly hurt token walking where this screen shows it, so a monster out of
     * the players' sight leaves no trail on their screens, and a smear behind a downed body the
     * game master drags or walks here. Old drops go.
     */
    const layDrops = (visible: Lifted[], time: number) =>
    {
        drops = blood.ground ? drops.filter((drop) => time - drop.start < dropLife) : [];

        if (!scenario || !blood.ground)
            return;

        for (const token of visible)
        {
            const moving = walks.has(token.id) || held(token.id);
            const state = moving ? stateOf(token) : undefined;

            if (state !== 'bloodied' && state !== 'critical' && state !== 'down')
            {
                lastDrop.delete(token.id);
                continue;
            }

            // Critical bleeds harder: drops closer together. A body smears, closer still.
            const smear = state === 'down';
            const gap = smear ? smearGap : dropGap * (state === 'critical' ? 0.6 : 1);
            const last = lastDrop.get(token.id);

            if (last && distance(last, token) < scenario.grid.size * gap)
                continue;

            lastDrop.set(token.id, { x: token.x, y: token.y });
            bleed(token, token.size, time, state === 'critical', smear);
        }
    };

    const draw = (time: number) =>
    {
        frame = 0;

        if (!scenario || viewport.width === 0)
            return;

        const walking = walks.size > 0;

        // The fog or a token still fading in or out.
        pings = pings.filter((ping) => time - ping.start < pingLife);
        hits = hits.filter((hit) => time - hit.start < hitLife);
        clearedDecals = calm.matches ? [] : clearedDecals.filter((decal) => time - decal.at < decalFade);

        // A new pool spreads out fast and settles, like spilt liquid, its colour there well before
        // its size. A cleared one fades softly. Reduced motion shows and clears them at once.
        const progress = (at: number, length: number) => (calm.matches ? 1 : Math.min(1, (time - at) / length));
        const easeOut = (step: number) => 1 - (1 - step) ** 3;
        const shownDecals = [
            ...decals.map((decal) =>
            {
                const spread = progress(decal.at, decalSpread);

                return { ...decal, alpha: easeOut(Math.min(1, spread * 3)), scale: (decal.scale ?? 1) * (0.3 + 0.7 * easeOut(spread)) };
            }),
            ...clearedDecals.map((decal) =>
            {
                const gone = progress(decal.at, decalFade);

                return { ...decal, alpha: 1 - gone * gone * (3 - 2 * gone) };
            }),
        ];
        const decalsMoving = blood.ground && (clearedDecals.length > 0 || decals.some((decal) => progress(decal.at, decalSpread) < 1));
        const settling =
            fading.size > 0 || mounting.size > 0 || pings.length > 0 || hits.length > 0 || decalsMoving || (layers !== null && time - layers.changedAt < fogSettings.fade);

        // Only the smoke is moving: skip frames until its own rate comes round.
        if (!urgent && !walking && !settling && time - drawnAt < 1000 / smokeFps)
        {
            frame = requestAnimationFrame(draw);

            return;
        }

        urgent = false;
        drawnAt = time;

        const started = performance.now();
        const shown = tokensAt(time);

        // The fog follows a walking token on every screen. Redrawn each quarter cell walked
        // rather than every frame: closer than that looks the same under the blur.
        if (walking)
        {
            const quarter = scenario.grid.size / 4;
            const key = shown
                .filter((token) => token.kind === 'player')
                .map((token) => `${Math.round(token.x / quarter)},${Math.round(token.y / quarter)}`)
                .join(' ');

            if (key !== walkFogKey)
            {
                walkFogKey = key;
                refreshFog(shown);
            }
        }

        const fog = fogEnabled ? layers : null;
        const background = scenario.background ? loaded(scenario.background) : null;
        const path = pathShown(scenario);
        // Other screens' paths, for tokens this screen shows, never the one drawn here.
        const others = drafts.flatMap((draft) =>
        {
            const token = shown.find((candidate) => candidate.id === draft.id);

            if (!token || draft.id === path?.id)
                return [];

            const over = draft.feet > token.speed;

            return [{ ...draft, over, colour: over ? tooFar : token.color }];
        });

        shareDraft(path);

        // Peeking, the GM view, the game master sees every monster too, and the fog at half
        // strength: clear enough to see through, dark enough to tell what the players see.
        const visible = easeMounts(perched(fogEnabled && !peek ? shown.filter(seenByPlayers) : shown, scenario.grid, walksNow), time, scenario.grid);

        layDrops(visible, time);

        // The monster being dragged on, lined up with the grid the way it will land, see monsterFrom
        // in map/presets.ts.
        const landing = ghost && {
            ...ghost.monster,
            id: 'ghost',
            kind: 'npc' as const,
            speed: 0,
            ...landingAt(scenario, ghost.at, ghost.monster.size, ghost.stack ? [] : tokens),
            hidden: true,
            alpha: 0.8,
            lift: 1,
        };
        const { grid } = scenario;
        const anchor = landing && grid.type !== 'none' ? anchorAt(grid, landing, landing.size) : null;

        const scene: Scene = {
            // The Player view leaves out the props the GM hides. Only at drawing, as the scenario
            // here is the one a door opened in the Player view saves.
            scenario: fogEnabled && !peek ? { ...scenario, props: scenario.props.filter((prop) => !prop.hidden) } : scenario,
            background,
            picture: loaded,
            tokens: landing ? [...fadeTokens(visible, time), landing] : fadeTokens(visible, time),
            editing: !fogEnabled,
            own,
            ownRestedAt,
            motion: !calm.matches,
            fog,
            fogLook: { fade: !calm.matches, opacity: peek ? 0.5 : 1, settings: fogSettings },
            time,
            decals: blood.ground ? shownDecals : [],
            wounds: blood.wounds,
            turn,
            drops: drops.map((drop) => ({ ...drop, alpha: Math.min(1, (dropLife - (time - drop.start)) / dropFade) })),
            // The path's line goes under the tokens, so it never covers the one walking it.
            beneath: () =>
            {
                for (const draft of others)
                    drawRoute(context, draft.points, camera.zoom, draft.colour);

                if (path)
                    drawRoute(context, path.points, camera.zoom, path.colour);

                if (landing)
                    drawFootprint(context, grid, anchor ? footprint(grid, anchor, landing.size) : [], landing, tokenRadius(grid, landing.size), camera.zoom);

            },
        };

        render(context, scene, camera, viewport);
        options.onView?.(toWorld(camera, { x: viewport.width / 2, y: viewport.height / 2 }));

        const scale = viewport.dpr * camera.zoom;

        context.setTransform(scale, 0, 0, scale, viewport.dpr * camera.x, viewport.dpr * camera.y);

        // The HP under each token whose numbers this screen has, over the fog so the GM view reads
        // it. Only in play: in edit mode it would be in the way. Not on a token fading out, which
        // keeps how it was last shown, numbers and all, see fadeTokens.
        if (fogEnabled)
        {
            const staying = new Set(visible.map((token) => token.id));

            for (const token of scene.tokens)
            {
                // A rider's HP would cover its carrier's picture; its own phone and the Players list
                // have it. Hidden too while it walks to get on, and gets on or off.
                if (!staying.has(token.id) || token.radius !== undefined || boarding.has(token.id))
                    continue;

                context.globalAlpha = token.alpha ?? 1;
                drawHealth(context, token, tokenRadius(scenario.grid, token.size), camera.zoom, pillScale());
            }

            context.globalAlpha = 1;
        }

        if (targets)
        {
            for (const token of scene.tokens)
            {
                if (targets.includes(token.id))
                    drawTarget(context, token, shownRadius(scenario.grid, token), camera.zoom);

            }
        }

        if (selection)
        {
            for (const token of scene.tokens)
            {
                if (selection.includes(token.id))
                    drawSelected(context, token, shownRadius(scenario.grid, token), camera.zoom);

            }
        }

        if (boxing)
            drawBox(context, boxing, camera.zoom, highlight, true);

        // The name of the condition badge the mouse rests on or a finger pressed, over the rest.
        const badge = badgePoint && conditionBadgeAt(visible, scenario.grid, badgePoint);

        if (badge)
            drawPill(context, badgeName(badge), badge, camera.zoom, ground, pillScale());

        for (const draft of others)
            drawPill(context, `${draft.feet} ft`, draft.points[draft.points.length - 1], camera.zoom, draft.over ? tooFar : ground, pillScale());

        if (path)
            drawPathLabels(path);

        for (const line of drawings)
            drawLine(context, line.points, camera.zoom, line.color ?? highlight, line.width);

        for (const mark of marks)
            drawMark(context, mark, camera.zoom, scenario, mark.color ?? highlight, system);

        tool?.draw(context, camera.zoom, scenario);

        if (propGhost)
            drawPropGhost(context, propGhost, loaded(propGhost.src), camera.zoom);


        for (const ping of pings)
            drawPing(context, ping, (time - ping.start) / pingLife, camera.zoom, !calm.matches);

        for (const hit of hits)
            drawHit(context, hit, (time - hit.start) / hitLife, camera.zoom, !calm.matches);

        // The smoke drifts, walking tokens move, fog changes and tokens fade, so they ask for
        // the next frame. Reduced motion keeps the smoke still and skips the fades; a walk still
        // plays. Only once: the fog refreshed above may already have asked, and two would draw
        // every frame twice.
        if ((walking || fading.size > 0 || pings.length > 0 || hits.length > 0 || decalsMoving || (fog && !calm.matches)) && frame === 0)
            frame = requestAnimationFrame(draw);

        measure(time, performance.now() - started);
    };

    const redraw = () =>
    {
        urgent = true;

        if (frame === 0)
            frame = requestAnimationFrame(draw);

    };

    /**
     * The game master's Reveal, a box or a circle: what it covers counts as seen before, or,
     * hidden, as never seen. What a player sees right now stays seen.
     */
    const reveal = (polygon: Point[], hide: boolean) =>
    {
        if (!explored)
            return;

        markSeen(explored, polygon, hide ? 0 : 1);

        if (layers)
            shapePolygon(layers, polygon, hide);

        shareExplored(hide);
        refreshFog();
    };

    const fit = () =>
    {
        if (!scenario || viewport.width === 0)
            return;

        camera = fitCamera(scenario, viewport);
        fitZoom = camera.zoom;
        fittedId = scenario.id;
    };

    /**
     * On a phone, the first time its own token shows on a map, the camera moves to it, close
     * enough to see the room. Never further out than the whole map.
     */
    const focusOwn = () =>
    {
        const token = own ? tokens.find((candidate) => candidate.id === own) : undefined;

        if (!token || !scenario || viewport.width === 0 || focusedId === scenario.id)
            return;

        const close = Math.min(viewport.width, viewport.height) / (scenario.grid.size * ownCells);

        camera = centerOn(token, viewport, Math.min(Math.max(close, fitZoom), fitZoom * zoomInLimit));
        focusedId = scenario.id;
        redraw();
    };

    const zoomBy = (at: Point, factor: number) =>
    {
        camera = zoomAt(camera, at, factor, fitZoom * zoomOutLimit, fitZoom * zoomInLimit);
        redraw();
    };

    const resize = () =>
    {
        const dpr = window.devicePixelRatio || 1;

        viewport = { width: canvas.clientWidth, height: canvas.clientHeight, dpr };
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);

        if (scenario && fittedId !== scenario.id)
            fit();
        else if (scenario)
            fitZoom = fitCamera(scenario, viewport).zoom;

        focusOwn();

        // Resizing the canvas wipes it, so draw now rather than leave a blank frame.
        cancelAnimationFrame(frame);
        urgent = true;
        draw(performance.now());
    };

    const local = (event: MouseEvent): Point =>
    {
        const box = canvas.getBoundingClientRect();

        return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    /** The topmost token under a screen point that this screen shows: every one in the GM view. */
    const tokenAt = (screen: Point, current: Scenario): Token | undefined =>
    {
        const world = toWorld(camera, screen);
        const shown = perched(fogEnabled && !peek ? tokens.filter(seenByPlayers) : tokens, current.grid, walksNow);

        // Last drawn is on top. The project targets ES2022, which has no findLast. A press reaches
        // a bit past the token's edge, as tokens leave room in their cell and fingers are wide, and
        // never less than around a Medium one, so a Tiny one is as easy to grab. A rider is small
        // on its carrier's ring, so only its own circle grabs it.
        const hit = [...shown]
            .reverse()
            .find((token) => distance(world, token) <= (token.radius ?? Math.max(tokenRadius(current.grid, token.size), tokenRadius(current.grid)) * 1.5));

        // Where it really stands, not where it is drawn.
        return hit && tokens.find((token) => token.id === hit.id);
    };

    /** Names the condition badge under a screen point, or none with null, redrawing on a change. */
    const showBadgeAt = (screen: Point | null) =>
    {
        const shown = fogEnabled && !peek ? tokens.filter(seenByPlayers) : tokens;

        badgePoint = screen && toWorld(camera, screen);

        const badge = badgePoint && scenario ? conditionBadgeAt(perched(shown, scenario.grid, walksNow), scenario.grid, badgePoint) : undefined;
        const key = badge ? `${badge.tokenId} ${badge.kind.id}` : '';

        if (key !== badgeKey)
        {
            badgeKey = key;
            redraw();
        }
    };

    /** Puts tokens down where given, by id, all in one go. */
    const moveTokens = (moves: Map<string, Point>) =>
    {
        tokens = tokens.map((token) =>
        {
            const to = moves.get(token.id);

            return to ? { ...token, x: to.x, y: to.y } : token;
        });
        refreshFog();
        redraw();
    };

    /** Whether a token is being dragged, on its own or with the ones picked. */
    const held = (id: string) => dragging?.group.some((member) => member.id === id) === true;

    /** The cursor at rest: the tool's, an arrow for the Select tool, or the stylesheet's grab hand. */
    const restCursor = () => (tool ? tool.cursor : selection ? 'default' : '');

    /** What a route costs: counted per cell on a grid, by length without one. */
    const routeFeet = (current: Scenario, { cells, points }: Route) =>
        current.grid.type === 'none'
            ? Math.round(lineFeet(current.grid, points))
            : pathFeet(current.grid, cells);

    /**
     * Whether players may walk to a point: anywhere without fog, otherwise only where they see now
     * or have seen. The seen samples are coarse and the fog is drawn soft over them, so a point
     * counts when any of the four samples around it was seen, rather than only the one it is in.
     */
    const seenGround = (point: Point) =>
    {
        if (!fogEnabled || !explored || lit.some((polygon) => insidePolygon(point, polygon)))
            return true;

        const known = explored;
        const reach = known.sample / 2;

        return [-reach, reach].some((dx) =>
            [-reach, reach].some((dy) => wasSeen(known, { x: point.x + dx, y: point.y + dy })),
        );
    };

    /** Grows the route towards the finger, never through a wall or into ground nobody has seen. */
    const extendRoute = (current: Scenario, world: Point) =>
    {
        if (!route)
            return;

        const token = tokens.find((candidate) => candidate.id === route?.id);

        if (!token)
            return;

        const { grid, walls } = current;
        // In the GM view a monster's path goes anywhere, fog or not: the players see nothing of it.
        const open = (point: Point) => (peek && token.kind !== 'player') || seenGround(point);

        route = { ...route, unknown: open(world) ? undefined : world };

        if (grid.type !== 'none')
        {
            const anchor = anchorAt(grid, world, token.size);

            // A cell only counts once the finger is well inside it. Crossing a corner brushes the
            // cells beside it, which would turn a diagonal step into two straight ones.
            if (distance(world, footprintCenter(grid, anchor, token.size)) > grid.size * 0.35)
                return;

            const before = route.cells.length;
            const grown = extendPath(grid, walls, route.cells, anchor, token.size);
            // Never into ground the party has not seen, or the walls stopping a path drawn there
            // would map it out.
            const unseen = grown.findIndex(
                (cell, index) => index >= before && !open(footprintCenter(grid, cell, token.size)),
            );
            const cells = unseen === -1 ? grown : grown.slice(0, unseen);

            // A tick per cell gained or taken back, felt on a phone while the finger hides the path.
            if (cells.length !== before)
                buzz(8);

            route = { ...route, cells, points: cells.map((cell) => footprintCenter(grid, cell, token.size)) };

            return;
        }

        // Without a grid, a new point every quarter cell of finger travel, unless a wall is in the way.
        const last = route.points[route.points.length - 1];

        if (!pathBlocked(walls, [last, world]) && open(world) && distance(last, world) > grid.size / 4)
            route = { ...route, points: [...route.points, world] };

    };

    /**
     * Whether a route would end on top of someone. Outside the GM view a monster the players cannot
     * see does not count, or saying no would give away where it hides.
     */
    const endTaken = (current: Scenario, token: Token, end: Point) =>
    {
        const { grid } = current;
        // A player and their companion share a space, see ridesOn in map/size.ts.
        const others = tokens.filter((other) => other.id !== token.id && !partners(token, other) && (peek || !fogEnabled || seenByPlayers(other)));

        if (grid.type === 'none')
        {
            return others.some(
                (other) =>
                    distance(other, end) < tokenRadius(grid, other.size) + tokenRadius(grid, token.size),
            );
        }

        const mine = footprintKeys(grid, anchorAt(grid, end, token.size), token.size);

        return others.some((other) =>
            [...footprintKeys(grid, anchorAt(grid, other, other.size), other.size)].some((key) =>
                mine.has(key),
            ),
        );
    };

    const toolPointer = (event: PointerEvent, current: Scenario): ToolPointer => ({
        world: toWorld(camera, local(event)),
        free: event.altKey,
        straight: event.shiftKey,
        zoom: camera.zoom,
        scenario: current,
        seen: (point) => peek || seenGround(point),
        monsters: tokens.filter((token) => token.kind === 'npc'),
        system,
        touch: event.pointerType !== 'mouse',
        onToken: tokenAt(local(event), current) !== undefined,
    });

    /**
     * A tool's change shows at once, before the page passes the scenario back, so a quick
     * second click already builds on the first. A drag's in-between steps only show here, and
     * the page hears of the final one, see Change in map/tools.ts.
     */
    const changeScenario = (next: Scenario, final = true) =>
    {
        scenario = next;
        segments = sightSegments(next);
        refreshFog();
        redraw();

        if (final)
            options.onScenarioChange?.(next);

    };

    const down = (event: PointerEvent) =>
    {
        // A right click cancels, see contextMenu: it never pans or presses a tool. A press on its own
        // is a fresh click, so a cancel whose menu event never came does not swallow this one.
        if (event.pointerType === 'mouse' && event.button === 2)
        {
            menuHandled = false;

            return;
        }

        canvas.setPointerCapture(event.pointerId);

        // The middle mouse button always pans, whatever tool is on and whatever is under it, with
        // the closed hand of a pan whatever cursor the tool has.
        if (event.pointerType === 'mouse' && event.button === 1)
        {
            pointers.set(event.pointerId, local(event));
            middlePan = event.pointerId;
            canvas.style.cursor = 'grabbing';

            return;
        }

        // A finger has no hover: a press names the badge under it, until the next press or a pan.
        if (event.pointerType !== 'mouse')
            showBadgeAt(local(event));

        // A second finger while one drags a tool, like the ruler, means a pinch: the tool lets go
        // and both fingers zoom.
        if (toolPointerId !== null && pointers.has(toolPointerId))
        {
            tool?.cancel?.();
            toolPointerId = null;
            redraw();
        }

        const idle = pointers.size === 0 && !dragging && !route && toolPointerId === null;
        const target = idle && targets && scenario ? tokenAt(local(event), scenario) : undefined;

        // Picking targets, a press on a token picks it or lets it go; anywhere else pans.
        if (target)
        {
            options.onTarget?.(target.id);
            pointers.set(event.pointerId, local(event));

            return;
        }

        // The Select tool: a press on a token picks it, or with Shift adds it or lets it go, and
        // drags every picked one along; on empty ground it starts a box, so it never pans.
        if (idle && selection && scenario && event.button === 0)
        {
            const point = local(event);
            const token = tokenAt(point, scenario);

            if (!token)
            {
                const world = toWorld(camera, point);

                boxing = { pointerId: event.pointerId, start: world, end: world, add: event.shiftKey };

                return;
            }

            if (event.shiftKey)
            {
                options.onSelect?.(selection.includes(token.id) ? selection.filter((id) => id !== token.id) : [...selection, token.id]);

                return;
            }

            const group = selection.includes(token.id) ? selection : [token.id];

            if (group !== selection)
                options.onSelect?.(group);

            dragging = {
                id: token.id,
                pointerId: event.pointerId,
                from: { x: token.x, y: token.y },
                group: tokens.filter((other) => group.includes(other.id)).map((other) => ({ id: other.id, from: { x: other.x, y: other.y } })),
            };

            return;
        }

        if (idle && tool && scenario && tool.down(toolPointer(event, scenario)))
        {
            toolPointerId = event.pointerId;

            // Kept where it is, for a pinch should a second finger come.
            if (event.pointerType !== 'mouse')
                pointers.set(event.pointerId, local(event));

            redraw();

            return;
        }

        const point = local(event);
        const pressed = idle && scenario ? tokenAt(point, scenario) : undefined;
        // On a phone its own token answers, and its summons, see convex/summons.ts.
        const token = own === null || pressed?.id === own || (pressed?.summonOf !== undefined && pressed.summonOf === own) ? pressed : undefined;

        // In play mode a token draws a path, a player's unless the game master froze movement, so
        // the GM sees how far a monster gets too. On the GM's screens any token with Alt held drags
        // freely; a phone always draws its path. Everything in edit mode drags: that is the game
        // master's hand.
        const walksPath = token !== undefined && (own !== null || !event.altKey);

        if (token && fogEnabled && walksPath)
        {
            if ((frozen && token.kind === 'player') || walks.has(token.id))
            {
                pointers.set(event.pointerId, point);

                return;
            }

            const anchor = scenario && scenario.grid.type !== 'none' ? anchorAt(scenario.grid, token, token.size) : null;

            // A new path replaces the one waiting, so its Move or Cancel goes too.
            if (pending)
                options.onPathCancel?.();

            pending = null;
            route = {
                id: token.id,
                pointerId: event.pointerId,
                cells: anchor ? [anchor] : [],
                points: [{ x: token.x, y: token.y }],
                finger: event.pointerType !== 'mouse' ? toWorld(camera, point) : undefined,
            };
            redraw();

            return;
        }

        if (token)
        {
            const from = { x: token.x, y: token.y };

            dragging = { id: token.id, pointerId: event.pointerId, from, group: [{ id: token.id, from }] };
        }
        else
            pointers.set(event.pointerId, point);

        // One finger or the mouse held still on the floor in play mode pings; a second finger means
        // a pinch instead.
        letGo();

        if (!token && fogEnabled && options.onPing && pointers.size === 1 && scenario)
        {
            const at = onMap(scenario, toWorld(camera, point));
            const { onPing } = options;

            hold = {
                pointerId: event.pointerId,
                from: point,
                timer: window.setTimeout(() =>
                {
                    hold = null;
                    onPing(at);
                }, holdDelay),
            };
        }
    };

    const move = (event: PointerEvent) =>
    {
        // A right button pressed while the left one holds comes as a move, not a press. Waiting
        // for its menu event would cancel only on letting go of it.
        if (event.pointerType === 'mouse' && event.button === 2 && cancelMove())
        {
            menuHandled = true;

            return;
        }

        if (route?.pointerId === event.pointerId && scenario)
        {
            const world = onMap(scenario, toWorld(camera, local(event)));

            extendRoute(scenario, world);

            if (route && event.pointerType !== 'mouse')
                route = { ...route, finger: world };

            redraw();

            return;
        }

        if (boxing?.pointerId === event.pointerId)
        {
            boxing = { ...boxing, end: toWorld(camera, local(event)) };
            redraw();

            return;
        }

        // The pressed token follows the pointer and the rest of the group keeps its place around it.
        if (dragging?.pointerId === event.pointerId)
        {
            if (scenario)
            {
                const to = onMap(scenario, toWorld(camera, local(event)));
                const { from } = dragging;

                moveTokens(new Map(dragging.group.map((member) => [member.id, { x: member.from.x + to.x - from.x, y: member.from.y + to.y - from.y }])));
            }

            return;
        }

        const pressed = toolPointerId === event.pointerId;
        const previous = pointers.get(event.pointerId);

        // The tool's own drag, or a mouse hovering, which tools use for their previews.
        if (pressed || (!previous && !dragging && !route))
        {
            if (!pressed && event.pointerType === 'mouse')
                showBadgeAt(local(event));

            if (pressed && previous)
                pointers.set(event.pointerId, local(event));

            if (tool && scenario)
            {
                tool.move(toolPointer(event, scenario), pressed);
                canvas.style.cursor = tool.cursor;
                redraw();
            }

            return;
        }

        if (!previous)
            return;

        const point = local(event);

        // A press that wanders is a pan, not a ping. A few pixels of wobble still count as still.
        if (hold?.pointerId === event.pointerId && distance(point, hold.from) > 6)
            letGo();

        const other = [...pointers].find(([id]) => id !== event.pointerId);

        pointers.set(event.pointerId, point);

        if (badgeKey && distance(point, previous) > 0)
            showBadgeAt(null);

        if (!other)
        {
            camera = panBy(camera, point.x - previous.x, point.y - previous.y);
            redraw();

            return;
        }

        // Two fingers: the midpoint pans, the spread zooms around it. A third is ignored.
        const anchor = other[1];
        const before = midpoint(previous, anchor);
        const after = midpoint(point, anchor);
        const spread = distance(previous, anchor);

        camera = panBy(camera, after.x - before.x, after.y - before.y);

        if (spread > 0)
            zoomBy(after, distance(point, anchor) / spread);
        else
            redraw();

    };

    /** Lets go of a drawn path: anything longer than a tap waits for Move or Cancel. */
    const finishRoute = (current: Scenario, finished: Route) =>
    {
        const token = tokens.find((candidate) => candidate.id === finished.id);

        if (!token || finished.points.length < 2)
            return;

        const end = finished.points[finished.points.length - 1];

        pending = {
            id: token.id,
            points: finished.points,
            feet: routeFeet(current, finished),
            blocked: endTaken(current, token, end),
        };
        options.onPathEnd?.(pending);
    };

    const up = (event: PointerEvent) =>
    {
        pointers.delete(event.pointerId);
        letGo();

        if (middlePan === event.pointerId)
        {
            middlePan = null;
            canvas.style.cursor = restCursor();
        }

        // A box picks every token whose middle is inside it, with Shift added to those picked. A
        // click on empty ground, a box around nothing, lets them all go.
        if (boxing?.pointerId === event.pointerId)
        {
            const { start, end, add } = boxing;
            const inside = tokens
                .filter((token) => token.x >= Math.min(start.x, end.x) && token.x <= Math.max(start.x, end.x) && token.y >= Math.min(start.y, end.y) && token.y <= Math.max(start.y, end.y))
                .map((token) => token.id);

            boxing = null;
            options.onSelect?.(add ? [...new Set([...(selection ?? []), ...inside])] : inside);
            redraw();

            return;
        }

        if (route?.pointerId === event.pointerId)
        {
            const finished = route;

            route = null;

            if (scenario)
                finishRoute(scenario, finished);

            redraw();

            return;
        }

        if (toolPointerId === event.pointerId)
        {
            toolPointerId = null;

            if (tool && scenario)
                tool.up?.(toolPointer(event, scenario));

            redraw();

            return;
        }

        if (dragging?.pointerId !== event.pointerId || !scenario)
            return;

        const { group } = dragging;

        dragging = null;

        // Each lands lined up with the grid, its whole footprint on the map, clear of everyone else
        // and of the group landed before it; wherever it was let go without a grid. Only the game
        // master drags freely, so hidden monsters count too. With Alt held it may land on someone.
        const moved = tokens.filter((token) => group.some((member) => member.id === token.id));
        const stay = event.altKey ? [] : tokens.filter((token) => !moved.includes(token));
        const landed = new Map<string, Point>();

        for (const token of moved)
        {
            const to = landingAt(scenario, token, token.size, stay.filter((other) => !partners(token, other)));

            landed.set(token.id, to);
            stay.push({ ...token, ...to });
        }

        moveTokens(landed);

        for (const [id, to] of landed)
            options.onTokenMove?.(id, to);
    };

    /** Drops a path being drawn, or puts a dragged token back. False when neither was going on. */
    const cancelMove = () =>
    {
        if (!route && !dragging && !boxing)
            return false;

        if (dragging)
            moveTokens(new Map(dragging.group.map((member) => [member.id, member.from])));

        route = null;
        dragging = null;
        boxing = null;
        redraw();

        return true;
    };

    /**
     * A right click cancels: a token being moved goes back where it was, a path waiting to be
     * walked is dropped, otherwise what the tool has half done, like a drag still held down, otherwise the tool itself. The browser's own
     * menu would be no use on the map. The menu event comes for a right click even while the left
     * button holds a drag, and the left button's let go then finds nothing to finish.
     */
    const contextMenu = (event: MouseEvent) =>
    {
        event.preventDefault();

        // A long press on a phone opens the menu too. It is a ping there, never a cancel.
        if (event instanceof PointerEvent && event.pointerType === 'touch')
            return;

        if (menuHandled || cancelMove())
        {
            menuHandled = false;

            return;
        }

        if (pending)
        {
            options.onPathCancel?.();

            return;
        }

        const held = toolPointerId !== null;
        // A token under the click opens its menu, unless the tool is mid drag or targets are being
        // picked, where the click puts those away first.
        const token = !held && !targets && scenario ? tokenAt(local(event), scenario) : undefined;

        if (token && options.onTokenMenu?.(token.id, { x: event.clientX, y: event.clientY }))
            return;

        const prop = !token && !held && !targets && scenario ? propAt(scenario.props, toWorld(camera, local(event))) : undefined;

        if (prop && options.onPropMenu?.(prop.id, { x: event.clientX, y: event.clientY }))
            return;

        if (!tool)
            return;


        toolPointerId = null;

        if (!tool.cancel?.() && !held)
            options.onToolCancel?.();

        redraw();
    };

    /** A middle click would start the browser's own autoscroll, which fights the pan. */
    const middleDown = (event: MouseEvent) =>
    {
        if (event.button === 1)
            event.preventDefault();

    };

    const wheel = (event: WheelEvent) =>
    {
        event.preventDefault();

        // A trackpad pinch arrives as a wheel with ctrlKey and small steps. Firefox can report a
        // mouse wheel in lines rather than pixels.
        const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;

        zoomBy(local(event), Math.exp(-pixels * (event.ctrlKey ? 0.01 : 0.0015)));
    };

    const keydown = (event: KeyboardEvent) =>
    {
        // Keys typed into a field, like the grid size, are not for the map.
        if (
            event.target instanceof HTMLInputElement ||
            !tool ||
            !scenario ||
            !tool.key?.(event.key, scenario)
        )
            return;

        event.preventDefault();
        redraw();
    };

    const observer = new ResizeObserver(resize);
    const leave = (event: PointerEvent) =>
    {
        if (event.pointerType === 'mouse')
            showBadgeAt(null);

    };

    observer.observe(canvas);
    canvas.addEventListener('pointerleave', leave);
    window.addEventListener('ttrpg-paint', redraw);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('mousedown', middleDown);
    canvas.addEventListener('contextmenu', contextMenu);
    // Not passive, so preventDefault keeps the page itself from zooming or scrolling.
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);

    return {
        setScenario: (next) =>
        {
            // Another map starts with nothing seen. The same map edited keeps what was seen.
            if (scenario?.id !== next.id)
            {
                explored = null;
                layers = null;
                sharedEpoch = null;
                walks.clear();
                // The old map's tokens do not stand on this one. Lit from where they stood, a token
                // past this map's edge would uncover half of it; setTokens brings the new ones.
                tokens = [];
                // The new map's tokens fade in, the old map's do not fade out over it.
                lastShown = new Map();
                fading.clear();
                drops = [];
                lastDrop.clear();
                // The old map's blood does not fade out over this one.
                decals = [];
                clearedDecals = [];
                clearTimeout(exploredTimer);
            }

            scenario = next;
            segments = sightSegments(next);
            applyShared();

            if (fittedId !== next.id)
                fit();

            refreshFog();
            redraw();
        },
        setTokens: (next) =>
        {
            const before = new Map(tokens.map((token) => [token.id, token]));

            for (const token of next)
            {
                const previous = before.get(token.id);

                if (!token.movedAt || token.movedAt === previous?.movedAt || !token.path || token.path.length < 2 || !scenario)
                    continue;

                const walk = startWalk(token.path, performance.now(), scenario.grid.size);

                // One that only now arrives still walks if its walk has not long ended: a monster
                // walking out of the fog reaches a phone once it stands in sight, and comes out of
                // the fog as it walks, see seenByPlayers. ponytail: trusts this screen's clock to
                // within arrivalSlack of the server's; one far ahead shows it standing there.
                if (previous || Date.now() - token.movedAt < walk.duration + arrivalSlack)
                    walks.set(token.id, walk);

            }

            // A downed body dragged on another screen arrives here without a path, put straight
            // down: it smears from where it lay to where it is now. The screen that dragged it laid
            // its smear as it went, and has it there already, so it adds none.
            if (scenario && blood.ground)
            {
                const now = performance.now();
                const step = scenario.grid.size * smearGap;

                for (const token of next)
                {
                    const previous = before.get(token.id);

                    if (!previous || walks.has(token.id) || held(token.id) || stateOf(token) !== 'down')
                        continue;

                    const length = distance(previous, token);

                    for (let along = 0; along < length; along += step)
                    {
                        const share = along / length;

                        bleed({ x: previous.x + (token.x - previous.x) * share, y: previous.y + (token.y - previous.y) * share }, token.size, now, false, true);
                    }
                }
            }

            // Tokens in mid drag keep following the finger rather than jumping back.
            const holding = new Map(tokens.filter((token) => held(token.id)).map((token) => [token.id, token]));

            // Bigger first, so a small token standing in a big one's space is drawn and picked on top.
            tokens = next.map((token) => holding.get(token.id) ?? token).sort((a, b) => drawnAcross(b.size) - drawnAcross(a.size));
            focusOwn();
            // From where walking tokens are now: their end would light up first and jump back.
            refreshFog(tokensAt(performance.now()));
            redraw();
        },
        setMode: (mode) =>
        {
            fogEnabled = mode === 'play';
            lit = [];
            refreshFog();
            redraw();
        },
        setTool: (id, placing = null, snap = 1) =>
        {
            // A ruler or area still out goes with the tool that drew it.
            if (marked || markTimer)
                shareMark(null);

            tool = createTool(id, changeScenario, placing, reveal, snap, shareMark, (ids) => options.onMonstersErase?.(ids), {
                share: shareLine,
                erase: (ids) => options.onEraseDrawings?.(ids),
                drawings: () => drawings,
                // Without a colour picked the server colours a player's line with their ring, the host's with none.
                look: () => ({ colour: pen.color ?? tokens.find((token) => token.id === own)?.color ?? highlight, width: pen.width }),
            });
            toolPointerId = null;
            canvas.style.cursor = restCursor();
            redraw();
        },
        setPending: (move) =>
        {
            pending = move;
            redraw();
        },
        setDrafts: (next) =>
        {
            drafts = next;
            redraw();
        },
        setMarks: (next) =>
        {
            marks = next;
            redraw();
        },
        setDrawings: (next) =>
        {
            drawings = next;
            redraw();
        },
        setPen: (next) =>
        {
            pen = next;
        },
        ping: (at, color) =>
        {
            pings.push({ ...at, color, start: performance.now() });
            redraw();
        },
        hit: ({ kind, targets: struck }) =>
        {
            const start = performance.now();
            const grid = scenario?.grid;

            if (!grid)
                return;

            for (const { x, y, size, died } of struck)
                hits.push({ x, y, radius: tokenRadius(grid, size), kind: died ? 'death' : kind, start });

            redraw();
        },
        setTargets: (ids) =>
        {
            targets = ids;
            redraw();
        },
        setGhost: (next) =>
        {
            ghost = next;
            redraw();
        },
        setPropGhost: (next) =>
        {
            propGhost = next;
            redraw();
        },
        setSelection: (ids) =>
        {
            selection = ids;

            if (!ids)
                boxing = null;

            canvas.style.cursor = restCursor();
            redraw();
        },
        setBlood: (next) =>
        {
            blood = next;
            redraw();
        },
        setSystem: (next) =>
        {
            system = next;
            redraw();
        },
        setTurn: (id) =>
        {
            turn = id;
            redraw();
        },
        worldAt: (client) =>
        {
            const box = canvas.getBoundingClientRect();

            return toWorld(camera, { x: client.x - box.left, y: client.y - box.top });
        },
        setDecals: (next) =>
        {
            const now = performance.now();
            const since = new Map(decals.map((decal) => [decal.id, decal.at]));
            const kept = new Set(next.map((decal) => decal.id));

            clearedDecals = [
                ...clearedDecals.filter((decal) => !kept.has(decal.id)),
                ...decals.filter((decal) => !kept.has(decal.id)).map((decal) => ({ ...decal, at: now })),
            ];
            decals = next.map((decal) => ({ ...decal, at: since.get(decal.id) ?? now }));
            redraw();
        },
        setPeek: (next) =>
        {
            peek = next;
            redraw();
        },
        setOwn: (id) =>
        {
            own = id;
            focusOwn();
            redraw();
        },
        setFrozen: (next) =>
        {
            frozen = next;

            // A path half drawn when the game master freezes is dropped.
            if (frozen)
                route = null;

            redraw();
        },
        resetFog: () =>
        {
            // A save waiting from before would bring back what was just forgotten.
            clearTimeout(exploredTimer);
            explored?.seen.fill(0);

            if (layers)
                clearShape(layers);

            refreshFog();
        },
        setFogSource: (source) =>
        {
            if (source === fogSource)
                return;

            fogSource = source;
            explored = null;
            layers = null;
            sharedEpoch = null;
            clearTimeout(exploredTimer);
            refreshFog();
            redraw();
        },
        setFogSettings: (settings) =>
        {
            fogSettings = settings;
            refreshFog();
            redraw();
        },
        setShared: (fog) =>
        {
            shared = fog;
            applyShared();
            refreshFog();
            redraw();
        },
        destroy: () =>
        {
            letGo();
            window.clearTimeout(draftTimer);
            observer.disconnect();
            window.removeEventListener('ttrpg-paint', redraw);
            canvas.removeEventListener('pointerleave', leave);
            canvas.removeEventListener('pointerdown', down);
            canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', up);
            canvas.removeEventListener('pointercancel', up);
            canvas.removeEventListener('mousedown', middleDown);
            canvas.removeEventListener('contextmenu', contextMenu);
            canvas.removeEventListener('wheel', wheel);
            window.removeEventListener('keydown', keydown);
            cancelAnimationFrame(frame);
            clearTimeout(exploredTimer);
        },
    };
}
