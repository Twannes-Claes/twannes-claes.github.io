import { useEffect, useEffectEvent, useRef } from 'react';

import type { FogSettings, Point, PropPicture, Scenario, SharedFog, Token } from '../types';

import { demoCredit, demoScenario } from '../content/scenarios';
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
    fogSettings = defaultFogSettings,
    fogSource = 'live',
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
    const explored = useEffectEvent((fog: SharedFog) => onExplored?.(fog));

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
            onExplored: (fog) => explored(fog),
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

    return (
        <>
            <canvas ref={canvas} className="ttrpg-map" aria-label={`Battle map: ${scenario.name}`} />
            {/* The demo's picture is free to use with attribution, so every map showing it
                credits its maker: the demo, the example session and its copies, for the GM and
                players. */}
            {scenario.background === demoScenario.background && (
                <a href={demoCredit.url} className="ttrpg-credit" target="_blank" rel="noreferrer">
                    {demoCredit.text}
                </a>
            )}
        </>
    );
}
