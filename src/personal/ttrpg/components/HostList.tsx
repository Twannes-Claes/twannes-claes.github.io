import { useMutation, useQuery } from 'convex/react';

import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { confirmAction } from '../services/confirm';

interface Person
{
    userId: Id<'users'>;
    name: string;
    email: string | null;
}

/** A person's name and email, how the owner tells requests apart. */
function Who({ person }: { person: Person })
{
    return (
        <span className="ttrpg-row__main">
            <span>{person.name}</span>
            {person.email && <span className="ttrpg-row__detail">{person.email}</span>}
        </span>
    );
}

/** For the owner only: who asked to host, to approve or decline, and the hosts so far. */
export function HostList()
{
    const overview = useQuery(api.hosts.overview);
    const answer = useMutation(api.hosts.answer);
    const removeHost = useMutation(api.hosts.remove);

    const remove = (person: Person) =>
    {
        void confirmAction(`Stop ${person.name} hosting? Their sessions stay, for if they come back.`, 'Remove')
            .then((yes) => (yes ? removeHost({ userId: person.userId }) : undefined));
    };

    if (!overview)
        return null;

    return (
        <section className="ttrpg-panel ttrpg-card" aria-label="Hosts">
            <h2>Asking to host</h2>
            {overview.requests.length === 0 && <p className="ttrpg-dashboard__note">Nobody right now.</p>}
            <ul className="ttrpg-rows">
                {overview.requests.map((person) => (
                    <li key={person.userId} className="ttrpg-row">
                        <Who person={person} />
                        <button
                            type="button"
                            className="ttrpg-segment"
                            onClick={() => void answer({ userId: person.userId, approve: false })}
                        >
                            Decline
                        </button>
                        <button
                            type="button"
                            className="ttrpg-segment ttrpg-segment--confirm"
                            onClick={() => void answer({ userId: person.userId, approve: true })}
                        >
                            Approve
                        </button>
                    </li>
                ))}
            </ul>

            <h2>Hosts</h2>
            {overview.hosts.length === 0 && <p className="ttrpg-dashboard__note">Only you so far.</p>}
            <ul className="ttrpg-rows">
                {overview.hosts.map((person) => (
                    <li key={person.userId} className="ttrpg-row">
                        <Who person={person} />
                        <button
                            type="button"
                            className="ttrpg-segment"
                            onClick={() => remove(person)}
                        >
                            Remove
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
