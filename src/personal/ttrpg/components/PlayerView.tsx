import { faImage, faSnowflake } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useActionState, useEffect, useState, type ReactNode } from 'react';

import type { FogSettings } from '../types';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { defaultFogSettings } from '../map/fog';
import type { PendingMove } from '../map/view';
import { explain, upload } from '../services/backend';
import { toAvatar } from '../services/images';

import { Backend } from './Backend';
import { Loading, Toast, Toasts } from './Feedback';
import { MapCanvas } from './MapCanvas';
import { MoveSheet } from './MoveSheet';
import { useMessage } from './useMessage';

/** Ring colours to start from, the portfolio's accent first. The player can pick any other. */
const ringColours = ['#683c9b', '#2f8f55', '#c27c2c', '#2c7cc2', '#b4443c', '#c2b22c'];

interface PlayerViewProps
{
    /** From ?s=, what the QR code holds. */
    sessionId: string;
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

function Player({ sessionId }: PlayerViewProps)
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
                <p>{status.mine ? 'The session has ended. Thanks for playing!' : 'The session has not started yet.'}</p>
            </Note>
        );
    }

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

    return <Table sessionId={status.sessionId} mine={status.mine} frozen={status.frozen} fogLook={status.fogLook} />;
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
    const avatarUrl = useMutation(api.play.avatarUrl);
    const setAvatar = useMutation(api.play.setAvatar);
    const [password, setPassword] = useState<string | null>(null);
    const [colour] = useState(() => ringColours[Math.floor(Math.random() * ringColours.length)]);

    const [wrong, check, checking] = useActionState(
        (_: string, form: FormData) =>
        {
            const typed = String(form.get('password'));

            return convex
                .query(api.play.check, { sessionId, password: typed })
                .then((right) =>
                {
                    if (!right)
                        return 'That is not the password. Ask the GM.';

                    setPassword(typed);

                    return '';
                })
                .catch(() => 'Could not check the password. Check the connection.');
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
        const character = {
            sessionId,
            password: password ?? '',
            name: String(form.get('name')),
            color: String(form.get('color')),
        };

        return avatar.then(
            (blob) =>
                join(character)
                    .then(async () =>
                    {
                        if (blob)
                            await setAvatar({ sessionId, storageId: await upload(blob, await avatarUrl({ sessionId })) });

                        return '';
                    })
                    .catch((reason: unknown) => explain(reason, 'Joining did not work. Check the connection and try again.')),
            () => 'That picture could not be read. Pick another one, or join without one.',
        );
    }, '');

    if (password === null)
    {
        return (
            <main className="ttrpg-dashboard">
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
        <main className="ttrpg-dashboard">
            <header className="ttrpg-dashboard__header">
                <h1>Your character</h1>
                <p>A name, a colour for the ring around your token, and a picture.</p>
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
                <label className="ttrpg-field">
                    Picture, from the camera or your photos
                    <input name="picture" type="file" accept="image/*" />
                </label>
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
    mine: Id<'tokens'>;
    frozen: boolean;
    /** How the GM set the fog to look, null for the default. */
    fogLook: FogSettings | null;
}

/** The map on the phone: everyone's tokens and the fog, and paths drawn from the player's own token. */
function Table({ sessionId, mine, frozen, fogLook }: TableProps)
{
    const scenario = useQuery(api.play.scenario, { sessionId });
    const tokens = useQuery(api.play.tokens, { sessionId });
    const fog = useQuery(api.play.fog, { sessionId });
    const move = useMutation(api.play.move);
    const avatarUrl = useMutation(api.play.avatarUrl);
    const setAvatar = useMutation(api.play.setAvatar);
    const [pending, setPending] = useState<PendingMove | null>(null);
    const message = useMessage();
    const [uploading, setUploading] = useState(false);

    if (scenario === undefined || tokens === undefined)
        return <Note><Loading>Opening the map</Loading></Note>;

    if (tokens === null)
        return <Note>You are no longer at this table. Scan the QR code to join again.</Note>;

    if (!scenario)
        return <Note><Loading>The GM is setting up the map</Loading></Note>;

    const token = tokens.find((candidate) => candidate.id === mine);

    const confirm = () =>
    {
        if (!pending)
            return;

        const end = pending.points[pending.points.length - 1];

        setPending(null);
        message.clear();
        move({ tokenId: mine, ...end, path: pending.points }).catch((reason: unknown) =>
            message.error(explain(reason, 'That move did not go through. Try again.')),
        );
    };

    // A new picture for the token, or a first one for a player who joined without. The old one is
    // deleted by the server, see setAvatar in convex/play.ts.
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
                    const kept = await setAvatar({ sessionId, storageId: await upload(blob, await avatarUrl({ sessionId })) });

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
        <main>
            <div className="ttrpg-panel ttrpg-modes">
                <label className="ttrpg-segment" aria-disabled={uploading}>
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
            </div>

            <MapCanvas
                scenario={scenario}
                tokens={tokens}
                mode="play"
                tool="select"
                placing={null}
                fogEpoch={0}
                pending={pending}
                frozen={frozen}
                peek={false}
                own={mine}
                shared={fog ?? null}
                fogSettings={fogLook ?? defaultFogSettings}
                onPathEnd={setPending}
                onPathCancel={() => setPending(null)}
            />

            <Toasts>
                {frozen && (
                    <Toast kind="info" icon={faSnowflake}>
                        Movement paused by the GM
                    </Toast>
                )}
                {uploading && <Toast kind="busy">Uploading your picture</Toast>}
                {message.message && (
                    <Toast kind={message.message.kind} onClose={message.clear}>
                        {message.message.text}
                    </Toast>
                )}
            </Toasts>

            <MoveSheet move={pending} token={token} onMove={confirm} onCancel={() => setPending(null)} />
        </main>
    );
}
