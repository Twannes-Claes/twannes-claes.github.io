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
    /**
     * Where the TTRPG QR code sends phones while testing on the Wi-Fi, like
     * http://192.168.1.20:5173. Set in .env.development.local, see src/personal/ttrpg/README.md.
     */
    readonly VITE_JOIN_ORIGIN?: string;
}

/** Injected from version.txt by vite.config.ts. */
declare const __APP_VERSION__: string;

/** Set up by the GoatCounter snippet in index.html. Absent until it loads. */
interface Window
{
    goatcounter?: {
        count?: (vars?: { path?: string; title?: string; referrer?: string }) => void;
    };
}
