import { useEffect, useEffectEvent, useRef } from 'react';

import type { BloodSettings, Decal, Draft, FogSettings, Mark, Ping, Point, PropPicture, Scenario, SharedFog, SharedHit, SharedMark, Token } from '../types';

import { demoCredit, demoScenario } from '../content/scenarios';
import { defaultFogSettings } from '../map/fog';
import { defaultBlood } from '../map/health';
import type { ToolId } from '../map/tools';
import { createMapView, type FrameStats, type MapView, type PendingMove } from '../map/view';

/** One empty list for screens without drafts, so its effect does not run on every render. */
const noDrafts: Draft[] = [];
const noMarks: SharedMark[] = [];
const noDecals: Decal[] = [];

interface MapCanvasProps
{
    scenario: Scenario;
    tokens: Token[];
    /** Edit shows walls and the spawn point, play shows the fog. */
    mode: 'edit' | 'play';
    tool: ToolId;
    /** The library picture the props tool places with each click. */
    placing: PropPicture | null;
    /** Snap points per cell side for the walls tool, 0 for none. */
    wallSnap?: number;
    /** Bump to forget everything seen before. */
    fogEpoch: number;
    /** The drawn path waiting for Move or Cancel. */
    pending: PendingMove | null;
    /** Players cannot draw paths while frozen. */
    frozen: boolean;
    /** The game master sees through the fog while this is on. */
    peek: boolean;
    /** On a player's phone, their token, the only one they can move, see setOwn in map/view.ts. */
    own?: string | null;
    /** Hears where a token dragged freely lands: anything in edit mode, monsters in play. */
    onTokenMove?: (id: string, to: Point) => void;
    /** Hears a path a player let go of. */
    onPathEnd?: (move: PendingMove) => void;
    /** Hears every change a tool makes to the scenario. */
    onScenarioChange?: (scenario: Scenario) => void;
    /** Hears how the drawing keeps up, for the ?debug display. */
    onStats?: (stats: FrameStats) => void;
    /** Hears the world point in the middle of the screen, every frame. */
    onView?: (center: Point) => void;
    /** Hears a right click with nothing half done, to put the tool away. */
    onToolCancel?: () => void;
    /** Hears the path waiting for its Move or Cancel being dropped. */
    onPathCancel?: () => void;
    /** What the party has seen, from the server, see SharedFog. */
    shared?: SharedFog | null;
    /**
     * Hears what this screen has seen, to share, with forget when the game master hid some. Only
     * the GM view and the Player view on the table screen listen, never a phone.
     */
    onExplored?: (fog: SharedFog, forget?: boolean) => void;
    /**
     * The last ping on this map. Each new one flashes; undefined while it loads, so the one already
     * there when the page opens never does.
     */
    ping?: Ping | null;
    /** A long press on an empty spot in play mode, to ping it. */
    onPing?: (at: Point) => void;
    /** Other screens' paths, see Draft. */
    drafts?: Draft[];
    /** Hears this screen's path as it is drawn, to share, see onDraft in map/view.ts. */
    onDraft?: (id: string, points: Point[] | null, feet: number) => void;
    /** Other screens' rulers and areas, see Mark. */
    marks?: SharedMark[];
    /** Hears this screen's ruler or area as it is dragged, to share, see onMark in map/view.ts. */
    onMark?: (mark: Mark | null) => void;
    /** How the fog looks, see FogSettings. */
    fogSettings?: FogSettings;
    /** Whose fog this is, see setFogSource in map/view.ts. A phone is always live. */
    fogSource?: 'preview' | 'live';
    /** Credits the demo map's maker when it shows. Only the public demo does, see demoCredit. */
    credit?: boolean;
    /** The last attack or heal. Each new one plays, like a ping, see SharedHit. */
    hit?: SharedHit | null;
    /** The tokens picked for an attack or a heal, or null when not picking, see setTargets. */
    targets?: string[] | null;
    /** Hears a token pressed while picking targets. */
    onTarget?: (id: string) => void;
    /** What killed monsters left on the map, see Decal. */
    decals?: Decal[];
    /** Which blood shows, see BloodSettings. */
    blood?: BloodSettings;
}

/**
 * The map, filling the screen. Drawing, gestures and tools live in map/; this only mounts the
 * view and passes the props on. Created in an effect, because a canvas only exists in the
 * browser and the page is prerendered.
 */
