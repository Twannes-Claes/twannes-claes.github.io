import { faMap, faPen, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useMutation, useQuery } from 'convex/react';
import { useActionState, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

import { confirmAction } from '../services/confirm';

import { Loading } from './Feedback';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/**
 * The host's sessions, newest first. A new one opens in the editor; the example map only joins
 * the list. The pencil turns a session's name into a field, saved on Enter or a click away; Esc
 * keeps the old name.
 */
export function SessionList()
{
    const sessions = useQuery(api.sessions.list);
    const createSession = useMutation(api.sessions.create);
    const createExample = useMutation(api.sessions.example);
    const renameSession = useMutation(api.sessions.rename);
    const removeSession = useMutation(api.sessions.remove);
    const navigate = useNavigate();
    const [renaming, setRenaming] = useState<Id<'sessions'> | null>(null);
    const [problem, setProblem] = useState('');
    const [addingExample, setAddingExample] = useState(false);

    const [failure, create, creating] = useActionState(
        (_: string, form: FormData) =>
            createSession({ name: String(form.get('name')) })
                .then((id) =>
                {
                    navigate(`/ttrpg/edit?s=${id}`);

                    return '';
                })
                .catch(() => 'The session was not made. Try again.'),
        '',
    );

    // Stays on the dashboard: the new session shows at the top of the list.
    const addExample = () =>
    {
        setProblem('');
        setAddingExample(true);
        createExample({})
            .catch(() => setProblem('The example was not added. Try again.'))
            .finally(() => setAddingExample(false));
    };

    const rename = (id: Id<'sessions'>, before: string, name: string) =>
    {
        setRenaming(null);

        if (!name || name === before)
            return;

        setProblem('');
        renameSession({ sessionId: id, name }).catch(() => setProblem('The new name did not save. Try again.'));
    };

    const remove = (id: Id<'sessions'>, name: string) =>
    {
        void confirmAction(`Delete ${name} and all its maps? This cannot be undone.`, 'Delete')
            .then((yes) => (yes ? removeSession({ sessionId: id }) : undefined))
            .catch(() => setProblem(`${name} was not deleted. Try again.`));
    };

    return (
        <section className="ttrpg-panel ttrpg-card" aria-label="Sessions">
            <h2>Sessions</h2>

            {sessions === undefined && <Loading>Loading your sessions</Loading>}

            {sessions && sessions.length > 0 && (
                <ul className="ttrpg-rows">
                    {sessions.map((session) => (
                        <li key={session.id} className="ttrpg-row">
                            {renaming === session.id ? (
                                <input
                                    className="ttrpg-row__input"
                                    defaultValue={session.name}
                                    aria-label="Session name"
                                    maxLength={60}
                                    autoFocus
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={(event) => rename(session.id, session.name, event.target.value.trim())}
                                    onKeyDown={(event) =>
                                    {
                                        if (event.key === 'Enter')
                                            event.currentTarget.blur();

                                        // Back to the old name: set it before the blur saves the field.
                                        if (event.key === 'Escape')
                                        {
                                            event.currentTarget.value = session.name;
                                            event.currentTarget.blur();
                                        }
                                    }}
                                />
                            ) : (
                                <Link to={`/ttrpg/edit?s=${session.id}`} className="ttrpg-row__main">
                                    <span className="ttrpg-row__name">{session.name}</span>
                                    <span className="ttrpg-row__detail">
                                        {`${session.maps} ${session.maps === 1 ? 'map' : 'maps'} · ${dateFormat.format(session.updatedAt)}`}
                                    </span>
                                </Link>
                            )}
                            <button
                                type="button"
                                className="ttrpg-icon-button ttrpg-icon-button--small"
                                aria-label={`Rename ${session.name}`}
                                aria-pressed={renaming === session.id}
                                title="Rename"
                                // The field keeps focus on the press, so the click saves it by
                                // letting go of it, as a click away would.
                                onPointerDown={(event) => event.preventDefault()}
                                onClick={() =>
                                {
                                    if (renaming !== session.id)
                                        setRenaming(session.id);
                                    else if (document.activeElement instanceof HTMLInputElement)
                                        document.activeElement.blur();

                                }}
                            >
                                <FontAwesomeIcon icon={faPen} />
                            </button>
                            <button
                                type="button"
                                className="ttrpg-icon-button ttrpg-icon-button--small"
                                aria-label={`Delete ${session.name}`}
                                title="Delete"
                                onClick={() => remove(session.id, session.name)}
                            >
                                <FontAwesomeIcon icon={faTrashCan} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {sessions?.length === 0 && (
                <p className="ttrpg-dashboard__note">No sessions yet. Make the first one below.</p>
            )}

            <form action={create} className="ttrpg-card__form">
                <input name="name" placeholder="Session name" aria-label="Session name" maxLength={60} required />
                <button type="submit" className="ttrpg-button ttrpg-button--confirm" disabled={creating}>
                    <FontAwesomeIcon icon={faPlus} />
                    {creating ? 'Making it' : 'New session'}
                </button>
            </form>
            <button
                type="button"
                className="ttrpg-segment ttrpg-segment--block"
                title="A session with the demo map"
                disabled={addingExample}
                onClick={addExample}
            >
                <FontAwesomeIcon icon={faMap} />
                {addingExample ? 'Adding the example' : 'Add the example map'}
            </button>
            {(failure || problem) && (
                <p className="ttrpg-error" role="alert">
                    {failure || problem}
                </p>
            )}
        </section>
    );
}
