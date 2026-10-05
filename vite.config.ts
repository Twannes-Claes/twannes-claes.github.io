import { readFileSync } from 'node:fs';

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

export default defineConfig({
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    define: {
        __APP_VERSION__: JSON.stringify(version),
    },
    ssgOptions: {
        onPageRendered: (_route, html) => keepLatinFontPreloads(html),
    },
});
