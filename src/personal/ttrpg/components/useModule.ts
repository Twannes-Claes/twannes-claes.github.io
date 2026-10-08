import { useEffect, useState } from 'react';

/**
 * A module loaded on demand once wanted, null until it arrives. The pages load everything that
 * needs Convex this way, so it stays out of the portfolio bundle, never runs during the
 * prerender, and the demo never loads it. load must be a module-level function: an import()
 * written inside a component makes the React Compiler skip it, see CLAUDE.md.
 */
export function useModule<T>(load: () => Promise<T>, wanted: boolean): T | null
{
    const [loaded, setLoaded] = useState<T | null>(null);

    useEffect(() =>
    {
        if (!wanted)
            return;

        let cancelled = false;

        load().then((module) =>
        {
            if (!cancelled)
                setLoaded(module);

        });

        return () =>
        {
            cancelled = true;
        };
    }, [load, wanted]);

    return loaded;
}
