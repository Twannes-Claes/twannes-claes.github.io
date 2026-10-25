import Discord from '@auth/core/providers/discord';
import { Anonymous } from '@convex-dev/auth/providers/Anonymous';
import { convexAuth } from '@convex-dev/auth/server';

/**
 * Whether Discord may send the browser back to an address. The site's own always; while the site
 * is the dev server on localhost, also that dev server on the laptop's network address, the one
 * the QR code gives phones, see lanOrigin in vite.config.ts. On a phone localhost is the phone.
 */
function allowed(target: URL, site: URL): boolean
{
    if (target.origin === site.origin)
        return true;

    const dev = site.hostname === 'localhost' && target.protocol === 'http:' && target.port === site.port;

    return dev && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(target.hostname);
}

/**
 * Game masters sign in with Discord, run by Convex itself. Players sign in anonymously when they
 * join, which keeps them the same user on that phone, or with Discord to keep their characters.
 * The Discord client id and secret are environment variables of the deployment (AUTH_DISCORD_ID,
 * AUTH_DISCORD_SECRET), never in the repo, see README.md.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
    // Discord sends an "iss" back with the sign in, which must match, or the callback fails.
    providers: [Discord({ issuer: 'https://discord.com' }), Anonymous],
    callbacks: {
        async redirect({ redirectTo })
        {
            const site = new URL(process.env.SITE_URL ?? '');
            const target = new URL(redirectTo, site);

            if (!allowed(target, site))
                throw new Error(`Discord may not send the browser to ${target.origin}.`);

            return target.href;
        },
    },
});
