import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import type { Db, Skylander } from '../types';

import { TiltButton } from '../../../shared/components/TiltButton';
import { fetchNames, lookup } from '../services/wiki';

import { SkylanderCard } from './SkylanderCard';
import { TextInput } from './TextInput';

/** The add form and the grid, shown once signed in. */
export function Collection({ db }: { db: Db })
{
    const [items, setItems] = useState<Skylander[] | null>(null);
    const [names, setNames] = useState<string[]>([]);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => db.watchCollection(setItems, (error) => setMessage(error.message)), [db]);

    useEffect(() =>
    {
        // Suggestions are a nicety, typing a name still works without them.
        fetchNames()
            .then(setNames)
            .catch(() => undefined);
    }, []);

    const owned = useMemo(() => new Set(items?.map((item) => item.name)), [items]);
    const suggestions = useMemo(() => names.filter((entry) => !owned.has(entry)), [names, owned]);

    const add = useCallback(
        async (event: FormEvent) =>
        {
            event.preventDefault();

            const typed = name.trim();

            if (!typed)
                return;

            setBusy(true);
            setMessage('');

            try
            {
                // Wiki titles are case sensitive, so a lowercase entry is matched here first.
                const known = names.find((entry) => entry.toLowerCase() === typed.toLowerCase());
                const details = await lookup(known ?? typed);
                const added = await db.addSkylander(details);

                if (!added)
                    setMessage(`${details.name} is already in the collection.`);
                else if (!details.url)
                    setMessage(`${details.name} is not on the wiki, so it was added without a picture.`);

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
        [db, name, names],
    );

    const remove = useCallback(
        (item: Skylander) =>
        {
            if (!window.confirm(`Remove ${item.name} from the collection?`))
                return;

            db.removeSkylander(item.id).catch((error: Error) => setMessage(error.message));
        },
        [db],
    );

    const signOut = useCallback(() => void db.signOut(), [db]);

    return (
        <>
            <form onSubmit={add} className="mb-4 flex flex-wrap items-center gap-4">
                <TextInput
                    list="skylander-names"
                    placeholder="Skylander name, like Spyro"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="max-w-md flex-1"
                />
                <datalist id="skylander-names">
                    {suggestions.map((entry) => (
                        <option key={entry} value={entry} />
                    ))}
                </datalist>
                <TiltButton>
                    <button type="submit" disabled={busy || !name.trim()}>
                        {busy ? 'Adding' : 'Add'}
                    </button>
                </TiltButton>
                <button
                    type="button"
                    onClick={signOut}
                    className="nav-link ms-auto"
                    aria-label="Lock"
                >
                    <FontAwesomeIcon icon={faRightFromBracket} />
                    Lock
                </button>
            </form>

            <p className="mb-8 min-h-6 opacity-80">{message}</p>

            {items === null ? (
                <p>Loading the collection.</p>
            ) : items.length === 0 ? (
                <p>Nothing here yet. Add the first one above.</p>
            ) : (
                <>
                    <p className="tag tag--big mb-6">{items.length} collected</p>
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-6">
                        {items.map((item) => (
                            <SkylanderCard key={item.id} item={item} onRemove={remove} />
                        ))}
                    </ul>
                </>
            )}
        </>
    );
}
