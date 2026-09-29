import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';

import type { CatalogEntry } from '../types';

/**
 * Names starting with the query first, then names containing it anywhere. An empty query shows
 * the whole catalog, so the list can be browsed without knowing a name.
 */
function match(catalog: CatalogEntry[], query: string): CatalogEntry[]
{
    const needle = query.trim().toLowerCase();

    if (!needle)
        return catalog;

    const starts: CatalogEntry[] = [];
    const contains: CatalogEntry[] = [];

    for (const entry of catalog)
    {
        const index = entry.name.toLowerCase().indexOf(needle);

        if (index === 0)
            starts.push(entry);
        else if (index > 0)
            contains.push(entry);
    }

    return [...starts, ...contains];
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

/**
 * A combobox with pictures. It replaces a native datalist, whose dropdown the browser draws
 * itself and cannot be styled or show images.
 */
export function SkylanderSearch({ value, onChange, catalog, owned, onPick }: SkylanderSearchProps)
{
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);

    const results = useMemo(() => match(catalog, value), [catalog, value]);
    const expanded = open && results.length > 0;

    // What Enter would add: the highlighted row, or the best match once something is typed.
    // An empty box has no best match, so Enter there does not add the first name alphabetically.
    const target = active >= 0 ? active : value.trim() && results.length > 0 ? 0 : -1;

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
            onPick(name);
        },
        [onPick],
    );

    const onKeyDown = useCallback(
        (event: KeyboardEvent<HTMLInputElement>) =>
        {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp')
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

    return (
        <div className="sky-search">
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
                placeholder="Add a Skylander, like Spyro"
                value={value}
                onChange={(event) =>
                {
                    onChange(event.target.value);
                    setOpen(true);
                    setActive(-1);
                }}
                onFocus={() => setOpen(true)}
                // Focus does not fire again after a pick, so a click reopens the list too.
                onClick={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={onKeyDown}
            />

            {expanded && (
                <ul className="sky-search__list" id={listId} role="listbox">
                    {results.map((entry, index) =>
                    {
                        const copies = owned.get(entry.name) ?? 0;

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
                                {copies > 0 && (
                                    <span className="sky-search__owned">
                                        <FontAwesomeIcon icon={faCheck} />
                                        {copies > 1 ? `Owned ×${copies}` : 'Owned'}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
