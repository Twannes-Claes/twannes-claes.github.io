import type { CatalogEntry, SkylanderDetails } from '../types';

import { elements } from '../content/elements';

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

/**
 * Every page in Category:Skylanders with a small thumbnail, for the search dropdown. The category
 * holds a few hundred pages, which a single request covers.
 */
export async function fetchCatalog(): Promise<CatalogEntry[]>
{
    const data = (await call({
        action: 'query',
        generator: 'categorymembers',
        gcmtitle: 'Category:Skylanders',
        gcmnamespace: '0',
        gcmlimit: '500',
        prop: 'pageimages',
        piprop: 'thumbnail',
        pithumbsize: '96',
    })) as { query: { pages: Record<string, WikiPage> } };

    return Object.values(data.query.pages)
        .map((page) => ({ name: page.title, thumb: page.thumbnail?.source ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name));
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
        return { name, image: '', element: '', game: '', url: '' };

    const categories = new Set((page.categories ?? []).map((category) => category.title));

    return {
        name: page.title,
        image: page.thumbnail?.source ?? '',
        element:
            elements.find(({ name }) => categories.has(`Category:${name} Skylanders`))?.name ?? '',
        game:
            games.find((game) => categories.has(`Category:Skylanders: ${game} Characters`)) ?? '',
        url: `https://skylanders.fandom.com/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    };
}