export function MapCanvas({
    scenario,
    tokens,
    mode,
    tool,
    placing,
    wallSnap = 1,
    fogEpoch,
    pending,
    frozen,
    peek,
    own = null,
    onTokenMove,
    onPathEnd,
    onScenarioChange,
    onStats,
    onView,
    onToolCancel,
    onPathCancel,
    shared = null,
    onExplored,
    ping,
    onPing,
    drafts = noDrafts,
    onDraft,
    marks = noMarks,
    onMark,
    fogSettings = defaultFogSettings,
    fogSource = 'live',
    credit = false,
    hit,
    targets = null,
    onTarget,
    decals = noDecals,
    blood = defaultBlood,
}: MapCanvasProps)
{
    const canvas = useRef<HTMLCanvasElement>(null);
    const view = useRef<MapView | null>(null);
    // The view is made once, so it calls the latest handlers through these rather than the first.
    const tokenMoved = useEffectEvent((id: string, to: Point) => onTokenMove?.(id, to));
    const scenarioChanged = useEffectEvent((next: Scenario) => onScenarioChange?.(next));
    const pathEnded = useEffectEvent((move: PendingMove) => onPathEnd?.(move));
    const measured = useEffectEvent((stats: FrameStats) => onStats?.(stats));
    const viewed = useEffectEvent((center: Point) => onView?.(center));
    const toolCancelled = useEffectEvent(() => onToolCancel?.());
    const pathCancelled = useEffectEvent(() => onPathCancel?.());
    const explored = useEffectEvent((fog: SharedFog, forget?: boolean) => onExplored?.(fog, forget));
    const pinged = useEffectEvent((at: Point) => onPing?.(at));
    const drafted = useEffectEvent((id: string, points: Point[] | null, feet: number) => onDraft?.(id, points, feet));
    const markedOut = useEffectEvent((mark: Mark | null) => onMark?.(mark));
    const targeted = useEffectEvent((id: string) => onTarget?.(id));
    // The last ping and hit seen, to tell a new one from the one already there.
    const lastPing = useRef<Ping | null | undefined>(undefined);
    const lastHit = useRef<SharedHit | null | undefined>(undefined);

    useEffect(() =>
    {
        if (!canvas.current)
            return;

        const created = createMapView(canvas.current, {
            onTokenMove: (id, to) => tokenMoved(id, to),
            onScenarioChange: (next) => scenarioChanged(next),
            onPathEnd: (move) => pathEnded(move),
            onStats: (stats) => measured(stats),
            onView: (center) => viewed(center),
            onToolCancel: () => toolCancelled(),
            onPathCancel: () => pathCancelled(),
            onExplored: (fog, forget) => explored(fog, forget),
            onPing: (at) => pinged(at),
            onDraft: (id, points, feet) => drafted(id, points, feet),
            onMark: (mark) => markedOut(mark),
            onTarget: (id) => targeted(id),
        });

        view.current = created;

        return () =>
        {
            created.destroy();
            view.current = null;
        };
    }, []);

    // The effects below run after the one above on mount, so the view is there to take them.
    useEffect(() =>
    {
        view.current?.setScenario(scenario);
    }, [scenario]);

    // Another map: the server keeps only the last ping and hit, and sends them while their map is
    // played, so coming back would bring an old one back as if new. What is there then is old
    // news. Before the ping and hit effects, which may take a new value in the same render.
    useEffect(() =>
    {
        lastPing.current = undefined;
        lastHit.current = undefined;
    }, [scenario.id]);

    useEffect(() =>
    {
        view.current?.setTokens(tokens);
    }, [tokens]);

    useEffect(() =>
    {
        view.current?.setMode(mode);
    }, [mode]);

    useEffect(() =>
    {
        view.current?.setTool(tool, placing, wallSnap);
    }, [tool, placing, wallSnap]);

    useEffect(() =>
    {
        view.current?.setPending(pending);
    }, [pending]);

    useEffect(() =>
    {
        view.current?.setFrozen(frozen);
    }, [frozen]);

    useEffect(() =>
    {
        view.current?.setPeek(peek);
    }, [peek]);

    useEffect(() =>
    {
        view.current?.setOwn(own);
    }, [own]);

    // Before the shared fog: a switch to live forgets the preview first, then takes the party's.
    // The ping and hit there then are old news too, so the next ones seen are where counting starts.
    useEffect(() =>
    {
        view.current?.setFogSource(fogSource);
        lastPing.current = undefined;
        lastHit.current = undefined;
    }, [fogSource]);

    useEffect(() =>
    {
        view.current?.setShared(shared);
    }, [shared]);

    useEffect(() =>
    {
        if (ping === undefined)
            return;

        if (lastPing.current !== undefined && ping && ping.at !== lastPing.current?.at)
            view.current?.ping(ping, ping.color);

        lastPing.current = ping;
    }, [ping]);

    useEffect(() =>
    {
        if (hit === undefined)
            return;

        if (lastHit.current !== undefined && hit && hit.at !== lastHit.current?.at)
            view.current?.hit(hit);

        lastHit.current = hit;
    }, [hit]);

    useEffect(() =>
    {
        view.current?.setTargets(targets);
    }, [targets]);

    useEffect(() =>
    {
        view.current?.setBlood(blood);
    }, [blood]);

    // Again for another map, which drops the old map's decals, see setScenario in map/view.ts.
    useEffect(() =>
    {
        view.current?.setDecals(decals);
    }, [decals, scenario.id]);

    useEffect(() =>
    {
        view.current?.setDrafts(drafts);
    }, [drafts]);

    useEffect(() =>
    {
        view.current?.setMarks(marks);
    }, [marks]);

    useEffect(() =>
    {
        view.current?.setFogSettings(fogSettings);
    }, [fogSettings]);

    useEffect(() =>
    {
        if (fogEpoch > 0)
            view.current?.resetFog();

    }, [fogEpoch]);

    return (
        <>
            <canvas ref={canvas} className="ttrpg-map" aria-label={`Battle map: ${scenario.name}`} />
            {/* The demo's picture is free to use with attribution, so the public demo credits its
                maker. Sessions are played in private, so the example session and its copies
                show the map alone. */}
            {credit && scenario.background === demoScenario.background && (
                <a href={demoCredit.url} className="ttrpg-credit" target="_blank" rel="noreferrer">
                    {demoCredit.text}
                </a>
            )}
        </>
    );
}
