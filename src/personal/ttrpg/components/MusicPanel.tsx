import { faMusic, faPause, faPen, faPlay, faPlus, faRepeat, faStop, faTrash, faVolumeHigh, faVolumeXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type FormEvent } from 'react';

import type { MusicControls, Track } from '../types';

import { videoId } from '../content/music';

import { Popover } from './Popover';

/** The few calls of the YouTube IFrame API used here, see developers.google.com/youtube. */
interface YouTubePlayer
{
    loadVideoById: (video: { videoId: string; startSeconds: number }) => void;
    getCurrentTime: () => number;
    playVideo: () => void;
    pauseVideo: () => void;
    stopVideo: () => void;
    seekTo: (seconds: number) => void;
    setVolume: (volume: number) => void;
    mute: () => void;
    unMute: () => void;
    destroy: () => void;
}

interface YouTubeApi
{
    Player: new (
        element: HTMLElement,
        options: {
            width: string;
            height: string;
            playerVars: Record<string, number>;
            events: { onReady: () => void; onStateChange: (event: { data: number }) => void };
        },
    ) => YouTubePlayer;
}

declare global
{
    interface Window
    {
        YT?: YouTubeApi;
        onYouTubeIframeAPIReady?: () => void;
    }
}

let youTube: Promise<YouTubeApi> | null = null;

/** Loads the IFrame API once, the first time the panel opens. A failed load is tried again. */
function loadYouTube(): Promise<YouTubeApi>
{
    youTube ??= new Promise((resolve, reject) =>
    {
        // Loaded already, by this page before a reload of this module, and it only calls back once.
        if (window.YT?.Player)
        {
            resolve(window.YT);

            return;
        }

        window.onYouTubeIframeAPIReady = () => resolve(window.YT as YouTubeApi);

        const script = document.createElement('script');

        script.src = 'https://www.youtube.com/iframe_api';
        script.onerror = () =>
        {
            youTube = null;
            script.remove();
            reject(new Error('YouTube did not load.'));
        };

        document.head.append(script);
    });

    return youTube;
}

const ended = 0;
const playing = 1;

interface MusicPanelProps
{
    controls: MusicControls;
    /**
     * Unseen rather than gone while closed or in Edit, so the music plays on, see MapEditor.tsx.
     */
    shown: boolean;
    onClose: () => void;
    onError: (message: string) => void;
}

/**
 * The GM's music above the play dock: YouTube links with a name each, for all their sessions, and
 * the player that plays one in this tab, see Music in PLAN.md.
 */
