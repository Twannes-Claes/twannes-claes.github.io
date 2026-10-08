import { faEye, faPen, faSnowflake } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState, type DragEvent } from 'react';

import type { FogSettings, Live, Point, PropPicture, Scenario, Store } from '../types';

import { blankScenario, demoTokens } from '../content/scenarios';
import { defaultFogSettings } from '../map/fog';
import type { ToolId } from '../map/tools';
import { scenarioFromUvtt } from '../map/uvtt';
import type { FrameStats, PendingMove } from '../map/view';
import { baseName } from '../services/images';

import { FogPanel } from './FogPanel';
import { GridPanel } from './GridPanel';
import { LiveControls } from './LiveControls';
import { MapCanvas } from './MapCanvas';
import { Monsters } from './Monsters';
import { MoveSheet } from './MoveSheet';
import { PlayDock, type PlayTool } from './PlayDock';
import { PropLibrary } from './PropLibrary';
import { ScenarioList } from './ScenarioList';
import { ToolRail } from './ToolRail';
import { useHistory } from './useHistory';
import { useIdle, useWakeLock } from './useScreen';
import { WallPanel, type WallKind } from './WallPanel';

type Mode = 'edit' | 'play';

/** How long the editor waits after the last change before it saves. */
const saveDelay = 1000;

interface MapEditorProps
{
    /** The scenarios it opens with. Empty starts with one blank map. */
    initial: Scenario[];
    /** The game master's prop pictures it opens with. */
    library: PropPicture[];
    /** Where pictures go and changes are saved, see Store in types.ts. */
    store: Store;
    /** Shows the frame rate, see pages/Editor.tsx. */
    debug: boolean;
    /** A saved session's live play: starting it, and the players' tokens. Not in the demo. */
    live?: Live;
}

/**
 * The editor and its play mode: scenarios, the edit tools, undo, play mode with the fog, and
 * importing .dd2vtt maps. The demo and a saved session both use it, with a different store; with
 * a save in the store it saves a second after the last change.
 */
