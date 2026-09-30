/*
 * Plays the catchphrase recordings from the wiki, see services/wiki.ts. One at a time, so adding
 * a figure or pressing a speaker while another is talking stops the first.
 */

let current: HTMLAudioElement | null = null;
const listeners = new Set<(playing: string | null) => void>();

function announce(playing: string | null)
{
    for (const listener of listeners)
        listener(playing);

}

/** Stops whatever is playing and says this line instead. */
export function playVoice(url: string)
{
    if (!url)
        return;

    current?.pause();

    const audio = new Audio(url);

    current = audio;
    audio.volume = 0.85;

    const done = () =>
    {
        if (current === audio)
        {
            current = null;
            announce(null);
        }
    };

    audio.addEventListener('ended', done);
    audio.addEventListener('error', done);
    announce(url);
    // A browser that blocks sound until the page is used just stays quiet.
    audio.play().catch(done);
}

export function stopVoice()
{
    current?.pause();
    current = null;
    announce(null);
}

/** Tells a speaker button which recording is playing, so it can show it is talking. */
export function watchVoice(listener: (playing: string | null) => void): () => void
{
    listeners.add(listener);

    return () => listeners.delete(listener);
}
