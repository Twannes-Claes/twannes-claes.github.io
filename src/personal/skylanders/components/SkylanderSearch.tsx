import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
} from 'react';

import type { CatalogEntry } from '../types';

import { elementFor, elements, giant, type Element } from '../content/elements';

/** The enlarged thumbnail over the list, centred on the one under the mouse. */
interface Preview
{
    /** The small thumbnail, already loaded, shown until the larger one arrives. */
    src: string;
    x: number;
    y: number;
    /** Shrinking back after the mouse left, removed once the animation ends. */
    leaving: boolean;
}

/**
 * The same wiki picture at a size that stays sharp in the preview. Fandom thumbnail links end in
 * their width, so any other link is used as it is.
 */
function largerThumb(url: string): string
{
    return url.replace(/scale-to-width-down\/\d+/, 'scale-to-width-down/240');
}

const prefetched = new Set<string>();

/**
 * Starts loading a row's larger picture when the mouse reaches the row, so it is usually cached
 * by the time the mouse is on the thumbnail.
 */
function prefetch(thumb: string)
{
    const url = largerThumb(thumb);

    if (!thumb || prefetched.has(url))
        return;

    prefetched.add(url);

    const image = new Image();

    image.referrerPolicy = 'no-referrer';
    image.src = url;
}

/** Shows the larger picture over the small one once it has loaded, see skylanders.css. */
function markLoaded(image: HTMLImageElement)
{
    image.dataset.loaded = '';
}

/** Short enough that "fi" still means a name, long enough that "fir" can mean Fire. */
const minTagQuery = 3;

/** Whether the query is the start of the figure's element, or of Giants. */
function matchesTag(entry: CatalogEntry, needle: string): boolean
{
    const tags = entry.giant ? [entry.element, giant.name] : [entry.element];

    return tags.some((tag) => tag && tag.toLowerCase().startsWith(needle));
}

/**
 * Names starting with the query first, then names containing it anywhere, then figures whose
 * element or Giants tag starts with it, so "fire" or "giants" lists those. An empty query shows
 * the whole catalog, so the list can be browsed without knowing a name. `named` counts the name
 * matches at the front.
 */
function match(catalog: CatalogEntry[], query: string): { results: CatalogEntry[]; named: number }
{
    const needle = query.trim().toLowerCase();

    if (!needle)
        return { results: catalog, named: 0 };

    const starts: CatalogEntry[] = [];
    const contains: CatalogEntry[] = [];
    const tagged: CatalogEntry[] = [];

    for (const entry of catalog)
    {
        const index = entry.name.toLowerCase().indexOf(needle);

        if (index === 0)
            starts.push(entry);
        else if (index > 0)
            contains.push(entry);
        else if (needle.length >= minTagQuery && matchesTag(entry, needle))
            tagged.push(entry);
    }

    return { results: [...starts, ...contains, ...tagged], named: starts.length + contains.length };
}

/** The name with the typed part picked out in gold. */
function Highlight({ name, query }: { name: string; query: string })
{
    const needle = query.trim().toLowerCase();
    const index = needle ? name.toLowerCase().indexOf(needle) : -1;

    if (index < 0)
        return <>{name}</>;

    const end = index + needle.length;

    return (
        <>
            {name.slice(0, index)}
            <mark>{name.slice(index, end)}</mark>
            {name.slice(end)}
        </>
    );
}

interface SkylanderSearchProps
{
    value: string;
    onChange: (value: string) => void;
    /** Every figure on the wiki, owned ones included. */
    catalog: CatalogEntry[];
    /**
     * How many of each figure we have, by name. Owned figures get a badge rather than being
     * hidden, so the search doubles as a "do we have this?" check in a shop.
     */
    owned: Map<string, number>;
    /** Called with a suggestion that was clicked or chosen with the keyboard. */
    onPick: (name: string) => void;
}

interface FilterButtonProps
{
    element: Element;
    pressed: boolean;
    onToggle: (name: string) => void;
}

/**
 * One round icon in the filter row. Skipped by Tab and pressed on mousedown, because moving focus
 * off the input would close the list before the click lands.
 */
function FilterButton({ element, pressed, onToggle }: FilterButtonProps)
{
    return (
        <button
            type="button"
            className="sky-search__icon sky-search__filter sky-tip"
            style={{ '--el': element.color } as CSSProperties}
            aria-pressed={pressed}
            aria-label={element.name}
            data-tip={element.name}
            tabIndex={-1}
            onMouseDown={(event) =>
            {
                event.preventDefault();
                onToggle(element.name);
            }}
        >
            <FontAwesomeIcon icon={element.icon} />
        </button>
    );
}

