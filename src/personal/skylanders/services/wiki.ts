import type { CatalogEntry, SkylanderDetails } from '../types';

import { elements } from '../content/elements';
import {
    editionId,
    variants,
    wikiPage,
    type Edition,
    type Look,
    type Looks,
    type VariantId,
} from '../content/variants';

/*
 * There is no official Skylanders API, so this reads the fan wiki at skylanders.fandom.com through
 * its MediaWiki API. origin=* is what makes MediaWiki answer with CORS headers.
 */

const api = 'https://skylanders.fandom.com/api.php';

/** Release order, so the first category match is the game a figure debuted in. */
const games = [
    "Spyro's Adventure",
    'Giants',
    'Swap Force',
    'Trap Team',
    'SuperChargers',
    'Imaginators',
];

/** Versions the wiki marks with a category on the figure's own page. */
const categoryVersions: { id: VariantId; category: string }[] = [
    { id: 'series2', category: 'Category:Series 2 Skylanders' },
    { id: 'series3', category: 'Category:Series 3 Skylanders' },
    { id: 'lightcore', category: 'Category:LightCore Skylanders' },
];

/** Repaints the wiki gives a page of their own, named with a prefix, like "Legendary Spyro". */
const pageVersions = variants.flatMap(({ id, page }) => (page ? [{ id, prefix: page }] : []));

/** The repaints that also sit in Category:Skylanders, and so would show up in the search. */
const repaintCategories = ['Category:Dark Edition Skylanders', "Category:Eon's Elite"];

async function call(params: Record<string, string>): Promise<unknown>
{
    const search = new URLSearchParams({ format: 'json', origin: '*', ...params });
    const response = await fetch(`${api}?${search}`);

    if (!response.ok)
        throw new Error(`Skylanders wiki answered ${response.status}`);

    return response.json();
}

interface WikiPage
{
    title: string;
    missing?: string;
    thumbnail?: { source: string };
    categories?: { title: string }[];
    revisions?: { slots: { main: { '*': string } } }[];
}

/** Titles of every page in a category, for the version lists below. */
async function members(category: string): Promise<string[]>
{
    const data = (await call({
        action: 'query',
        list: 'categorymembers',
        cmtitle: category,
        cmnamespace: '0',
        cmlimit: '500',
    })) as { query: { categorymembers: { title: string }[] } };

    return data.query.categorymembers.map((page) => page.title);
}

/**
 * What marks a page as an actual figure: an element, or being a Sensei, since Kaos (Sensei) has no
 * element category. Category:Skylanders also holds topic pages like "Trap Team" or "Minis", and
 * TV-only characters, which have neither.
 */
const figureCategories = [
    ...elements.map(({ name }) => `Category:${name} Skylanders`),
    'Category:Male Senseis',
    'Category:Female Senseis',
];

/**
 * Characters that never came out as a figure, so they are no use in a collection: the mobile
 * game Lost Islands' own characters like Birthday Bash, the digital-only ones from the Trap Team
 * tablet, pre-made Imaginators, TV-only characters, and scrapped or unreleased ones.
 */
const notFigureCategories = [
    'Category:Lost Islands Exclusive Skylanders',
    'Category:Tablet Exclusives',
    'Category:Instant Skylanders',
    'Category:Imaginators',
    'Category:TV Exclusive Characters',
    'Category:Non-Playable Characters',
    'Category:Scrapped Content',
];

/** The eight Giants and their repaints, plus a couple of pages that are not figures. */
const giantCategory = 'Category:Giants';

/**
 * Special paint jobs of a figure, like Legendary Stealth Elf or Springtime Trigger Happy. The wiki
 * gives each a page of its own, but here they are versions of the figure, see content/variants.ts.
 */
const altDecoCategory = 'Category:Alt Deco Skylanders';

/**
 * A figure's SuperChargers release, like Double Dare Trigger Happy. A figure of its own on the
 * wiki, but collected as a version of the original here, the same as a paint job.
 */
