import { readFileSync } from 'node:fs';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Read from version.txt so the page and the release pipeline cannot disagree.
const version = readFileSync(new URL('./version.txt', import.meta.url), 'utf8').trim();

export default defineConfig({
    plugins: [react(), tailwindcss()],
    define: {
        __APP_VERSION__: JSON.stringify(version),
    },
});
