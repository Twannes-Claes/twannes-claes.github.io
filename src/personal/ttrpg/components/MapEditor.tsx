import { faCheck, faDiceD20, faHatWizard, faPen, faSnowflake, faTriangleExclamation, faTv } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useEffectEvent, useRef, useState, type DragEvent, type MouseEvent } from 'react';

import type { BloodSettings, Decal, FogSettings, GameSystem, GroupCheck, HitKind, Initiative, Live, MonsterControls, PictureBytes, Ping, Point, Preset, PropPicture, Scenario, SharedHit, Store, Token } from '../types';

import { cleanConditions } from '../content/conditions';
import { blankScenario, demoTokens } from '../content/scenarios';
import { demoOgrePreset } from '../content/statBlocks';
import { gameSystems } from '../content/systems';
import { defaultFogSettings } from '../map/fog';
import { cleanStats, defaultBlood, downedPool, hitOn, withoutNumbers } from '../map/health';
import { nextTurn } from '../map/initiative';
import { monsterFrom } from '../map/presets';
import { landingAt, resizedAt } from '../map/size';
import { toggleDoor, type ToolId } from '../map/tools';
import { scenarioFromUvtt } from '../map/uvtt';
import type { FrameStats, PendingMove } from '../map/view';
import { confirmAction, kickPlayer } from '../services/confirm';
import { baseName, toAvatar } from '../services/images';
import { listenForDoors, type DoorChange } from '../services/tableChannel';

import { Spinner, Toast, Toasts } from './Feedback';
import { FogPanel } from './FogPanel';
import { AttackButton, HitSheet } from './HitSheet';
import { GridPanel } from './GridPanel';
import { CheckPanel } from './CheckPanel';
import { InitiativePanel } from './InitiativePanel';
import { LiveControls, Players } from './LiveControls';
import { MapCanvas } from './MapCanvas';
import { MonsterList, Monsters } from './Monsters';
import { MoveSheet } from './MoveSheet';
import { PlayDock, type PlayTool } from './PlayDock';
import { Popover } from './Popover';
import { PresetLibrary } from './PresetLibrary';
import { PropLibrary } from './PropLibrary';
import { RulerPicker } from './RulerPicker';
import { ScenarioList } from './ScenarioList';
import { Settings } from './Settings';
import { StatBlock } from './StatBlock';
import { SelectPanel } from './SelectPanel';
import { TokenMenu } from './TokenMenu';
import { Tray } from './Tray';
import { ToolRail } from './ToolRail';
import { useHistory } from './useHistory';
import { useMessage } from './useMessage';
import { useScreenSettings } from './useScreenSettings';
import { useIdle, useWakeLock } from './useScreen';
import { WallPanel, type WallKind } from './WallPanel';

/**
 * Both play modes show the map in play. The GM view dims the fog and shows every monster, with
 * the GM's controls; the Player view shows only what the players may see, see PLAN.md.
 */
type Mode = 'edit' | 'gm' | 'players';

/** The map tool behind each kind of the walls tool, see WallPanel. */
const wallTools: Record<WallKind, ToolId> = { wall: 'walls', ring: 'rings', change: 'doors' };

/**
 * The fight in a line, for its toast: rolling, or the round and whose turn it is. The Player view
 * says Enemy for a hidden monster, as the players' screens do.
 */
function fightLine(fight: Initiative, tokens: Token[], asPlayers: boolean): string
{
    if (!fight.begun)
        return 'Rolling for initiative';

    const token = tokens.find((candidate) => candidate.id === fight.turn);

    if (!token)
        return `Round ${fight.round}`;

    return `Round ${fight.round} · ${asPlayers && token.hidden ? 'Enemy' : token.name}'s turn`;
}

