import type { CatalogEntry, SkylanderDetails } from '../types';

import { elements } from '../content/elements';
import { variants, type VariantId } from '../content/variants';

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
const pageVersions: { id: VariantId; prefix: string }[] = [
    { id: 'legendary', prefix: 'Legendary' },
    { id: 'dark', prefix: 'Dark' },
    { id: 'eonsElite', prefix: 'Elite' },
];

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
            // Only asks about the figure categories, so each page lists at most a couple.
            clcategories: figureCategories.join('|'),
            cllimit: '500',
        }) as Promise<{ query: { pages: Record<string, WikiPage> } }>,
        ...repaintCategories.map(members),
    ]);
    const skip = new Set(repaints.flat());

    return Object.values(data.query.pages)
        .filter((page) => page.categories && !skip.has(page.title))
        .map((page) => ({ name: page.title, thumb: page.thumbnail?.source ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** Which repaints of a figure exist, from whether their "Legendary X" style pages do. */
async function repaintsOf(name: string): Promise<VariantId[]>
{
    const titles = new Map(pageVersions.map(({ id, prefix }) => [`${prefix} ${name}`, id]));
    const data = (await call({
        action: 'query',
        titles: [...titles.keys()].join('|'),
        redirects: '1',
    })) as { query: { pages: Record<string, WikiPage> } };

    // A redirect lands on another title, often the figure itself, so only an exact match counts.
    return Object.values(data.query.pages)
        .filter((page) => page.missing === undefined && titles.has(page.title))
        .map((page) => titles.get(page.title) as VariantId);
}

/** Looks a name up on the wiki. Unknown names still come back, just without the extras. */
export async function lookup(name: string): Promise<SkylanderDetails>
{
    const data = (await call({
        action: 'query',
        titles: name,
        prop: 'pageimages|categories',
        piprop: 'thumbnail',
        pithumbsize: '300',
        cllimit: '100',
        redirects: '1',
    })) as { query: { pages: Record<string, WikiPage> } };

    const page = Object.values(data.query.pages)[0];

    if (!page || page.missing !== undefined)
        return { name, image: '', element: '', game: '', url: '', versions: [] };

    const categories = new Set((page.categories ?? []).map((category) => category.title));
    const repaints = await repaintsOf(page.title);
    const found = new Set([
        ...categoryVersions
            .filter(({ category }) => categories.has(category))
            .map(({ id }) => id),
        ...repaints,
    ]);

    return {
        name: page.title,
        image: page.thumbnail?.source ?? '',
        element:
            elements.find(({ name }) => categories.has(`Category:${name} Skylanders`))?.name ?? '',
        // Every figure is in the plain game category, only some also in the "Characters" one.
        game:
            games.find(
                (game) =>
                    categories.has(`Category:Skylanders: ${game}`) ||
                    categories.has(`Category:Skylanders: ${game} Characters`),
            ) ?? '',
        url: `https://skylanders.fandom.com/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
        // In the order of content/variants.ts, so the dialog lists them the same way every time.
        versions: variants.map(({ id }) => id).filter((id) => found.has(id)),
    };
}
