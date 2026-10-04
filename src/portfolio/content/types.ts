import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { ReactNode } from 'react';

export type ProjectCategory = 'Professional Work' | 'Game Dev' | 'Game Jams';

export interface ProjectSection
{
    label: string;
    /** Rich copy. JSX, so emphasis and paragraph breaks stay real markup. */
    body?: ReactNode;
    /** Bullet points. ReactNode because some carry inline emphasis. */
    list?: ReactNode[];
}

export interface ProjectLink
{
    url: string;
    icon: IconDefinition;
    text: string;
}

export interface ProjectImage
{
    src: string;
    /** Lightbox target when it differs from src, such as a YouTube URL. */
    href?: string;
    /** Badge drawn over the thumbnail. */
    icon?: IconDefinition;
}

export interface Project
{
    /** URL segment: 'adapta-solva' becomes /projects/adapta-solva. */
    slug: string;
    title: string;
    category: ProjectCategory;
    /** Hidden from the home page when false. Its page still exists. */
    active: boolean;
    /** Ascending, within the category. */
    order: number;
    cardImage: string;
    tags: string[];
    sections: ProjectSection[];
    links?: ProjectLink[];
    images?: ProjectImage[];
}
