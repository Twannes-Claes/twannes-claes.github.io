import type { Edition, Looks, VariantCounts, VariantId } from './content/variants';

/**
 * The Firebase module, typed without importing it, because the page loads it on demand and a
 * normal import would pull Firebase into the portfolio bundle.
 */
export type Db = typeof import('./services/db');

/**
 * Toys that go on the portal without being a Skylander, like the Ghost Pirate Swords or the
 * Pirate Seas ship, sorted the way the wiki sorts them. Also the tag the card shows.
 */
export type ItemKind = 'Magic Item' | 'Adventure Pack';

export interface Skylander
{
    /** Firestore document id, derived from the name in services/db.ts. */
    id: string;
    /** As shown, without the wiki's "(character)", see services/wiki.ts. */
    name: string;
    /**
     * The wiki page title, which can differ from the name, like "Blaster-Tron (character)". Used
     * for lookups and the document id. Missing on figures saved before it was tracked, where the
     * name is still the title.
     */
    title?: string;
    /** Thumbnail from the Skylanders wiki, empty when the wiki has none. */
    image: string;
    /** Magic, Tech, Water and so on, empty when the wiki page does not say. */
    element: string;
    /**
     * One of the big Giants figures, from the wiki. Missing on figures saved before it was
     * tracked, until Collection.tsx looks them up again.
     */
    giant?: boolean;
    /** Set on magic items and adventure packs, missing on Skylanders. */
    item?: ItemKind;
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
    /**
     * A picture of each version, from the wiki. Missing on figures saved before it was tracked,
     * until Collection.tsx looks them up again.
     */
    looks?: Looks;
    /**
     * The figure's official catchphrase from the wiki, like "All Fired Up!", empty when the page
     * has none. Missing on figures saved before it was tracked, until Collection.tsx looks them up
     * again.
     */
    catchphrase?: string;
    /** A recording of the catchphrase, which only some wiki pages have, empty otherwise. */
    voice?: string;
    /**
     * Special paint jobs of this figure with wiki pages of their own, like Springtime Trigger
     * Happy. Missing on figures saved before they were tracked, until Collection.tsx looks them up
     * again.
     */
    editions?: Edition[];
    /**
     * Which version of the wiki lookup filled these details in, see detailsVersion in
     * services/wiki.ts. Older or missing means Collection.tsx looks the figure up again.
     */
    detailsVersion?: number;
}

/** What a wiki lookup knows about a figure, before it is stored. */
export type SkylanderDetails = Omit<Skylander, 'id' | 'count' | 'variants'>;

/** One search suggestion, with a small picture for the dropdown. */
export interface CatalogEntry
{
    /** As shown, without the wiki's "(character)". */
    name: string;
    /** The wiki page title, for looking the figure up. */
    title: string;
    /** Small wiki thumbnail, empty for the few pages without one. */
    thumb: string;
    /** Empty when the wiki page does not say, like on Kaos. */
    element: string;
    giant: boolean;
    /** Set on magic items and adventure packs, see Skylander. */
    item?: ItemKind;
}
