import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Read from version.txt so the page and the release pipeline cannot disagree.
const version = readFileSync(new URL('./version.txt', import.meta.url), 'utf8').trim();

/**
 * Drops every font preload but the Latin ones. vite-react-ssg preloads each font file a page
 * imports, Cyrillic, Greek and the rest included, and a preload downloads a file even when
 * unicode-range would never pick it. Left without one, those subsets still load if a page uses
 * them.
 */
function keepLatinFontPreloads(html: string): string
{
    return html.replace(/<link\b[^>]*\bas="font"[^>]*>/g, (link) =>
        /href="[^"]*-latin-(?!ext)[^"]*\.woff2"/.test(link) ? link : '',
    );
}

/**
 * The dev server on this laptop's network address, for the TTRPG QR code, so phones on the same
 * Wi-Fi reach it wherever the laptop is. A home network's 192.168 address wins over the virtual
 * adapters Windows adds. Read when the dev server starts, so moving networks needs a restart.
 */
function lanOrigin(): string | null
{
    const addresses = Object.values(networkInterfaces())
        .flatMap((entries) => entries ?? [])
        .filter((entry) => entry.family === 'IPv4' && !entry.internal)
        .map((entry) => entry.address);
    const address = addresses.find((candidate) => candidate.startsWith('192.168.')) ?? addresses[0];

    return address ? `http://${address}:5173` : null;
}

export default defineConfig(({ command }) => ({
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    define: {
        __APP_VERSION__: JSON.stringify(version),
        // Only for npm run dev: the built site is opened at its real address.
        __JOIN_ORIGIN__: JSON.stringify(command === 'serve' ? lanOrigin() : null),
    },
    ssgOptions: {
        onPageRendered: (_route, html) => keepLatinFontPreloads(html),
    },
}));
