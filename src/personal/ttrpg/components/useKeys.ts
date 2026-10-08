import { useEffect, useEffectEvent } from 'react';

/** Whether a key went to a field, where it is text rather than a shortcut. */
export function typing(event: KeyboardEvent): boolean
{
    return (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
    );
}

/**
 * Hears every key pressed on the page while active. The listener is added once and always calls
 * the latest handler, so a handler made fresh on each render does not add and remove it.
 */
export function useKeydown(handler: (event: KeyboardEvent) => void, active = true)
{
    const onKey = useEffectEvent(handler);

    useEffect(() =>
    {
        if (!active)
            return;

        const keydown = (event: KeyboardEvent) => onKey(event);

        window.addEventListener('keydown', keydown);

        return () => window.removeEventListener('keydown', keydown);
    }, [active]);
}
