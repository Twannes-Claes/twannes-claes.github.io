import { faDiscord } from '@fortawesome/free-brands-svg-icons';
import { faArrowUpRightFromSquare, faChevronDown, faHourglassHalf, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useActionState, useState } from 'react';

import { api } from '../convex/_generated/api';
import { fileSize } from '../services/images';

import { Backend } from './Backend';
import { Loading, Spinner } from './Feedback';
import { HostList } from './HostList';
import { SessionList } from './SessionList';
import { StorageMeter } from './StorageMeter';

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
            {hosting && <Storage owner={me.role === 'owner'} />}
        </>
    );
}

/**
 * What Convex's free plan allows besides file storage, from docs.convex.dev/production/state/limits.
 * Past one, new writes start to fail rather than a bill arriving. Only the dashboard knows how much
 * of each is used: counting them here would itself spend calls and bandwidth.
 */
const planLimits = [
    { name: 'Function calls', limit: '1M a month', hint: 'Every query run, mutation and live update' },
    { name: 'Database bandwidth', limit: '1 GB a month', hint: 'Everything read and written, fog and tokens most' },
    { name: 'File bandwidth', limit: '1 GB a month', hint: 'Maps, props and token pictures downloaded' },
    { name: 'Database storage', limit: '0.5 GB', hint: 'Sessions, maps, walls and tokens' },
];

/** The usage page of the team's Convex dashboard, the only place that counts everything. */
const usagePage = 'https://dashboard.convex.dev/t/twannes-claes/settings/usage';

/**
 * The whole plan's storage, shared by every host, with this host's props marked in it. The owner
 * also sees the free plan's other limits, with the way to their live numbers.
 */
function Storage({ owner }: { owner: boolean })
{
    const usage = useQuery(api.pictures.usage);

    return (
        <section className="ttrpg-panel ttrpg-card ttrpg-usage" aria-label="Storage">
            {/* Last and folded: worth a look now and then, not every visit. */}
            <details>
                <summary>
                    <h2>{owner ? 'Storage and limits' : 'Storage'}</h2>
                    {usage && <span>{fileSize(usage.propBytes + usage.otherBytes)} used</span>}
                    <FontAwesomeIcon icon={faChevronDown} className="ttrpg-usage__chevron" />
                </summary>
                <div className="ttrpg-usage__body">
                    {usage ? <StorageMeter {...usage} plan /> : <Loading>Adding up the files</Loading>}
                    {owner && (
                        <div className="ttrpg-plan">
                            <p className="ttrpg-storage__head">Free plan</p>
                            <dl>
                                {planLimits.map(({ name, limit, hint }) => (
                                    <div key={name} title={hint}>
                                        <dt>{name}</dt>
                                        <dd>{limit}</dd>
                                    </div>
                                ))}
                            </dl>
                            <a href={usagePage} target="_blank" rel="noreferrer">
                                See what is used on the Convex dashboard
                                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                            </a>
                        </div>
                    )}
                </div>
            </details>
        </section>
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
