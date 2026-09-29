import { faRightFromBracket, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Head } from 'vite-react-ssg';

import type { Skylander } from './types';

import { Nav } from '../../shared/components/Nav';
import { TiltButton } from '../../shared/components/TiltButton';

import { fetchNames, lookup } from './wiki';

type Db = typeof import('./db');

const inputClass =
    'w-full rounded-[5px] border-2 border-edge bg-transparent px-3 py-2 text-fg outline-none focus:border-accent';

interface CardProps
{
    item: Skylander;
    onRemove: (item: Skylander) => void;
}

function SkylanderCard({ item, onRemove }: CardProps)
{
    const remove = useCallback(() => onRemove(item), [item, onRemove]);

    return (
        <li className="flex flex-col overflow-hidden rounded-[5px] border-2 border-edge">
            <div className="grid aspect-square place-items-center bg-paper">
                {item.image ? (
                    <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain"
                    />
                ) : (
                    <span className="font-mono text-4xl text-ink">?</span>
                )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                    {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="font-medium">
                            {item.name}
                        </a>
                    ) : (
                        <span className="font-medium">{item.name}</span>
                    )}
                    <button
                        type="button"
                        onClick={remove}
                        aria-label={`Remove ${item.name}`}
                        className="opacity-60 transition-opacity hover:opacity-100"
                    >
                        <FontAwesomeIcon icon={faTrash} />
                    </button>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                    {item.element && <span className="tag">{item.element}</span>}
                    {item.game && <span className="text-sm opacity-70">{item.game}</span>}
                </div>
            </div>
        </li>
    );
}

function PasswordForm({ db }: { db: Db })
{
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = useCallback(
        async (event: FormEvent) =>
        {
            event.preventDefault();
            setBusy(true);
            setError('');

            try
            {
                await db.signIn(password);
            }
            catch
            {
                setError('That password is not right.');
                setBusy(false);
            }
        },
        [db, password],
    );

    return (
        <form onSubmit={submit} className="flex max-w-sm flex-col gap-4">
            <label className="flex flex-col gap-2">
                Password
                <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={inputClass}
                    autoFocus
                />
            </label>
            {error && <p className="text-red-400">{error}</p>}
            <TiltButton>
                <button type="submit" disabled={busy || !password}>
                    Open
                </button>
            </TiltButton>
        </form>
    );
}

function Collection({ db }: { db: Db })
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
                <input
                    list="skylander-names"
                    placeholder="Skylander name, like Spyro"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={`${inputClass} max-w-md flex-1`}
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

/**
 * A private page for tracking the Skylanders collection. It is left out of the nav and marked
 * noindex, so only people with the link find it, and only people with the password see the list.
 */
export default function Skylanders()
{
    const [db, setDb] = useState<Db | null>(null);
    const [signedIn, setSignedIn] = useState<boolean | null>(null);

    useEffect(() =>
    {
        let unsubscribe: (() => void) | undefined;
        let cancelled = false;

        // Loaded here rather than imported, so Firebase is not in the portfolio bundle and
        // never runs during the prerender.
        import('./db').then((module) =>
        {
            if (cancelled)
                return;

            setDb(module);
            unsubscribe = module.watchSignedIn(setSignedIn);
        });

        return () =>
        {
            cancelled = true;
            unsubscribe?.();
        };
    }, []);

    let body;

    if (!db || signedIn === null)
        body = <p>Loading.</p>;
    else if (!signedIn)
        body = <PasswordForm db={db} />;
    else
        body = <Collection db={db} />;

    return (
        <>
            <Head>
                <title>Skylanders</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <Nav back />

            <main className="container-page">
                <div className="my-[clamp(4rem,5vw+2rem,8rem)]">
                    <h1 className="section-heading">Skylanders</h1>
                    {body}
                </div>
            </main>
        </>
    );
}
