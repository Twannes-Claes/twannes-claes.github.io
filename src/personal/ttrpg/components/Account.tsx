import { faDiscord } from '@fortawesome/free-brands-svg-icons';
import { faHourglassHalf, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useActionState, useState } from 'react';

import { api } from '../convex/_generated/api';

import { Backend } from './Backend';
import { Loading, Spinner } from './Feedback';
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
        return <Loading>Checking your account</Loading>;

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
                <section className="ttrpg-panel ttrpg-card" aria-label="Waiting to host">
                    <h2>Request sent</h2>
                    <p className="ttrpg-dashboard__note">
                        <FontAwesomeIcon icon={faHourglassHalf} /> Once the owner approves, your
                        sessions show up here.
                    </p>
                </section>
            )}
        </>
    );
}

function SignIn()
{
    const { signIn } = useAuthActions();
    const [leaving, setLeaving] = useState(false);

    // Discord sends the browser back here, where Backend finishes the sign in.
    const signInWithDiscord = () =>
    {
        setLeaving(true);
        signIn('discord', { redirectTo: '/ttrpg' }).catch(() => setLeaving(false));
    };

    return (
        <section className="ttrpg-panel ttrpg-card" aria-label="Sign in">
            <h2>Sign in to host</h2>
            <p className="ttrpg-dashboard__note">
                Game masters sign in to build and run sessions. Players do not need an account,
                they join with the QR code at the table.
            </p>
            <div className="ttrpg-card__actions">
                <button type="button" className="ttrpg-button" disabled={leaving} onClick={signInWithDiscord}>
                    {leaving ? <Spinner /> : <FontAwesomeIcon icon={faDiscord} />}
                    {leaving ? 'Opening Discord' : 'Sign in with Discord'}
                </button>
            </div>
        </section>
    );
}

function AskToHost()
{
    const ask = useMutation(api.hosts.ask);

    // Once asked, the role changes and the page shows the waiting card instead of this one.
    const [failure, request, asking] = useActionState(
        () => ask().then(() => '', () => 'The request did not go through. Try again.'),
        '',
    );

    return (
        <form action={request} className="ttrpg-panel ttrpg-card" aria-label="Ask to host">
            <h2>Not a host yet</h2>
            <p className="ttrpg-dashboard__note">
                Hosts build battle maps and run sessions. Ask, and the owner of this app lets you
                in.
            </p>
            {failure && (
                <p className="ttrpg-error" role="alert">
                    {failure}
                </p>
            )}
            <div className="ttrpg-card__actions">
                <button type="submit" className="ttrpg-button ttrpg-button--confirm" disabled={asking}>
                    {asking ? 'Asking' : 'Ask to host'}
                </button>
            </div>
        </form>
    );
}
