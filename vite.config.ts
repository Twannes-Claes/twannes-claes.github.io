import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Pulls in the `ssgOptions` augmentation on vite's UserConfig.
import type {} from 'vite-react-ssg';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  ssgOptions: {
    // /projects/foo -> dist/projects/foo/index.html, leaving the flat
    // dist/projects/foo.html path free for the legacy redirect stubs.
    dirStyle: 'nested',
    formatting: 'none',
  },
});
