import { useState } from 'react';

import type { Skylander } from '../types';

import { SkylanderCard } from './SkylanderCard';

interface SkylanderGridProps
{
    items: Skylander[];
    onRemove: (item: Skylander) => void;
    onVariants: (item: Skylander) => void;
}

/**
 * The card grid. Cards present when it mounts play the staggered entrance, cards added later
 * are left to the view transition in Collection.tsx, because the entrance starts invisible and
 * the transition would capture that empty frame. Collection.tsx keys this on the filter, so a
 * new filter mounts it fresh and replays the entrance. The React Compiler memoises it, so typing
 * in the search, which re-renders Collection.tsx on every key, leaves the cards alone.
 */
export function SkylanderGrid({
    items,
    onRemove,
    onVariants,
}: SkylanderGridProps)
{
    const [intro] = useState(() => new Set(items.map((item) => item.id)));

    return (
        <ul className="sky-grid">
            {items.map((item, index) => (
                <SkylanderCard
                    key={item.id}
                    item={item}
                    index={index}
                    intro={intro.has(item.id)}
                    onRemove={onRemove}
                    onVariants={onVariants}
                />
            ))}
        </ul>
    );
}
