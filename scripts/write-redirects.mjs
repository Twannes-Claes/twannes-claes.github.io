/**
 * Post-build fixups that static hosting needs.
 *
 * 1. Legacy aliases. Jekyll served project pages at /projects/<slug>.html; the
 *    React build emits /projects/<slug>/index.html. Old links (CVs, LinkedIn
 *    posts, search results) must keep working.
 *
 *    These are full copies of the page rather than meta-refresh stubs. A stub
 *    would loop: static hosts resolve the extensionless /projects/<slug> to
 *    <slug>.html in preference to <slug>/index.html, so a stub there would
 *    redirect to a URL that resolves straight back to the stub. Serving the real
 *    page at both paths sidesteps host-specific resolution order entirely, and
 *    the canonical tag already points at the clean URL, so search engines
 *    collapse the pair.
 *
 * 2. GitHub Pages reads its not-found page from /404.html specifically, so the
 *    prerendered /404 page is lifted out of its directory.
 */
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const projectsDir = join(distDir, 'projects');

const entries = await readdir(projectsDir, { withFileTypes: true }).catch(() => {
  throw new Error(
    `Expected prerendered pages in ${projectsDir}. Did the vite-react-ssg build run first?`,
  );
});

const slugs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

if (slugs.length === 0) {
  throw new Error(`No project directories found in ${projectsDir}; nothing to alias.`);
}

await Promise.all(
  slugs.map(async (slug) => {
    const html = await readFile(join(projectsDir, slug, 'index.html'), 'utf8');
    await writeFile(join(projectsDir, `${slug}.html`), html);
  }),
);

console.log(`Wrote ${slugs.length} legacy .html aliases to dist/projects/`);

const notFoundSrc = join(distDir, '404', 'index.html');
const notFoundHtml = await readFile(notFoundSrc, 'utf8').catch(() => null);

if (!notFoundHtml) {
  throw new Error(`Expected a prerendered ${notFoundSrc}. Is the /404 route still in routes.tsx?`);
}

await writeFile(join(distDir, '404.html'), notFoundHtml);
await rm(join(distDir, '404'), { recursive: true, force: true });

console.log('Wrote dist/404.html');
