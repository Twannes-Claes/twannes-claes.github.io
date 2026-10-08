import { faDiscord } from '@fortawesome/free-brands-svg-icons';
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';

import { api } from '../convex/_generated/api';

import { Backend } from './Backend';
import { HostList } from './HostList';
import { SessionList } from './SessionList';

/**
 * The dashboard behind sign in: the host's sessions, asking to host, and for the owner the hosts,
 * see PLAN.md. Loaded on demand by pages/Dashboard.tsx, with Convex.
 */
export function Account()
{
    return (
        <Backend>
            <Home />
        </Backend>
    );
}

function Home()
{
    const { isLoading, isAuthenticated } = useConvexAuth();
    const { signOut } = useAuthActions();
    const me = useQuery(api.hosts.me);

    if (isLoading || (isAuthenticated && me === undefined))
        return <p className="ttrpg-dashboard__note">Loading</p>;

    if (!me)
        return <SignIn />;

    const hosting = me.role === 'host' || me.role === 'owner';

    return (
        <>
            <section className="ttrpg-panel ttrpg-profile" aria-label="Signed in">
                {me.image && <img src={me.image} alt="" className="ttrpg-profile__picture" />}
                <p>{me.name}</p>
                <button type="button" className="ttrpg-segment" onClick={() => void signOut()}>
                    <FontAwesomeIcon icon={faRightFromBracket} />
                    Sign out
                </button>
            </section>

            {hosting && <SessionList />}
            {me.role === 'owner' && <HostList />}
            {me.role === 'guest' && <AskToHost />}
            {me.role === 'asked' && (
                <p className="ttrpg-dashboard__note">
                    You asked to host. Once the owner approves, your sessions show up here.
                </p>
            )}
        </>
    );
}

function SignIn()
{
    const { signIn } = useAuthActions();

    // Discord sends the browser back here, where Backend finishes the sign in.
    const signInWithDiscord = () => void signIn('discord', { redirectTo: '/ttrpg' });

    return (
        <section className="ttrpg-panel ttrpg-card" aria-label="Sign in">
            <h2>Sign in to host</h2>
            <p className="ttrpg-dashboard__note">
                Game masters sign in to build and run sessions. Players do not need an account,
                they join with the QR code at the table.
            </p>
            <div className="ttrpg-card__actions">
                <button type="button" className="ttrpg-button" onClick={signInWithDiscord}>
                    <FontAwesomeIcon icon={faDiscord} /> Sign in with Discord
                </button>
            </div>
        </section>
    );
}

function AskToHost()
{
    const ask = useMutation(api.hosts.ask);

    return (
        <section className="ttrpg-panel ttrpg-card" aria-label="Ask to host">
            <h2>Not a host yet</h2>
            <p className="ttrpg-dashboard__note">
                Hosts build battle maps and run sessions. Ask, and the owner of this app lets you
                in.
            </p>
            <button type="button" className="ttrpg-button ttrpg-button--confirm" onClick={() => void ask()}>
                Ask to host
            </button>
        </section>
    );
}
