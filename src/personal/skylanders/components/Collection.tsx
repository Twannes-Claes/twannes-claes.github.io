import { faStar } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { flushSync } from 'react-dom';

import type { CatalogEntry, Db, Skylander, SkylanderDetails } from '../types';

import { elements, giant, magicItem } from '../content/elements';
import { addedMessage } from '../content/messages';
import { offeredVersions, type VersionId } from '../content/variants';
import { playVoice } from '../services/voice';
import { detailsVersion, fetchCatalog, lookup } from '../services/wiki';

import { ChooseVersion } from './ChooseVersion';
import { ConfirmRemove } from './ConfirmRemove';
import { SkylanderGrid } from './SkylanderGrid';
import { SkylanderSearch } from './SkylanderSearch';
import { VariantsDialog } from './VariantsDialog';

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
    /** The catalog is still on its way, so the search shows a spinner instead of nothing. */
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState<string | null>(null);
    /** The Skylander the remove dialog is asking about. */
    const [pending, setPending] = useState<Skylander | null>(null);
    /** Id of the Skylander in the versions dialog, looked up in items so its counts stay live. */
    const [versionsOf, setVersionsOf] = useState<string | null>(null);
    /** A figure being added, shown in ChooseVersion.tsx until it is confirmed or cancelled. */
    const [choosing, setChoosing] = useState<SkylanderDetails | null>(null);

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
            .catch(() => undefined)
            .finally(() => setCatalogLoading(false));
    }, []);

    // Ids already looked up again, so a figure the wiki still has no game for is asked once.
    const repaired = useRef(new Set<string>());

    useEffect(() =>
    {
        // Figures saved by an older lookup, or missing a game or element it did not find, get
        // looked up again once and patched, see detailsVersion in services/wiki.ts. Failures
        // are left for the next visit to retry.
        for (const item of items ?? [])
        {
            // Items have no element to find.
            const complete =
                item.game && (item.element || item.item) && item.detailsVersion === detailsVersion;

            if (complete || !item.url || repaired.current.has(item.id))
                continue;

            repaired.current.add(item.id);
            lookup(item.title)
                .then((details) =>
                    db.updateDetails(item.id, {
                        ...details,
                        game: details.game || item.game,
                        element: details.element || item.element,
                    }),
                )
                .catch(() => undefined);
        }
    }, [items, db]);

    /** How many of each figure we have, by name, so the search can say "owned". */
    const owned = new Map(items?.map((item) => [item.name, item.count]));

    /**
     * Only the elements someone owns get a chip, with how many of each, and Giants and Items a
     * chip after them once there is one.
     */
    const tally = new Map<string, number>();
    const bump = (name: string) => tally.set(name, (tally.get(name) ?? 0) + 1);

    for (const item of items ?? [])
    {
        if (item.item)
            bump(magicItem.name);
        else
            bump(item.element);

        if (item.giant)
            bump(giant.name);

    }

    const counts = [...elements, giant, magicItem]
        .filter((element) => tally.has(element.name))
        .map((element) => ({ element, count: tally.get(element.name) ?? 0 }));

    // A filter whose last figure was just removed falls back to showing everything.
    const activeFilter = counts.some(({ element }) => element.name === filter) ? filter : null;

    const shown =
        items?.filter((item) =>
        {
            if (activeFilter === magicItem.name)
                return item.item !== undefined;

            if (activeFilter === giant.name)
                return item.giant;

            return !activeFilter || item.element === activeFilter;
        }) ?? [];

    /** The Skylanders and the items apart, so the items get a shelf of their own below. */
    const figures = shown.filter((item) => !item.item);
    const things = shown.filter((item) => item.item);

    /** Stores a looked up figure, as a plain copy or one of a special version. */
    const save = async (details: SkylanderDetails, variant?: VersionId) =>
    {
        const count = await db.addSkylander(details, variant);
        const version = offeredVersions({ ...details, variants: {} }).find(
            ({ id }) => id === variant,
        );
            // "Series 2 Spyro", or an edition's own page name, like "Springtime Trigger Happy".
        const name = version ? (version.title ?? `${version.name} ${details.name}`) : details.name;

        // A copy of one already owned is counted by the figure, whichever version it is.
        setMessage(addedMessage(count > 1 ? details.name : name, count));
        setName('');
    };

    const addByName = async (input: string) =>
    {
        const typed = input.trim();

        // With no button to disable, a second Enter mid-add is ignored here instead, so it
        // does not count the figure twice.
        if (!typed || busy)
            return;

        const unknown = `There is no Skylander or item called "${typed}". Pick one from the list.`;

        // Only real Skylanders get in. Matching here also fixes the capitals, because wiki
        // titles are case sensitive.
        // Looked up by its wiki title, which can differ from the name shown, see wiki.ts.
        const known = catalog.find(
            (entry) =>
                entry.name.toLowerCase() === typed.toLowerCase() ||
                entry.title.toLowerCase() === typed.toLowerCase(),
        )?.title;

        if (catalog.length > 0 && !known)
        {
            setMessage(unknown);

            return;
        }

        setBusy(true);
        setMessage('');

        const details = await lookup(known ?? typed).catch((error: unknown) =>
        {
            setMessage(error instanceof Error ? error.message : 'Adding failed.');
        });

        setBusy(false);

        // Shows the figure first, to check the picture and pick a version, see save below.
        // Without the catalog the wiki itself is the check: no page, no Skylander.
        if (details?.url)
            setChoosing(details);
        else if (details)
            setMessage(unknown);

    };

    const choose = (details: SkylanderDetails, variant?: VersionId) =>
    {
        setChoosing(null);
        // Straight away, while the click still counts as the reason for the sound, rather
        // than after saving, which browsers could treat as a page playing on its own.
        playVoice(details.voice);
        save(details, variant).catch((error: Error) => setMessage(error.message));
    };

    // The search is left as it was, still open behind the dialog, see holdOpen in
    // SkylanderSearch.tsx.
    const cancelChoosing = () => setChoosing(null);

    const submit = (event: FormEvent) =>
    {
        event.preventDefault();
        void addByName(name);
    };

    // Leaves the typed text alone, so the list behind the dialog keeps its place for a cancel.
    const pick = (picked: string) => void addByName(picked);

    const confirmRemove = (item: Skylander) =>
    {
        setPending(null);
        db.removeSkylander(item.id).catch((error: Error) => setMessage(error.message));
    };

    const cancelRemove = () => setPending(null);

    const changeCount = (item: Skylander, delta: number, variant?: VersionId) =>
    {
        // Taking away the last copy removes the figure, so that goes through the dialog.
        if (item.count + delta < 1)
        {
            setPending(item);

            return;
        }

        db.changeCount(item.id, delta, variant).catch((error: Error) =>
            setMessage(error.message),
        );
    };

    const openVersions = (item: Skylander) => setVersionsOf(item.id);
    const closeVersions = () => setVersionsOf(null);
    const versionsItem = items?.find((item) => item.id === versionsOf) ?? null;

    const total = items?.reduce((sum, item) => sum + item.count, 0) ?? 0;
    const itemCount = items?.filter((item) => item.item).length ?? 0;
    const skylanderCount = (items?.length ?? 0) - itemCount;

    const showAll = () => setFilter(null);

    return (
        <>
            <form onSubmit={submit} className="sky-panel sky-toolbar">
                <SkylanderSearch
                    value={name}
                    onChange={setName}
                    catalog={catalog}
                    loading={catalogLoading}
                    owned={owned}
                    onPick={pick}
                    holdOpen={choosing !== null}
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
                                <span className="sky-coin__count">{skylanderCount}</span>
                                <span className="sky-coin__label">
                                    {skylanderCount === 1 ? 'Skylander' : 'Skylanders'}
                                </span>
                            </div>
                            {itemCount > 0 && (
                                <div className="sky-coin sky-coin--small sky-coin--copper">
                                    <span className="sky-coin__count">{itemCount}</span>
                                    <span className="sky-coin__label">
                                        {itemCount === 1 ? 'Item' : 'Items'}
                                    </span>
                                </div>
                            )}
                            {/* Only says something new once there are duplicates. */}
                            {total > items.length && (
                                <div className="sky-coin sky-coin--small sky-coin--blue">
                                    <span className="sky-coin__count">{total}</span>
                                    <span className="sky-coin__label">Figures</span>
                                </div>
                            )}
                        </div>
                        <div
                            className="sky-filters"
                            role="group"
                            aria-label="Filter by element, Giants or items"
                            // How many chips share the line, All included, see skylanders.css.
                            style={{ '--chips': counts.length + 1 } as CSSProperties}
                        >
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
                    {figures.length > 0 && (
                        <SkylanderGrid
                            key={activeFilter ?? 'all'}
                            items={figures}
                            onRemove={setPending}
                            onVariants={openVersions}
                        />
                    )}
                    {things.length > 0 && (
                        <>
                            {/* Only needed to tell the shelves apart when both are there. */}
                            {figures.length > 0 && (
                                <h2 className="sky-shelf">Magic items & adventure packs</h2>
                            )}
                            <SkylanderGrid
                                key={`items-${activeFilter ?? 'all'}`}
                                items={things}
                                onRemove={setPending}
                                onVariants={openVersions}
                            />
                        </>
                    )}
                </>
            )}

            <ConfirmRemove item={pending} onConfirm={confirmRemove} onCancel={cancelRemove} />
            <VariantsDialog item={versionsItem} onChange={changeCount} onClose={closeVersions} />
            <ChooseVersion details={choosing} onChoose={choose} onCancel={cancelChoosing} />
        </>
    );
}
