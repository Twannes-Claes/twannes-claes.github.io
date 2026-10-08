import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useKeydown } from './useKeys';

interface PopoverProps
{
    title: string;
    onClose: () => void;
    /** Where it sits, such as ttrpg-start under the top bar or ttrpg-dock-panel above the dock. */
    className: string;
    /**
     * A press anywhere else closes it too. Off for the panels the game master works next to the
     * map with, like the fog and the monsters, where a press on the map pans or drags.
     */
    dismissOnOutside?: boolean;
    children: ReactNode;
}

/**
 * A floating panel with its title and a close button, closed by Esc as well. The button that
 * opens one carries aria-expanded, which tells screen readers it is open and keeps a press on it
 * from counting as outside, so it can close the panel again.
 */
export function Popover({ title, onClose, className, dismissOnOutside = false, children }: PopoverProps)
{
    const panel = useRef<HTMLElement>(null);

    useKeydown((event) =>
    {
        if (event.key === 'Escape')
            onClose();

    });

    // A press in the confirm dialog, like Remove on a player, is not a press beside the panel.
    const pressed = useEffectEvent((event: PointerEvent) =>
    {
        const target = event.target instanceof Element ? event.target : null;

        if (target && !panel.current?.contains(target) && !target.closest('[aria-expanded], dialog'))
            onClose();

    });

    useEffect(() =>
    {
        if (!dismissOnOutside)
            return;

        const press = (event: PointerEvent) => pressed(event);

        document.addEventListener('pointerdown', press);

        return () => document.removeEventListener('pointerdown', press);
    }, [dismissOnOutside]);

    // In the app's own root rather than beside its button: the top bar's blur makes the bar the
    // box that fixed things are placed in, see QrCode in LiveControls.tsx.
    return createPortal(
        <section ref={panel} className={`ttrpg-panel ttrpg-popover ${className}`} aria-label={title}>
            <header className="ttrpg-popover__header">
                <h2>{title}</h2>
                <button
                    type="button"
                    className="ttrpg-icon-button ttrpg-icon-button--small"
                    aria-label="Close"
                    title="Close (Esc)"
                    onClick={onClose}
                >
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            </header>
            {children}
        </section>,
        document.querySelector('.ttrpg') ?? document.body,
    );
}
