/// <reference types="vite/client" />

interface ImportMetaEnv
{
    /**
     * The Skylanders password, for the dev only auto-login button. Set in .env.development.local,
     * which only `npm run dev` reads and git ignores, so it never reaches the built site.
     */
    readonly VITE_SKYLANDERS_DEV_PASSWORD?: string;
    /** The TTRPG app's Convex development deployment, written to .env.local by `npx convex dev`. */
    readonly VITE_CONVEX_URL?: string;
}

/** Injected from version.txt by vite.config.ts. */
declare const __APP_VERSION__: string;

/**
 * Under npm run dev, the dev server on the laptop's network address, where the TTRPG QR code
 * sends phones. Null in the built site, see vite.config.ts.
 */
declare const __JOIN_ORIGIN__: string | null;

/** Set up by the GoatCounter snippet in index.html. Absent until it loads. */
interface Window
{
    goatcounter?: {
        count?: (vars?: { path?: string; title?: string; referrer?: string }) => void;
    };
}