export function MusicPanel({ controls, shown, onClose, onError }: MusicPanelProps)
{
    const host = useRef<HTMLDivElement>(null);
    const player = useRef<YouTubePlayer | null>(null);
    const [ready, setReady] = useState(false);
    const [current, setCurrent] = useState<Track | null>(null);
    const [paused, setPaused] = useState(true);
    const [loop, setLoop] = useState(true);
    const [volume, setVolume] = useState(50);
    const [muted, setMuted] = useState(false);
    const [name, setName] = useState('');
    const [link, setLink] = useState('');
    // The list or the form to add a link, one at a time under the player.
    const [adding, setAdding] = useState(false);
    const [renaming, setRenaming] = useState<string | null>(null);
    // Where each link was left, by its id, so switching back carries on from there.
    const left = useRef(new Map<string, number>());

    const failed = useEffectEvent(() => onError('YouTube did not load. Check the connection and try again.'));

    const changed = useEffectEvent((state: number) =>
    {
        if (state === ended && loop)
        {
            player.current?.seekTo(0);
            player.current?.playVideo();

            return;
        }

        setPaused(state !== playing);
    });

    const started = useEffectEvent(() =>
    {
        player.current?.setVolume(volume);
        setReady(true);
    });

    useEffect(() =>
    {
        let gone = false;
        // The API swaps the element it is given for its iframe, so it gets one React does not own.
        const slot = document.createElement('div');

        host.current?.append(slot);

        loadYouTube()
            .then((api) =>
            {
                if (gone)
                    return;

                player.current = new api.Player(slot, {
                    width: '100%',
                    height: '100%',
                    playerVars: { playsinline: 1, rel: 0 },
                    events: { onReady: () => started(), onStateChange: (event) => changed(event.data) },
                });
            })
            .catch(failed);

        return () =>
        {
            gone = true;
            player.current?.destroy();
            player.current = null;
        };
    }, []);

    const play = (track: Track) =>
    {
        if (track.id === current?.id)
        {
            player.current?.playVideo();

            return;
        }

        if (current && player.current)
            left.current.set(current.id, player.current.getCurrentTime());

        setCurrent(track);
        player.current?.loadVideoById({ videoId: track.videoId, startSeconds: left.current.get(track.id) ?? 0 });
    };

    // A link stopped starts from the beginning next time.
    const stop = () =>
    {
        if (current)
            left.current.delete(current.id);

        setCurrent(null);
        player.current?.stopVideo();
    };

    const toggle = () =>
    {
        if (paused)
            player.current?.playVideo();
        else
            player.current?.pauseVideo();

    };

    const turn = (next: number) =>
    {
        setVolume(next);
        player.current?.setVolume(next);
        hush(false);
    };

    const hush = (next: boolean) =>
    {
        setMuted(next);

        if (next)
            player.current?.mute();
        else
            player.current?.unMute();

    };

    const add = (event: FormEvent) =>
    {
        event.preventDefault();

        if (!videoId(link))
        {
            onError('That is not a YouTube video link.');

            return;
        }

        controls
            .saveTrack({ name, link })
            .then(() =>
            {
                setName('');
                setLink('');
                setAdding(false);
            })
            .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : 'That link did not save.'));
    };

    const rename = (track: Track, name: string) =>
    {
        const next = name.trim();

        setRenaming(null);

        if (next && next !== track.name)
            controls.saveTrack({ name: next, link: track.videoId }, track.id).catch((reason: unknown) => onError(reason instanceof Error ? reason.message : 'That name did not save.'));

    };

    const remove = (track: Track) => controls.removeTrack(track.id).catch((reason: unknown) => onError(reason instanceof Error ? reason.message : 'That link was not removed.'));

    return (
        <Popover title="Music" className={`ttrpg-dock-panel ttrpg-music${shown ? '' : ' ttrpg-away'}`} onClose={onClose}>
            <div className="ttrpg-popover__body">
                <div className="ttrpg-music__stage">
                    <div ref={host} className="ttrpg-music__screen" />
                    {!current && (
                        <div className="ttrpg-music__idle">
                            <span className="ttrpg-music__disc">
                                <FontAwesomeIcon icon={faMusic} />
                            </span>
                            <span>Nothing playing</span>
                            <span className="ttrpg-music__hint">Pick a link to play it here.</span>
                        </div>
                    )}
                </div>
                <div className="ttrpg-music__controls">
                    <button type="button" className="ttrpg-segment" disabled={!ready || !current} aria-label={paused ? 'Play' : 'Pause'} title={paused ? 'Play' : 'Pause'} onClick={toggle}>
                        <FontAwesomeIcon icon={paused ? faPlay : faPause} fixedWidth />
                    </button>
                    <button type="button" className="ttrpg-segment" disabled={!ready || !current} aria-label="Stop" title="Stop" onClick={stop}>
                        <FontAwesomeIcon icon={faStop} />
                    </button>
                    <button type="button" className="ttrpg-segment" aria-pressed={loop} aria-label="Loop" title="Start again at the end" onClick={() => setLoop(!loop)}>
                        <FontAwesomeIcon icon={faRepeat} />
                    </button>
                    <button type="button" className="ttrpg-segment" aria-pressed={muted} aria-label="Mute" title={muted ? 'Unmute' : 'Mute'} onClick={() => hush(!muted)}>
                        <FontAwesomeIcon icon={muted ? faVolumeXmark : faVolumeHigh} fixedWidth />
                    </button>
                    <label className="ttrpg-music__volume" title="Volume">
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={volume}
                            aria-label="Volume"
                            style={{ '--fill': `${volume}%` } as CSSProperties}
                            onChange={(event) => turn(event.target.valueAsNumber)}
                        />
                    </label>
                </div>
            </div>
            <div className="ttrpg-tabs" role="group">
                <button type="button" className="ttrpg-tabs__tab" aria-pressed={!adding} onClick={() => setAdding(false)}>
                    Links
                </button>
                <button type="button" className="ttrpg-tabs__tab" aria-pressed={adding} onClick={() => setAdding(true)}>
                    Add
                </button>
            </div>
            {!adding && (
                <div className="ttrpg-popover__body">
                    {controls.tracks.length === 0 && <p className="ttrpg-empty">No music yet. Add a YouTube link under Add.</p>}
                    <ul className="ttrpg-rows">
                        {controls.tracks.map((track) => (
                            <li key={track.id} className="ttrpg-row">
                                {renaming === track.id ? (
                                    <input
                                        className="ttrpg-row__input"
                                        defaultValue={track.name}
                                        maxLength={60}
                                        aria-label="Name"
                                        autoFocus
                                        onFocus={(event) => event.currentTarget.select()}
                                        onBlur={(event) => rename(track, event.target.value)}
                                        onKeyDown={(event) =>
                                        {
                                            if (event.key === 'Enter')
                                                event.currentTarget.blur();

                                        }}
                                    />
                                ) : (
                                    <button type="button" className="ttrpg-row__main" aria-pressed={current?.id === track.id} disabled={!ready} title="Play this" onClick={() => play(track)}>
                                        <span className="ttrpg-row__name">{track.name}</span>
                                    </button>
                                )}
                                <button type="button" className="ttrpg-icon-button ttrpg-icon-button--small" aria-label="Rename" title="Rename" onClick={() => setRenaming(track.id)}>
                                    <FontAwesomeIcon icon={faPen} />
                                </button>
                                <button type="button" className="ttrpg-icon-button ttrpg-icon-button--small" aria-label="Remove" title="Remove" onClick={() => void remove(track)}>
                                    <FontAwesomeIcon icon={faTrash} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {adding && (
                <form className="ttrpg-popover__body ttrpg-check-form" onSubmit={add}>
                    <label className="ttrpg-field">
                        Name
                        <input value={name} maxLength={60} autoFocus placeholder="Tavern" onChange={(event) => setName(event.target.value)} />
                    </label>
                    <label className="ttrpg-field">
                        YouTube link
                        <input value={link} placeholder="https://www.youtube.com/watch?v=..." onChange={(event) => setLink(event.target.value)} />
                    </label>
                    <button type="submit" className="ttrpg-segment ttrpg-segment--block" disabled={!link.trim()}>
                        <FontAwesomeIcon icon={faPlus} />
                        Add
                    </button>
                </form>
            )}
        </Popover>
    );
}
