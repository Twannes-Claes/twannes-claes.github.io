import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { ReactNode } from 'react';

export type ProjectCategory = 'Professional Work' | 'Game Dev' | 'Game Jam';

/** Ordered as they appear on the home page. */
export const PROJECT_CATEGORIES: ProjectCategory[] = ['Professional Work', 'Game Dev', 'Game Jam'];

/** Heading shown above each group on the home page. */
export const CATEGORY_HEADINGS: Record<ProjectCategory, string> = {
  'Professional Work': 'Professional Work',
  'Game Dev': 'Game Dev',
  'Game Jam': 'Game Jams',
};

export interface ProjectSection {
  label: string;
  /** Rich copy. JSX so emphasis and paragraph breaks stay real markup. */
  body?: ReactNode;
  /** Bulleted points. ReactNode because some entries carry inline emphasis. */
  list?: ReactNode[];
}

export interface ProjectLink {
  url: string;
  icon: IconDefinition;
  text: string;
}

export interface ProjectImage {
  src: string;
  /** Lightbox target when it differs from `src`, e.g. a YouTube watch URL. */
  href?: string;
  /** Overlay badge drawn on the thumbnail. */
  icon?: IconDefinition;
}

export interface Project {
  /** URL segment: 'adapta-solva' resolves to /projects/adapta-solva. */
  slug: string;
  title: string;
  category: ProjectCategory;
  /** Hidden from the site when false, but kept in the repo. */
  active: boolean;
  /** Ascending; controls order within a category. */
  order: number;
  cardImage: string;
  tags: string[];
  sections: ProjectSection[];
  links?: ProjectLink[];
  images?: ProjectImage[];
}
