import type { VariantCounts, VariantId } from '../content/variants';
import type { Skylander, SkylanderDetails } from '../types';

import { lookup } from './wiki';

/*
 * A stand-in for services/db.ts under `npm run dev` with ?mock in the URL, see
 * pages/Skylanders.tsx. It keeps the collection in memory and never touches Firebase, so the page
 * can be tried out without the password. Reloading starts over from the samples.
 */

/**
 * A mix of elements, games and name lengths, with duplicates for the second coin and a few
 * special versions for the variant tags and frame.
 */
const samples: [name: string, count: number, variants: VariantCounts][] = [
    ['Spyro', 2, { dark: 1 }],
    ['Chop Chop', 1, {}],
    ['Dino-Rang', 3, { eonsElite: 1 }],
    ['Trigger Happy', 2, {}],
    ['Stealth Elf', 1, { legendary: 1 }],
    ['Eruptor', 1, {}],
    ['Gill Grunt', 1, {}],
    ['Hex', 1, {}],
    ['Tree Rex', 1, {}],
    ['Jet-Vac', 1, {}],
    ['Knight Light', 1, {}],
];

const items = new Map<string, Skylander>();
const listeners = new Set<(items: Skylander[]) => void>();
const watchers = new Set<(signedIn: boolean) => void>();
let signedIn = true;
let seeded: Promise<void> | undefined;

function idFor(name: string): string
{
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function publish()
{
    const sorted = [...items.values()].sort((a, b) => a.name.localeCompare(b.name));

    for (const listener of listeners)
        listener(sorted);

}

/** Fills in the samples with real wiki pictures and details, once. */
function seed(): Promise<void>
{
    seeded ??= Promise.all(
        samples.map(async ([name, count, variants]) =>
        {
            const details = await lookup(name);
            const id = idFor(details.name);

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
        callback([...items.values()].sort((a, b) => a.name.localeCompare(b.name)));

    return () => listeners.delete(callback);
}

export async function addSkylander(item: SkylanderDetails): Promise<number>
{
    const id = idFor(item.name);
    const existing = items.get(id);
    const count = (existing?.count ?? 0) + 1;

    items.set(id, { ...item, id, count, variants: existing?.variants ?? {} });
    publish();

    return count;
}

export async function changeCount(id: string, delta: number, variant?: VariantId): Promise<void>
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
