import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

export interface Slide
{
    id: string;
    /** The version's name, like "Legendary". */
    name: string;
    color: string;
    src: string;
}

interface PortraitCarouselProps
{
    slides: Slide[];
    /** The figure's name, for the alt text. */
    figure: string;
    /** Position in the grid, so neighbouring cards do not all turn at once. */
    index: number;
}

/** How long each version shows before the next one fades in. */
const holdMs = 8000;

/**
 * Cycles through the pictures of the versions owned of a figure, fading from one to the next,
 * with a dot per version to jump to it. Holds still while the pointer is on the card, so a
 * version can be looked at, and for people who reduce motion.
 */
export function PortraitCarousel({ slides, figure, index }: PortraitCarouselProps)
{
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);
    const turned = useRef(false);
    // A list that got shorter, after selling a version, starts over rather than showing nothing.
    const shown = active < slides.length ? active : 0;

    useEffect(() =>
    {
        if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;

        // Restarts on every turn and every click on a dot, so a picked version gets its full time.
        // Only the first turn is staggered along the grid, after that every card keeps its beat.
        const timer = window.setTimeout(
            () =>
            {
                turned.current = true;
                setActive((shown + 1) % slides.length);
            },
            holdMs + (turned.current ? 0 : (index % 6) * 600),
        );

        return () => window.clearTimeout(timer);
    }, [shown, paused, slides.length, index]);

    const pause = useCallback(() => setPaused(true), []);
    const resume = useCallback(() => setPaused(false), []);

    return (
        <div className="sky-carousel" onPointerEnter={pause} onPointerLeave={resume}>
            {slides.map((slide, position) => (
                <img
                    key={slide.id}
                    className="sky-carousel__slide"
                    src={slide.src}
                    alt={`${slide.name} ${figure}`}
                    aria-hidden={position !== shown}
                    data-active={position === shown || undefined}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                />
            ))}
            {/* One per version, stacked, so the names crossfade along with the pictures. */}
            {slides.map((slide, position) => (
                <span
                    key={slide.id}
                    className="sky-carousel__label"
                    style={{ '--v': slide.color } as CSSProperties}
                    aria-hidden={position !== shown}
                    data-active={position === shown || undefined}
                >
                    {slide.name}
                </span>
            ))}
            <div className="sky-carousel__dots" role="group" aria-label={`Versions of ${figure}`}>
                {slides.map((slide, position) => (
                    <button
                        key={slide.id}
                        type="button"
                        className="sky-carousel__dot"
                        style={{ '--v': slide.color } as CSSProperties}
                        aria-label={`Show ${slide.name}`}
                        aria-pressed={position === shown}
                        onClick={() => setActive(position)}
                    />
                ))}
            </div>
        </div>
    );
}