const reissueCategory = 'Category:SuperCharger Versions of Previous Skylanders';

function elementOf(categories: Set<string>): string
{
    return elements.find(({ name }) => categories.has(`Category:${name} Skylanders`))?.name ?? '';
}

interface CatalogPage
{
    title: string;
    thumb: string;
    categories: Set<string>;
    /** An actual figure, see figureCategories. */
    figure: boolean;
    /** Never came out as a figure, see notFigureCategories. */
    unreleased: boolean;
    /**
     * For a paint job or a SuperChargers release of another figure, the original figure's name,
     * empty for everything else. Found through the longest figure name the title ends with, and
     * followed down, so Dark Super Shot Stealth Elf comes back to Stealth Elf through Super Shot
     * Stealth Elf.
     */
    base: string;
}

let catalogPages: Promise<CatalogPage[]> | undefined;

/** The categories fetchPages() asks about. */
const catalogCategories = [
    ...figureCategories,
    ...notFigureCategories,
    giantCategory,
    altDecoCategory,
    reissueCategory,
];

const cacheKey = 'skylanders-catalog';

/**
 * The pages as the last visit fetched them. Stored with the categories they were sorted by, so a
 * change to the lists above throws an old copy away instead of using it.
 */
interface CachedCatalog
{
    categories: string[];
    pages: (Omit<CatalogPage, 'categories'> & { categories: string[] })[];
}

/** The last visit's pages, or nothing when there are none or storage is blocked. */
function readCache(): CatalogPage[] | undefined
{
    try
    {
        const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as CachedCatalog | null;

        if (cached?.categories.join('|') !== catalogCategories.join('|'))
            return undefined;

        return cached.pages.map((page) => ({ ...page, categories: new Set(page.categories) }));
    }
    catch
    {
        // Storage blocked or the copy unreadable, the wiki is asked instead.
        return undefined;
    }
}

function writeCache(pages: CatalogPage[])
{
    const cached: CachedCatalog = {
        categories: catalogCategories,
        pages: pages.map((page) => ({ ...page, categories: [...page.categories] })),
    };

    try
    {
        localStorage.setItem(cacheKey, JSON.stringify(cached));
    }
    catch
    {
        // Storage blocked or full, the next visit just waits for the wiki again.
    }
}

/**
 * Every page in Category:Skylanders, straight from the wiki. The category holds a few hundred
 * pages, which a single request covers. Dark and Eon's Elite repaints are found through their own
 * categories as well, since not all of them are marked Alt Deco.
 */
function downloadPages(): Promise<CatalogPage[]>
{
    return Promise.all([
        call({
            action: 'query',
            generator: 'categorymembers',
            gcmtitle: 'Category:Skylanders',
            gcmnamespace: '0',
            gcmlimit: '500',
            prop: 'pageimages|categories',
            piprop: 'thumbnail',
            pithumbsize: '96',
            // Only asks about the categories used here, so each page lists at most a few.
            clcategories: catalogCategories.join('|'),
            cllimit: '500',
        }) as Promise<{ query: { pages: Record<string, WikiPage> } }>,
        ...repaintCategories.map(members),
    ]).then(([data, ...repaints]) =>
    {
        const repainted = new Set(repaints.flat());
        const pages = Object.values(data.query.pages).map((page) =>
        {
            const categories = new Set(page.categories?.map(({ title }) => title));

            return {
                title: page.title,
                thumb: page.thumbnail?.source ?? '',
                categories,
                // Giants alone does not make a figure, it also holds pages like "Giant Chest".
                figure: figureCategories.some((category) => categories.has(category)),
                unreleased: notFigureCategories.some((category) => categories.has(category)),
                repaint:
                    categories.has(altDecoCategory) ||
                    categories.has(reissueCategory) ||
                    repainted.has(page.title),
            };
        });
        const figures = pages.filter((page) => page.figure).map((page) => page.title);
        // Each version's direct original, before following it down.
        const parents = new Map(
            pages
                .filter((page) => page.repaint)
                .map((page) => [
                    page.title,
                    figures
                        .filter((name) => name !== page.title && page.title.endsWith(` ${name}`))
                        .sort((a, b) => b.length - a.length)[0] ?? '',
                ]),
        );
        const original = (title: string): string =>
        {
            const parent = parents.get(title);

            return parent ? original(parent) : title;
        };

        return pages.map(({ repaint, ...page }) => ({
            ...page,
            base: repaint && parents.get(page.title) ? original(page.title) : '',
        }));
    });
}

