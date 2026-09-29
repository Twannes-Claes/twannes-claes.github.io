import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState } from 'react';
import Lightbox, { type GenericSlide, type Slide } from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

import type { ProjectImage } from '../content/types';

/** A slide that embeds a video player instead of showing an image. */
interface SlideYouTube extends GenericSlide {
    type: 'youtube';
    embedUrl: string;
}

// Register the custom slide type with the lightbox's own union.
declare module 'yet-another-react-lightbox'
{
    interface SlideTypes {
        youtube: SlideYouTube;
    }
}

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
        // Not a parseable URL; fall through to the image slide.
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
    const slides = images.map(toSlide);

    return (
        <>
            <div className="accent-slab relative ms-[12%] flex h-fit flex-col gap-4 max-[768px]:ms-0">
                {images.map((image, i) => (
                    <button
                        key={image.src}
                        type="button"
                        onClick={() => setIndex(i)}
                        aria-label={image.icon ? 'Play video' : 'Open image'}
                        className={`gallery-img ${image.icon ? 'gallery-img--video' : ''}`}
                    >
                        <img src={image.src} alt="" />
                        {image.icon && <FontAwesomeIcon icon={image.icon} />}
                    </button>
                ))}
            </div>

            <Lightbox
                open={index >= 0}
                index={index}
                close={() => setIndex(-1)}
                slides={slides}
                render={{
                    slide: ({ slide }) =>
                    {
                        if (slide.type !== 'youtube')
                            return undefined;

                        return (
                            <iframe
                                title="Project video"
                                src={slide.embedUrl}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                className="aspect-video h-auto w-[min(90vw,1280px)] border-0"
                            />
                        );
                    },
                }}
            />
        </>
    );
}
