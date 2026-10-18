import { spawn } from 'node:child_process';

/*
 * `npx convex dev` and the dev server reachable from phones, in this one terminal. Convex's own
 * `--start` opens a second console window on Windows. Ctrl+C reaches both, since they share this
 * console.
 */

for (const command of ['convex dev', 'vite --host'])
    spawn(command, { shell: true, stdio: 'inherit' });