/**
 * A combobox with pictures. It replaces a native datalist, whose dropdown the browser draws
 * itself and cannot be styled or show images.
 */
export function SkylanderSearch({ value, onChange, catalog, owned, onPick }: SkylanderSearchProps)
{
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    /** The element chosen in the filter row, null for any. */
    const [elementFilter, setElementFilter] = useState<string | null>(null);
    const [giantsOnly, setGiantsOnly] = useState(false);
    const filtering = elementFilter !== null || giantsOnly;
    const searchRef = useRef<HTMLDivElement>(null);
    const [preview, setPreview] = useState<Preview | null>(null);

    /** Only elements the catalog has figures for get a filter. */
    const filterElements = useMemo(
        () => elements.filter(({ name }) => catalog.some((entry) => entry.element === name)),
        [catalog],
    );

    const { results, named } = useMemo(
        () =>
            match(
                catalog.filter(
                    (entry) =>
                        (!elementFilter || entry.element === elementFilter) &&
                        (!giantsOnly || entry.giant),
                ),
                value,
            ),
        [catalog, value, elementFilter, giantsOnly],
    );
    // Stays open on a filter with no matches, so it can be switched off again.
    const expanded = open && (results.length > 0 || filtering);

    // What Enter would add: the highlighted row, or the best name match once something is typed.
    // An empty box has no best match, so Enter there does not add the first name alphabetically,
    // and neither does typing "fire", which only matched the element.
    const target = active >= 0 ? active : named > 0 ? 0 : -1;

    // Keeps the keyboard highlight in view while arrowing through the long list.
    useEffect(() =>
    {
        if (active >= 0)
            document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });

    }, [active, listId]);

    const pick = useCallback(
        (name: string) =>
        {
            setOpen(false);
            setActive(-1);
            setPreview(null);
            onPick(name);
        },
        [onPick],
    );

    const onKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) =>
        {
            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length > 0)
            {
                event.preventDefault();
                setOpen(true);

                const step = event.key === 'ArrowDown' ? 1 : -1;

                setActive((current) => (current + step + results.length) % results.length);
            }
            else if (event.key === 'Enter' && target >= 0)
            {
                // Takes the suggestion instead of submitting the typed text. With no match the
                // form submits, and Collection.tsx explains the name is not a Skylander.
                event.preventDefault();
                pick(results[target].name);
            }
            else if (event.key === 'Escape')

                setOpen(false);

        },
        [pick, results, target],
    );

    const toggleElement = useCallback((name: string) =>
    {
        setElementFilter((current) => (current === name ? null : name));
        setActive(-1);
        setPreview(null);
    }, []);

    const toggleGiants = useCallback(() =>
    {
        setGiantsOnly((current) => !current);
        setActive(-1);
        setPreview(null);
    }, []);

    /**
     * Drawn outside the list, because the list and its panel clip anything that pokes out of
     * them, so an enlarged thumbnail inside would lose its edges.
     */
    const showPreview = useCallback((thumb: HTMLElement, src: string) =>
    {
        const search = searchRef.current?.getBoundingClientRect();
        const box = thumb.getBoundingClientRect();

        if (search)
        {
            setPreview({
                src,
                x: box.left + box.width / 2 - search.left,
                y: box.top + box.height / 2 - search.top,
                leaving: false,
            });
        }
    }, []);

    const hidePreview = useCallback(() => setPreview(null), []);

    const leavePreview = useCallback(() =>
    {
        // Reduced motion turns the animations off in skylanders.css, so no end would ever come.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            setPreview(null);
        else
            setPreview((current) => current && { ...current, leaving: true });

    }, []);

    // Only the shrink ends it, the pop finishing leaves the preview up.
    const previewAnimated = useCallback(
        () => setPreview((current) => (current?.leaving ? null : current)),
        [],
    );

    return (
        <div className="sky-search" ref={searchRef}>
            <input
                className="sky-input"
                role="combobox"
                aria-label="Skylander name"
                aria-autocomplete="list"
                aria-expanded={expanded}
                aria-controls={listId}
                aria-activedescendant={expanded && target >= 0 ? `${listId}-${target}` : undefined}
                autoComplete="off"
                spellCheck={false}
                placeholder="Add a Skylander, or search Fire, Giants..."
                value={value}
                onChange={(event) =>
                {
                    onChange(event.target.value);
                    setOpen(true);
                    setActive(-1);
                    // The rows move under the mouse without it leaving the thumbnail.
                    setPreview(null);
                }}
                onFocus={() => setOpen(true)}
                // Focus does not fire again after a pick, so a click reopens the list too.
                onClick={() => setOpen(true)}
                onBlur={() =>
                {
                    setOpen(false);
                    setPreview(null);
                }}
                onKeyDown={onKeyDown}
            />

            {expanded && (
                <div className="sky-search__panel">
                    <div
                        className="sky-search__filters"
                        role="group"
                        aria-label="Filter suggestions by element or Giants"
                    >
                        {filterElements.map((element) => (
                            <FilterButton
                                key={element.name}
                                element={element}
                                pressed={elementFilter === element.name}
                                onToggle={toggleElement}
                            />
                        ))}
                        <FilterButton
                            element={giant}
                            pressed={giantsOnly}
                            onToggle={toggleGiants}
                        />
                    </div>

                    {results.length === 0 && (
                        <p className="sky-search__none">No Skylanders match these filters.</p>
                    )}

                    <ul
                        className="sky-search__list"
                        id={listId}
                        role="listbox"
                        onScroll={hidePreview}
                    >
                        {results.map((entry, index) =>
                        {
                            const copies = owned.get(entry.name) ?? 0;
                            const element = elementFor(entry.element);

                            return (
                                <li
                                    key={entry.name}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-selected={index === target}
                                    className={`sky-search__option${copies > 0 ? ' sky-search__option--owned' : ''}`}
                                    // mousedown rather than click, because click fires after the input
                                    // blurs and the list is already gone by then.
                                    onMouseDown={(event) =>
                                    {
                                        event.preventDefault();
                                        pick(entry.name);
                                    }}
                                    onMouseEnter={() =>
                                    {
                                        setActive(index);
                                        prefetch(entry.thumb);
                                    }}
                                >
                                    <span
                                        className="sky-search__thumb"
                                        onMouseEnter={(event) =>
                                            entry.thumb &&
                                            showPreview(event.currentTarget, entry.thumb)
                                        }
                                        onMouseLeave={leavePreview}
                                    >
                                        {entry.thumb && (
                                            <img
                                                src={entry.thumb}
                                                alt=""
                                                loading="lazy"
                                                referrerPolicy="no-referrer"
                                            />
                                        )}
                                    </span>
                                    <span className="sky-search__name">
                                        <Highlight name={entry.name} query={value} />
                                    </span>
                                    {/* Shows why a search for an element or Giants listed it. */}
                                    <span className="sky-search__tags">
                                        {entry.element && (
                                            <span
                                                className="sky-search__icon sky-tip sky-tip--left"
                                                style={{ '--el': element.color } as CSSProperties}
                                                data-tip={element.name}
                                            >
                                                <FontAwesomeIcon icon={element.icon} />
                                            </span>
                                        )}
                                        {entry.giant && (
                                            <span
                                                className="sky-search__icon sky-tip sky-tip--left"
                                                style={{ '--el': giant.color } as CSSProperties}
                                                data-tip="Giant"
                                            >
                                                <FontAwesomeIcon icon={giant.icon} />
                                            </span>
                                        )}
                                    </span>
                                    {copies > 0 && (
                                        <span
                                            className="sky-search__owned"
                                            aria-label={`Owned ×${copies}`}
                                        >
                                            {`×${copies}`}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {expanded && preview && (
                // Keyed on the picture, so moving to the next thumbnail replays the pop.
                <span
                    key={preview.src}
                    className={`sky-search__preview${preview.leaving ? ' sky-search__preview--leaving' : ''}`}
                    style={{ left: preview.x, top: preview.y }}
                    aria-hidden="true"
                    onAnimationEnd={previewAnimated}
                >
                    <img
                        className="sky-search__preview-sharp"
                        src={largerThumb(preview.src)}
                        alt=""
                        referrerPolicy="no-referrer"
                        // A cached picture can finish before React listens, so the ref checks.
                        ref={(image) =>
                        {
                            if (image?.complete)
                                markLoaded(image);

                        }}
                        onLoad={(event) => markLoaded(event.currentTarget)}
                    />
                    <img src={preview.src} alt="" referrerPolicy="no-referrer" />
                </span>
            )}
        </div>
    );
}