/** How long the editor waits after the last change before it saves. */
/** A walk along a path from now, which every screen plays, see setTokens in map/view.ts. */
function walkFromNow(path: Point[]): Pick<Token, 'path' | 'movedAt'>
{
    return { path, movedAt: Date.now() };
}

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
    // The one panel open above the play dock.
    const [panel, setPanel] = useState<'monsters' | 'fog' | 'initiative' | 'check' | null>(null);
    // The fog's look: the session's when it is saved, this screen's in the demo. While a slider
    // moves, the draft shows here only, and letting go saves it, see FogPanel.
    const [demoFog, setDemoFog] = useState<FogSettings>(defaultFogSettings);
    // Pings and hits off a live map stay on this screen.
    const [localPing, setLocalPing] = useState<Ping | null>(null);
    const [localHit, setLocalHit] = useState<SharedHit | null>(null);
    const [localDecals, setLocalDecals] = useState<Decal[]>([]);
    // Which blood shows: the session's when it is saved, this tab's in the demo.
    const [demoBlood, setDemoBlood] = useState(defaultBlood);
    const [demoSystem, setDemoSystem] = useState<GameSystem>('5e');
    // The demo's monster presets, kept in this tab, starting with the ogre on its map.
    const [demoPresets, setDemoPresets] = useState<Preset[]>(() => [demoOgrePreset]);
    // The fight off a live map, with the test players, and whether Up next is on in the demo.
    const [localFight, setLocalFight] = useState<Initiative | null>(null);
    const [localCheck, setLocalCheck] = useState<GroupCheck | null>(null);
    const [demoUpNext, setDemoUpNext] = useState(false);
    // The tokens picked for an attack or a heal, or null when not picking, see HitSheet.
    const [targets, setTargets] = useState<string[] | null>(null);
    // The token right-clicked in the GM view, with where, and the preset whose stat block it opened.
    const [menu, setMenu] = useState<{ id: string; at: Point } | null>(null);
    const [reading, setReading] = useState<string | null>(null);
    // The tokens picked with the Select tool in Edit, see SelectPanel.
    const [selected, setSelected] = useState<string[]>([]);
    const [fogDraft, setFogDraft] = useState<FogSettings | null>(null);
    const [stats, setStats] = useState<FrameStats | null>(null);
    const [screen, setScreen] = useScreenSettings();
    const playing = mode !== 'edit';
    // The screen stays on, and the controls step aside once the mouse rests as long as this
    // screen's settings say, unless a move is waiting on its sheet.
    const idle = useIdle(screen.hideAfter, playing && !pending && screen.hideAfter > 0);
    const showStats = debug || screen.frameRate;
    const unsaved = Boolean(store.save) && scenarios !== saved;

    useWakeLock(playing);

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

    // A door opened or closed on the table screen's Player view, which leaves saving the map to
    // this editor, see services/tableChannel.ts. Kept like a click here, undo and autosave alike.
    const sessionId = live ? live.sessionId : null;
    const doorFromTable = useEffectEvent((door: DoorChange) =>
        history.commit((current) =>
            current.map((scenario) =>
                scenario.id === door.scenarioId
                    ? {
                        ...scenario,
                        walls: scenario.walls.map((wall) =>
                            wall.id === door.wallId && wall.door && wall.door.open !== door.open ? toggleDoor(wall) : wall,
                        ),
                    }
                    : scenario,
            ),
        ),
    );

    useEffect(() => (sessionId ? listenForDoors(sessionId, doorFromTable) : undefined), [sessionId]);

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
        setMenu(null);
        setSelected([]);
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
    // A saved session's monsters stand on their map whether it is played or not, beside the test
    // players, see placeMonster in convex/play.ts. The demo's are in this tab with the players.
    // The ones on the map's tray are off it, see Tray.tsx; the live map's tokens never hold them.
    const monstersOf = live ? live.monsters.filter((monster) => monster.scenarioId === active.id) : tokens.filter((token) => token.kind === 'npc');
    const tray = monstersOf.filter((monster) => monster.tray === true);
    const monstersHere = liveMap ? liveMap.tokens.filter((token) => token.kind === 'npc') : monstersOf.filter((monster) => monster.tray !== true);
    const shown = liveMap
        ? liveMap.tokens
        : live
            ? [...tokens.filter((token) => token.kind === 'player'), ...monstersHere]
            : tokens.filter((token) => token.tray !== true);
    const isFrozen = liveMap ? liveMap.frozen : frozen;

    const fail = (promise: Promise<void>) => void promise.catch((reason: Error) => message.error(reason.message));

    const changeToken = (id: string, change: (token: Token) => Token) =>
    {
        setTokens((current) => current.map((token) => (token.id === id ? change(token) : token)));

        return Promise.resolve();
    };

    // The demo's presets and monsters, done here in the tab the way the server does them for a
    // saved session, and never sent anywhere, so all of it can be tried without an account.
    const demoMonsters: MonsterControls = {
        system: demoSystem,
        presets: demoPresets,
        savePreset: async (preset, picture, id) =>
        {
            const avatar = picture ? URL.createObjectURL(await toAvatar(picture)) : undefined;
            const saved = id ?? crypto.randomUUID();

            setDemoPresets((current) =>
            {
                const was = current.find((other) => other.id === saved);
                const next = { ...preset, id: saved, avatar: avatar ?? was?.avatar };

                return (was ? current.map((other) => (other.id === saved ? next : other)) : [...current, next]).sort((a, b) => a.name.localeCompare(b.name));
            });

            if (avatar)
                setTokens((current) => current.map((token) => (token.presetId === saved ? { ...token, avatar } : token)));

            return saved;
        },
        removePreset: (id) =>
        {
            setDemoPresets((current) => current.filter((preset) => preset.id !== id));
            setTokens((current) => current.map((token) => (token.presetId === id ? { ...token, presetId: undefined, avatar: undefined } : token)));

            return Promise.resolve();
        },
        placeMonster: (presetId, scenarioId, at, stack) =>
        {
            const preset = demoPresets.find((other) => other.id === presetId);

            // The demo's tokens are the open map's, so a drop only lands there.
            if (preset && scenarioId === active.id)
            {
                setTokens((current) => [
                    ...current,
                    {
                        id: crypto.randomUUID(),
                        presetId,
                        ...monsterFrom(preset, active, at ?? active.spawn, new Set(current.map((token) => token.name)), stack ? [] : current.filter((token) => token.tray !== true)),
                        tray: at ? undefined : true,
                    },
                ]);
            }

            return Promise.resolve();
        },
        setMonster: (id, { name, color, downs }) =>
            changeToken(id, (token) => ({ ...token, name: name.trim().slice(0, 30) || token.name, color, downs: downs || undefined })),
        hide: (id, hidden) => changeToken(id, (token) => ({ ...token, hidden })),
        stage: (id, at, hidden) =>
            changeToken(id, (token) => ({ ...token, ...at, path: undefined, movedAt: undefined, tray: at ? undefined : true, hidden: at ? hidden : true })),
        removeMonster: (id) =>
        {
            setTokens((current) => current.filter((token) => token.id !== id));

            return Promise.resolve();
        },
        setStats: (id, stats) => changeToken(id, (token) => ({ ...token, ...cleanStats(stats) })),
        setConditions: (id, conditions) => changeToken(id, (token) => ({ ...token, conditions: cleanConditions(demoSystem, conditions) })),
        setSize: (id, size) => changeToken(id, (token) => ({ ...token, size, ...resizedAt(active.grid, token, size) })),
    };
    const monsterControls = live ?? demoMonsters;

    // The test players off a live map, changed here in the tab.
    const testPlayers: Pick<Live, 'setStats' | 'setConditions' | 'setSize'> = {
        setStats: (id, stats) => changeToken(id, (token) => ({ ...token, ...cleanStats(stats) })),
        setConditions: (id, conditions) => changeToken(id, (token) => ({ ...token, conditions })),
        setSize: (id, size) => changeToken(id, (token) => ({ ...token, size, ...resizedAt(active.grid, token, size) })),
    };
    const playerControls = liveMap ?? testPlayers;

    // Where the last press let go on the page, to tell a monster dragged off the map onto the tray.
    // Heard before the map hears it, so the drag it ends is judged from where it ended.
    const letGo = useRef<Point | null>(null);

    useEffect(() =>
    {
        const up = (event: PointerEvent) =>
        {
            letGo.current = { x: event.clientX, y: event.clientY };
        };

        window.addEventListener('pointerup', up, true);

        return () => window.removeEventListener('pointerup', up, true);
    }, []);

    // A monster dragged off the map and let go over the tray goes onto it, hidden,
    // rather than where it was let go. False for anything else.
    const ontoTray = (id: string) =>
    {
        const at = letGo.current;
        const box = document.querySelector('.ttrpg-tray:not(.ttrpg-hidden)')?.getBoundingClientRect();

        if (!at || !box || at.x < box.left || at.x > box.right || at.y < box.top || at.y > box.bottom)
            return false;

        if (!monstersHere.some((monster) => monster.id === id))
            return false;

        setMenu(null);
        fail(monsterControls.stage(id, null, true));

        return true;
    };

    // Dragged freely, or walked along a path: to the server for the live map's tokens and a saved
    // session's monsters on any map, here for the test players and the demo.
    const moveToken = (id: string, to: Point, path?: Point[]) =>
    {
        const saved = liveMap ?? (live && monstersHere.some((monster) => monster.id === id) ? live : null);
        const walk = path ? walkFromNow(path) : {};

        if (!path && ontoTray(id))
            return;

        if (saved)
            fail(saved.move(id, to, path));
        else
            setTokens((current) => current.map((token) => (token.id === id ? { ...token, ...to, ...walk } : token)));

    };

    // Monsters leave the map for good, unlike the walls and props undo brings back, so whatever
    // calls this asks first: the erase tool, or the bin beside one in the Monsters panel.
    const removeMonsters = (ids: string[]) =>
    {
        for (const id of ids)
            fail(monsterControls.removeMonster(id));

    };

    const eraseMonster = (monster: Token) =>
        void confirmAction(`Remove ${monster.name} from the map?`, 'Remove').then((yes) =>
        {
            if (yes)
                removeMonsters([monster.id]);

        });

    // Off the tray onto the map, lined up with the grid, hidden like any monster placed.
    const fromTray = (id: string, at: Point, stack: boolean) =>
    {
        const monster = tray.find((other) => other.id === id);

        if (!monster)
            return;

        setMenu(null);
        fail(monsterControls.stage(id, landingAt(active, at, monster.size, stack ? [] : shown), true));
    };

    // What the Select tool's panel does to the picked monsters at once, see SelectPanel.
    const pickedMonsters = monstersHere.filter((monster) => selected.includes(monster.id));

    const hidePicked = (hidden: boolean) =>
    {
        for (const monster of pickedMonsters)
        {
            if ((monster.hidden === true) !== hidden)
                fail(monsterControls.hide(monster.id, hidden));

        }
    };

    const trayPicked = () =>
    {
        for (const monster of pickedMonsters)
            fail(monsterControls.stage(monster.id, null, true));

        setSelected((ids) => ids.filter((id) => !pickedMonsters.some((monster) => monster.id === id)));
    };

    const walker = pending ? shown.find((token) => token.id === pending.id) : undefined;

    // What a confirmed move writes: where the token ends, the path and when, so every screen
    // plays the same walk, see setTokens in map/view.ts.
    const confirmMove = () =>
    {
        if (!pending)
            return;

        moveToken(pending.id, pending.points[pending.points.length - 1], pending.points);
        setPending(null);
    };

    const freeze = () =>
    {
        if (liveMap)
            fail(liveMap.freeze(!liveMap.frozen));
        else
            setFrozen((on) => !on);

    };

    // Off a live map, a hit lands here, as the server would land it, see hit in convex/play.ts.
    const hitHere = (ids: string[], kind: HitKind, amount: number) =>
    {
        const struck = tokens.filter((token) => ids.includes(token.id));
        const killed = struck.filter((token) => hitOn(token, kind, amount).died);

        setLocalHit({
            at: Date.now(),
            kind,
            targets: struck.map((token) => ({ x: token.x, y: token.y, size: token.size, died: killed.includes(token) })),
        });
        const downed = struck.filter((token) => hitOn(token, kind, amount).downed);

        setLocalDecals((current) => [
            ...current,
            ...killed.map(({ x, y, size }) => ({ id: crypto.randomUUID(), x, y, size })),
            ...downed.map(({ x, y, size }) => ({ id: crypto.randomUUID(), x, y, size, scale: downedPool })),
        ]);
        setTokens((current) =>
            current.flatMap((token) =>
            {
                const { after, died } = ids.includes(token.id) ? hitOn(token, kind, amount) : { after: null, died: false };

                return died ? [] : [{ ...token, ...after }];
            }),
        );
    };

    const decals = liveMap ? liveMap.decals : localDecals;
    const blood = live ? (live.blood ?? defaultBlood) : demoBlood;

    const setBlood = (change: Partial<BloodSettings>) =>
    {
        if (live)
            fail(live.setBlood({ ...blood, ...change }));
        else
            setDemoBlood({ ...blood, ...change });

    };

    const system = live ? live.system : demoSystem;
    const setSystem = (next: GameSystem) => (live ? fail(live.setSystem(next)) : setDemoSystem(next));
    const fight = liveMap ? liveMap.initiative : localFight;
    const setFight = (next: Initiative | null) => (liveMap ? fail(liveMap.setInitiative(next)) : setLocalFight(next));
    // Off a live map nobody can answer it, but the GM can still try the panel.
    const check = liveMap ? liveMap.check : localCheck;
    const setCheck = (next: { text: string; asked: string[] } | null) => (liveMap ? fail(liveMap.setCheck(next)) : setLocalCheck(next && { ...next, rolls: [] }));
    const upNext = live ? live.upNext : demoUpNext;
    const setUpNext = (on: boolean) => (live ? fail(live.setUpNext(on)) : setDemoUpNext(on));

    const clearDecals = () =>
    {
        if (liveMap)
            fail(liveMap.clearDecals());
        else
            setLocalDecals([]);

    };

    const dealHit = (kind: HitKind, amount: number) =>
    {
        const ids = targets ?? [];

        if (liveMap)
            return liveMap.hit(ids, kind, amount).then(() => setTargets(null));

        hitHere(ids, kind, amount);
        setTargets(null);

        return Promise.resolve();
    };

    const pickTarget = (id: string) =>
        setTargets((picked) => picked && (picked.includes(id) ? picked.filter((other) => other !== id) : [...picked, id]));

    const startTargets = () =>
    {
        setPlayTool('open-doors');
        setTargets([]);
    };

    // A right click with nothing half done: stop picking targets or placing a picture, or go back
    // to no tool.
    const putToolAway = () =>
    {
        if (targets)
            setTargets(null);
        else if (playing)
            setPlayTool('open-doors');
        else if (placing)
            setPlacing(null);
        else
            setTool('select');

    };

    // The right-clicked token, gone with the token itself, a map switch or a fight that killed it.
    // In Edit only with the tools a right click has nothing to cancel in, like a wall chain.
    const menuOpens = mode === 'gm' || (mode === 'edit' && (tool === 'select' || tool === 'pick' || tool === 'monsters'));
    const menuToken = menu && menuOpens ? [...shown, ...tray].find((token) => token.id === menu.id) : undefined;
    const menuOnTray = menuToken?.tray === true;
    // In Edit, clear of the rail, or beside the Monsters panel when it is open.
    const statBlockBeside = mode !== 'edit' ? '' : tool === 'monsters' ? ' ttrpg-statblock-panel--beside' : ' ttrpg-statblock-panel--rail';
    const menuAt = menu ? menu.at : { x: 0, y: 0 };
    const menuMonster = menuToken?.kind === 'npc';
    const menuControls = menuMonster ? monsterControls : playerControls;
    const menuPreset = menuMonster ? monsterControls.presets.find((preset) => preset.id === menuToken.presetId) : undefined;
    const readPreset = monsterControls.presets.find((preset) => preset.id === reading);
    // A monster leaves the map, a live player the table; the test players stay.
    const menuRemove = !menuToken
        ? undefined
        : menuMonster
            ? () => eraseMonster(menuToken)
            : liveMap
                ? () => kickPlayer(liveMap, menuToken.id, menuToken.name, message.done, message.error)
                : undefined;

    const togglePanel = (next: 'monsters' | 'fog' | 'initiative' | 'check') => setPanel((open) => (open === next ? null : next));

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
        setTargets(null);
        setMenu(null);
        // A GM tool like Reveal has no button in the Player view to put it away with.
        setPlayTool('open-doors');

        if (next !== 'edit' && live && live.live && live.activeScenarioId !== active.id)
            fail(live.open(active.id));

    };

    // A plain click shows the Player view here. Ctrl, Shift or the middle button leave the link to
    // the browser, which opens it in a tab or window of its own, for the table screen.
    const showPlayerView = (event: MouseEvent) =>
    {
        if (event.ctrlKey || event.metaKey || event.shiftKey)
            return;

        event.preventDefault();
        switchMode('players');
    };

    // By id, so an upload that finishes after another map opened still lands on its own map.
    const updateScenario = (id: string, update: (scenario: Scenario) => Scenario, merge = false) =>
        history.commit(
            (current) => current.map((scenario) => (scenario.id === id ? update(scenario) : scenario)),
            merge,
        );

    const changeScenario = (next: Scenario, merge = false) => updateScenario(next.id, () => next, merge);

    // Every player starts over at the spawn point of the scenario that opens, see PLAN.md, but
    // keeps their numbers, as respawn in convex/play.ts does live.
    const open = (scenario: Scenario) =>
    {
        setActiveId(scenario.id);
        setTokens((current) =>
            demoTokens(scenario).map((token) =>
            {
                const was = current.find((other) => other.id === token.id);

                return was && token.kind === 'player' ? { ...was, x: token.x, y: token.y, path: undefined, movedAt: undefined } : token;
            }),
        );
        setLocalDecals([]);
        setLocalFight(null);
        setPending(null);
        setTargets(null);

        if (playing && live && live.live)
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
                // The Player view shows how hurt everyone looks, not the numbers.
                tokens={mode === 'players' ? shown.map(withoutNumbers) : shown}
                mode={playing ? 'play' : 'edit'}
                tool={playing ? playTool : tool === 'walls' ? wallTools[wallKind] : tool}
                placing={playing ? null : placing}
                wallSnap={wallSnap}
                fogEpoch={fogEpoch}
                pending={pending}
                frozen={isFrozen}
                peek={mode === 'gm'}
                onTokenMove={moveToken}
                onMonstersErase={removeMonsters}
                onPathEnd={setPending}
                onPathCancel={() => setPending(null)}
                onScenarioChange={changeScenario}
                onStats={showStats ? setStats : undefined}
                onPresetDrop={playing ? undefined : (presetId, at, stack) => fail(monsterControls.placeMonster(presetId, active.id, at, stack))}
                onTrayDrop={playing ? undefined : fromTray}
                onToolCancel={putToolAway}
                shared={liveMap ? liveMap.fog : null}
                onExplored={liveMap ? (fog, forget) => fail(liveMap.saveFog(fog, forget)) : undefined}
                ping={liveMap ? liveMap.ping : localPing}
                onPing={(at) => (liveMap ? fail(liveMap.sendPing(at)) : setLocalPing({ ...at, at: Date.now() }))}
                drafts={liveMap ? liveMap.drafts : undefined}
                onDraft={liveMap ? (id, points, feet) => fail(liveMap.draw(id, points, feet)) : undefined}
                marks={liveMap ? liveMap.marks : undefined}
                // Only a preview for the table, so a failed send is not worth a message.
                onMark={liveMap ? (next) => void liveMap.mark(next).catch(() => undefined) : undefined}
                fogSettings={fogSettings}
                fogSource={liveMap ? 'live' : 'preview'}
                // Only the demo has no session, see credit in MapCanvas.tsx.
                credit={!live}
                hit={liveMap ? liveMap.lastHit : localHit}
                decals={decals}
                blood={blood}
                turn={fight?.turn ?? null}
                targets={targets}
                onTarget={pickTarget}
                selection={mode === 'edit' && tool === 'pick' ? selected : null}
                onSelect={setSelected}
                onTokenMenu={menuOpens ? (id, at) => setMenu({ id, at }) : undefined}
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
                    aria-pressed={mode === 'gm'}
                    title={
                        liveMap
                            ? 'Live: the fog dimmed, every monster, and your GM controls'
                            : 'Run the map, with two test players'
                    }
                    onClick={() => switchMode('gm')}
                >
                    <FontAwesomeIcon icon={faHatWizard} />
                    GM view
                </button>
                {/* A link for a saved session, so Ctrl+click opens it for the table screen. The
                    demo lives in this tab only, so it has nothing to open there. */}
                {live ? (
                    <a
                        href={`${live.joinPath}&table`}
                        className="ttrpg-segment"
                        aria-current={mode === 'players' ? 'true' : undefined}
                        title="What the players see. Ctrl+click opens it in a window of its own, for the table screen"
                        onClick={showPlayerView}
                    >
                        <FontAwesomeIcon icon={faTv} />
                        Player view
                    </a>
                ) : (
                    <button
                        type="button"
                        className="ttrpg-segment"
                        aria-pressed={mode === 'players'}
                        title="What the players will see"
                        onClick={() => switchMode('players')}
                    >
                        <FontAwesomeIcon icon={faTv} />
                        Player view
                    </button>
                )}
                {/* Before going live, the test players' numbers, to try how hurt tokens look. */}
                {!(live && live.live) && (
                    <Players
                        tokens={tokens}
                        onSetStats={testPlayers.setStats}
                        system={system}
                        onSetConditions={testPlayers.setConditions}
                        onSetSize={testPlayers.setSize}
                        grid={active.grid}
                        hidden={idle}
                    />
                )}
                {live && (
                    <LiveControls
                        live={live}
                        scenarioId={active.id}
                        grid={active.grid}
                        onStarted={() => setMode('gm')}
                        onDone={message.done}
                        onError={message.error}
                        hidden={idle}
                    />
                )}
                <Settings
                    settings={screen}
                    onChange={setScreen}
                    hidden={idle}
                    table={
                        <>
                            <section className="ttrpg-shortcuts" aria-label="Game system">
                                <h3 className="ttrpg-subhead">Game system</h3>
                                <div className="ttrpg-settings__choices">
                                    {gameSystems.map((choice) => (
                                        <button
                                            key={choice.id}
                                            type="button"
                                            className="ttrpg-segment"
                                            aria-pressed={system === choice.id}
                                            onClick={() => setSystem(choice.id)}
                                        >
                                            {choice.name}
                                        </button>
                                    ))}
                                </div>
                            </section>
                            <section className="ttrpg-shortcuts" aria-label="Initiative">
                                <h3 className="ttrpg-subhead">Initiative</h3>
                                <div className="ttrpg-settings__choices">
                                    <button
                                        type="button"
                                        className="ttrpg-segment"
                                        aria-pressed={upNext}
                                        title="The phone of whoever goes after the current turn says so"
                                        onClick={() => setUpNext(!upNext)}
                                    >
                                        Up next
                                    </button>
                                </div>
                            </section>
                            <section className="ttrpg-shortcuts" aria-label="Blood">
                                <h3 className="ttrpg-subhead">Blood</h3>
                                <div className="ttrpg-settings__choices">
                                    <button
                                        type="button"
                                        className="ttrpg-segment"
                                        aria-pressed={blood.ground}
                                        title="Trails behind badly hurt tokens, and a pool where a monster falls"
                                        onClick={() => setBlood({ ground: !blood.ground })}
                                    >
                                        On the ground
                                    </button>
                                    <button
                                        type="button"
                                        className="ttrpg-segment"
                                        aria-pressed={blood.wounds}
                                        title="Red rising in a hurt token, and drips once it is bloodied"
                                        onClick={() => setBlood({ wounds: !blood.wounds })}
                                    >
                                        On tokens
                                    </button>
                                </div>
                            </section>
                        </>
                    }
                />
            </div>

            <Toasts>
                {playing && isFrozen && (
                    <Toast kind="info" icon={faSnowflake}>
                        Movement paused by the GM
                    </Toast>
                )}
                {playing && fight && (
                    <Toast kind="info" icon={faDiceD20}>
                        {fightLine(fight, shown, mode === 'players')}
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
                move={playing ? pending : null}
                token={walker}
                onMove={confirmMove}
                onCancel={() => setPending(null)}
            />

            {/* In the place of the controls at the bottom, which make way while picking. */}
            {playing && targets && (
                <HitSheet
                    targets={shown.filter((token) => targets.includes(token.id))}
                    onApply={dealHit}
                    onCancel={() => setTargets(null)}
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
                    {tool === 'monsters' && (
                        <PresetLibrary
                            presets={monsterControls.presets}
                            system={system}
                            monsters={monstersHere}
                            onSave={monsterControls.savePreset}
                            onRemove={(preset) => monsterControls.removePreset(preset.id).then(() => message.done(`Deleted ${preset.name}.`))}
                            onDone={message.done}
                            onError={message.error}
                        >
                            <MonsterList
                                controls={monsterControls}
                                monsters={monstersHere}
                                onRemove={eraseMonster}
                                onError={message.error}
                                statBlockClass="ttrpg-statblock-panel ttrpg-statblock-panel--beside"
                            />
                        </PresetLibrary>
                    )}
                    {tool === 'pick' && (
                        <SelectPanel
                            picked={shown.filter((token) => selected.includes(token.id)).length}
                            monsters={pickedMonsters.length}
                            onHide={hidePicked}
                            onTray={trayPicked}
                            onAll={() => setSelected(shown.map((token) => token.id))}
                            onClear={() => setSelected([])}
                        />
                    )}
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
                mode === 'gm' && !pending && !targets && (
                    <PlayDock
                        tool={playTool}
                        onTool={setPlayTool}
                        frozen={isFrozen}
                        onFreeze={freeze}
                        scenarios={scenarios}
                        activeId={active.id}
                        onScenario={select}
                        hidden={idle}
                        onMonsters={() => togglePanel('monsters')}
                        monstersOpen={panel === 'monsters'}
                        onFog={() => togglePanel('fog')}
                        fogOpen={panel === 'fog'}
                        onAttack={startTargets}
                        onClearDecals={blood.ground && decals.length > 0 ? clearDecals : undefined}
                        onInitiative={() => togglePanel('initiative')}
                        initiativeOpen={panel === 'initiative'}
                        onNextTurn={fight?.begun ? () => setFight(nextTurn(fight, (id) => shown.some((token) => token.id === id))) : undefined}
                        onCheck={() => togglePanel('check')}
                        checkOpen={panel === 'check'}
                    />
                )
            )}

            {/* The Player view has a phone's ruler and nothing more, so it stays the map. */}
            {mode === 'players' && !pending && !targets && (
                <div className={`ttrpg-panel ttrpg-corner ttrpg-corner--left${idle ? ' ttrpg-hidden' : ''}`}>
                    <RulerPicker
                        tool={playTool}
                        onMeasure={(next) => setPlayTool(next ?? 'open-doors')}
                        start
                    />
                    <AttackButton onClick={startTargets} />
                </div>
            )}

            {mode === 'gm' && !pending && !idle && panel === 'fog' && (
                <FogPanel
                    settings={fogSettings}
                    onChange={setFogDraft}
                    onCommit={() => saveFog(fogDraft)}
                    onReset={() => saveFog(defaultFogSettings)}
                    onResetFog={resetFog}
                    onClose={() => setPanel(null)}
                />
            )}

            {mode === 'gm' && !pending && !idle && panel === 'initiative' && (
                <InitiativePanel fight={fight} tokens={shown} system={system} onChange={setFight} onClose={() => setPanel(null)} />
            )}

            {mode === 'gm' && !pending && !idle && panel === 'check' && (
                <CheckPanel check={check} players={shown.filter((token) => token.kind === 'player')} onSend={setCheck} onClose={() => setPanel(null)} />
            )}

            {mode === 'gm' && !pending && !idle && panel === 'monsters' && (
                <Monsters
                    controls={monsterControls}
                    monsters={monstersHere}
                    onClose={() => setPanel(null)}
                    onRemove={eraseMonster}
                    onError={message.error}
                />
            )}

            {/* In Edit only for now, with the tools that move monsters, so one can be dragged onto it
                even while it is empty. */}
            {mode === 'edit' && (tool === 'monsters' || tool === 'select' || tool === 'pick') && (
                <Tray
                    monsters={tray}
                    onPresetDrop={tool === 'monsters' ? (presetId) => fail(monsterControls.placeMonster(presetId, active.id, null)) : undefined}
                    onMenu={(id, at) => setMenu({ id, at })}
                />
            )}

            {menuToken && (
                <TokenMenu
                    token={menuToken}
                    at={menuAt}
                    grid={active.grid}
                    system={system}
                    onSetStats={(stats) => menuControls.setStats(menuToken.id, stats)}
                    onSetConditions={(conditions) => menuControls.setConditions(menuToken.id, conditions)}
                    onSetSize={(size) => menuControls.setSize(menuToken.id, size)}
                    onHit={
                        playing && !menuOnTray
                            ? () =>
                            {
                                startTargets();
                                setTargets([menuToken.id]);
                                setMenu(null);
                            }
                            : undefined
                    }
                    onHide={menuMonster && !menuOnTray ? () => fail(monsterControls.hide(menuToken.id, !menuToken.hidden)) : undefined}
                    onTray={
                        menuMonster && !menuOnTray && !playing
                            ? () =>
                            {
                                setMenu(null);
                                fail(monsterControls.stage(menuToken.id, null, true));
                            }
                            : undefined
                    }
                    onSetDetails={menuMonster ? (details) => monsterControls.setMonster(menuToken.id, details) : undefined}
                    onStatBlock={menuPreset ? () => setReading(reading === menuPreset.id ? null : menuPreset.id) : undefined}
                    statBlockOpen={Boolean(menuPreset) && reading === menuPreset?.id}
                    onRemove={menuRemove}
                    onClose={() => setMenu(null)}
                />
            )}

            {mode !== 'players' && readPreset && (
                <Popover title="Stat block" className={`ttrpg-statblock-panel${statBlockBeside}`} onClose={() => setReading(null)}>
                    <div className="ttrpg-popover__body">
                        <StatBlock markdown={readPreset.markdown} />
                    </div>
                </Popover>
            )}

            {showStats && stats && (
                <p className="ttrpg-panel ttrpg-stats" aria-hidden="true">
                    {`${stats.fps} fps · ${stats.frameMs.toFixed(1)} ms · worst ${stats.worstMs.toFixed(1)} ms`}
                </p>
            )}
        </main>
    );
}
