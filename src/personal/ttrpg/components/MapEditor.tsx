import { faCheck, faEye, faPen, faSnowflake, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useEffectEvent, useRef, useState, type DragEvent } from 'react';

import type { FogSettings, Live, PictureBytes, Ping, Point, PropPicture, Scenario, Store } from '../types';

import { blankScenario, demoTokens } from '../content/scenarios';
import { defaultFogSettings } from '../map/fog';
import type { ToolId } from '../map/tools';
import { scenarioFromUvtt } from '../map/uvtt';
import type { FrameStats, PendingMove } from '../map/view';
import { confirmAction } from '../services/confirm';
import { baseName } from '../services/images';

import { Spinner, Toast, Toasts } from './Feedback';
import { FogPanel } from './FogPanel';
import { GridPanel } from './GridPanel';
import { LiveControls } from './LiveControls';
import { MapCanvas } from './MapCanvas';
import { Monsters } from './Monsters';
import { MoveSheet } from './MoveSheet';
import { PlayDock, type PlayTool } from './PlayDock';
import { PropLibrary } from './PropLibrary';
import { ScenarioList } from './ScenarioList';
import { Settings } from './Settings';
import { ToolRail } from './ToolRail';
import { useHistory } from './useHistory';
import { useMessage } from './useMessage';
import { useScreenSettings } from './useScreenSettings';
import { useIdle, useWakeLock } from './useScreen';
import { WallPanel, type WallKind } from './WallPanel';

type Mode = 'edit' | 'play';

/** The map tool behind each kind of the walls tool, see WallPanel. */
const wallTools: Record<WallKind, ToolId> = { wall: 'walls', ring: 'rings', change: 'doors' };

/** How long the editor waits after the last change before it saves. */
const saveDelay = 1000;
const pictureFailed = 'That picture did not upload. Is it a PNG, WebP or JPEG?';

/**
 * Whether the editor's changes are stored, quietly in the bottom right: a spinner while they
 * wait, a tick once saved, and a warning that stays when the last save failed.
 */
function SaveState({ unsaved, failed }: { unsaved: boolean; failed: boolean })
{
    if (failed)
    {
        return (
            <p
                className="ttrpg-panel ttrpg-saved ttrpg-saved--failed"
                role="alert"
                title="Kept here, saving again on your next change"
            >
                <FontAwesomeIcon icon={faTriangleExclamation} />
                Not saved
            </p>
        );
    }

    return (
        <p className="ttrpg-panel ttrpg-saved" role="status">
            {unsaved ? <Spinner /> : <FontAwesomeIcon icon={faCheck} />}
            {unsaved ? 'Saving' : 'Saved'}
        </p>
    );
}

interface MapEditorProps
{
    /** The scenarios it opens with. Empty starts with one blank map. */
    initial: Scenario[];
    /** The game master's prop pictures it opens with. */
    library: PropPicture[];
    /** The size of every stored file besides the props, for the storage meter. 0 in the demo. */
    otherBytes?: number;
    /** The size of each stored map picture of the session. Missing in the demo. */
    backgrounds?: PictureBytes[];
    /** Where pictures go and changes are saved, see Store in types.ts. */
    store: Store;
    /** Shows the frame rate, see pages/Editor.tsx. The settings can show it too. */
    debug: boolean;
    /** A saved session's live play: starting it, and the players' tokens. Not in the demo. */
    live?: Live;
}

/**
 * The editor and its play mode: scenarios, the edit tools, undo, play mode with the fog, and
 * importing .dd2vtt maps. The demo and a saved session both use it, with a different store; with
 * a save in the store it saves a second after the last change.
 */
