/// <reference types="vite/client" />

interface ImportMetaEnv
{
    /**
     * The Skylanders password, for the dev only auto-login button. Set in .env.development.local,
     * which only `npm run dev` reads and git ignores, so it never reaches the built site.
     */
    readonly VITE_SKYLANDERS_DEV_PASSWORD?: string;
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
