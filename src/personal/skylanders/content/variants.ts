export type VariantId =
    | 'series2'
    | 'series3'
    | 'lightcore'
    | 'legendary'
    | 'dark'
    | 'eonsElite'
    | 'special';

/** How many copies of each special version are owned. Plain copies are not listed. */
export type VariantCounts = Partial<Record<VariantId, number>>;

export interface Variant
{
    id: VariantId;
    name: string;
    /** Shorter label for the tags on a card. */
    short: string;
    color: string;
}

/** The special versions collectors tell apart, in the order they are listed everywhere. */
export const variants: Variant[] = [
    { id: 'series2', name: 'Series 2', short: 'S2', color: '#c9d2e6' },
    { id: 'series3', name: 'Series 3', short: 'S3', color: '#8fd6ff' },
    { id: 'lightcore', name: 'Lightcore', short: 'Lightcore', color: '#ffe45c' },
    { id: 'legendary', name: 'Legendary', short: 'Legendary', color: '#5b8cff' },
    { id: 'dark', name: 'Dark', short: 'Dark', color: '#a77bff' },
    { id: 'eonsElite', name: "Eon's Elite", short: 'Elite', color: '#f5c542' },
    // Chrome, crystal, glow in the dark, gold and the other limited runs. The wiki has no list of
    // these, so every figure offers it.
    { id: 'special', name: 'Special edition', short: 'Special', color: '#ff7ad9' },
];

/**
 * The versions a figure's dialog offers: the ones the wiki knows it came in, see services/wiki.ts,
 * plus Special edition, plus any already owned so a count is never hidden. Figures looked up
 * before versions were tracked have no list yet and get every version until the repair in
 * Collection.tsx fills it in.
 */
export function offeredVariants(known: VariantId[] | undefined, counts: VariantCounts): Variant[]
{
    if (!known)
        return variants;

    return variants.filter(
        (variant) =>
            variant.id === 'special' ||
            known.includes(variant.id) ||
            (counts[variant.id] ?? 0) > 0,
    );
}

/** The variants a figure has at least one copy of, in list order. */
export function ownedVariants(counts: VariantCounts): Variant[]
{
    return variants.filter((variant) => (counts[variant.id] ?? 0) > 0);
}

/** Copies that are not a special version: whatever the special counts do not account for. */
export function plainCount(total: number, counts: VariantCounts): number
{
    return total - variants.reduce((sum, variant) => sum + (counts[variant.id] ?? 0), 0);
}
