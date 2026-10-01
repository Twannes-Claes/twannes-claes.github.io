import Lightbox, { type GenericSlide, type Slide } from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

/*
 * Only ever loaded with a dynamic import from ProjectGallery.tsx, the first time a picture is
 * opened, so the lightbox and its styles stay out of the bundle every page loads.
 */

/** A slide that embeds a video player instead of showing an image. */
interface SlideYouTube extends GenericSlide
{
    type: 'youtube';
    embedUrl: string;
}

// Adds the video slide to the lightbox's own union of slide types.
declare module 'yet-another-react-lightbox'
{
    interface SlideTypes
    {
        youtube: SlideYouTube;
    }
}

export type { Slide };

interface ProjectLightboxProps
{
    slides: Slide[];
    /** The open slide, -1 while closed. */
    index: number;
    onClose: () => void;
}

/** Renders a video slide as an embedded player, and leaves the rest to the lightbox. */
function renderSlide({ slide }: { slide: Slide })
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
}

const render = { slide: renderSlide };

export default function ProjectLightbox({ slides, index, onClose }: ProjectLightboxProps)
{
    return (
        <Lightbox
            open={index >= 0}
            index={index}
            close={onClose}
            slides={slides}
            render={render}
        />
    );
}
