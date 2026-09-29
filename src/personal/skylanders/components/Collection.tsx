import { faStar } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type FormEvent,
} from 'react';
import { flushSync } from 'react-dom';

import type { CatalogEntry, Db, Skylander } from '../types';

import { elements } from '../content/elements';
import { fetchCatalog, lookup } from '../services/wiki';

import { ConfirmRemove } from './ConfirmRemove';
import { SkylanderGrid } from './SkylanderGrid';
import { SkylanderSearch } from './SkylanderSearch';

/**
 * Runs a list update as a view transition, so new cards pop in, removed ones pop out and the
 * rest glide into place, with the animations in styles/skylanders.css. flushSync makes React
 * render inside the callback, where the browser takes its after snapshot. Browsers without view
 * transitions, and people who reduce motion, just get the update.
 */
function withTransition(update: () => void)
{
    if (
        !('startViewTransition' in document) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
    {
        update();

        return;
    }

    document.startViewTransition(() => flushSync(update));
}

/** The add form, the element filters and the grid, shown once signed in. */
export function Collection({ db }: { db: Db })
{
    const [items, setItems] = useState<Skylander[] | null>(null);
    const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState<string | null>(null);
    /** The Skylander the remove dialog is asking about. */
    const [pending, setPending] = useState<Skylander | null>(null);

    useEffect(() =>
    {
        // The ids on screen, to tell a Skylander arriving or leaving from a count changing.
        let onScreen: Set<string> | null = null;

        return db.watchCollection(
            (next) =>
            {
                const ids = new Set(next.map((item) => item.id));
                const previous = onScreen;

                onScreen = ids;

                // Counts skip the transition, which would freeze the cards as snapshots and
                // hide the badge bump. The first load skips it too, the grid has an entrance.
                if (
                    previous &&
                    (previous.size !== ids.size || next.some((item) => !previous.has(item.id)))
                )
                    withTransition(() => setItems(next));
                else
                    setItems(next);

            },
            (error) => setMessage(error.message),
        );
    }, [db]);

    useEffect(() =>
    {
        // Feeds the suggestions and the check that a typed name is real. If it fails to load,
        // adding falls back to asking the wiki about each name.
        fetchCatalog()
            .then(setCatalog)
            .catch(() => undefined);
    }, []);

    // Ids already looked up again, so a figure the wiki still has no game for is asked once.
    const repaired = useRef(new Set<string>());

    useEffect(() =>
    {
        // Figures saved before the lookup matched every game category have none, so they get
        // looked up again once and patched. Failures are left for the next visit to retry.
        for (const item of items ?? [])
        {
            if ((item.game && item.element) || !item.url || repaired.current.has(item.id))
                continue;

            repaired.current.add(item.id);
            lookup(item.name)
                .then((details) =>
                {
                    if (details.game !== item.game || details.element !== item.element)
                    {
                        return db.updateDetails(item.id, {
                            game: details.game,
                            element: details.element,
                        });
                    }

                })
                .catch(() => undefined);
        }
    }, [items, db]);

    const owned = useMemo(() => new Set(items?.map((item) => item.name)), [items]);
    const suggestions = useMemo(
        () => catalog.filter((entry) => !owned.has(entry.name)),
        [catalog, owned],
    );

    /** Only the elements someone owns get a chip, with how many of each. */
    const counts = useMemo(() =>
    {
        const tally = new Map<string, number>();

        for (const item of items ?? [])
            tally.set(item.element, (tally.get(item.element) ?? 0) + 1);

        return elements
            .filter((element) => tally.has(element.name))
            .map((element) => ({ element, count: tally.get(element.name) ?? 0 }));
    }, [items]);

    // A filter whose last figure was just removed falls back to showing everything.
    const activeFilter = counts.some(({ element }) => element.name === filter) ? filter : null;
    const shown = useMemo(
        () => items?.filter((item) => !activeFilter || item.element === activeFilter) ?? [],
        [items, activeFilter],
    );

    const addByName = useCallback(
        async (input: string) =>
        {
            const typed = input.trim();

            // With no button to disable, a second Enter mid-add is ignored here instead, so it
            // does not count the figure twice.
            if (!typed || busy)
                return;

            const unknown = `There is no Skylander called "${typed}". Pick one from the list.`;

            // Only real Skylanders get in. Matching here also fixes the capitals, because wiki
            // titles are case sensitive.
            const known = catalog.find(
                (entry) => entry.name.toLowerCase() === typed.toLowerCase(),
            )?.name;

            if (catalog.length > 0 && !known)
            {
                setMessage(unknown);

                return;
            }

            setBusy(true);
            setMessage('');

            try
            {
                const details = await lookup(known ?? typed);

                // Without the catalog the wiki itself is the check: no page, no Skylander.
                if (!details.url)
                {
                    setMessage(unknown);

                    return;
                }

                const count = await db.addSkylander(details);

                if (count > 1)
                    setMessage(`That makes ${count} of ${details.name}!`);
                else
                    setMessage(`${details.name} joined the collection!`);

                setName('');
            }
            catch (error)
            {
                setMessage(error instanceof Error ? error.message : 'Adding failed.');
            }
            finally
            {
                setBusy(false);
            }
        },
        [busy, catalog, db],
    );

    const submit = useCallback(
        (event: FormEvent) =>
        {
            event.preventDefault();
            void addByName(name);
        },
        [addByName, name],
    );

    const pick = useCallback(
        (picked: string) =>
        {
            setName(picked);
            void addByName(picked);
        },
        [addByName],
    );

    const confirmRemove = useCallback(
        (item: Skylander) =>
        {
            setPending(null);
            db.removeSkylander(item.id).catch((error: Error) => setMessage(error.message));
        },
        [db],
    );

    const cancelRemove = useCallback(() => setPending(null), []);

    const changeCount = useCallback(
        (item: Skylander, delta: number) =>
        {
            // Taking away the last copy removes the figure, so that goes through the dialog.
            if (item.count + delta < 1)
            {
                setPending(item);

                return;
            }

            db.changeCount(item.id, delta).catch((error: Error) => setMessage(error.message));
        },
        [db],
    );

    const total = useMemo(() => items?.reduce((sum, item) => sum + item.count, 0) ?? 0, [items]);

    const showAll = useCallback(() => setFilter(null), []);

    return (
        <>
            <form onSubmit={submit} className="sky-panel sky-toolbar">
                <SkylanderSearch
                    value={name}
                    onChange={setName}
                    catalog={suggestions}
                    onPick={pick}
                />
            </form>

            <p className="sky-message" key={message} role="status">
                {message}
            </p>

            {items === null ? (
                <p className="sky-loading">Summoning the collection</p>
            ) : items.length === 0 ? (
                <p className="sky-empty">No Skylanders yet. Add your first one above!</p>
            ) : (
                <>
                    <div className="sky-stats">
                        <div className="sky-tally">
                            <div className="sky-coin">
                                <span className="sky-coin__count">{items.length}</span>
                                <span className="sky-coin__label">
                                    {items.length === 1 ? 'Skylander' : 'Skylanders'}
                                </span>
                            </div>
                            {/* Only says something new once there are duplicates. */}
                            {total > items.length && (
                                <div className="sky-coin sky-coin--blue">
                                    <span className="sky-coin__count">{total}</span>
                                    <span className="sky-coin__label">Figures</span>
                                </div>
                            )}
                        </div>
                        <div className="sky-filters" role="group" aria-label="Filter by element">
                            <button
                                type="button"
                                className="sky-chip"
                                aria-pressed={activeFilter === null}
                                onClick={showAll}
                            >
                                <FontAwesomeIcon icon={faStar} />
                                All
                            </button>
                            {counts.map(({ element, count }) => (
                                <button
                                    key={element.name}
                                    type="button"
                                    className="sky-chip"
                                    style={{ '--el': element.color } as CSSProperties}
                                    aria-pressed={activeFilter === element.name}
                                    onClick={() => setFilter(element.name)}
                                >
                                    <FontAwesomeIcon icon={element.icon} />
                                    {element.name}
                                    <span className="sky-chip__count">{count}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Keyed on the filter, so switching replays the card entrance. */}
                    <SkylanderGrid
                        key={activeFilter ?? 'all'}
                        items={shown}
                        onRemove={setPending}
                        onChangeCount={changeCount}
                    />
                </>
            )}

            <ConfirmRemove item={pending} onConfirm={confirmRemove} onCancel={cancelRemove} />
        </>
    );
}
