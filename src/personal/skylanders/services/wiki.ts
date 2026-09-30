import type { CatalogEntry, SkylanderDetails } from '../types';

import { elements } from '../content/elements';
import { variants, wikiPage, type Look, type Looks, type VariantId } from '../content/variants';

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

/** The eight Giants and their repaints, plus a couple of pages that are not figures. */
const giantCategory = 'Category:Giants';

function elementOf(categories: Set<string>): string
{
    return elements.find(({ name }) => categories.has(`Category:${name} Skylanders`))?.name ?? '';
}

/**
 * Every figure in Category:Skylanders with a small thumbnail, for the search dropdown. The
 * category holds a few hundred pages, which a single request covers. Dark and Eon's Elite repaints
 * have pages of their own in it, but they are versions of a figure here, see content/variants.ts,
 * so they are left out.
 */
export async function fetchCatalog(): Promise<CatalogEntry[]>
{
    const [data, ...repaints] = await Promise.all([
        call({
            action: 'query',
            generator: 'categorymembers',
            gcmtitle: 'Category:Skylanders',
            gcmnamespace: '0',
            gcmlimit: '500',
            prop: 'pageimages|categories',
            piprop: 'thumbnail',
            pithumbsize: '96',
            // Only asks about the figure categories and Giants, so each page lists at most a few.
            clcategories: [...figureCategories, giantCategory].join('|'),
            cllimit: '500',
        }) as Promise<{ query: { pages: Record<string, WikiPage> } }>,
        ...repaintCategories.map(members),
    ]);
    const skip = new Set(repaints.flat());

    return Object.values(data.query.pages)
        .map((page) => ({ page, categories: new Set(page.categories?.map(({ title }) => title)) }))
        // Giants alone does not make a figure, it also holds pages like "Giant Chest".
        .filter(
            ({ page, categories }) =>
                figureCategories.some((category) => categories.has(category)) &&
                !skip.has(page.title),
        )
        .map(({ page, categories }) => ({
            name: page.title,
            thumb: page.thumbnail?.source ?? '',
            element: elementOf(categories),
            giant: categories.has(giantCategory),
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

/** Picture links for wiki file names, keyed by the name they were asked for. */
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
            pages: Record<string, { title: string; imageinfo?: { thumburl?: string }[] }>;
        };
    };
    // The wiki answers with its own spelling of a name, spaces for underscores and a capital first.
    const spelled = new Map(data.query.normalized?.map(({ from, to }) => [to, from]));
    const thumbs = new Map<string, string>();

    for (const page of Object.values(data.query.pages))
    {
        const thumb = page.imageinfo?.[0]?.thumburl;

        if (thumb)
            thumbs.set((spelled.get(page.title) ?? page.title).replace(/^File:/, ''), thumb);

    }

    return thumbs;
}

/** A picture of each version of a figure: the infobox tabs, and the repaint pages. */
async function looksOf(
    wikitext: string,
    portrait: string,
    repaints: { id: VariantId; thumb: string }[],
): Promise<Looks>
{
    const files = infoboxFiles(wikitext);
    const thumbs = await fileThumbs([...files.values()]);
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

/** Looks a name up on the wiki. Unknown names still come back, just without the extras. */
export async function lookup(name: string): Promise<SkylanderDetails>
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
            name,
            image: '',
            element: '',
            giant: false,
            game: '',
            url: '',
            versions: [],
            looks: {},
        };
    }

    const categories = new Set((page.categories ?? []).map((category) => category.title));
    const image = page.thumbnail?.source ?? '';
    const repaints = await repaintsOf(page.title);
    const looks = await looksOf(page.revisions?.[0]?.slots.main['*'] ?? '', image, repaints);
    const found = new Set([
        ...categoryVersions
            .filter(({ category }) => categories.has(category))
            .map(({ id }) => id),
        ...repaints.map(({ id }) => id),
    ]);

    return {
        name: page.title,
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
    };
}
