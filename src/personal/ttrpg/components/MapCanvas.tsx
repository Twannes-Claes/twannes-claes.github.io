import { useEffect, useRef } from 'react';

import type { FogSettings, Point, PropPicture, Scenario, SharedFog, Token } from '../types';

import { defaultFogSettings } from '../map/fog';

import type { ToolId } from '../map/tools';
import { createMapView, type FrameStats, type MapView, type PendingMove } from '../map/view';

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
    /** The walls tool draws closed doors rather than walls. */
    wallDoor?: boolean;
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
    /** What the party has seen, from the server, see SharedFog. */
    shared?: SharedFog | null;
    /** Hears what this screen has seen, to share. Only the game master's screen listens. */
    onExplored?: (fog: SharedFog) => void;
    /** How the fog looks, see FogSettings. */
    fogSettings?: FogSettings;
    /** Whose fog this is, see setFogSource in map/view.ts. A phone is always live. */
    fogSource?: 'preview' | 'live';
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
    wallDoor = false,
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
    shared = null,
    onExplored,
    fogSettings = defaultFogSettings,
    fogSource = 'live',
}: MapCanvasProps)
{
    const canvas = useRef<HTMLCanvasElement>(null);
    const view = useRef<MapView | null>(null);
    // The view is made once, so it calls the latest handlers through these rather than the first.
    const moved = useRef(onTokenMove);
    const changed = useRef(onScenarioChange);
    const ended = useRef(onPathEnd);
    const measured = useRef(onStats);
    const viewed = useRef(onView);
    const cancelled = useRef(onToolCancel);
    const explored = useRef(onExplored);

    useEffect(() =>
    {
        moved.current = onTokenMove;
        changed.current = onScenarioChange;
        ended.current = onPathEnd;
        measured.current = onStats;
        viewed.current = onView;
        explored.current = onExplored;
        cancelled.current = onToolCancel;
    }, [onTokenMove, onScenarioChange, onPathEnd, onStats, onView, onExplored, onToolCancel]);

    useEffect(() =>
    {
        if (!canvas.current)
            return;

        const created = createMapView(canvas.current, {
            onTokenMove: (id, to) => moved.current?.(id, to),
            onScenarioChange: (next) => changed.current?.(next),
            onPathEnd: (move) => ended.current?.(move),
            onStats: (stats) => measured.current?.(stats),
            onView: (center) => viewed.current?.(center),
            onToolCancel: () => cancelled.current?.(),
            onExplored: (fog) => explored.current?.(fog),
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
        view.current?.setTool(tool, placing, wallSnap, wallDoor);
    }, [tool, placing, wallSnap, wallDoor]);

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
    useEffect(() =>
    {
        view.current?.setFogSource(fogSource);
    }, [fogSource]);

    useEffect(() =>
    {
        view.current?.setShared(shared);
    }, [shared]);

    useEffect(() =>
    {
        view.current?.setFogSettings(fogSettings);
    }, [fogSettings]);

    useEffect(() =>
    {
        if (fogEpoch > 0)
            view.current?.resetFog();

    }, [fogEpoch]);

    return <canvas ref={canvas} className="ttrpg-map" aria-label={`Battle map: ${scenario.name}`} />;
}
