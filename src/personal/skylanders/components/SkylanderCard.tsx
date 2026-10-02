import {
    faQuoteLeft,
    faStar,
    faVolumeHigh,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    useCallback,
    useEffect,
    useState,
    type CSSProperties,
    type MouseEvent,
    type PointerEvent,
} from 'react';

import type { Skylander } from '../types';

import { elementFor, giant } from '../content/elements';
import { normalFor, ownedVersions, plainCount, versionImage } from '../content/variants';
import { playVoice, stopVoice, watchVoice } from '../services/voice';

import { PortraitCarousel, type Slide } from './PortraitCarousel';

interface SkylanderCardProps
{
    item: Skylander;
    /** Position in the grid, staggers the entrance animation. */
    index: number;
    /** Plays the staggered entrance. Off for cards added later, see SkylanderGrid.tsx. */
    intro: boolean;
    onRemove: (item: Skylander) => void;
    /** Opens the versions dialog in Collection.tsx, where the copies are counted. */
    onVariants: (item: Skylander) => void;
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

function straighten(card: HTMLElement)
{
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
}

function untilt(event: PointerEvent<HTMLLIElement>)
{
    straighten(event.currentTarget);
}

/**
 * Straightens the card behind a button that opens a dialog. The modal makes the card inert, so
 * it never hears the pointer leave and would keep its tilt after the dialog closes.
 */
function straightenCard(event: MouseEvent<HTMLButtonElement>)
{
    const card = event.currentTarget.closest('li');

    if (card)
        straighten(card);

}

interface VoiceButtonProps
{
    name: string;
    voice: string;
    catchphrase: string;
}

/** Says the figure's catchphrase, and stops it when pressed while talking. */
function VoiceButton({ name, voice, catchphrase }: VoiceButtonProps)
{
    const [playing, setPlaying] = useState(false);

    useEffect(() => watchVoice((current) => setPlaying(current === voice)), [voice]);

    const toggle = useCallback(() =>
    {
        if (playing)
            stopVoice();
        else
            playVoice(voice);

    }, [playing, voice]);

    const label = catchphrase ? `${name} says "${catchphrase}"` : `Hear ${name}`;

    return (
        <button
            type="button"
            // The label is the styled .sky-tip from skylanders.css, to the left over the card.
            className={`sky-card__voice sky-tip sky-tip--left${playing ? ' sky-card__voice--playing' : ''}`}
            onClick={toggle}
            aria-label={playing ? 'Stop' : label}
            aria-pressed={playing}
            data-tip={catchphrase ? `"${catchphrase}"` : `Hear ${name}`}
        >
            <FontAwesomeIcon icon={faVolumeHigh} />
            {/* Rings sent out while it talks. Elements, since ::after holds the label. */}
            {playing && (
                <>
                    <span className="sky-card__voice-ring" aria-hidden="true" />
                    <span className="sky-card__voice-ring" aria-hidden="true" />
                </>
            )}
        </button>
    );
}

export function SkylanderCard({
    item,
    index,
    intro,
    onRemove,
    onVariants,
}: SkylanderCardProps)
{
    const remove = useCallback(
        (event: MouseEvent<HTMLButtonElement>) =>
        {
            straightenCard(event);
            onRemove(item);
        },
        [item, onRemove],
    );
    const versions = useCallback(
        (event: MouseEvent<HTMLButtonElement>) =>
        {
            straightenCard(event);
            onVariants(item);
        },
        [item, onVariants],
    );
    const element = elementFor(item.element, item.item);
    const special = ownedVersions(item);
    // A picture of each version owned, for the carousel. Versions the wiki has no picture of are
    // left out rather than shown as the plain one.
    const slides: Slide[] = [
        ...(plainCount(item.count, item.variants) > 0
            ? [{ ...normalFor(item.versions), src: item.looks?.normal ?? item.image }]
            : []),
        ...special.map((version) => ({ ...version, src: versionImage(item, version) })),
    ].filter((slide) => slide.src);
    // One version, like a figure owned only as a Legendary, shows that picture on its own.
    const portrait = slides[0]?.src ?? item.image;
    // The holographic frame is for the rarer ones. A Series 2 or 3 is just another release.
    const rare = special.some(({ id }) => id !== 'series2' && id !== 'series3');
    const style = {
        '--el': element.color,
        '--i': index,
        // Lets the view transition in Collection.tsx follow this card as it enters, leaves or
        // moves. Prefixed because a name must not start with a digit.
        viewTransitionName: `sky-card-${item.id}`,
    } as CSSProperties;

    return (
        <li
            className={`sky-card${intro ? ' sky-card--intro' : ''}${rare ? ' sky-card--special' : ''}`}
            style={style}
            onPointerEnter={glint}
            onPointerMove={tilt}
            onPointerLeave={untilt}
        >
            {/* Decoration only, the element tag below names it. */}
            <span className="sky-medal" aria-hidden="true">
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
            <button
                type="button"
                className="sky-card__versions"
                onClick={versions}
                aria-label={`Versions of ${item.name}`}
                title="Versions"
            >
                <FontAwesomeIcon icon={faStar} />
            </button>
            {/* Below the remove and versions buttons: a speaker on figures the wiki has a
                recording of, otherwise a quote that shows the catchphrase on hover. */}
            {item.voice ? (
                <VoiceButton
                    name={item.name}
                    voice={item.voice}
                    catchphrase={item.catchphrase ?? ''}
                />
            ) : (
                item.catchphrase && (
                    <span
                        className="sky-card__voice sky-card__voice--quote sky-tip sky-tip--left"
                        data-tip={`"${item.catchphrase}"`}
                        role="img"
                        aria-label={`${item.name} says "${item.catchphrase}"`}
                    >
                        <FontAwesomeIcon icon={faQuoteLeft} />
                    </span>
                )
            )}

            <div className="sky-card__portrait">
                {slides.length > 1 ? (
                    <PortraitCarousel slides={slides} figure={item.name} index={index} />
                ) : portrait ? (
                    <img
                        src={portrait}
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
                {(element.name || item.giant) && (
                    <ul className="sky-card__tags" aria-label="Tags">
                        {element.name && (
                            <li
                                className="sky-tag sky-tag--icon"
                                style={{ '--v': element.color } as CSSProperties}
                            >
                                <FontAwesomeIcon icon={element.icon} />
                                {/* "Magic Item" or "Adventure Pack" rather than "Items". */}
                                {item.item ?? element.name}
                            </li>
                        )}
                        {item.giant && (
                            <li
                                className="sky-tag sky-tag--icon"
                                style={{ '--v': giant.color } as CSSProperties}
                            >
                                <FontAwesomeIcon icon={giant.icon} />
                                Giant
                            </li>
                        )}
                    </ul>
                )}
            </div>
        </li>
    );
}
