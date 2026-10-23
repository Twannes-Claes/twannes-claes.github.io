import {
    faCompress,
    faDiceD20,
    faExpand,
    faForwardStep,
    faImage,
    faRightFromBracket,
    faSnowflake,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useAuthActions, useAuthToken, useConvexAuth } from '@convex-dev/auth/react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useActionState, useEffect, useState, type ReactNode } from 'react';

import type { BloodSettings, FogSettings, GameSystem, HitKind, PlayerFight, Scenario } from '../types';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { defaultFogSettings } from '../map/fog';
import { defaultBlood } from '../map/health';
import type { FrameStats, PendingMove } from '../map/view';
import { confirmAction } from '../services/confirm';
import { explain, uploadAvatar } from '../services/backend';
import { toAvatar } from '../services/images';
import { sendDoor } from '../services/tableChannel';

import { Backend } from './Backend';
import { ConditionPicker } from './ConditionPicker';
import { Loading, Toast, Toasts } from './Feedback';
import { MapCanvas } from './MapCanvas';
import { AttackButton, HitSheet } from './HitSheet';
import { MoveSheet } from './MoveSheet';
import { RollSheet } from './RollSheet';
import { RulerPicker, type Measure } from './RulerPicker';
import { Settings } from './Settings';
import { StatsForm } from './StatsForm';
import { useMessage } from './useMessage';
import { useFullscreen, useIdle, useWakeLock } from './useScreen';
import { useScreenSettings } from './useScreenSettings';

/** Ring colours to start from, the portfolio's accent first. The player can pick any other. */
const ringColours = ['#683c9b', '#2f8f55', '#c27c2c', '#2c7cc2', '#b4443c', '#c2b22c'];

interface PlayerViewProps
{
    /** From ?s=, what the QR code holds. */
    sessionId: string;
    /** From ?table, the Player view for the table screen. Only the session's host gets it. */
    table: boolean;
}

/**
 * The phone side of a session: join with the password and a character, then move on the map.
 * Players never make an account: the page signs them in anonymously, which keeps them the same
 * player on this phone, so coming back skips joining. Loaded on demand by pages/Join.tsx.
 */
export function PlayerView(props: PlayerViewProps)
{
    return (
        <Backend>
            <Player {...props} />
        </Backend>
    );
}

/** A message in the middle of the screen, for every state before the map. */
function Note({ children }: { children: ReactNode })
{
    return <main className="ttrpg-placeholder">{children}</main>;
}

function Player({ sessionId, table }: PlayerViewProps)
{
    const { isLoading, isAuthenticated } = useConvexAuth();
    const { signIn } = useAuthActions();
    const [offline, setOffline] = useState(false);
    const status = useQuery(api.play.status, isAuthenticated ? { sessionId } : 'skip');

    useEffect(() =>
    {
        if (!isLoading && !isAuthenticated)
            signIn('anonymous').catch(() => setOffline(true));

    }, [isLoading, isAuthenticated, signIn]);

    if (offline)
    {
        return (
            <Note>
                <h1>No connection</h1>
                <p>Check the Wi-Fi or mobile data, then scan the QR code again.</p>
            </Note>
        );
    }

    if (status === undefined)
        return <Note><Loading>Connecting</Loading></Note>;

    if (status === null)
    {
        return (
            <Note>
                <h1>Session not found</h1>
                <p>Scan the QR code on the table again.</p>
            </Note>
        );
    }

    if (!status.live)
    {
        return (
            <Note>
                <h1>{status.name}</h1>
                {/* Ending the session takes every player's token, so ended and not started yet
                    look the same here, see end in convex/play.ts. */}
                <p>No game right now. This page opens the table as soon as the GM starts.</p>
            </Note>
        );
    }

    if (table && status.host)
        return <Table sessionId={status.sessionId} mine={null} frozen={status.frozen} fogLook={status.fogLook} blood={status.blood} system={status.system} fight={status.fight} />;

    if (status.kicked)
    {
        return (
            <Note>
                <h1>{status.name}</h1>
                <p>The GM removed you from this table.</p>
            </Note>
        );
    }

    if (!status.mine)
        return <JoinForm sessionId={status.sessionId} name={status.name} />;

    return <Table sessionId={status.sessionId} mine={status.mine} frozen={status.frozen} fogLook={status.fogLook} blood={status.blood} system={status.system} fight={status.fight} />;
}

