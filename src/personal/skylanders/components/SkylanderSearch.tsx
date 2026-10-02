import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type CSSProperties,
    type KeyboardEvent,
    type MouseEvent,
} from 'react';

import type { CatalogEntry } from '../types';

import { elementFor, elements, giant, magicItem, type Element } from '../content/elements';

/** Short enough that "fi" still means a name, long enough that "fir" can mean Fire. */
const minTagQuery = 3;

/**
 * Whether the query is the start of the figure's element or of Giants, or for an item of "Items",
 * "Magic Item" or "Adventure Pack".
 */
function matchesTag(entry: CatalogEntry, needle: string): boolean
{
    const tags = [
        entry.element,
        entry.giant ? giant.name : '',
        entry.item ?? '',
        entry.item ? magicItem.name : '',
    ];

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

function keepFocus(event: MouseEvent)
{
    event.preventDefault();
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
    /** The catalog has not arrived yet, so an opened list says so rather than staying shut. */
    loading: boolean;
    /**
     * How many of each figure we have, by name. Owned figures get a badge rather than being
     * hidden, so the search doubles as a "do we have this?" check in a shop.
     */
    owned: Map<string, number>;
    /** Called with a suggestion that was clicked or chosen with the keyboard. */
    onPick: (name: string) => void;
    /**
     * A picked figure is being confirmed in a dialog. The list stays open behind it, filter and
     * scroll position included, so a cancel comes back to the same spot. Adding closes it.
     */
    holdOpen: boolean;
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
export function SkylanderSearch({
    value,
    onChange,
    catalog,
    loading,
    owned,
    onPick,
    holdOpen,
}: SkylanderSearchProps)
{
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    /** The element chosen in the filter row, null for any. */
    const [elementFilter, setElementFilter] = useState<string | null>(null);
    const [giantsOnly, setGiantsOnly] = useState(false);
    const [itemsOnly, setItemsOnly] = useState(false);
    const filtering = elementFilter !== null || giantsOnly || itemsOnly;

    /** Only elements the catalog has figures for get a filter. */
    const filterElements = useMemo(
        () => elements.filter(({ name }) => catalog.some((entry) => entry.element === name)),
        [catalog],
    );

    const { results, named } = useMemo(() =>
    {
        const found = match(
            catalog.filter(
                (entry) =>
                    (!elementFilter || entry.element === elementFilter) &&
                    (!giantsOnly || entry.giant) &&
                    (!itemsOnly || entry.item),
            ),
            value,
        );
        // A name typed in full still comes up under a filter it falls outside, first in the
        // list so Enter takes it.
        const needle = value.trim().toLowerCase();
        const exact = catalog.find((entry) => entry.name.toLowerCase() === needle);

        if (!exact || found.results.includes(exact))
            return found;

        return { results: [exact, ...found.results], named: found.named + 1 };
    }, [catalog, value, elementFilter, giantsOnly, itemsOnly]);
    // Stays open on a filter with no matches, so it can be switched off again.
    const expanded = open && (results.length > 0 || filtering);

    // What Enter would add: the highlighted row, or the best name match once something is typed.
    // An empty box has no best match, so Enter there does not add the first name alphabetically,
    // and neither does typing "fire", which only matched the element.
    const target = active >= 0 ? active : named > 0 ? 0 : -1;

    const input = useRef<HTMLInputElement>(null);

    // Once the confirm dialog is gone the list follows the focus again: open after a cancel,
    // which hands focus back to the box, closed after an add, which does not.
    useEffect(() =>
    {
        if (holdOpen)
            return;

        // Checked a moment later, once the dialog has closed and handed the focus on.
        const timer = window.setTimeout(() =>
        {
            if (document.activeElement !== input.current)
                setOpen(false);

        });

        return () => window.clearTimeout(timer);
    }, [holdOpen]);

    // Keeps the keyboard highlight in view while arrowing through the long list.
    useEffect(() =>
    {
        if (active >= 0)
            document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });

    }, [active, listId]);

    const pick = useCallback(
        // Leaves the list open, see holdOpen.
        (name: string) => onPick(name),
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

    // An element and Giants combine, but items have neither, so Items switches the others off
    // and they switch Items off, rather than ending up on an empty list.
    const toggleElement = useCallback((name: string) =>
    {
        setElementFilter((current) => (current === name ? null : name));
        setItemsOnly(false);
        setActive(-1);
    }, []);

    const toggleGiants = useCallback(() =>
    {
        setGiantsOnly((current) => !current);
        setItemsOnly(false);
        setActive(-1);
    }, []);

    const toggleItems = useCallback(() =>
    {
        setItemsOnly((current) => !current);
        setElementFilter(null);
        setGiantsOnly(false);
        setActive(-1);
    }, []);

    // Stays in the box afterwards, ready for the next name.
    const clear = useCallback(() =>
    {
        onChange('');
        setActive(-1);
        input.current?.focus();
    }, [onChange]);

    const type = useCallback(
        (event: ChangeEvent<HTMLInputElement>) =>
        {
            onChange(event.target.value);
            setOpen(true);
            setActive(-1);
        },
        [onChange],
    );

    const show = useCallback(() => setOpen(true), []);

    // The confirm dialog taking focus is not leaving the search, see holdOpen.
    const leave = useCallback(() =>
    {
        if (!holdOpen)
            setOpen(false);

    }, [holdOpen]);

    return (
        <div className="sky-search">
            <input
                ref={input}
                className={`sky-input${value ? ' sky-input--clearable' : ''}`}
                role="combobox"
                aria-label="Skylander or item name"
                aria-autocomplete="list"
                aria-expanded={expanded}
                aria-controls={listId}
                aria-activedescendant={expanded && target >= 0 ? `${listId}-${target}` : undefined}
                autoComplete="off"
                spellCheck={false}
                placeholder="Add a Skylander or item, or search Fire, Giants..."
                value={value}
                onChange={type}
                onFocus={show}
                // Focus does not fire again after a pick, so a click reopens the list too.
                onClick={show}
                onBlur={leave}
                onKeyDown={onKeyDown}
            />
            {value && (
                <button
                    type="button"
                    className="sky-search__clear"
                    aria-label="Clear search"
                    // Keeps the focus in the box, so the list does not close and reopen.
                    onMouseDown={keepFocus}
                    onClick={clear}
                >
                    <FontAwesomeIcon icon={faXmark} />
                </button>
            )}

            {open && loading && catalog.length === 0 && (
                <div className="sky-search__panel">
                    <p className="sky-search__loading" role="status">
                        Loading Skylanders
                    </p>
                </div>
            )}

            {expanded && (
                <div className="sky-search__panel">
                    <div
                        className="sky-search__filters"
                        role="group"
                        aria-label="Filter suggestions by element, Giants or items"
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
                        <FilterButton
                            element={magicItem}
                            pressed={itemsOnly}
                            onToggle={toggleItems}
                        />
                    </div>

                    {results.length === 0 && (
                        <p className="sky-search__none">Nothing matches these filters.</p>
                    )}

                    <ul className="sky-search__list" id={listId} role="listbox">
                        {results.map((entry, index) =>
                        {
                            const copies = owned.get(entry.name) ?? 0;
                            const element = elementFor(entry.element, entry.item);

                            return (
                                <li
                                    key={entry.name}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-selected={index === target}
                                    className={`sky-search__option${copies > 0 ? ' sky-search__option--owned' : ''}`}
                                    // mousedown rather than click, because click fires after
                                    // the input blurs and the list is already gone by then.
                                    onMouseDown={(event) =>
                                    {
                                        event.preventDefault();
                                        pick(entry.name);
                                    }}
                                    onMouseEnter={() => setActive(index)}
                                >
                                    <span className="sky-search__thumb">
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
                                    {/* Before the icons, so the element icons line up down the list
                                        whether a figure is owned or not. */}
                                    {copies > 0 && (
                                        <span
                                            className="sky-search__owned"
                                            aria-label={`Owned ×${copies}`}
                                        >
                                            {`×${copies}`}
                                        </span>
                                    )}
                                    {/* Shows why a search for an element or Giants listed it. The
                                        element comes last, at the edge, for the same reason. */}
                                    <span className="sky-search__tags">
                                        {entry.giant && (
                                            <span
                                                className="sky-search__icon sky-tip sky-tip--left"
                                                style={{ '--el': giant.color } as CSSProperties}
                                                data-tip="Giant"
                                            >
                                                <FontAwesomeIcon icon={giant.icon} />
                                            </span>
                                        )}
                                        {element.name && (
                                            <span
                                                className="sky-search__icon sky-tip sky-tip--left"
                                                style={{ '--el': element.color } as CSSProperties}
                                                data-tip={entry.item ?? element.name}
                                            >
                                                <FontAwesomeIcon icon={element.icon} />
                                            </span>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
