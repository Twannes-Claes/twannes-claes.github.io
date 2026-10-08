import { useConvexAuth } from '@convex-dev/auth/react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { Live, PropPicture, Scenario, Token } from '../types';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { explain, sessionStore, upload } from '../services/backend';
import { toAvatar } from '../services/images';

import { Backend } from './Backend';
import { Loading } from './Feedback';
import { MapEditor } from './MapEditor';

interface SessionEditorProps
{
    /** From ?s=, checked by the server, see convex/access.ts. */
    sessionId: string;
    debug: boolean;
}

interface Opened
{
    scenarios: Scenario[];
    library: PropPicture[];
}

/** Waits for a call, and turns its failure into a message the editor can show. */
function friendly(call: Promise<unknown>): Promise<void>
{
    return call.then(
        () => undefined,
        (reason: unknown) =>
        {
            throw new Error(explain(reason, 'That did not work. Check the connection and try again.'));
        },
    );
}

/** A monster's picture, shrunk like a player's and uploaded, or nothing without one. */
function monsterPicture(picture: Blob | null): Promise<Id<'_storage'> | undefined>
{
    if (!picture)
        return Promise.resolve(undefined);

    return toAvatar(picture).then(upload, () =>
    {
        throw new ConvexError('That picture could not be read. Pick another one.');
    });
}

/** Before the first tokens arrive, so the map gets the same empty list each time. */
const noTokens: Token[] = [];

/**
 * A saved session in the editor: loaded once when it opens, then the editor holds it and saves
 * changes back, see MapEditor. Playing it is live: whether it runs and where the tokens stand
 * follow the server, see convex/play.ts. Loaded on demand by pages/Editor.tsx, with Convex.
 */
export function SessionEditor(props: SessionEditorProps)
{
    return (
        <Backend>
            <Session {...props} />
        </Backend>
    );
}

function Session({ sessionId, debug }: SessionEditorProps)
{
    const { isLoading, isAuthenticated } = useConvexAuth();
    const convex = useConvex();
    const id = sessionId as Id<'sessions'>;
    const [store] = useState(() => sessionStore(id));
    const [opened, setOpened] = useState<Opened | null>(null);
    const [error, setError] = useState('');
    // Signing out in another tab stops these, rather than leaving them to fail.
    const following = opened && isAuthenticated;
    const status = useQuery(api.play.status, following ? { sessionId } : 'skip');
    const tokens = useQuery(api.play.tokens, following ? { sessionId: id } : 'skip');
    const fog = useQuery(api.play.fog, following ? { sessionId: id } : 'skip');
    const saveFog = useMutation(api.play.saveFog);
    const resetFog = useMutation(api.play.resetFog);
    const setFogLook = useMutation(api.play.setFogLook);
    const startSession = useMutation(api.play.start);
    const endSession = useMutation(api.play.end);
    const freezeSession = useMutation(api.play.freeze);
    const openScenario = useMutation(api.play.open);
    const moveToken = useMutation(api.play.move);
    const kickPlayer = useMutation(api.play.kick);
    const addNpc = useMutation(api.play.addMonster);
    const hideNpc = useMutation(api.play.hide);
    const removeNpc = useMutation(api.play.removeMonster);

    useEffect(() =>
    {
        if (!isAuthenticated)
            return;

        let cancelled = false;

        convex
            .query(api.sessions.load, { sessionId: id })
            .then((session) =>
            {
                if (!cancelled)
                    setOpened(session);

            })
            .catch((reason: unknown) =>
            {
                if (!cancelled)
                    setError(explain(reason, 'That session could not be opened.'));

            });

        return () =>
        {
            cancelled = true;
        };
    }, [convex, isAuthenticated, id]);

    const live: Live | undefined = status
        ? {
            live: status.live,
            frozen: status.frozen,
            password: status.password ?? '',
            activeScenarioId: status.activeScenarioId,
            tokens: tokens ?? noTokens,
            joinPath: `/ttrpg/join?s=${sessionId}`,
            start: (password, scenarioId, freshFog) =>
                friendly(startSession({ sessionId: id, password, scenarioId, freshFog })),
            end: () => friendly(endSession({ sessionId: id })),
            freeze: (frozen) => friendly(freezeSession({ sessionId: id, frozen })),
            open: (scenarioId) => friendly(openScenario({ sessionId: id, scenarioId })),
            move: (tokenId, to, path) =>
                friendly(moveToken({ tokenId: tokenId as Id<'tokens'>, x: to.x, y: to.y, path })),
            kick: (tokenId) => friendly(kickPlayer({ tokenId: tokenId as Id<'tokens'> })),
            addMonster: ({ picture, ...monster }, at) =>
                friendly(
                    monsterPicture(picture)
                        .then((storageId) => addNpc({ sessionId: id, ...monster, x: at.x, y: at.y, storageId }))
                        .then((added) =>
                        {
                            if (!added)
                                throw new ConvexError('That picture was refused. Pick another one.');

                        }),
                ),
            hide: (tokenId, hidden) => friendly(hideNpc({ tokenId: tokenId as Id<'tokens'>, hidden })),
            removeMonster: (tokenId) => friendly(removeNpc({ tokenId: tokenId as Id<'tokens'> })),
            fog: fog ?? null,
            saveFog: (shared) => friendly(saveFog({ sessionId: id, ...shared })),
            resetFog: () => friendly(resetFog({ sessionId: id })),
            fogLook: status.fogLook,
            setFogLook: (look) => friendly(setFogLook({ sessionId: id, look })),
        }
        : undefined;

    if (opened)
    {
        return (
            <MapEditor
                initial={opened.scenarios}
                library={opened.library}
                store={store}
                debug={debug}
                live={live}
            />
        );
    }

    const signedOut = !isLoading && !isAuthenticated;

    if (!signedOut && !error)
    {
        return (
            <main className="ttrpg-placeholder">
                <Loading>Opening the session</Loading>
            </main>
        );
    }

    return (
        <main className="ttrpg-placeholder">
            <h1>{signedOut ? 'Signed out' : 'Could not open it'}</h1>
            <p>{signedOut ? 'Sign in to open this session.' : error}</p>
            <p>
                <Link to="/ttrpg" className="ttrpg-link">
                    Back to your sessions
                </Link>
            </p>
        </main>
    );
}
