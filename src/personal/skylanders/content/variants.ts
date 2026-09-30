export type VariantId =
    | 'series2'
    | 'series3'
    | 'lightcore'
    | 'legendary'
    | 'dark'
    | 'eonsElite';

/** A version a figure can look like: the plain one or one of the special versions. */
export type Look = VariantId | 'normal';

/** A picture of each version the wiki has one for, see services/wiki.ts. */
export type Looks = Partial<Record<Look, string>>;

/** The plain version, next to the special ones in the dialog and on the card. */
export const normal: { id: 'normal'; name: string; color: string } = {
    id: 'normal',
    name: 'Normal',
    color: '#f5c542',
};

/**
 * The plain version under the name collectors use for it. That is the first release, so on
 * figures that were released again as Series 2 or 3 it is Series 1, like the wiki's S1 tab.
 * Figures that never had a series are just Normal.
 */
export function normalFor(versions: VariantId[] | undefined): typeof normal
{
    const series = versions?.some((id) => id === 'series2' || id === 'series3');

    return series ? { ...normal, name: 'Series 1' } : normal;
}

/** An edition's id, from its name, like "edition-springtime" for Springtime Trigger Happy. */
export type EditionId = `edition-${string}`;

/** Anything a copy can be counted as besides the plain version: a variant or an edition. */
export type VersionId = VariantId | EditionId;

/** How many copies of each special version are owned. Plain copies are not listed. */
export type VariantCounts = Partial<Record<VersionId, number>>;

/**
 * A special paint job of one figure that the wiki gives a page of its own, like Springtime
 * Trigger Happy or Jade Fire Kraken, found by services/wiki.ts. Legendary, Dark and Eon's Elite
 * are variants instead, since most figures have them.
 */
export interface Edition
{
    id: EditionId;
    /** What sets it apart, like "Springtime". */
    name: string;
    /** The wiki page, like "Springtime Trigger Happy". */
    title: string;
    image: string;
}

/** One version as the dialogs and the card list it: a variant or an edition. */
export interface Version
{
    id: VersionId;
    name: string;
    color: string;
    /**
     * For repaints the wiki gives a page of their own, the prefix of that page, like "Legendary"
     * in "Legendary Spyro". The others only differ in small details, so they link to pictures.
     */
    page?: string;
    /** An edition's own wiki page. */
    title?: string;
    /** An edition's picture. The variants' are in the figure's looks. */
    image?: string;
}

export interface Variant extends Version
{
    id: VariantId;
}

/** The special versions collectors tell apart, in the order they are listed everywhere. */
export const variants: Variant[] = [
    // Warm coral and bright cyan for the series, next to the gold of Series 1.
    { id: 'series2', name: 'Series 2', color: '#ff8466' },
    { id: 'series3', name: 'Series 3', color: '#33d6f0' },
    // Lightcore figures glow, so an electric lime.
    { id: 'lightcore', name: 'Lightcore', color: '#c4f24a' },
    // The repaints after their paint: royal blue Legendaries, violet Darks, and a rich rose
    // for Eon's Elite, which used to share Series 1's gold.
    { id: 'legendary', name: 'Legendary', color: '#4d74ff', page: 'Legendary' },
    { id: 'dark', name: 'Dark', color: '#9d6bff', page: 'Dark' },
    { id: 'eonsElite', name: "Eon's Elite", color: '#ff5c8a', page: 'Elite' },
];

/**
 * Where a version of a figure can be seen: its own wiki page, the figure's page opened on that
 * version's picture, or else an image search for the toy.
 */
export function variantLink(
    figure: { name: string; url: string; looks?: Looks },
    variant: { id: Look | EditionId; name: string; page?: string; title?: string },
): string
{
    if (variant.title)
        return wikiPage(variant.title);

    if (variant.page)
        return wikiPage(`${variant.page} ${figure.name}`);

    // The file name inside a picture link, like Series_2_Eruptor_Promo.jpg in
    // .../images/f/f7/Series_2_Eruptor_Promo.jpg/revision/latest/...
    const look = figure.looks?.[variant.id as Look] ?? '';
    const file = /\/images\/[^/]+\/[^/]+\/([^/]+)\//.exec(look)?.[1];

    // ?file= makes Fandom open the page with that picture in its lightbox.
    if (file && figure.url)
        return `${figure.url}?file=${file}`;

    const query = new URLSearchParams({
        q: `Skylanders ${figure.name} ${variant.name} figure`,
        udm: '2',
    });

    return `https://www.google.com/search?${query}`;
}

export function wikiPage(title: string): string
{
    return `https://skylanders.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/**
 * The versions a figure's dialog offers: the ones the wiki knows it came in, see services/wiki.ts,
 * plus any already owned so a count is never hidden. Figures looked up
 * before versions were tracked have no list yet and get every version until the repair in
 * Collection.tsx fills it in.
 */
export function offeredVariants(known: VariantId[] | undefined, counts: VariantCounts): Variant[]
{
    if (!known)
        return variants;

    return variants.filter(
        (variant) =>
            known.includes(variant.id) ||
            (counts[variant.id] ?? 0) > 0,
    );
}

/** The id an edition is counted under, from its name: "Power Blue" is "edition-power-blue". */
export function editionId(name: string): EditionId
{
    const slug = name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    return `edition-${slug}`;
}

/**
 * A colour of its own for each edition, from its name, so they tell apart in the dialogs and on
 * the card without a list to keep up. Bright enough to read on the dark panels.
 */
function editionColor(name: string): string
{
    let hash = 0;

    for (const letter of name)
        hash = (hash * 31 + letter.charCodeAt(0)) % 360;

    return `hsl(${hash} 80% 66%)`;
}

/** A figure's editions as versions, for the lists next to its variants. */
export function editionVersions(editions: Edition[] | undefined): Version[]
{
    return (editions ?? []).map((edition) => ({
        id: edition.id,
        name: edition.name,
        color: editionColor(edition.name),
        title: edition.title,
        image: edition.image,
    }));
}

/** The picture of a version: an edition's own, or a variant's from the figure's looks. */
export function versionImage(figure: { looks?: Looks }, version: Version): string
{
    return version.image ?? figure.looks?.[version.id as Look] ?? '';
}

/** Every special version a figure offers: its variants, then its editions. */
export function offeredVersions(item: {
    versions?: VariantId[];
    editions?: Edition[];
    variants: VariantCounts;
}): Version[]
{
    return [...offeredVariants(item.versions, item.variants), ...editionVersions(item.editions)];
}

/** The special versions a figure has at least one copy of, in list order. */
export function ownedVersions(item: {
    versions?: VariantId[];
    editions?: Edition[];
    variants: VariantCounts;
}): Version[]
{
    return offeredVersions(item).filter((version) => (item.variants[version.id] ?? 0) > 0);
}

/** Copies that are not a special version: whatever the special counts do not account for. */
export function plainCount(total: number, counts: VariantCounts): number
{
    return total - Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0);
}
