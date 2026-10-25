import { faBookOpen, faBurst, faEye, faEyeSlash, faInbox, faTrash, faUserXmark, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { Condition, CreatureSize, GameSystem, Grid, Point, Stats, Token } from '../types';

import { ConditionPicker } from './ConditionPicker';
import { DetailsForm } from './Monsters';
import { RowEditor } from './RowEditor';
import { SizePicker } from './SizePicker';
import { StatChips, StatsForm } from './StatsForm';
import { useKeydown } from './useKeys';

/** Room kept between the menu and the edge of the screen, and between the pointer and the menu. */
const edge = 16;
const gap = 6;

interface TokenMenuProps
{
    token: Token;
    /** Where the right click was, on the page. */
    at: Point;
    grid: Grid;
    system: GameSystem;
    onSetStats: (stats: Stats) => Promise<void>;
    onSetConditions: (conditions: Condition[]) => Promise<void>;
    onSetSize: (size: CreatureSize) => Promise<void>;
    /** Starts an attack or a heal with this token picked, in the GM view only. */
    onHit?: () => void;
    /** Monsters only: hide from the players, or show again. */
    onHide?: () => void;
    /** A monster on the map: off it onto the tray, hidden, see Tray.tsx. */
    onTray?: () => void;
    /** A monster's name, ring and Goes down at 0, or a test player's name and ring. */
    onSetDetails?: (details: { name: string; color: string; downs: boolean }) => Promise<void>;
    /** Whether Details offers Goes down at 0: a monster's does, a test player's not. */
    detailsAtZero?: boolean;
    /** A monster placed from a preset: opens or closes its stat block. */
    onStatBlock?: () => void;
    statBlockOpen?: boolean;
    /** Takes a monster off the map, or a live player off the table, after asking. */
    onRemove?: () => void;
    onClose: () => void;
}

/**
 * The GM view's right-click menu on a token: the token's row as the Players and Monsters lists
 * show it opened, at the pointer. What the GM does to one token most, without finding it in a list.
 */
export function TokenMenu({
    token,
    at,
    grid,
    system,
    onSetStats,
    onSetConditions,
    onSetSize,
    onHit,
    onHide,
    onTray,
    onSetDetails,
    detailsAtZero = true,
    onStatBlock,
    statBlockOpen = false,
    onRemove,
    onClose,
}: TokenMenuProps)
{
    const card = useRef<HTMLElement>(null);
    const monster = token.kind === 'npc';

    // Down and to the right of the pointer, flipped to the other side where the screen ends. Laid
    // out again when it changes size, before it paints, so it never shows cut off. The controls
    // zoom with the settings' size, and left and top zoom with them, see .ttrpg-popover.
    useLayoutEffect(() =>
    {
        const element = card.current;

        if (!element)
            return;

        const place = () =>
        {
            const zoom = Number(getComputedStyle(element).zoom) || 1;
            const { width, height } = element.getBoundingClientRect();
            const right = at.x + gap + width <= window.innerWidth - edge;
            const below = at.y + gap + height <= window.innerHeight - edge;
            const x = Math.max(edge, Math.min(right ? at.x + gap : at.x - gap - width, window.innerWidth - edge - width));
            const y = Math.max(edge, Math.min(below ? at.y + gap : at.y - gap - height, window.innerHeight - edge - height));

            element.style.left = `${x / zoom}px`;
            element.style.top = `${y / zoom}px`;
        };

        const observer = new ResizeObserver(place);

        observer.observe(element);

        return () => observer.disconnect();
    }, [at]);

    useKeydown((event) =>
    {
        if (event.key === 'Escape' && !document.querySelector('dialog[open]'))
            onClose();

    });

    // A press anywhere else closes it, a right click on another token too, which then opens that
    // one's. A press in the confirm dialog, like Remove asks, is not a press beside it.
    const pressed = useEffectEvent((event: PointerEvent) =>
    {
        const target = event.target instanceof Element ? event.target : null;

        if (target && !card.current?.contains(target) && !target.closest('dialog'))
            onClose();

    });

    // Zooming the map closes it too, as the token it belongs to slides away from under it. Only on
    // the map: scrolling a panel, like the conditions or a stat block, keeps it.
    const zoomed = useEffectEvent((event: WheelEvent) =>
    {
        if (event.target instanceof HTMLCanvasElement)
            onClose();

    });

    useEffect(() =>
    {
        const press = (event: PointerEvent) => pressed(event);
        const wheel = (event: WheelEvent) => zoomed(event);

        document.addEventListener('pointerdown', press);
        document.addEventListener('wheel', wheel, { passive: true });

        return () =>
        {
            document.removeEventListener('pointerdown', press);
            document.removeEventListener('wheel', wheel);
        };
    }, []);

    return createPortal(
        <section
            ref={card}
            className="ttrpg-panel ttrpg-popover ttrpg-token-menu"
            aria-label={token.name}
            // The map's own menu is no use on the menu either.
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="ttrpg-token-menu__head">
                <div className="ttrpg-row__main ttrpg-row__main--swatch">
                    <span className="ttrpg-swatch" style={{ background: token.color }} />
                    <span className="ttrpg-row__text">
                        <span className="ttrpg-row__name">{token.name}</span>
                        <StatChips token={token} />
                    </span>
                </div>
                <button type="button" className="ttrpg-icon-button ttrpg-icon-button--small" aria-label="Close" title="Close (Esc)" onClick={onClose}>
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            </div>

            <div className="ttrpg-token-menu__actions">
                {onHit && (
                    <button type="button" className="ttrpg-segment" title="Deal damage or heal, with more tokens if you like" onClick={onHit}>
                        <FontAwesomeIcon icon={faBurst} />
                        Attack
                    </button>
                )}
                {onHide && (
                    <button
                        type="button"
                        className="ttrpg-segment"
                        aria-pressed={token.hidden === true}
                        title={token.hidden ? 'Show to the players' : 'Hide from the players'}
                        onClick={onHide}
                    >
                        <FontAwesomeIcon icon={token.hidden ? faEyeSlash : faEye} />
                        {token.hidden ? 'Hidden' : 'Hide'}
                    </button>
                )}
                {onTray && (
                    <button type="button" className="ttrpg-segment" title="Off the map onto the tray, hidden" onClick={onTray}>
                        <FontAwesomeIcon icon={faInbox} />
                        To tray
                    </button>
                )}
                {onStatBlock && (
                    <button type="button" className="ttrpg-segment" aria-pressed={statBlockOpen} title="Stat block" onClick={onStatBlock}>
                        <FontAwesomeIcon icon={faBookOpen} />
                        Stats
                    </button>
                )}
                {onRemove && (
                    <button
                        type="button"
                        className="ttrpg-segment"
                        title={monster ? 'Remove from the map' : 'Remove from the table'}
                        onClick={onRemove}
                    >
                        <FontAwesomeIcon icon={monster ? faTrash : faUserXmark} />
                        Remove
                    </button>
                )}
            </div>

            <RowEditor
                // Another token starts over on its first tab, with its own forms.
                key={token.id}
                tabs={[
                    { id: 'numbers', label: 'Numbers', content: <StatsForm token={token} onSave={onSetStats} /> },
                    {
                        id: 'conditions',
                        label: 'Conditions',
                        scrolls: true,
                        content: <ConditionPicker system={system} conditions={token.conditions ?? []} onChange={onSetConditions} />,
                    },
                    {
                        id: 'size',
                        label: 'Size',
                        content: (
                            <SizePicker size={token.size} grid={grid} onChange={onSetSize} />
                        ),
                    },
                    ...(onSetDetails ? [{ id: 'details', label: 'Details', content: <DetailsForm monster={token} atZero={detailsAtZero} onSave={onSetDetails} /> }] : []),
                ]}
            />
        </section>,
        document.querySelector('.ttrpg') ?? document.body,
    );
}