export function MapEditor({ initial, library: initialLibrary, otherBytes = 0, backgrounds = [], store, debug, live }: MapEditorProps)
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
    const message = useMessage();
    // An upload or import on its way, shown with a spinner until it lands.
    const [busy, setBusy] = useState<string | null>(null);
    const [saveFailed, setSaveFailed] = useState(false);
    // For the background button's tip, see ScenarioList, by picture address.
    const [pictureBytes, setPictureBytes] = useState(() => new Map(backgrounds.map(({ src, bytes }) => [src, bytes])));
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
    // Pings off a live map stay on this screen.
    const [localPing, setLocalPing] = useState<Ping | null>(null);
    const [fogDraft, setFogDraft] = useState<FogSettings | null>(null);
    // The middle of the screen, where a new monster goes. A ref: it changes every frame.
    const viewCenter = useRef<Point | null>(null);
    const [stats, setStats] = useState<FrameStats | null>(null);
    const [screen, setScreen] = useScreenSettings();
    // The table screen stays on, and the controls step aside once the mouse rests as long as this
    // screen's settings say, unless a move is waiting on its sheet.
    const idle = useIdle(screen.hideAfter, mode === 'play' && !pending && screen.hideAfter > 0);
    const showStats = debug || screen.frameRate;
    const unsaved = Boolean(store.save) && scenarios !== saved;

    useWakeLock(mode === 'play');

    // The backgrounds undo and redo can still bring back, so the save keeps their pictures. Read
    // when the save goes, rather than a dependency, so a render alone never delays it.
    const held = useEffectEvent(() => [
        ...new Set(history.states.flatMap((state) => state.flatMap((scenario) => scenario.background ?? []))),
    ]);

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

            save(scenarios, changed, held())
                .then(() =>
                {
                    setSaved(scenarios);
                    setSaveFailed(false);
                })
                .catch(() => setSaveFailed(true));
        }, saveDelay);

        return () => window.clearTimeout(timer);
    }, [scenarios, saved, store]);

    // Leaving the editor drops its undo, so the map pictures only undo still held are freed now, see
    // release in convex/sessions.ts. A failure only leaves them for the next save.
    useEffect(() => () => void store.release?.().catch(() => undefined), [store]);

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

    // Shows label with a spinner while the work runs.
    function track<T>(label: string, work: Promise<T>): Promise<T>
    {
        setBusy(label);

        return work.finally(() => setBusy(null));
    }

    const upload = (files: File[]) =>
    {
        if (files.length === 0)
            return;

        const count = files.length === 1 ? 'the picture' : `${files.length} pictures`;

        track(`Uploading ${count}`, Promise.all(files.map(store.uploadProp)))
            .then((pictures) =>
            {
                // A picture already in the library comes back as that one, see uploadProp in
                // services/backend.ts, so it is placed but not listed twice.
                const known = new Set(library.map((picture) => picture.id));
                const added = pictures.filter((picture, at) => !known.has(picture.id) && pictures.findIndex((other) => other.id === picture.id) === at);
                const what = added.length === 1 ? 'the picture' : `${added.length} pictures`;

                setLibrary((current) => [...current, ...added]);
                setPlacing(pictures[0] ?? null);
                message.done(
                    added.length === 0
                        ? 'Already in your props. Click the map to place it.'
                        : `Added ${what} to your props. Click the map to place it.`,
                );
            })
            .catch(() => message.error('One of those pictures did not upload. Is it a PNG, WebP or JPEG?'));
    };

    // Its placed copies go with it, on these maps here and on the others in convex/pictures.ts.
    // Only the maps that had one change, so the autosave sends just those.
    const removePicture = (picture: PropPicture) =>
        void confirmAction(`Delete ${picture.name} from your props? Every copy placed on your maps goes with it.`, 'Delete')
            .then((yes) =>
            {
                if (!yes)
                    return;

                return track(`Deleting ${picture.name}`, store.removeProp(picture)).then(() =>
                {
                    setLibrary((current) => current.filter((other) => other.id !== picture.id));
                    setPlacing((current) => (current?.id === picture.id ? null : current));
                    history.commit((current) =>
                        current.map((scenario) =>
                            scenario.props.some((prop) => prop.src === picture.src)
                                ? { ...scenario, props: scenario.props.filter((prop) => prop.src !== picture.src) }
                                : scenario,
                        ),
                    );
                    message.done(`Deleted ${picture.name}.`);
                });
            })
            .catch(() => message.error(`${picture.name} was not deleted. Check the connection and try again.`));

    // Undo can take away the open scenario, then the first one shows.
    const active = scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0];

    // The map being played shows the players' tokens, live. Any other map, or a session not
    // started, previews play mode with the two test players.
    const liveMap = live && live.live && live.activeScenarioId === active.id ? live : null;
    const shown = liveMap ? liveMap.tokens : tokens;
    const isFrozen = liveMap ? liveMap.frozen : frozen;

    const fail = (promise: Promise<void>) => void promise.catch((reason: Error) => message.error(reason.message));

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
        message.done(liveMap ? 'Fog reset on every screen.' : 'Fog reset.');

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

    // By id, so an upload that finishes after another map opened still lands on its own map.
    const updateScenario = (id: string, update: (scenario: Scenario) => Scenario, merge = false) =>
        history.commit(
            (current) => current.map((scenario) => (scenario.id === id ? update(scenario) : scenario)),
            merge,
        );

    const changeScenario = (next: Scenario, merge = false) => updateScenario(next.id, () => next, merge);

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

    const rename = (id: string, name: string) => updateScenario(id, (scenario) => ({ ...scenario, name }));

    const duplicate = (id: string) =>
    {
        const original = scenarios.find((scenario) => scenario.id === id);

        if (!original)
            return;

        add({ ...original, id: crypto.randomUUID(), name: `${original.name} copy` });
        message.done(`Made ${original.name} copy.`);
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

    const uploadMap = async (picture: Blob) =>
    {
        const stored = await store.uploadMap(picture);
        const { src, bytes } = stored;

        if (bytes !== undefined)
            setPictureBytes((sizes) => new Map(sizes).set(src, bytes));

        return stored;
    };

    // The file's picture is stored first, so the scenario only keeps its address.
    const load = (file: File) =>
    {
        const imported = file.text()
            .then((text) => scenarioFromUvtt(text, crypto.randomUUID(), baseName(file)))
            .then(async (scenario) =>
            {
                if (!scenario.background)
                    return scenario;

                const picture = await fetch(scenario.background).then((response) => response.blob());
                const { src } = await uploadMap(picture);

                return { ...scenario, background: src };
            });

        track(`Importing ${file.name}`, imported)
            .then((scenario) =>
            {
                add(scenario);
                message.done(`Imported ${scenario.name}, with ${scenario.walls.length} walls.`);
            })
            .catch((reason: Error) => message.error(reason.message));
    };

    // A map from a plain picture, sized to it. The grid is lined up by hand with the G tool.
    const loadPicture = (file: File) =>
    {
        track('Uploading the map picture', uploadMap(file))
            .then(({ src, width, height }) =>
            {
                add({
                    ...blankScenario(baseName(file)),
                    width,
                    height,
                    background: src,
                    spawn: { x: width / 2, y: height / 2 },
                });
                message.done('New map made. Line the grid up with the Grid tool (G).');
            })
            .catch(() => message.error(pictureFailed));
    };

    // A picture behind the open map. The map takes the picture's size, and walls, props and the
    // spawn point keep their places; the spawn is pulled inside if the map got smaller.
    const setBackground = (file: File) =>
    {
        const { id } = active;

        track('Uploading the background', uploadMap(file))
            .then(({ src, width, height }) =>
            {
                updateScenario(id, (scenario) => ({
                    ...scenario,
                    background: src,
                    width,
                    height,
                    spawn: { x: Math.min(scenario.spawn.x, width), y: Math.min(scenario.spawn.y, height) },
                }));
                message.done('Background set.');
            })
            .catch(() => message.error(pictureFailed));
    };

    const removeBackground = () =>
    {
        updateScenario(active.id, (scenario) => ({ ...scenario, background: null }));
        message.done('Background removed. Ctrl+Z brings it back.');
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
        <main className="ttrpg-editor" onDrop={dropped} onDragOver={draggedOver}>
            <MapCanvas
                scenario={active}
                tokens={shown}
                mode={mode}
                tool={mode === 'edit' ? (tool === 'walls' ? wallTools[wallKind] : tool) : playTool}
                placing={mode === 'edit' ? placing : null}
                wallSnap={wallSnap}
                fogEpoch={fogEpoch}
                pending={pending}
                frozen={isFrozen}
                peek={mode === 'play' && peek}
                onTokenMove={moveToken}
                onPathEnd={setPending}
                onPathCancel={() => setPending(null)}
                onScenarioChange={changeScenario}
                onStats={showStats ? setStats : undefined}
                onView={(center) =>
                {
                    viewCenter.current = center;
                }}
                onToolCancel={putToolAway}
                shared={liveMap ? liveMap.fog : null}
                onExplored={liveMap ? (fog, forget) => fail(liveMap.saveFog(fog, forget)) : undefined}
                ping={liveMap ? liveMap.ping : localPing}
                onPing={(at) => (liveMap ? fail(liveMap.sendPing(at)) : setLocalPing({ ...at, at: Date.now() }))}
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
                    title="Draw walls, place props and line up the grid"
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
                            ? 'Live: what the players see, with your GM controls'
                            : 'What the players will see, with two test players'
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
                        onDone={message.done}
                        onError={message.error}
                    />
                )}
                <Settings settings={screen} onChange={setScreen} hidden={idle} />
            </div>

            <Toasts>
                {mode === 'play' && isFrozen && (
                    <Toast kind="info" icon={faSnowflake}>
                        Movement paused by the GM
                    </Toast>
                )}
                {busy && <Toast kind="busy">{busy}</Toast>}
                {message.message && (
                    <Toast kind={message.message.kind} onClose={message.clear}>
                        {message.message.text}
                    </Toast>
                )}
            </Toasts>

            <MoveSheet
                move={mode === 'play' ? pending : null}
                token={walker}
                onMove={confirmMove}
                onCancel={() => setPending(null)}
            />

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
                            onRemove={removePicture}
                            otherBytes={otherBytes}
                        />
                    )}
                    {tool === 'walls' && (
                        <WallPanel kind={wallKind} onKind={setWallKind} snap={wallSnap} onSnap={setWallSnap} />
                    )}
                    {tool === 'align' && (
                        <GridPanel
                            grid={active.grid}
                            onChange={(grid, merge) => changeScenario({ ...active, grid }, merge)}
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
                        backgroundBytes={active.background ? pictureBytes.get(active.background) : undefined}
                    />
                    {store.save && <SaveState unsaved={unsaved} failed={saveFailed} />}
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
                        onPeek={setPeek}
                        hidden={idle}
                        onMonsters={liveMap ? () => togglePanel('monsters') : undefined}
                        monstersOpen={panel === 'monsters'}
                        onFog={() => togglePanel('fog')}
                        fogOpen={panel === 'fog'}
                    />
                )
            )}

            {mode === 'play' && !pending && !idle && panel === 'fog' && (
                <FogPanel
                    settings={fogSettings}
                    onChange={setFogDraft}
                    onCommit={() => saveFog(fogDraft)}
                    onReset={() => saveFog(defaultFogSettings)}
                    onResetFog={resetFog}
                    onClose={() => setPanel(null)}
                />
            )}

            {mode === 'play' && !pending && !idle && liveMap && panel === 'monsters' && (
                <Monsters
                    live={liveMap}
                    at={() => viewCenter.current ?? active.spawn}
                    onClose={() => setPanel(null)}
                    onDone={message.done}
                    onError={message.error}
                />
            )}

            {showStats && stats && (
                <p className="ttrpg-panel ttrpg-stats" aria-hidden="true">
                    {`${stats.fps} fps · ${stats.frameMs.toFixed(1)} ms · worst ${stats.worstMs.toFixed(1)} ms`}
                </p>
            )}
        </main>
    );
}