/**
 * The catalog pages, shared by the search and the lookups. The last visit's copy is used straight
 * away, so the search opens without waiting for the wiki, and a fresh copy is saved behind it for
 * next time. The wiki changes rarely, so one visit behind is close enough.
 */
function fetchPages(): Promise<CatalogPage[]>
{
    if (catalogPages)
        return catalogPages;

    const download = downloadPages();
    const cached = readCache();

    // A failure is reported through catalogPages when there is no copy, and harmless when there is.
    download.then(writeCache).catch(() => undefined);
    catalogPages = cached ? Promise.resolve(cached) : download;

    // A failed request is asked again next time rather than kept.
    catalogPages.catch(() =>
    {
        catalogPages = undefined;
    });

    return catalogPages;
}

/**
 * A figure's name as shown, without the "(character)" the wiki adds to tell it apart from a page
 * of the same name, like Blaster-Tron (character). The page title stays in `title`, for lookups.
 */
function displayName(title: string): string
{
    return title.replace(/\s*\(character\)$/i, '');
}

/**
 * Every figure with a small thumbnail, for the search dropdown. Paint jobs of another figure are
 * left out, since they are picked as a version of that figure when adding it.
 */
export async function fetchCatalog(): Promise<CatalogEntry[]>
{
    const pages = await fetchPages();

    return pages
        .filter((page) => page.figure && !page.unreleased && !page.base)
        .map((page) => ({
            name: displayName(page.title),
            title: page.title,
            thumb: page.thumb,
            element: elementOf(page.categories),
            giant: page.categories.has(giantCategory),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A figure's special paint jobs, like Springtime and Power Blue for Trigger Happy, with the
 * picture from their page at the size of the other version pictures. Legendary, Dark and Eon's
 * Elite are left to the variants, which cover them for every figure.
 */
async function editionsOf(name: string): Promise<Edition[]>
{
    const pages = await fetchPages();
    const variantPrefixes = new Set(pageVersions.map(({ prefix }) => prefix));

    return pages
        .filter((page) => page.base === name && !page.unreleased)
        .map((page) => ({ page, prefix: page.title.slice(0, -name.length - 1) }))
        .filter(({ prefix }) => !variantPrefixes.has(prefix))
        .map(({ page, prefix }) => ({
            id: editionId(prefix),
            name: prefix,
            title: page.title,
            image: page.thumb.replace(/scale-to-width-down\/\d+/, `scale-to-width-down/${lookSize}`),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** Size of the version pictures, the same as the portrait from lookup(). */
const lookSize = '300';

/**
 * Which repaints of a figure exist, from whether their "Legendary X" style pages do, with the
 * picture on each page.
 */
async function repaintsOf(name: string): Promise<{ id: VariantId; thumb: string }[]>
{
    const titles = new Map(pageVersions.map(({ id, prefix }) => [`${prefix} ${name}`, id]));
    const data = (await call({
        action: 'query',
        titles: [...titles.keys()].join('|'),
        redirects: '1',
        prop: 'pageimages',
        piprop: 'thumbnail',
        pithumbsize: lookSize,
    })) as { query: { pages: Record<string, WikiPage> } };

    // A redirect lands on another title, often the figure itself, so only an exact match counts.
    return Object.values(data.query.pages)
        .filter((page) => page.missing === undefined && titles.has(page.title))
        .map((page) => ({
            id: titles.get(page.title) as VariantId,
            thumb: page.thumbnail?.source ?? '',
        }));
}

/** The tabs over the infobox picture, S1 being the first release. */
const lookTabs: Record<string, Look> = {
    S1: 'normal',
    S2: 'series2',
    S3: 'series3',
    LC: 'lightcore',
};

/**
 * File names of the infobox pictures by version. The infobox shows one per series, either as a
 * gallery of "Spyro.jpg|S1" lines or as tabs of "S1 = [[File:Spyro.jpg|290px]]".
 */
function infoboxFiles(wikitext: string): Map<Look, string>
{
    const files = new Map<Look, string>();
    const field = /\|\s*image\s*=\s*(<(gallery|tabber)>[\s\S]*?<\/\2>)/i.exec(wikitext)?.[1] ?? '';
    const lines = [
        ...field.matchAll(/^\s*(?:(?:File|Image):)?([^|\n=[\]]+?)\s*\|\s*(\w+)\s*$/gim),
    ].map(([, file, tab]) => ({ file, tab }));
    const tabs = [...field.matchAll(/^\s*(\w+)\s*=\s*\[\[(?:File|Image):([^|\]]+)/gim)].map(
        ([, tab, file]) => ({ file, tab }),
    );

    for (const { file, tab } of [...lines, ...tabs])
    {
        const look = lookTabs[tab.toUpperCase()];

        if (look && !files.has(look))
            files.set(look, file.trim());

    }

    return files;
}

/**
 * The catchphrase in the quote at the top of a figure's page, and the recording of it that some
 * pages add inside the quote: {{Quote|All Fired Up!|Spyro's official catchphrase<br>[[File:Spyro
 * Catchphrase.mp3]]}}.
 */
function catchphraseOf(wikitext: string): { line: string; file: string }
{
    const quote = /\{\{\s*quote\s*\|([^|}]*)\|([^\n]*?)\}\}/i.exec(wikitext);

    if (!quote)
        return { line: '', file: '' };

    // Drops wiki markup: ''italics'', '''bold''' and [[links|with labels]].
    const line = quote[1]
        .replace(/'{2,}/g, '')
        .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
        .trim();
    const file = /\[\[(?:File|Media):([^|\]]+\.(?:mp3|ogg|oga|wav))/i.exec(quote[2])?.[1] ?? '';

    return { line, file: file.trim() };
}

/**
 * Links for wiki file names, keyed by the name they were asked for: a picture at the size of the
 * version pictures, or a recording as it is.
 */
async function fileThumbs(files: string[]): Promise<Map<string, string>>
{
    if (files.length === 0)
        return new Map();

    const data = (await call({
        action: 'query',
        titles: files.map((file) => `File:${file}`).join('|'),
        prop: 'imageinfo',
        iiprop: 'url',
        iiurlwidth: lookSize,
    })) as {
        query: {
            normalized?: { from: string; to: string }[];
            pages: Record<
                string,
                { title: string; imageinfo?: { thumburl?: string; url?: string }[] }
            >;
        };
    };
    // The wiki answers with its own spelling of a name, spaces for underscores and a capital first.
    const spelled = new Map(data.query.normalized?.map(({ from, to }) => [to, from]));
    const thumbs = new Map<string, string>();

    for (const page of Object.values(data.query.pages))
    {
        // Recordings have no thumbnail, only their own link.
        const thumb = page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url;

        if (thumb)
            thumbs.set((spelled.get(page.title) ?? page.title).replace(/^File:/, ''), thumb);

    }

    return thumbs;
}

/**
 * A picture of each version of a figure: the infobox tabs, with their links from fileThumbs(),
 * and the repaint pages.
 */
function looksOf(
    files: Map<Look, string>,
    thumbs: Map<string, string>,
    portrait: string,
    repaints: { id: VariantId; thumb: string }[],
): Looks
{
    const looks: Looks = {};

    for (const [look, file] of files)
    {
        const thumb = thumbs.get(file);

        if (thumb)
            looks[look] = thumb;

    }

    // Figures from a single series have one plain picture, which is the page's own.
    looks.normal ??= portrait || undefined;

    for (const { id, thumb } of repaints)
    {
        if (thumb)
            looks[id] = thumb;

    }

    // Firestore refuses fields set to undefined.
    return Object.fromEntries(Object.entries(looks).filter(([, thumb]) => thumb)) as Looks;
}

/**
 * Which version of lookup() saved a figure's details. Raised whenever the lookup finds something
 * new for figures it already knew, like more editions, so Collection.tsx looks saved figures up
 * again once.
 */
export const detailsVersion = 3;

/** Lookups made this visit, by name, so cancelling a figure and picking it again is instant. */
const lookups = new Map<string, Promise<SkylanderDetails>>();

/**
 * Looks a figure up on the wiki by its page title, see CatalogEntry. Unknown names still come
 * back, just without the extras.
 */
export function lookup(name: string): Promise<SkylanderDetails>
{
    let details = lookups.get(name);

    if (!details)
    {
        details = fetchDetails(name);
        lookups.set(name, details);
        // A failed lookup is asked again next time rather than kept.
        details.catch(() => lookups.delete(name));
    }

    return details;
}

async function fetchDetails(name: string): Promise<SkylanderDetails>
{
    const data = (await call({
        action: 'query',
        titles: name,
        prop: 'pageimages|categories|revisions',
        piprop: 'thumbnail',
        pithumbsize: lookSize,
        cllimit: '100',
        // Only the top of the page, where the infobox with the version pictures is.
        rvprop: 'content',
        rvslots: 'main',
        rvsection: '0',
        redirects: '1',
    })) as { query: { pages: Record<string, WikiPage> } };

    const page = Object.values(data.query.pages)[0];

    if (!page || page.missing !== undefined)
    {
        return {
            name: displayName(name),
            title: name,
            image: '',
            element: '',
            giant: false,
            game: '',
            url: '',
            versions: [],
            looks: {},
            catchphrase: '',
            voice: '',
            editions: [],
            detailsVersion,
        };
    }

    const categories = new Set((page.categories ?? []).map((category) => category.title));
    const image = page.thumbnail?.source ?? '';
    const wikitext = page.revisions?.[0]?.slots.main['*'] ?? '';
    const pictures = infoboxFiles(wikitext);
    const catchphrase = catchphraseOf(wikitext);
    // The version pictures and the recording in one request.
    // A lookup without the editions still adds the figure, it just offers none.
    const [repaints, links, editions] = await Promise.all([
        repaintsOf(page.title),
        fileThumbs([...pictures.values(), catchphrase.file].filter(Boolean)),
        editionsOf(page.title).catch(() => []),
    ]);
    const looks = looksOf(pictures, links, image, repaints);
    const found = new Set([
        ...categoryVersions
            .filter(({ category }) => categories.has(category))
            .map(({ id }) => id),
        ...repaints.map(({ id }) => id),
    ]);

    return {
        name: displayName(page.title),
        title: page.title,
        image,
        element: elementOf(categories),
        giant: categories.has(giantCategory),
        // Every figure is in the plain game category, only some also in the "Characters" one.
        game:
            games.find(
                (game) =>
                    categories.has(`Category:Skylanders: ${game}`) ||
                    categories.has(`Category:Skylanders: ${game} Characters`),
            ) ?? '',
        url: wikiPage(page.title),
        // In the order of content/variants.ts, so the dialog lists them the same way every time.
        versions: variants.map(({ id }) => id).filter((id) => found.has(id)),
        looks,
        catchphrase: catchphrase.line,
        voice: links.get(catchphrase.file) ?? '',
        editions,
        detailsVersion,
    };
}