export function MapEditor({ initial, library: initialLibrary, store, debug, live }: MapEditorProps)
{
    const history = useHistory(() => (initial.length > 0 ? initial : [blankScenario('Map 1')]));
    const scenarios = history.present;
    // What the server has, to tell what changed. An empty session saves its blank map at once.
    const [saved, setSaved] = useState(initial);
    const [activeId, setActiveId] = useState(scenarios[0].id);
    const [mode, setMode] = useState<Mode>('edit');
    const [tool, setTool] = useState<ToolId>('select');
    const [tokens, setTokens] = useState(() => demoTokens(scenarios[0]));
    const [fogEpoch, setFogEpoch] = useState(0);
    const [error, setError] = useState('');
    const [library, setLibrary] = useState(initialLibrary);
    const [placing, setPlacing] = useState<PropPicture | null>(null);
    const [wallSnap, setWallSnap] = useState(1);
    const [wallKind, setWallKind] = useState<WallKind>('wall');
    const [pending, setPending] = useState<PendingMove | null>(null);
    const [frozen, setFrozen] = useState(false);
    const [playTool, setPlayTool] = useState<PlayTool>('open-doors');
    const [peek, setPeek] = useState(false);
    // The one panel open above the play dock.
    const [panel, setPanel] = useState<'monsters' | 'fog' | null>(null);
    // The fog's look: the session's when it is saved, this screen's in the demo. While a slider
    // moves, the draft shows here only, and letting go saves it, see FogPanel.
    const [demoFog, setDemoFog] = useState<FogSettings>(defaultFogSettings);
    const [fogDraft, setFogDraft] = useState<FogSettings | null>(null);
    // The middle of the screen, where a new monster goes. A ref: it changes every frame.
    const viewCenter = useRef<Point | null>(null);
    const [stats, setStats] = useState<FrameStats | null>(null);
    // The table screen stays on, and the controls step aside once the mouse rests, unless a
    // move is waiting on its sheet.
    const idle = useIdle(3000, mode === 'play' && !pending);
    const unsaved = Boolean(store.save) && scenarios !== saved;

    useWakeLock(mode === 'play');

    // Saves a moment after the last change, sending only the scenarios that changed. Undo and
    // every edit make new objects, so comparing them by identity is enough.
    useEffect(() =>
    {
        if (!store.save || scenarios === saved)
            return;

        const save = store.save;
        const timer = window.setTimeout(() =>
        {
            const changed = scenarios.filter((scenario) => !saved.includes(scenario));

            save(scenarios, changed)
                .then(() => setSaved(scenarios))
                .catch(() => setError('Saving failed. Your changes are kept here, it tries again on the next change.'));
        }, saveDelay);

        return () => window.clearTimeout(timer);
    }, [scenarios, saved, store]);

    // Closing the tab with changes still waiting asks first.
    useEffect(() =>
    {
        if (!unsaved)
            return;

        const leaving = (event: BeforeUnloadEvent) => event.preventDefault();

        window.addEventListener('beforeunload', leaving);

        return () => window.removeEventListener('beforeunload', leaving);
    }, [unsaved]);

    // Another tool puts the picked picture down, so coming back to Props starts with editing.
    const pickTool = (next: ToolId) =>
    {
        setTool(next);
        setPlacing(null);
    };

    const upload = (files: File[]) =>
    {
        setError('');
        Promise.all(files.map(store.uploadProp))
            .then((pictures) =>
            {
                setLibrary((current) => [...current, ...pictures]);
                setPlacing(pictures[0] ?? null);
            })
            .catch(() => setError('One of those pictures did not upload. Is it a PNG, WebP or JPEG?'));
    };

    // Undo can take away the open scenario, then the first one shows.
    const active = scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0];

    // The map being played shows the players' tokens, live. Any other map, or a session not
    // started, previews play mode with the two test players.
    const liveMap = live && live.live && live.activeScenarioId === active.id ? live : null;
    const shown = liveMap ? liveMap.tokens : tokens;
    const isFrozen = liveMap ? liveMap.frozen : frozen;

    const fail = (promise: Promise<void>) => void promise.catch((reason: Error) => setError(reason.message));

    const moveToken = (id: string, to: Point) =>
    {
        if (liveMap)
            fail(liveMap.move(id, to));
        else
            setTokens((current) => current.map((token) => (token.id === id ? { ...token, ...to } : token)));

    };

    const walker = pending ? shown.find((token) => token.id === pending.id) : undefined;

    // What a confirmed move writes: where the token ends, the path and when, so every screen
    // plays the same walk, see setTokens in map/view.ts.
    const confirmMove = () =>
    {
        if (!pending)
            return;

        const end = pending.points[pending.points.length - 1];
        const { id, points } = pending;

        if (liveMap)
            fail(liveMap.move(id, end, points));
        else
        {
            setTokens((current) =>
                current.map((token) =>
                    token.id === id ? { ...token, ...end, path: points, movedAt: Date.now() } : token,
                ),
            );
        }

        setPending(null);
    };

    const freeze = () =>
    {
        if (liveMap)
            fail(liveMap.freeze(!liveMap.frozen));
        else
            setFrozen((on) => !on);

    };

    // A right click with nothing half done: stop placing a picture, or go back to no tool.
    const putToolAway = () =>
    {
        if (mode === 'play')
            setPlayTool('open-doors');
        else if (placing)
            setPlacing(null);
        else
            setTool('select');

    };

    const togglePanel = (next: 'monsters' | 'fog') => setPanel((open) => (open === next ? null : next));

    const fogSettings = fogDraft ?? (live ? (live.fogLook ?? defaultFogSettings) : demoFog);

    // Saved for the session, and the draft dropped once the saved look has come back.
    const saveFog = (look: FogSettings | null) =>
    {
        if (!look)
            return;

        if (live)
            fail(live.setFogLook(look).finally(() => setFogDraft(null)));
        else
        {
            setDemoFog(look);
            setFogDraft(null);
        }
    };

    // Live, everyone forgets: the phones and every reload, not just this screen.
    const resetFog = () =>
    {
        setFogEpoch((epoch) => epoch + 1);

        if (liveMap)
            fail(liveMap.resetFog());

    };

    // Playing a live session shows the players the map open here.
    const switchMode = (next: Mode) =>
    {
        setMode(next);
        setPending(null);

        if (next === 'play' && live && live.live && live.activeScenarioId !== active.id)
            fail(live.open(active.id));

    };

    const changeScenario = (next: Scenario) =>
        history.commit((current) =>
            current.map((scenario) => (scenario.id === next.id ? next : scenario)),
        );

    // Every player starts over at the spawn point of the scenario that opens, see PLAN.md.
    const open = (scenario: Scenario) =>
    {
        setActiveId(scenario.id);
        setTokens(demoTokens(scenario));
        setPending(null);

        if (mode === 'play' && live && live.live)
            fail(live.open(scenario.id));

    };

    const add = (scenario: Scenario) =>
    {
        history.commit((current) => [...current, scenario]);
        open(scenario);
    };

    const select = (id: string) =>
    {
        const scenario = scenarios.find((candidate) => candidate.id === id);

        if (scenario)
            open(scenario);

    };

    const rename = (id: string, name: string) =>
        history.commit((current) =>
            current.map((scenario) => (scenario.id === id ? { ...scenario, name } : scenario)),
        );

    const duplicate = (id: string) =>
    {
        const original = scenarios.find((scenario) => scenario.id === id);

        if (original)
            add({ ...original, id: crypto.randomUUID(), name: `${original.name} copy` });

    };

    const remove = (id: string) =>
    {
        const rest = scenarios.filter((scenario) => scenario.id !== id);

        if (rest.length === 0)
            return;

        history.commit(() => rest);

        if (id === active.id)
            open(rest[0]);

    };

    // The file's picture is stored first, so the scenario only keeps its address.
    const load = (file: File) =>
    {
        setError('');
        file.text()
            .then((text) => scenarioFromUvtt(text, crypto.randomUUID(), baseName(file)))
            .then(async (scenario) =>
            {
                if (!scenario.background)
                    return scenario;

                const picture = await fetch(scenario.background).then((response) => response.blob());
                const { src } = await store.uploadMap(picture);

                return { ...scenario, background: src };
            })
            .then(add)
            .catch((reason: Error) => setError(reason.message));
    };

    // A map from a plain picture, sized to it. The grid is lined up by hand with the G tool.
    const loadPicture = (file: File) =>
    {
        setError('');
        store.uploadMap(file)
            .then(({ src, width, height }) =>
                add({
                    ...blankScenario(baseName(file)),
                    width,
                    height,
                    background: src,
                    spawn: { x: width / 2, y: height / 2 },
                }),
            )
            .catch(() => setError('That picture did not upload. Is it a PNG, WebP or JPEG?'));
    };

    // A picture behind the open map. The map takes the picture's size, and walls, props and the
    // spawn point keep their places; the spawn is pulled inside if the map got smaller. By id,
    // so the picture lands on the map it was picked for even if another opens while it uploads.
    const setBackground = (file: File) =>
    {
        const { id } = active;

        setError('');
        store.uploadMap(file)
            .then(({ src, width, height }) =>
                history.commit((current) =>
                    current.map((scenario) =>
                        scenario.id === id
                            ? {
                                ...scenario,
                                background: src,
                                width,
                                height,
                                spawn: {
                                    x: Math.min(scenario.spawn.x, width),
                                    y: Math.min(scenario.spawn.y, height),
                                },
                            }
                            : scenario,
                    ),
                ),
            )
            .catch(() => setError('That picture did not upload. Is it a PNG, WebP or JPEG?'));
    };

    const removeBackground = () =>
    {
        const { id } = active;

        history.commit((current) =>
            current.map((scenario) => (scenario.id === id ? { ...scenario, background: null } : scenario)),
        );
    };

    // A dropped .dd2vtt imports, a dropped picture becomes a map.
    const dropped = (event: DragEvent) =>
    {
        event.preventDefault();

        const file = event.dataTransfer.files[0];

        if (file?.type.startsWith('image/'))
            loadPicture(file);
        else if (file)
            load(file);

    };

    // Without this the browser opens a dropped file itself instead of handing it to the page.
    const draggedOver = (event: DragEvent) => event.preventDefault();


    return (
        <main onDrop={dropped} onDragOver={draggedOver}>
            <MapCanvas
                scenario={active}
                tokens={shown}
                mode={mode}
                tool={mode === 'edit' ? (tool === 'walls' && wallKind === 'change' ? 'doors' : tool) : playTool}
                placing={mode === 'edit' ? placing : null}
                wallSnap={wallSnap}
                wallDoor={wallKind === 'door'}
                fogEpoch={fogEpoch}
                pending={pending}
                frozen={isFrozen}
                peek={mode === 'play' && peek}
                onTokenMove={moveToken}
                onPathEnd={setPending}
                onScenarioChange={changeScenario}
                onStats={debug ? setStats : undefined}
                onView={(center) =>
                {
                    viewCenter.current = center;
                }}
                onToolCancel={putToolAway}
                shared={liveMap ? liveMap.fog : null}
                onExplored={liveMap ? (fog) => fail(liveMap.saveFog(fog)) : undefined}
                fogSettings={fogSettings}
                fogSource={liveMap ? 'live' : 'preview'}
            />

            <div
                className={`ttrpg-panel ttrpg-modes${idle ? ' ttrpg-hidden' : ''}`}
                role="group"
                aria-label="Mode"
            >
                {live && live.live && (
                    <span className="ttrpg-live" role="status" title="Players can join and move">
                        Live
                    </span>
                )}
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-pressed={mode === 'edit'}
                    onClick={() => switchMode('edit')}
                >
                    <FontAwesomeIcon icon={faPen} />
                    Edit
                </button>
                <button
                    type="button"
                    className="ttrpg-segment"
                    aria-pressed={mode === 'play'}
                    title={
                        live && live.live
                            ? 'The map as the players see it, with your GM controls. Live: moves, doors, monsters and fog reach every phone'
                            : 'The map as the players will see it, with your GM controls and two test players. Start the session to go live'
                    }
                    onClick={() => switchMode('play')}
                >
                    <FontAwesomeIcon icon={faEye} />
                    Player view
                </button>
                {live && (
                    <LiveControls
                        live={live}
                        scenarioId={active.id}
                        onStarted={() => setMode('play')}
                        onError={setError}
                    />
                )}
            </div>

            {error && (
                <p className="ttrpg-panel ttrpg-toast" role="alert">
                    {error}
                </p>
            )}

            {mode === 'play' && isFrozen && (
                <p className="ttrpg-panel ttrpg-toast" role="status">
                    <FontAwesomeIcon icon={faSnowflake} /> Movement paused by the GM
                </p>
            )}

            {mode === 'play' && pending && walker && (
                <MoveSheet
                    move={pending}
                    token={walker}
                    onMove={confirmMove}
                    onCancel={() => setPending(null)}
                />
            )}

            {mode === 'edit' ? (
                <>
                    <ToolRail
                        tool={tool}
                        onTool={pickTool}
                        canUndo={history.canUndo}
                        canRedo={history.canRedo}
                        onUndo={history.undo}
                        onRedo={history.redo}
                    />
                    {tool === 'props' && (
                        <PropLibrary
                            pictures={library}
                            placing={placing}
                            onPick={setPlacing}
                            onUpload={upload}
                        />
                    )}
                    {tool === 'walls' && (
                        <WallPanel kind={wallKind} onKind={setWallKind} snap={wallSnap} onSnap={setWallSnap} />
                    )}
                    {tool === 'align' && (
                        <GridPanel
                            grid={active.grid}
                            onChange={(grid) => changeScenario({ ...active, grid })}
                        />
                    )}
                    <ScenarioList
                        scenarios={scenarios}
                        activeId={active.id}
                        onSelect={select}
                        onRename={rename}
                        onDuplicate={duplicate}
                        onDelete={remove}
                        onNew={() => add(blankScenario('New map'))}
                        onImport={load}
                        onPicture={loadPicture}
                        onBackground={setBackground}
                        onRemoveBackground={removeBackground}
                    />
                    {store.save && (
                        <p className="ttrpg-panel ttrpg-saved" role="status">
                            {unsaved ? 'Saving' : 'Saved'}
                        </p>
                    )}
                </>
            ) : (
                !pending && (
                    <PlayDock
                        tool={playTool}
                        onTool={setPlayTool}
                        frozen={isFrozen}
                        onFreeze={freeze}
                        scenarios={scenarios}
                        activeId={active.id}
                        onScenario={select}
                        onResetFog={resetFog}
                        onPeek={setPeek}
                        hidden={idle}
                        onMonsters={liveMap ? () => togglePanel('monsters') : undefined}
                        monstersOpen={panel === 'monsters'}
                        onFog={() => togglePanel('fog')}
                        fogOpen={panel === 'fog'}
                    />
                )
            )}

            {mode === 'play' && !pending && panel === 'fog' && (
                <FogPanel
                    settings={fogSettings}
                    onChange={setFogDraft}
                    onCommit={() => saveFog(fogDraft)}
                    onReset={() => saveFog(defaultFogSettings)}
                />
            )}

            {mode === 'play' && !pending && liveMap && panel === 'monsters' && (
                <Monsters live={liveMap} at={() => viewCenter.current ?? active.spawn} onError={setError} />
            )}

            {debug && stats && (
                <p className="ttrpg-panel ttrpg-stats" aria-hidden="true">
                    {`${stats.fps} fps · ${stats.frameMs.toFixed(1)} ms · worst ${stats.worstMs.toFixed(1)} ms`}
                </p>
            )}
        </main>
    );
}
