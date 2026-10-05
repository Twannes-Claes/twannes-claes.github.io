import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { lazy, Suspense, useState } from 'react';

import type { ProjectImage } from '../content/types';
import type { Slide } from './ProjectLightbox';

const ProjectLightbox = lazy(() => import('./ProjectLightbox'));

/**
 * Converts a YouTube watch or youtu.be URL into its embed form.
 * Returns null for anything else, which then opens as a plain image.
 */
function toYouTubeEmbed(url: string): string | null
{
    try
    {
        const parsed = new URL(url);

        if (parsed.hostname === 'youtu.be')
            return `https://www.youtube.com/embed${parsed.pathname}`;

        if (parsed.hostname.endsWith('youtube.com'))
        {
            const id = parsed.searchParams.get('v');

            if (id)
                return `https://www.youtube.com/embed/${id}`;

        }
    }
    catch
    {
        // Not a URL at all, so it opens as a plain image.
    }

    return null;
}

function toSlide(image: ProjectImage): Slide
{
    const embedUrl = image.href ? toYouTubeEmbed(image.href) : null;

    if (embedUrl)
        return { type: 'youtube', embedUrl };

    return { src: image.href ?? image.src };
}

export function ProjectGallery({ images }: { images: ProjectImage[] })
{
    const [index, setIndex] = useState(-1);
    // Mounted from the first open on and kept, so closing still plays the lightbox's fade out.
    const [opened, setOpened] = useState(false);
    const slides = images.map(toSlide);

    const open = (position: number) =>
    {
        setOpened(true);
        setIndex(position);
    };

    const close = () => setIndex(-1);

    return (
        <>
            <div className="accent-slab relative ms-[12%] flex h-fit flex-col gap-4 max-[768px]:ms-0">
                {images.map((image, position) => (
                    <button
                        key={image.src}
                        type="button"
                        onClick={() => open(position)}
                        aria-label={image.icon ? 'Play video' : 'Open image'}
                        className={`gallery-img ${image.icon ? 'gallery-img--video' : ''}`}
                    >
                        {/* The first one is in view on arrival, the rest wait for a scroll. */}
                        <img
                            src={image.src}
                            alt=""
                            loading={position === 0 ? 'eager' : 'lazy'}
                            decoding="async"
                        />
                        {image.icon && <FontAwesomeIcon icon={image.icon} />}
                    </button>
                ))}
            </div>

            {opened && (
                <Suspense fallback={null}>
                    <ProjectLightbox slides={slides} index={index} onClose={close} />
                </Suspense>
            )}
        </>
    );
}
