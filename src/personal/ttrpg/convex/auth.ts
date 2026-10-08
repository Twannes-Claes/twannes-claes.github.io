import Discord from '@auth/core/providers/discord';
import { Anonymous } from '@convex-dev/auth/providers/Anonymous';
import { convexAuth } from '@convex-dev/auth/server';

/**
 * Game masters sign in with Discord, run by Convex itself. Players sign in anonymously when they
 * join, which keeps them the same user on that phone. The Discord client id and secret are
 * environment variables of the deployment (AUTH_DISCORD_ID, AUTH_DISCORD_SECRET), never in the
 * repo, see README.md.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
    // Discord sends an "iss" back with the sign in, which must match, or the callback fails.
    providers: [Discord({ issuer: 'https://discord.com' }), Anonymous],
});
