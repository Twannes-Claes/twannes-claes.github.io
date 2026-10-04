import { useCallback, useRef } from 'react';

import type { Project } from '../content/types';

import { TiltButton } from '../../shared/components/TiltButton';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery';

import { ProjectCard } from './ProjectCard';

/** Scrolls the track one card along, snapping takes care of centring it. */
function step(track: HTMLDivElement | null, direction: number)
{
    const card = track?.firstElementChild;

    if (card)
        track.scrollBy({ left: direction * card.clientWidth, behavior: 'smooth' });

}

/** Native scroll snapping, so swiping is the browser's own. Stops at the ends rather than looping. */
function ProjectCarousel({ projects }: { projects: Project[] })
{
    const track = useRef<HTMLDivElement>(null);

    const scrollPrev = useCallback(() => step(track.current, -1), []);
    const scrollNext = useCallback(() => step(track.current, 1), []);

    return (
        <>
            {/* Stretched 50px past the container on each side, so the neighbouring cards
                peek in. */}
            <div className="accent-slab accent-slab--cards -mx-[50px]">
                {/* Padded by half the leftover width, so the first and last card can centre. */}
                <div
                    ref={track}
                    className="flex snap-x snap-mandatory overflow-x-auto px-[7.5%] [scrollbar-width:none]"
                >
                    {projects.map((project) => (
                        <div
                            key={project.slug}
                            className="flex min-w-0 shrink-0 grow-0 basis-[85%] snap-center flex-col"
                        >
                            <ProjectCard project={project} />
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-8 flex flex-row justify-center gap-4">
                <TiltButton
                    className="button--icon button--arrow button--arrow-prev"
                    magnitude={12}
                >
                    <button type="button" aria-label="Previous project" onClick={scrollPrev} />
                </TiltButton>
                <TiltButton className="button--icon button--arrow" magnitude={12}>
                    <button type="button" aria-label="Next project" onClick={scrollNext} />
                </TiltButton>
            </div>
        </>
    );
}

/**
 * Three columns, two under 992px, a swipeable carousel under 768px.
 * The grid is the prerendered and no-JS fallback.
 */
export function ProjectShowcase({ projects }: { projects: Project[] })
{
    const isMobile = useMediaQuery('(max-width: 767.98px)');

    if (isMobile)
        return <ProjectCarousel projects={projects} />;

    return (
        <div className="accent-slab accent-slab--cards grid grid-cols-3 gap-8 max-[992px]:grid-cols-2">
            {projects.map((project) => (
                <ProjectCard key={project.slug} project={project} />
            ))}
        </div>
    );
}
