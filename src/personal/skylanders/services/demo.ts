import type { Skylander, SkylanderDetails } from '../types';

import { slug, type VariantCounts, type VersionId } from '../content/variants';

import { lookup } from './wiki';

/*
 * A stand-in for services/db.ts with ?demo in the URL, see pages/Skylanders.tsx, so the page can
 * be shown to people without the password or the real collection. It keeps a sample collection in
 * memory and never touches Firebase. Reloading starts over from the samples.
 */

/**
 * A mix of elements, games and name lengths, with duplicates for the blue coin, a few special
 * versions for the variant tags and frame, and two items.
 */
const samples: [name: string, count: number, variants: VariantCounts][] = [
    ['Spyro', 2, { dark: 1 }],
    ['Chop Chop', 1, {}],
    ['Dino-Rang', 3, { eonsElite: 1 }],
    ['Trigger Happy', 3, { series2: 1, 'edition-springtime': 1 }],
    ['Stealth Elf', 1, { legendary: 1 }],
    ['Eruptor', 3, { series2: 1, lightcore: 1 }],
    ['Gill Grunt', 1, {}],
    ['Hex', 1, {}],
    ['Tree Rex', 1, {}],
    ['Jet-Vac', 1, {}],
    ['Knight Light', 1, {}],
    // A magic item and an adventure pack, for the items shelf and coin.
    ['Ghost Pirate Swords', 1, {}],
    ['Pirate Seas', 1, {}],
];

const items = new Map<string, Skylander>();
const listeners = new Set<(items: Skylander[]) => void>();
const watchers = new Set<(signedIn: boolean) => void>();
let signedIn = true;
let seeded: Promise<void> | undefined;

function sorted(): Skylander[]
{
    return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function publish()
{
    const list = sorted();

    for (const listener of listeners)
        listener(list);

}

/** Fills in the samples with real wiki pictures and details, once. */
function seed(): Promise<void>
{
    seeded ??= Promise.all(
        samples.map(async ([name, count, variants]) =>
        {
            const details = await lookup(name);
            const id = slug(details.title);

            items.set(id, { ...details, id, count, variants });
        }),
    ).then(publish);

    return seeded;
}

function setSignedIn(value: boolean)
{
    signedIn = value;

    for (const watcher of watchers)
        watcher(value);

}

export function watchSignedIn(callback: (signedIn: boolean) => void): () => void
{
    watchers.add(callback);
    callback(signedIn);

    return () => watchers.delete(callback);
}

/** Any password opens the portal, except "wrong", which is there to try the error shake. */
export async function signIn(password: string): Promise<void>
{
    if (password === 'wrong')
        throw new Error('Wrong password');

    setSignedIn(true);
}

export async function signOut(): Promise<void>
{
    setSignedIn(false);
}

export function watchCollection(
    callback: (items: Skylander[]) => void,
    onError: (error: Error) => void,
): () => void
{
    listeners.add(callback);
    seed().catch(onError);

    if (items.size > 0)
        callback(sorted());

    return () => listeners.delete(callback);
}

export async function addSkylander(item: SkylanderDetails, variant?: VersionId): Promise<number>
{
    const id = slug(item.title);
    const existing = items.get(id);
    const count = (existing?.count ?? 0) + 1;
    const variants = { ...existing?.variants };

    if (variant)
        variants[variant] = (variants[variant] ?? 0) + 1;

    items.set(id, { ...item, id, count, variants });
    publish();

    return count;
}

export async function changeCount(id: string, delta: number, variant?: VersionId): Promise<void>
{
    const item = items.get(id);

    if (item)
    {
        const variants = variant
            ? { ...item.variants, [variant]: (item.variants[variant] ?? 0) + delta }
            : item.variants;

        items.set(id, { ...item, count: item.count + delta, variants });
    }

    publish();
}

export async function updateDetails(id: string, details: Partial<SkylanderDetails>): Promise<void>
{
    const item = items.get(id);

    if (item)
        items.set(id, { ...item, ...details });

    publish();
}

export async function removeSkylander(id: string): Promise<void>
{
    items.delete(id);
    publish();
}
