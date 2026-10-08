import type { Cell, FogSettings, Point, PropPicture, Scenario, SharedFog, Token } from '../types';

import { centerOn, fitCamera, panBy, toWorld, zoomAt, type Camera } from './camera.ts';
import {
    clearShape,
    composeFog,
    createExplored,
    createFogLayers,
    defaultFogSettings,
    markArea,
    markSeen,
    shapeArea,
    shapeSamples,
    type Explored,
    type FogLayers,
} from './fog.ts';
import { distance, midpoint } from './geometry.ts';
import { extendPath, lineFeet, pathBlocked, pathFeet } from './path.ts';
import { drawPill, drawRoute, render, tokenRadius, type Viewport } from './render.ts';
import { anchorAt, footprintCenter, footprintKeys } from './size.ts';
import { createTool, type Area, type MapTool, type ToolId, type ToolPointer } from './tools.ts';
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
/** How long the table screen waits after the fog last changed before it saves it: not every step of a walk. */
const exploredDelay = 1500;
const routeColour = '#683c9b';
const tooFarColour = '#b4443c';

/** A point pulled inside the map, so a token is never walked or dragged off it. */
function onMap({ width, height }: Scenario, { x, y }: Point): Point
{
    return { x: Math.min(Math.max(x, 0), width), y: Math.min(Math.max(y, 0), height) };
}

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
    /** A token dragged freely, in edit mode or a monster in play mode, landed here. */
    onTokenMove?: (id: string, to: Point) => void;
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
    /** A while after more of the map was seen, what has been seen in all, to share, see SharedFog. */
    onExplored?: (fog: SharedFog) => void;
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
    setTool: (id: ToolId, placing?: PropPicture | null, snap?: number, door?: boolean) => void;
    /** The path waiting for Move or Cancel, drawn until it is decided. */
    setPending: (move: PendingMove | null) => void;
    /** Frozen, players cannot draw paths; the game master still drags anything. */
    setFrozen: (frozen: boolean) => void;
    /** The game master looks through the fog, monsters included, while this is on. */
    setPeek: (peek: boolean) => void;
    /**
     * On a player's phone, their own token: the only one they can draw a path from. Every other
     * press pans. Null is the game master's screen, where every token answers.
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
    /** The token being dragged freely and the pointer dragging it. */
    let dragging: { id: string; pointerId: number } | null = null;
    let route: Route | null = null;
    let pending: PendingMove | null = null;
    let frozen = false;
    let peek = false;
    let own: string | null = null;
    /** Frames drawn since stats were last reported, and their cost. */
    const stats = { since: 0, frames: 0, spent: 0, worst: 0 };
    /** Tokens on their way, by id. */
    const walks = new Map<string, Walk>();
    /** The tokens the last frame showed, by id, so one that is gone can still fade out. */
    let lastShown = new Map<string, Token & { lift?: number }>();
    /** Tokens fading in or out, by id: since when, which way, and the token as it last showed. */
    const fading = new Map<string, { at: number; in: boolean; token?: Token & { lift?: number } }>();
    /** Where the players stood, to a quarter cell, the last time a walk redrew the fog. */
    let walkFogKey = '';
    let tool: MapTool | null = null;
    /** The pointer a tool took on press, which keeps going to the tool until it lifts. */
    let toolPointerId: number | null = null;
    /** The mouse panning with its middle button, which shows the closed hand while it does. */
    let middlePan: number | null = null;

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

    /** Tokens where they show at a moment: walking ones partway along their path. */
    const tokensAt = (time: number): (Token & { lift?: number })[] =>
        tokens.map((token) =>
        {
            const walk = walks.get(token.id);

            if (!walk)
                return token;

            const { point, lift, done } = walkAt(walk, time);

            if (done)
                walks.delete(token.id);

            return { ...token, ...point, lift: done ? 0 : lift };
        });

    /** How far a fade has come, 0 to 1. */
    const fadeProgress = (at: number, time: number) =>
        fogSettings.fade > 0 ? Math.min(1, Math.max(0, (time - at) / fogSettings.fade)) : 1;

    /** Starts a token fading. One fading the other way turns round from where it is, no jump. */
    const startFade = (id: string, fadingIn: boolean, time: number, token?: Token & { lift?: number }) =>
    {
        const current = fading.get(id);
        const at =
            current && current.in !== fadingIn ? time - (1 - fadeProgress(current.at, time)) * fogSettings.fade : time;

        fading.set(id, { at, in: fadingIn, token: token ?? current?.token });
    };

    /**
     * Everything that comes or goes on the map fades like the fog clears, over the same time: a
     * monster walking into sight, one the GM hides, a player joining or removed, Peek, another
     * map. Gone tokens keep showing where they were last while they fade out. Reduced motion
     * shows and hides them at once.
     */
    const fadeTokens = (visible: (Token & { lift?: number })[], time: number) =>
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

    /** Hands what has been seen on to be shared, once it has stopped changing for a moment. */
    const shareExplored = () =>
    {
        const { onExplored } = options;

        if (!onExplored || !scenario || !explored)
            return;

        const { id } = scenario;
        const { columns, rows, seen } = explored;

        clearTimeout(exploredTimer);
        exploredTimer = window.setTimeout(
            () => onExplored({ scenarioId: id, epoch: sharedEpoch ?? 0, columns, rows, seen: seen.slice().buffer }),
            exploredDelay,
        );
    };

    /** Takes in the shared fog for this map, when it fits the explored mask. */
    const applyShared = () =>
    {
        if (!shared || !scenario || shared.scenarioId !== scenario.id)
            return;

        explored ??= createExplored(scenario);

        if (shared.columns !== explored.columns || shared.rows !== explored.rows)
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

        new Uint8Array(shared.seen).forEach((flag, index) =>
        {
            if (flag && explored && !explored.seen[index])
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

    /** The path being drawn or waiting, with its feet beside its end, red past the speed. */
    const drawPath = (current: Scenario) =>
    {
        const shown = route
            ? { id: route.id, points: route.points, feet: routeFeet(current, route) }
            : pending;

        if (!shown || shown.points.length < 2)
            return;

        const token = tokens.find((candidate) => candidate.id === shown.id);
        const colour = token && shown.feet > token.speed ? tooFarColour : routeColour;
        const end = shown.points[shown.points.length - 1];

        drawRoute(context, shown.points, camera.zoom, colour);
        drawPill(context, `${shown.feet} ft`, end, camera.zoom, colour);
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

    const draw = (time: number) =>
    {
        frame = 0;

        if (!scenario || viewport.width === 0)
            return;

        const walking = walks.size > 0;
        // The fog or a token still fading in or out.
        const settling = fading.size > 0 || (layers !== null && time - layers.changedAt < fogSettings.fade);

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
        const scene = {
            scenario,
            background,
            picture: loaded,
            // Peeking, the game master sees every monster too.
            tokens: fadeTokens(fogEnabled && !peek ? shown.filter(seenByPlayers) : shown, time),
            editing: !fogEnabled,
            own,
            motion: !calm.matches,
            fog,
            fogLook: { fade: !calm.matches, opacity: peek ? 0.3 : 1, settings: fogSettings },
            time,
        };

        render(context, scene, camera, viewport);
        options.onView?.(toWorld(camera, { x: viewport.width / 2, y: viewport.height / 2 }));

        const scale = viewport.dpr * camera.zoom;

        context.setTransform(scale, 0, 0, scale, viewport.dpr * camera.x, viewport.dpr * camera.y);
        drawPath(scenario);
        tool?.draw(context, camera.zoom, scenario);

        // The smoke drifts, walking tokens move, fog changes and tokens fade, so they ask for
        // the next frame. Reduced motion keeps the smoke still and skips the fades; a walk still
        // plays. Only once: the fog refreshed above may already have asked, and two would draw
        // every frame twice.
        if ((walking || fading.size > 0 || (fog && !calm.matches)) && frame === 0)
            frame = requestAnimationFrame(draw);

        measure(time, performance.now() - started);
    };

    const redraw = () =>
    {
        urgent = true;

        if (frame === 0)
            frame = requestAnimationFrame(draw);

    };

    /** The game master's Reveal area: the box counts as seen before. */
    const revealArea = (area: Area) =>
    {
        if (!explored)
            return;

        markArea(explored, area);

        if (layers)
            shapeArea(layers, area);

        shareExplored();
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

    const local = (event: PointerEvent | WheelEvent): Point =>
    {
        const box = canvas.getBoundingClientRect();

        return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    /** The topmost token under a screen point that this screen shows. */
    const tokenAt = (screen: Point, current: Scenario): Token | undefined =>
    {
        const world = toWorld(camera, screen);
        const shown = fogEnabled ? tokens.filter(seenByPlayers) : tokens;

        // Last drawn is on top. The project targets ES2022, which has no findLast.
        return [...shown]
            .reverse()
            .find((token) => distance(world, token) <= tokenRadius(current.grid, token.size));
    };

    const moveToken = (id: string, to: Point) =>
    {
        tokens = tokens.map((token) => (token.id === id ? { ...token, x: to.x, y: to.y } : token));
        refreshFog();
        redraw();
    };

    /** What a route costs: counted per cell on a grid, by length without one. */
    const routeFeet = (current: Scenario, { cells, points }: Route) =>
        current.grid.type === 'none'
            ? Math.round(lineFeet(current.grid, points))
            : pathFeet(current.grid, cells);

    /** Grows the route towards the finger, never through a wall. */
    const extendRoute = (current: Scenario, world: Point) =>
    {
        if (!route)
            return;

        const token = tokens.find((candidate) => candidate.id === route?.id);

        if (!token)
            return;

        const { grid, walls } = current;

        if (grid.type !== 'none')
        {
            const cells = extendPath(grid, walls, route.cells, anchorAt(grid, world, token.size), token.size);

            route = { ...route, cells, points: cells.map((cell) => footprintCenter(grid, cell, token.size)) };

            return;
        }

        // Without a grid, a new point every quarter cell of finger travel, unless a wall is in the way.
        const last = route.points[route.points.length - 1];

        if (!pathBlocked(walls, [last, world]) && distance(last, world) > grid.size / 4)
            route = { ...route, points: [...route.points, world] };

    };

    /** Whether a route would end on top of someone else. */
    const endTaken = (current: Scenario, token: Token, end: Point) =>
    {
        const { grid } = current;
        const others = tokens.filter((other) => other.id !== token.id);

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
        zoom: camera.zoom,
        scenario: current,
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
        // A right click cancels, see contextMenu: it never pans or presses a tool.
        if (event.pointerType === 'mouse' && event.button === 2)
            return;

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

        const idle = pointers.size === 0 && !dragging && !route && toolPointerId === null;

        if (idle && tool && scenario && tool.down(toolPointer(event, scenario)))
        {
            toolPointerId = event.pointerId;
            redraw();

            return;
        }

        const point = local(event);
        const pressed = idle && scenario ? tokenAt(point, scenario) : undefined;
        const token = own === null || pressed?.id === own ? pressed : undefined;

        // In play mode players draw a path, unless the game master froze movement. Monsters,
        // and everything in edit mode, drag freely: that is the game master's hand.
        if (token && fogEnabled && token.kind === 'player')
        {
            if (frozen || walks.has(token.id))
            {
                pointers.set(event.pointerId, point);

                return;
            }

            const anchor = scenario && scenario.grid.type !== 'none' ? anchorAt(scenario.grid, token, token.size) : null;

            pending = null;
            route = {
                id: token.id,
                pointerId: event.pointerId,
                cells: anchor ? [anchor] : [],
                points: [{ x: token.x, y: token.y }],
            };
            redraw();

            return;
        }

        if (token)
            dragging = { id: token.id, pointerId: event.pointerId };
        else
            pointers.set(event.pointerId, point);

    };

    const move = (event: PointerEvent) =>
    {
        if (route?.pointerId === event.pointerId && scenario)
        {
            extendRoute(scenario, onMap(scenario, toWorld(camera, local(event))));
            redraw();

            return;
        }

        if (dragging?.pointerId === event.pointerId)
        {
            if (scenario)
                moveToken(dragging.id, onMap(scenario, toWorld(camera, local(event))));

            return;
        }

        const pressed = toolPointerId === event.pointerId;
        const previous = pointers.get(event.pointerId);

        // The tool's own drag, or a mouse hovering, which tools use for their previews.
        if (pressed || (!previous && !dragging && !route))
        {
            if (tool && scenario)
            {
                tool.move(toolPointer(event, scenario), pressed);
                redraw();
            }

            return;
        }

        if (!previous)
            return;

        const point = local(event);
        const other = [...pointers].find(([id]) => id !== event.pointerId);

        pointers.set(event.pointerId, point);

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

        if (middlePan === event.pointerId)
        {
            middlePan = null;
            // The tool's cursor again, or the stylesheet's grab hand without one.
            canvas.style.cursor = tool ? tool.cursor : '';
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
                tool.up(toolPointer(event, scenario));

            redraw();

            return;
        }

        if (dragging?.pointerId !== event.pointerId || !scenario)
            return;

        const { id } = dragging;
        const token = tokens.find((candidate) => candidate.id === id);

        dragging = null;

        if (!token)
            return;

        // Lands lined up with the grid, its whole footprint in cells; wherever it was let go
        // without a grid.
        const { grid } = scenario;
        const to =
            grid.type === 'none'
                ? { x: token.x, y: token.y }
                : footprintCenter(grid, anchorAt(grid, token, token.size), token.size);

        moveToken(id, to);
        options.onTokenMove?.(id, to);
    };

    /**
     * A right click cancels: what the tool has half done first, like a drag still held down,
     * otherwise the tool itself. The browser's own menu would be no use on the map. The menu
     * event comes for a right click even while the left button holds a drag.
     */
    const contextMenu = (event: MouseEvent) =>
    {
        event.preventDefault();

        if (!tool)
            return;

        const dragging = toolPointerId !== null;

        toolPointerId = null;

        if (!tool.cancel() && !dragging)
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
            !tool.key(event.key, scenario)
        )
            return;

        event.preventDefault();
        redraw();
    };

    const observer = new ResizeObserver(resize);

    observer.observe(canvas);
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
                // The new map's tokens fade in, the old map's do not fade out over it.
                lastShown = new Map();
                fading.clear();
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
                const walked = previous && token.movedAt && token.movedAt !== previous.movedAt;

                if (walked && token.path && token.path.length > 1 && scenario)
                    walks.set(token.id, startWalk(token.path, performance.now(), scenario.grid.size));

            }

            // A token in mid drag keeps following the finger rather than jumping back.
            const held = dragging ? tokens.find((token) => token.id === dragging?.id) : undefined;

            tokens = held ? next.map((token) => (token.id === held.id ? held : token)) : next;
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
        setTool: (id, placing = null, snap = 1, door = false) =>
        {
            tool = createTool(id, changeScenario, placing, revealArea, snap, door);
            toolPointerId = null;
            // The tool's cursor, or the stylesheet's grab hand when there is no tool.
            canvas.style.cursor = tool ? tool.cursor : '';
            redraw();
        },
        setPending: (move) =>
        {
            pending = move;
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
            observer.disconnect();
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
