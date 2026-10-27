import { useConvexAuth } from '@convex-dev/auth/react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { Decal, DiceRoll, Draft, Drawing, Live, PictureBytes, Preset, PropPicture, Scenario, SharedMark, Token, Track } from '../types';

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
    /** Every stored file that is not a prop, see load in convex/sessions.ts. */
    otherBytes: number;
    backgrounds: PictureBytes[];
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

/** A preset's picture, shrunk like a player's and uploaded, or nothing without one. */
function presetPicture(picture: Blob | null): Promise<Id<'_storage'> | undefined>
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
const noDrafts: Draft[] = [];
const noMarks: SharedMark[] = [];
const noDrawings: Drawing[] = [];
const noDecals: Decal[] = [];
const noRolls: DiceRoll[] = [];
const noPresets: Preset[] = [];
const noTracks: Track[] = [];
const noMonsters: Live['monsters'] = [];

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
    // Every tab shares one sign-in, so joining as a player in another tab signs this one in as that
    // player. Signing out, or in as someone else, stops these rather than leaving them to fail.
    const me = useQuery(api.hosts.me, isAuthenticated ? {} : 'skip');
    const hosting = me?.role === 'host' || me?.role === 'owner';
    const notHost = !isLoading && (!isAuthenticated || me !== undefined) && !hosting;
    const following = opened && hosting;
    const status = useQuery(api.play.status, following ? { sessionId } : 'skip');
    const tokens = useQuery(api.play.tokens, following ? { sessionId: id } : 'skip');
    const fog = useQuery(api.play.fog, following ? { sessionId: id } : 'skip');
    const ping = useQuery(api.play.ping, following ? { sessionId: id } : 'skip');
    const lastHit = useQuery(api.play.lastHit, following ? { sessionId: id } : 'skip');
    const decals = useQuery(api.play.decals, following ? { sessionId: id } : 'skip');
    const drafts = useQuery(api.play.drafts, following ? { sessionId: id } : 'skip');
    const marks = useQuery(api.play.marks, following ? { sessionId: id } : 'skip');
    const drawings = useQuery(api.play.drawings, following ? { sessionId: id } : 'skip');
    const presets = useQuery(api.presets.list, following ? {} : 'skip');
    const monsters = useQuery(api.play.monsters, following ? { sessionId: id } : 'skip');
    const placeMonster = useMutation(api.play.placeMonster);
    const setMonster = useMutation(api.play.setMonster);
    const savePreset = useMutation(api.presets.save);
    const removePreset = useMutation(api.presets.remove);
    const tracks = useQuery(api.music.list, following ? {} : 'skip');
    const saveTrack = useMutation(api.music.save);
    const removeTrack = useMutation(api.music.remove);
    const saveFog = useMutation(api.play.saveFog);
    const resetFog = useMutation(api.play.resetFog);
    const setFogLook = useMutation(api.play.setFogLook);
    const setBlood = useMutation(api.play.setBlood);
    const setSecretSaves = useMutation(api.play.setSecretSaves);
    const setSystem = useMutation(api.sessions.setSystem);
    const setInitiative = useMutation(api.play.setInitiative);
    const setUpNext = useMutation(api.play.setUpNext);
    const setCheck = useMutation(api.play.setCheck);
    const rolls = useQuery(api.dice.list, following ? { sessionId: id } : 'skip');
    const roll = useMutation(api.dice.roll);
    const startSession = useMutation(api.play.start);
    const endSession = useMutation(api.play.end);
    const freezeSession = useMutation(api.play.freeze);
    const openScenario = useMutation(api.play.open);
    const moveToken = useMutation(api.play.move);
    const kickPlayer = useMutation(api.play.kick);
    const hideNpc = useMutation(api.play.hide);
    const stageNpc = useMutation(api.play.stage);
    const removeNpc = useMutation(api.play.removeMonster);
    const setStats = useMutation(api.play.setStats);
    const setConditions = useMutation(api.play.setConditions);
    const setSize = useMutation(api.play.setSize);
    const hit = useMutation(api.play.hit);
    const clearDecals = useMutation(api.play.clearDecals);
    const sendPing = useMutation(api.play.sendPing);
    const draw = useMutation(api.play.draw);
    const mark = useMutation(api.play.mark);
    const drawLine = useMutation(api.play.drawLine);
    const eraseDrawings = useMutation(api.play.eraseDrawings);

    useEffect(() =>
    {
        if (!hosting)
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
    }, [convex, hosting, id]);

    const live: Live | undefined = status
        ? {
            sessionId,
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
            monsters: monsters ?? noMonsters,
            placeMonster: (presetId, scenarioId, at, stack) =>
                friendly(placeMonster({ sessionId: id, scenarioId, presetId: presetId as Id<'presets'>, at, stack })),
            setMonster: (tokenId, monster) => friendly(setMonster({ tokenId: tokenId as Id<'tokens'>, ...monster })),
            hide: (tokenId, hidden) => friendly(hideNpc({ tokenId: tokenId as Id<'tokens'>, hidden })),
            stage: (tokenId, at, hidden) => friendly(stageNpc({ tokenId: tokenId as Id<'tokens'>, at, hidden })),
            removeMonster: (tokenId) => friendly(removeNpc({ tokenId: tokenId as Id<'tokens'> })),
            setStats: (tokenId, stats) => friendly(setStats({ tokenId: tokenId as Id<'tokens'>, ...stats })),
            setConditions: (tokenId, conditions) => friendly(setConditions({ tokenId: tokenId as Id<'tokens'>, conditions })),
            setSize: (tokenId, size) => friendly(setSize({ tokenId: tokenId as Id<'tokens'>, size })),
            lastHit: lastHit ?? null,
            hit: (tokenIds, kind, amount) => friendly(hit({ sessionId: id, tokenIds: tokenIds as Id<'tokens'>[], kind, amount })),
            decals: decals ?? noDecals,
            clearDecals: () => friendly(clearDecals({ sessionId: id })),
            fog: fog ?? null,
            saveFog: (shared, forget) => friendly(saveFog({ sessionId: id, ...shared, forget })),
            resetFog: () => friendly(resetFog({ sessionId: id })),
            ping,
            sendPing: (at) => friendly(sendPing({ sessionId: id, ...at })),
            drafts: drafts ?? noDrafts,
            draw: (tokenId, points, feet) => friendly(draw({ tokenId: tokenId as Id<'tokens'>, points, feet })),
            marks: marks ?? noMarks,
            mark: (next) => friendly(mark({ sessionId: id, mark: next })),
            drawings: drawings ?? noDrawings,
            drawLine: (key, points, pen) => friendly(drawLine({ sessionId: id, key, points, pen })),
            eraseDrawings: (ids) => friendly(eraseDrawings({ sessionId: id, drawingIds: ids as Id<'drawings'>[] })),
            fogLook: status.fogLook,
            setFogLook: (look) => friendly(setFogLook({ sessionId: id, look })),
            blood: status.blood,
            setBlood: (blood) => friendly(setBlood({ sessionId: id, blood })),
            secretSaves: status.secretSaves,
            setSecretSaves: (secret) => friendly(setSecretSaves({ sessionId: id, secret })),
            system: status.system,
            setSystem: (system) => friendly(setSystem({ sessionId: id, system })),
            initiative: status.initiative,
            setInitiative: (fight) => friendly(setInitiative({ sessionId: id, initiative: fight })),
            check: status.check,
            setCheck: (check) => friendly(setCheck({ sessionId: id, check })),
            rolls: rolls ?? noRolls,
            roll: (ask) => friendly(roll({ sessionId: id, ...ask })),
            upNext: status.upNext,
            setUpNext: (on) => friendly(setUpNext({ sessionId: id, upNext: on })),
            presets: presets ?? noPresets,
            savePreset: (preset, picture, presetId) =>
                presetPicture(picture)
                    .then((storageId) => savePreset({ ...preset, storageId, presetId: presetId as Id<'presets'> | undefined }))
                    .then((saved) =>
                    {
                        if (!saved)
                            throw new ConvexError('That picture was refused. Pick another one.');

                        return saved;
                    })
                    .catch((reason: unknown) =>
                    {
                        throw new Error(explain(reason, 'That preset did not save. Try again.'));
                    }),
            removePreset: (presetId) => friendly(removePreset({ presetId: presetId as Id<'presets'> })),
            tracks: tracks ?? noTracks,
            saveTrack: (track, trackId) => friendly(saveTrack({ ...track, trackId: trackId as Id<'music'> | undefined })),
            removeTrack: (trackId) => friendly(removeTrack({ trackId: trackId as Id<'music'> })),
        }
        : undefined;

    if (opened && !notHost)
    {
        return (
            <MapEditor
                initial={opened.scenarios}
                library={opened.library}
                otherBytes={opened.otherBytes}
                backgrounds={opened.backgrounds}
                store={store}
                debug={debug}
                live={live}
            />
        );
    }

    if (!notHost && !error)
    {
        return (
            <main className="ttrpg-placeholder">
                <Loading>Opening the session</Loading>
            </main>
        );
    }

    return (
        <main className="ttrpg-placeholder">
            <h1>{notHost ? 'Signed out' : 'Could not open it'}</h1>
            <p>{notHost ? 'This browser is not signed in as the host. Sign in with Discord to open this session.' : error}</p>
            <p>
                <Link to="/ttrpg" className="ttrpg-link">
                    Back to your sessions
                </Link>
            </p>
        </main>
    );
}
