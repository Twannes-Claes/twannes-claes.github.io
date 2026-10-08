import { useEffect, useState, useSyncExternalStore } from 'react';

/*
 * The screen the table watches: full screen, kept awake, and controls that step aside when the
 * mouse is still. Browser state, so read through useSyncExternalStore and effects, never during
 * the prerender.
 */

const subscribeFullscreen = (onChange: () => void) =>
{
    document.addEventListener('fullscreenchange', onChange);

    return () => document.removeEventListener('fullscreenchange', onChange);
};

/** Whether the page fills the screen, and a way to switch. */
export function useFullscreen(): { fullscreen: boolean; toggle: () => void }
{
    const fullscreen = useSyncExternalStore(
        subscribeFullscreen,
        () => document.fullscreenElement !== null,
        () => false,
    );

    const toggle = () =>
    {
        // Refused without a click to start it, or on an iPhone, which has no full screen for
        // pages; the button then does nothing, which is all that can be done.
        const request = fullscreen
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen();

        request.catch(() => {});
    };

    return { fullscreen, toggle };
}

/**
 * Keeps the screen from dimming or locking while active, so the table screen stays on mid
 * fight. The browser drops the lock whenever the tab is hidden, so it is asked again on return.
 */
export function useWakeLock(active: boolean)
{
    useEffect(() =>
    {
        if (!active || !('wakeLock' in navigator))
            return;

        let lock: WakeLockSentinel | null = null;
        let released = false;

        const request = () =>
        {
            if (document.visibilityState !== 'visible')
                return;

            navigator.wakeLock
                .request('screen')
                .then((sentinel) =>
                {
                    if (released)
                        void sentinel.release();
                    else
                        lock = sentinel;

                })
                // Refused on low battery or by the browser; the screen just dims as it would.
                .catch(() => {});
        };

        request();
        document.addEventListener('visibilitychange', request);

        return () =>
        {
            released = true;
            document.removeEventListener('visibilitychange', request);
            void lock?.release();
        };
    }, [active]);
}

/**
 * True once there has been no mouse, touch or key for a while, false again on any of them. Like
 * waking a phone, a press on the map while idle only brings the controls back: the faded
 * controls let presses through, so without this a tap on the table screen meant for a button
 * would open a door or pan the map instead. A mouse wakes them on moving, before it clicks.
 */
export function useIdle(after: number, active: boolean): boolean
{
    const [idle, setIdle] = useState(false);

    useEffect(() =>
    {
        if (!active)
            return;

        // Mirrors idle, which the listeners below cannot read as it was set after they were made.
        let asleep = false;

        const sleep = () =>
        {
            asleep = true;
            setIdle(true);
        };

        let timer = window.setTimeout(sleep, after);

        const wake = () =>
        {
            asleep = false;
            setIdle(false);
            window.clearTimeout(timer);
            timer = window.setTimeout(sleep, after);
        };

        // Caught on the way down, before the map's own listener sees it. A press on a panel that
        // stays in sight, like the fog panel, still works as usual.
        const press = (event: PointerEvent) =>
        {
            if (asleep && event.target instanceof HTMLCanvasElement)
                event.stopPropagation();

            wake();
        };

        const events = ['pointermove', 'keydown', 'wheel'] as const;

        for (const name of events)
            window.addEventListener(name, wake, { passive: true });

        window.addEventListener('pointerdown', press, { capture: true });

        return () =>
        {
            window.clearTimeout(timer);

            for (const name of events)
                window.removeEventListener(name, wake);

            window.removeEventListener('pointerdown', press, { capture: true });
            setIdle(false);
        };
    }, [after, active]);

    return active && idle;
}
