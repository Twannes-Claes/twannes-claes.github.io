import type { VariantCounts, VariantId } from './content/variants';

/**
 * The Firebase module, typed without importing it, because the page loads it on demand and a
 * normal import would pull Firebase into the portfolio bundle.
 */
export type Db = typeof import('./services/db');

export interface Skylander
{
    /** Firestore document id, derived from the name in services/db.ts. */
    id: string;
    name: string;
    /** Thumbnail from the Skylanders wiki, empty when the wiki has none. */
    image: string;
    /** Magic, Tech, Water and so on, empty when the wiki page does not say. */
    element: string;
    /** The game the figure first appeared in. */
    game: string;
    /** Wiki page, empty when the name did not match one. */
    url: string;
    /** How many of this figure we own, at least 1, special versions included. */
    count: number;
    /** The special versions among those copies, see content/variants.ts. */
    variants: VariantCounts;
    /**
     * The special versions this figure was released in, from the wiki. Missing on figures saved
     * before it was tracked, until Collection.tsx looks them up again.
     */
    versions?: VariantId[];
}

/** What a wiki lookup knows about a figure, before it is stored. */
export type SkylanderDetails = Omit<Skylander, 'id' | 'count' | 'variants'>;

/** One search suggestion, with a small picture for the dropdown. */
export interface CatalogEntry
{
    name: string;
    /** Small wiki thumbnail, empty for the few pages without one. */
    thumb: string;
}
