import { faMinus, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, type CSSProperties, type PointerEvent } from 'react';

import type { Skylander } from '../types';

import { elementFor } from '../content/elements';

interface SkylanderCardProps
{
    item: Skylander;
    /** Position in the grid, staggers the entrance animation. */
    index: number;
    /** Plays the staggered entrance. Off for cards added later, see SkylanderGrid.tsx. */
    intro: boolean;
    onRemove: (item: Skylander) => void;
    /** +1 or -1. Collection.tsx turns the last -1 into the remove dialog. */
    onChangeCount: (item: Skylander, delta: number) => void;
}

/** Degrees the card leans towards the pointer at its edges. */
const maxTilt = 7;

/**
 * Tilts the card towards a mouse pointer. Written straight to CSS variables rather than state,
 * so following the mouse never re-renders React.
 */
function tilt(event: PointerEvent<HTMLLIElement>)
{
    if (event.pointerType !== 'mouse')
        return;

    const card = event.currentTarget;
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;

    card.style.setProperty('--rx', `${(0.5 - y) * maxTilt * 2}deg`);
    card.style.setProperty('--ry', `${(x - 0.5) * maxTilt * 2}deg`);
}

/** Soft white most of the time, now and then a warm gold or a pale portal blue. */
const glintColours = ['255 255 255', '255 255 255', '255 255 255', '255 232 160', '205 238 255'];

function between(min: number, max: number): number
{
    return min + Math.random() * (max - min);
}

/** Rolls a new look for the portrait glint in skylanders.css, so no two hovers match. */
function glint(event: PointerEvent<HTMLLIElement>)
{
    const card = event.currentTarget;
    // Mostly left to right, the way light usually catches a card, sometimes the other way.
    const reversed = Math.random() < 0.3;

    card.style.setProperty('--glint-angle', `${between(95, 140)}deg`);
    card.style.setProperty('--glint-width', `${between(7, 18)}%`);
    card.style.setProperty('--glint-strength', `${between(0.35, 0.7)}`);
    card.style.setProperty('--glint-duration', `${between(0.9, 1.5)}s`);
    card.style.setProperty('--glint-from', reversed ? '100%' : '-100%');
    card.style.setProperty('--glint-to', reversed ? '-100%' : '100%');
    card.style.setProperty(
        '--glint-rgb',
        glintColours[Math.floor(Math.random() * glintColours.length)],
    );
}

function untilt(event: PointerEvent<HTMLLIElement>)
{
    const card = event.currentTarget;

    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
}

export function SkylanderCard({ item, index, intro, onRemove, onChangeCount }: SkylanderCardProps)
{
    const remove = useCallback(() => onRemove(item), [item, onRemove]);
    const increase = useCallback(() => onChangeCount(item, 1), [item, onChangeCount]);
    const decrease = useCallback(() => onChangeCount(item, -1), [item, onChangeCount]);
    const element = elementFor(item.element);
    const style = {
        '--el': element.color,
        '--i': index,
        // Lets the view transition in Collection.tsx follow this card as it enters, leaves or
        // moves. Prefixed because a name must not start with a digit.
        viewTransitionName: `sky-card-${item.id}`,
    } as CSSProperties;

    return (
        <li
            className={intro ? 'sky-card sky-card--intro' : 'sky-card'}
            style={style}
            onPointerEnter={glint}
            onPointerMove={tilt}
            onPointerLeave={untilt}
        >
            <span className="sky-medal" title={element.name || 'Unknown element'}>
                <FontAwesomeIcon icon={element.icon} />
            </span>
            <button
                type="button"
                className="sky-card__remove"
                onClick={remove}
                aria-label={`Remove ${item.name}`}
            >
                <FontAwesomeIcon icon={faXmark} />
            </button>

            <div className="sky-card__portrait">
                {item.image ? (
                    <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <span className="sky-card__placeholder">?</span>
                )}
                {item.count > 1 && (
                    // Keyed on the count, so the badge pops each time it changes.
                    <span className="sky-card__copies" key={item.count}>
                        ×{item.count}
                    </span>
                )}
            </div>

            <div className="sky-card__body">
                {item.url ? (
                    <a className="sky-card__name" href={item.url} target="_blank" rel="noreferrer">
                        {item.name}
                    </a>
                ) : (
                    <span className="sky-card__name">{item.name}</span>
                )}
                {item.game && <span className="sky-card__game">{item.game}</span>}

                <div className="sky-stepper" role="group" aria-label={`Copies of ${item.name}`}>
                    <button
                        type="button"
                        // At one copy, minus removes the figure, so its hover turns red.
                        className={`sky-stepper__btn sky-stepper__btn--minus${item.count === 1 ? ' sky-stepper__btn--danger' : ''}`}
                        onClick={decrease}
                        aria-label={`One less ${item.name}`}
                    >
                        <FontAwesomeIcon icon={faMinus} />
                    </button>
                    {/* Keyed on the count, so the number bumps each time it changes. */}
                    <span className="sky-stepper__count" key={item.count} aria-live="polite">
                        {item.count}
                    </span>
                    <button
                        type="button"
                        className="sky-stepper__btn sky-stepper__btn--plus"
                        onClick={increase}
                        aria-label={`One more ${item.name}`}
                    >
                        <FontAwesomeIcon icon={faPlus} />
                    </button>
                </div>
            </div>
        </li>
    );
}