interface JoinFormProps
{
    sessionId: Id<'sessions'>;
    /** The session's name, as a title. */
    name: string;
}

/**
 * Joining in two short steps: the password the game master says out loud, then the character's
 * name, ring colour and picture. The token appears at the spawn point when it is done.
 */
function JoinForm({ sessionId, name }: JoinFormProps)
{
    const convex = useConvex();
    const join = useMutation(api.play.join);
    const authToken = useAuthToken();
    const [password, setPassword] = useState<string | null>(null);
    const [colour] = useState(() => ringColours[Math.floor(Math.random() * ringColours.length)]);
    const [pictureName, setPictureName] = useState('');

    const [wrong, check, checking] = useActionState(
        (_: string, form: FormData) =>
        {
            const typed = String(form.get('password'));

            return convex
                .mutation(api.play.check, { sessionId, password: typed })
                .then((right) =>
                {
                    if (!right)
                        return 'That is not the password. Ask the GM.';

                    setPassword(typed);

                    return '';
                })
                .catch((reason: unknown) => explain(reason, 'Could not check the password. Check the connection.'));
        },
        '',
    );

    // The picture is shrunk first, so one the phone cannot read is said here, before joining. It
    // goes up after the token exists, since only a player who joined may upload, and by then this
    // form is gone: a picture that fails to upload leaves the token with its initial.
    const [failure, create, creating] = useActionState((_: string, form: FormData) =>
    {
        const picture = form.get('picture');
        const avatar = picture instanceof File && picture.size > 0 ? toAvatar(picture) : Promise.resolve(null);

        // The form empties its file field itself once this is done, so the name shown goes now.
        setPictureName('');
        const character = {
            sessionId,
            password: password ?? '',
            name: String(form.get('name')),
            color: String(form.get('color')),
            maxHp: Number(form.get('maxHp')),
            ac: Number(form.get('ac')),
            perception: Number(form.get('perception')),
        };

        return avatar.then(
            (blob) =>
                join(character)
                    .then(async (tokenId) =>
                    {
                        // The GM changed the password since it was checked, by starting again.
                        if (!tokenId)
                            return 'The password changed. Reload the page and type the new one.';

                        if (blob)
                            await uploadAvatar(sessionId, blob, authToken);

                        return '';
                    })
                    .catch((reason: unknown) => explain(reason, 'Joining did not work. Check the connection and try again.')),
            () => 'That picture could not be read. Pick another one, or join without one.',
        );
    }, '');

    if (password === null)
    {
        return (
            <main className="ttrpg-dashboard ttrpg-player">
                <header className="ttrpg-dashboard__header">
                    <h1>{name}</h1>
                    <p>Join the table.</p>
                </header>
                <form action={check} className="ttrpg-panel ttrpg-card">
                    <label className="ttrpg-field">
                        Password
                        <input name="password" type="password" autoComplete="off" required autoFocus />
                    </label>
                    {wrong && <p className="ttrpg-error" role="alert">{wrong}</p>}
                    <button type="submit" className="ttrpg-button ttrpg-button--confirm" disabled={checking}>
                        {checking ? 'Checking' : 'Next'}
                    </button>
                </form>
            </main>
        );
    }

    return (
        <main className="ttrpg-dashboard ttrpg-player">
            <header className="ttrpg-dashboard__header">
                <h1>Your character</h1>
                <p>A name, a colour for the ring around your token, a picture, and a few numbers off your sheet.</p>
            </header>
            <form action={create} className="ttrpg-panel ttrpg-card">
                <label className="ttrpg-field">
                    Name
                    <input name="name" maxLength={30} autoComplete="off" required autoFocus />
                </label>
                <label className="ttrpg-field">
                    Ring colour
                    <input name="color" type="color" defaultValue={colour} />
                </label>
                <div className="ttrpg-field">
                    Picture, from the camera or your photos
                    <label className="ttrpg-segment">
                        <FontAwesomeIcon icon={faImage} />
                        <span>{pictureName || 'Choose a picture'}</span>
                        <input
                            name="picture"
                            type="file"
                            accept="image/*"
                            className="ttrpg-hidden-input"
                            onChange={(event) => setPictureName(event.target.files?.[0]?.name ?? '')}
                        />
                    </label>
                </div>
                {/* Only you and the GM see these. The rest of the table sees how hurt you look. */}
                <div className="ttrpg-fields">
                    <label className="ttrpg-field">
                        Max HP
                        <input name="maxHp" type="number" inputMode="numeric" min={1} max={9999} required />
                    </label>
                    <label className="ttrpg-field">
                        AC
                        <input name="ac" type="number" inputMode="numeric" min={0} max={50} required />
                    </label>
                    <label className="ttrpg-field" title="Passive Perception">
                        Perception
                        <input name="perception" type="number" inputMode="numeric" min={0} max={50} required />
                    </label>
                </div>
                {failure && <p className="ttrpg-error" role="alert">{failure}</p>}
                <button type="submit" className="ttrpg-button ttrpg-button--confirm" disabled={creating}>
                    {creating ? 'Joining' : 'Join'}
                </button>
            </form>
        </main>
    );
}

