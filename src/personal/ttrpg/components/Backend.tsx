import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { Component, type ReactNode } from 'react';

import { client } from '../services/backend';

/**
 * Gives everything inside it Convex and the sign-in state. It also finishes a Discord
 * sign-in when the page opens with the ?code those send back.
 */
export function Backend({ children }: { children: ReactNode })
{
    return (
        <Failsafe>
            <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>
        </Failsafe>
    );
}

/**
 * A live query that fails throws while rendering, which would take the whole page down. The
 * queries return null for what they expect, see convex/play.ts, so this is only for the rest,
 * like the deployment being down. React only catches render errors in a class.
 */
class Failsafe extends Component<{ children: ReactNode }, { failed: boolean }>
{
    state = { failed: false };

    static getDerivedStateFromError()
    {
        return { failed: true };
    }

    render()
    {
        if (!this.state.failed)
            return this.props.children;

        return (
            <main className="ttrpg-placeholder">
                <p>Something went wrong talking to the server.</p>
                <p>
                    <button type="button" className="ttrpg-button" onClick={() => window.location.reload()}>
                        Reload
                    </button>
                </p>
            </main>
        );
    }
}
