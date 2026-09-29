/// <reference types="vite/client" />

/** Injected from version.txt by vite.config.ts. */
declare const __APP_VERSION__: string;

/** Set up by the GoatCounter snippet in index.html. Absent until it loads. */
interface Window
{
    goatcounter?: {
        count?: (vars?: { path?: string; title?: string; referrer?: string }) => void;
    };
}
