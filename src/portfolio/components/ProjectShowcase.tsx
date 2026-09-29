import useEmblaCarousel from 'embla-carousel-react';
import { useCallback } from 'react';

import type { Project } from '../content/types';

import { TiltButton } from '../../shared/components/TiltButton';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery';

import { ProjectCard } from './ProjectCard';

/**
 * Three columns, two under 992px, a looping carousel under 768px.
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

function ProjectCarousel({ projects }: { projects: Project[] })
{
    const [emblaRef, emblaApi] = useEmblaCarousel({
        loop: true,
        align: 'center',
        containScroll: false,
    });

    const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

    return (
        <>
            {/* Stretched 50px past the container on each side so the neighbouring
          cards peek in, as the old slider did. */}
            <div className="accent-slab accent-slab--cards -mx-[50px]">
                <div className="overflow-hidden" ref={emblaRef}>
                    <div className="flex">
                        {projects.map((project) => (
                            <div
                                key={project.slug}
                                className="flex min-w-0 shrink-0 grow-0 basis-[85%] flex-col"
                            >
                                <ProjectCard project={project} />
                            </div>
                        ))}
                    </div>
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
