import { faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useMutation, useQuery } from 'convex/react';
import { useActionState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

import { confirmAction } from '../services/confirm';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** The host's sessions, newest first, and a new one, which opens in the editor. */
export function SessionList()
{
    const sessions = useQuery(api.sessions.list);
    const createSession = useMutation(api.sessions.create);
    const removeSession = useMutation(api.sessions.remove);
    const navigate = useNavigate();

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

    const remove = (id: Id<'sessions'>, name: string) =>
    {
        void confirmAction(`Delete ${name} and all its maps? This cannot be undone.`, 'Delete')
            .then((yes) => (yes ? removeSession({ sessionId: id }) : undefined));
    };

    return (
        <section className="ttrpg-panel ttrpg-card" aria-label="Sessions">
            <h2>Sessions</h2>

            {sessions && sessions.length > 0 && (
                <ul className="ttrpg-rows">
                    {sessions.map((session) => (
                        <li key={session.id} className="ttrpg-row">
                            <Link to={`/ttrpg/edit?s=${session.id}`} className="ttrpg-row__main">
                                <span>{session.name}</span>
                                <span className="ttrpg-row__detail">
                                    {`${session.maps} ${session.maps === 1 ? 'map' : 'maps'} · ${dateFormat.format(session.updatedAt)}`}
                                </span>
                            </Link>
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
                <input name="name" placeholder="Session name" aria-label="Session name" required />
                <button type="submit" className="ttrpg-segment" disabled={creating}>
                    <FontAwesomeIcon icon={faPlus} />
                    New session
                </button>
            </form>
            {failure && <p role="alert">{failure}</p>}
        </section>
    );
}
