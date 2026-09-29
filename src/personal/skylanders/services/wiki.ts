import type { Skylander } from '../types';

/*
 * There is no official Skylanders API, so this reads the fan wiki at skylanders.fandom.com through
 * its MediaWiki API. origin=* is what makes MediaWiki answer with CORS headers.
 */

const api = 'https://skylanders.fandom.com/api.php';

const elements = [
    'Magic',
    'Tech',
    'Water',
    'Fire',
    'Earth',
    'Air',
    'Life',
    'Undead',
    'Light',
    'Dark',
    'Kaos',
];

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

/** Every page in Category:Skylanders, used for the name suggestions. */
export async function fetchNames(): Promise<string[]>
{
    const data = (await call({
        action: 'query',
        list: 'categorymembers',
        cmtitle: 'Category:Skylanders',
        cmnamespace: '0',
        cmlimit: '500',
    })) as { query: { categorymembers: { title: string }[] } };

    return data.query.categorymembers.map((member) => member.title);
}

interface WikiPage
{
    title: string;
    missing?: string;
    thumbnail?: { source: string };
    categories?: { title: string }[];
}

/** Looks a name up on the wiki. Unknown names still come back, just without the extras. */
export async function lookup(name: string): Promise<Omit<Skylander, 'id'>>
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
        element: elements.find((element) => categories.has(`Category:${element} Skylanders`)) ?? '',
        game:
            games.find((game) => categories.has(`Category:Skylanders: ${game} Characters`)) ?? '',
        url: `https://skylanders.fandom.com/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    };
}