interface TableProps
{
    sessionId: Id<'sessions'>;
    /** The player's own token, or null on the table screen, where the GM moves any token. */
    mine: Id<'tokens'> | null;
    frozen: boolean;
    /** How the GM set the fog to look, null for the default. */
    fogLook: FogSettings | null;
    /** Which blood the GM lets show, null for all of it. */
    blood: BloodSettings | null;
    /** The session's game, whose conditions the player picks from. */
    system: GameSystem;
    /** The fight as this screen hears of it, null while there is none. */
    fight: PlayerFight | null;
}

/**
 * The map on the phone: everyone's tokens and the fog, and paths drawn from the player's own
 * token. Without one it is the Player view on the table screen, the editor's own Player view
 * without its top bar: the GM opens doors and moves any token from it. Kept awake, its buttons
 * fade out like the GM view's controls, and it saves what the party saw, so the fog is remembered
 * while the GM view is in Edit, see saveFog in convex/play.ts.
 */
function Table({ sessionId, mine, frozen, fogLook, blood, system, fight }: TableProps)
{
    const onTable = mine === null;
    // What a press does with no ruler on: open doors on the table screen, as in the editor, or on
    // a phone draw paths from the own token.
    const resting = onTable ? 'open-doors' : 'select';
    const scenario = useQuery(api.play.scenario, { sessionId });
    const tokens = useQuery(api.play.tokens, { sessionId, asPlayer: onTable });
    const fog = useQuery(api.play.fog, { sessionId });
    const ping = useQuery(api.play.ping, { sessionId });
    const lastHit = useQuery(api.play.lastHit, { sessionId, asPlayer: onTable });
    const decals = useQuery(api.play.decals, { sessionId, asPlayer: onTable });
    const hit = useMutation(api.play.hit);
    // The tokens picked for an attack or a heal, or null when not picking, see HitSheet.
    const [targets, setTargets] = useState<string[] | null>(null);
    const drafts = useQuery(api.play.drafts, { sessionId, asPlayer: onTable });
    const marks = useQuery(api.play.marks, { sessionId, asPlayer: onTable });
    const mark = useMutation(api.play.mark);
    const [tool, setTool] = useState<Measure | typeof resting>(resting);
    // A door the table screen just opened or closed, shown until the editor's save of it comes
    // back as a new scenario, see services/tableChannel.ts.
    const [doorMoved, setDoorMoved] = useState<{ from: Scenario; to: Scenario } | null>(null);
    const move = useMutation(api.play.move);
    const sendPing = useMutation(api.play.sendPing);
    const leaveTable = useMutation(api.play.leave);
    const draw = useMutation(api.play.draw);
    const saveFog = useMutation(api.play.saveFog);
    const saveStats = useMutation(api.play.setStats);
    const saveConditions = useMutation(api.play.setConditions);
    const rollInitiative = useMutation(api.play.rollInitiative);
    const endTurn = useMutation(api.play.endTurn);
    const authToken = useAuthToken();
    const [pending, setPending] = useState<PendingMove | null>(null);
    // The map the path and targets were made on. When the GM opens another, they go: confirmed,
    // the old map's path would move the token on the new one.
    const [mapId, setMapId] = useState(scenario?.id);

    if (scenario && scenario.id !== mapId)
    {
        setMapId(scenario.id);
        setPending(null);
        setTargets(null);
    }

    const message = useMessage();
    const [screen, setScreen] = useScreenSettings();
    const [stats, setStats] = useState<FrameStats | null>(null);
    const [uploading, setUploading] = useState(false);
    const { fullscreen, toggle } = useFullscreen();
    const idle = useIdle(screen.hideAfter, onTable && screen.hideAfter > 0);

    useWakeLock(onTable);

    if (scenario === undefined || tokens === undefined)
        return <Note><Loading>Opening the map</Loading></Note>;

    if (tokens === null)
        return <Note>You are no longer at this table. Scan the QR code to join again.</Note>;

    if (!scenario)
        return <Note><Loading>The GM is setting up the map</Loading></Note>;

    const token = tokens.find((candidate) => candidate.id === mine);
    // The one walking the drawn path: the own token on a phone, any on the table screen.
    const walker = pending ? tokens.find((candidate) => candidate.id === pending.id) : undefined;
    const shown = doorMoved && doorMoved.from === scenario ? doorMoved.to : scenario;

    const failed = (reason: unknown) => message.error(explain(reason, 'That move did not go through. Try again.'));

    // In a fight a phone waits for its turn to move or attack; it rolls first, see Initiative.
    // Without a roll by Begin it sits the fight out, free to move, and only the GM can add it.
    const myTurn = fight?.begun === true && fight.turn === mine;
    const sitsOut = fight?.begun === true && !fight.rolled;
    const held = frozen || (!onTable && fight !== null && !myTurn && !sitsOut);
    const rolling = !onTable && mine !== null && fight !== null && !fight.begun && !fight.rolled;
    const turnName = fight?.turn === 'enemy' ? 'Enemy' : tokens.find((candidate) => candidate.id === fight?.turn)?.name;

    const sendRoll = (roll: number) =>
        rollInitiative({ sessionId, roll }).then(
            () => undefined,
            (reason: unknown) =>
            {
                throw new Error(explain(reason, 'That roll did not go through. Try again.'));
            },
        );

    const picked = targets ? tokens.filter((candidate) => targets.includes(candidate.id)) : [];

    const dealHit = (kind: HitKind, amount: number) =>
        hit({ sessionId, tokenIds: picked.map((target) => target.id as Id<'tokens'>), kind, amount }).then(
            () => setTargets(null),
            (reason: unknown) =>
            {
                throw new Error(explain(reason, 'That did not go through. Try again.'));
            },
        );

    const pickTarget = (id: string) =>
        setTargets((current) => current && (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));

    const startTargets = () =>
    {
        setTool(resting);
        setTargets([]);
    };

    const confirm = () =>
    {
        if (!pending)
            return;

        const end = pending.points[pending.points.length - 1];

        setPending(null);
        message.clear();
        move({ tokenId: pending.id as Id<'tokens'>, ...end, path: pending.points }).catch(failed);
    };

    // The door tool hands back the whole map; the one door that changed goes to the editor.
    const doorChanged = (next: Scenario) =>
    {
        const wall = next.walls.find((candidate, index) => candidate.door && candidate.door.open !== shown.walls[index]?.door?.open);

        if (!wall?.door)
            return;

        setDoorMoved({ from: scenario, to: next });
        sendDoor(sessionId, { scenarioId: next.id, wallId: wall.id, open: wall.door.open });
    };

    // The token goes, and the page turns back to the join form, see Player.
    const leave = () =>
    {
        void confirmAction('Leave the table? Your token goes, and you can join again with the password.', 'Leave').then((yes) =>
        {
            if (yes)
                leaveTable({ sessionId }).catch((reason: unknown) => message.error(explain(reason, 'Leaving did not go through. Try again.')));

        });
    };

    // A new picture for the token, or a first one for a player who joined without. The old one is
    // deleted by the server, see keepAvatar in convex/play.ts.
    const changePicture = (picture: File | undefined) =>
    {
        if (!picture)
            return;

        message.clear();
        setUploading(true);
        toAvatar(picture)
            .then(
                async (blob) =>
                {
                    const kept = await uploadAvatar(sessionId, blob, authToken);

                    if (kept)
                        message.done('Your token has its new picture.');
                    else
                        message.error('That picture was refused. Pick another one.');

                },
                () => message.error('That picture could not be read. Pick another one.'),
            )
            .catch((reason: unknown) => message.error(explain(reason, 'The picture did not upload. Check the connection and try again.')))
            .finally(() => setUploading(false));
    };

    return (
        <main className="ttrpg-player">
            {onTable && (
                <div className={`ttrpg-panel ttrpg-corner${idle ? ' ttrpg-hidden' : ''}`}>
                    <button
                        type="button"
                        className="ttrpg-segment"
                        aria-label={fullscreen ? 'Leave full screen' : 'Full screen'}
                        title={fullscreen ? 'Leave full screen' : 'Full screen'}
                        onClick={toggle}
                    >
                        <FontAwesomeIcon icon={fullscreen ? faCompress : faExpand} />
                    </button>
                </div>
            )}

            {/* Both corners make way for the move sheet and the hit sheet at the bottom. */}
            {!pending && !targets && !rolling && (
                <div className={`ttrpg-panel ttrpg-corner ttrpg-corner--left${idle ? ' ttrpg-hidden' : ''}`}>
                    <RulerPicker
                        tool={tool}
                        onMeasure={(next) => setTool(next ?? resting)}
                        start
                    />
                    {/* Frozen, or waiting for their turn, players cannot attack, see play.hit. */}
                    <AttackButton onClick={startTargets} disabled={held && !onTable} />
                    {myTurn && (
                        <button
                            type="button"
                            className="ttrpg-segment ttrpg-segment--confirm"
                            onClick={() => void endTurn({ sessionId }).catch((reason: unknown) => message.error(explain(reason, 'That did not go through. Try again.')))}
                        >
                            <FontAwesomeIcon icon={faForwardStep} />
                            End turn
                        </button>
                    )}
                </div>
            )}

            {rolling && !pending && !targets && (
                <RollSheet title="Roll initiative" note={system === 'pf2e' ? 'Usually your Perception' : undefined} onSend={sendRoll} />
            )}

            {!onTable && !pending && !targets && (
                <div className="ttrpg-panel ttrpg-corner">
                    <Settings settings={screen} onChange={setScreen} phone>
                        <section className="ttrpg-shortcuts" aria-label="Your token">
                            <h3 className="ttrpg-subhead">Your token</h3>
                            <div className="ttrpg-token-actions">
                                <label className="ttrpg-segment ttrpg-segment--block" aria-disabled={uploading}>
                                    <FontAwesomeIcon icon={faImage} />
                                    {uploading ? 'Uploading' : 'Change picture'}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="ttrpg-hidden-input"
                                        disabled={uploading}
                                        onChange={(event) =>
                                        {
                                            changePicture(event.target.files?.[0]);
                                            event.target.value = '';
                                        }}
                                    />
                                </label>
                                <button type="button" className="ttrpg-segment ttrpg-segment--block" onClick={leave}>
                                    <FontAwesomeIcon icon={faRightFromBracket} />
                                    Leave table
                                </button>
                            </div>
                        </section>
                        {token && mine && (
                            <section className="ttrpg-shortcuts" aria-label="Your numbers">
                                <h3 className="ttrpg-subhead">Your numbers</h3>
                                <StatsForm
                                    token={token}
                                    onSave={(stats) =>
                                        saveStats({ tokenId: mine, ...stats }).then(
                                            () => message.done('Your numbers are saved.'),
                                            (reason: unknown) =>
                                            {
                                                throw new Error(explain(reason, 'That did not save. Check the connection and try again.'));
                                            },
                                        )}
                                />
                            </section>
                        )}
                        {token && mine && (
                            <section className="ttrpg-shortcuts" aria-label="Your conditions">
                                <h3 className="ttrpg-subhead">Your conditions</h3>
                                <ConditionPicker
                                    system={system}
                                    conditions={token.conditions ?? []}
                                    onChange={(conditions) =>
                                        saveConditions({ tokenId: mine, conditions }).then(
                                            () => undefined,
                                            (reason: unknown) =>
                                            {
                                                throw new Error(explain(reason, 'That did not save. Check the connection and try again.'));
                                            },
                                        )}
                                />
                            </section>
                        )}
                    </Settings>
                </div>
            )}

            <MapCanvas
                scenario={shown}
                tokens={tokens}
                mode="play"
                tool={tool}
                placing={null}
                fogEpoch={0}
                pending={pending}
                frozen={held}
                turn={fight?.turn === 'enemy' ? null : (fight?.turn ?? null)}
                peek={false}
                // Null in the Player view's window, where every token answers the GM.
                own={mine}
                onTokenMove={onTable ? (id, to) => void move({ tokenId: id as Id<'tokens'>, ...to }).catch(failed) : undefined}
                onScenarioChange={onTable ? doorChanged : undefined}
                shared={fog ?? null}
                // A failed save is not said: the next sends everything seen, filling the gap.
                onExplored={onTable ? (shared) => void saveFog({ sessionId, ...shared }).catch(() => undefined) : undefined}
                fogSettings={fogLook ?? defaultFogSettings}
                onPathEnd={setPending}
                onPathCancel={() => setPending(null)}
                // A right click with nothing half done puts the ruler away, as in the editor.
                onToolCancel={() => (targets ? setTargets(null) : setTool(resting))}
                hit={lastHit}
                decals={decals}
                blood={blood ?? defaultBlood}
                targets={targets}
                onTarget={pickTarget}
                onStats={screen.frameRate ? setStats : undefined}
                drafts={drafts}
                marks={marks}
                // Only a preview for the table, like a path being drawn. The table screen keeps its
                // own: it runs as the host, so its ruler would come back to it as the GM's too.
                onMark={onTable ? undefined : (next) => void mark({ sessionId, mark: next }).catch(() => undefined)}
                onDraft={(id, points, feet) =>
                    void draw({ tokenId: id as Id<'tokens'>, points, feet }).catch(() =>
                    {
                        // Only a preview for the table: the move itself still checks and says what failed.
                    })}
                ping={ping}
                onPing={(at) =>
                    void sendPing({ sessionId, ...at }).catch((reason: unknown) =>
                        message.error(explain(reason, 'That ping did not go through. Try again.')),
                    )}
            />

            <Toasts>
                {frozen && (
                    <Toast kind="info" icon={faSnowflake}>
                        Movement paused by the GM
                    </Toast>
                )}
                {fight && !fight.begun && (onTable || fight.rolled) && (
                    <Toast kind="info" icon={faDiceD20}>
                        Rolling for initiative
                    </Toast>
                )}
                {fight?.begun && turnName && (
                    <Toast kind="info" icon={faDiceD20}>
                        {myTurn ? 'Your turn' : `${turnName}'s turn`}
                    </Toast>
                )}
                {fight?.upNext && !myTurn && (
                    <Toast kind="info" icon={faForwardStep}>
                        You are up next
                    </Toast>
                )}
                {uploading && <Toast kind="busy">Uploading your picture</Toast>}
                {message.message && (
                    <Toast kind={message.message.kind} onClose={message.clear}>
                        {message.message.text}
                    </Toast>
                )}
            </Toasts>

            <MoveSheet move={pending} token={walker} onMove={confirm} onCancel={() => setPending(null)} />

            {targets && (
                <HitSheet
                    targets={picked}
                    // A player heals players only; the GM's table screen heals anyone.
                    canHeal={onTable || picked.every((target) => target.kind === 'player')}
                    onApply={dealHit}
                    onCancel={() => setTargets(null)}
                />
            )}

            {screen.frameRate && stats && (
                <p className="ttrpg-panel ttrpg-stats" aria-hidden="true">
                    {`${stats.fps} fps Â· ${stats.frameMs.toFixed(1)} ms Â· worst ${stats.worstMs.toFixed(1)} ms`}
                </p>
            )}
        </main>
    );
}
