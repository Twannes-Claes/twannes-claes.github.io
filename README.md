# twannes-claes.github.io

My portfolio, at [twannes-claes.github.io](https://twannes-claes.github.io).

Built with React 19, TypeScript and Tailwind CSS v4 on Vite, prerendered to static HTML with
[vite-react-ssg](https://github.com/Daydreamer-riri/vite-react-ssg) so every project page ships its
own `<title>` and Open Graph tags.

## Getting started

Requires Node 22+.

```bash
npm install
npm run dev
```

## Scripts

| Script              | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Dev server on http://localhost:5173                            |
| `npm run build`     | Prerenders every route to `dist/`, then writes redirect stubs  |
| `npm run preview`   | Serves the built `dist/` locally                               |
| `npm run typecheck` | `tsc --noEmit`                                                 |
| `npm run lint`      | ESLint                                                         |
| `npm run format`    | Prettier                                                       |

## Adding a project

1. Create `src/content/projects/<slug>.tsx` exporting a `Project`. Copy an existing one as a
   starting point; `src/content/types.ts` documents every field.
2. Register it in `src/content/projects/index.ts`.

`order` controls position within a category (ascending) and `active: false` hides a project from the
home page while keeping its page reachable. The route, the prerendered HTML file and the legacy
redirect stub are all generated from that list, so there is nothing else to wire up.

Images live in `public/assets/projects/<slug>/` and are referenced by absolute path
(`/assets/projects/<slug>/card.png`).

Page copy is JSX rather than strings, so emphasis and lists are real markup. Font Awesome icons are
imported as objects, which means a wrong icon name fails to compile instead of silently rendering
nothing.

## Structure

```
public/assets/      Images, PDFs, cursors, arrow.svg
src/content/        All copy and project data (typed)
src/components/     Nav, buttons, cards, carousel, gallery, SEO
src/pages/          Home, ProjectPage, NotFound
src/routes.tsx      One static route per project
src/styles/         Tailwind entry, design tokens, component classes
scripts/            Post-build redirect + 404 generation
```

### Theming

`src/styles/index.css` holds the `--c-*` design tokens. `:root` is the dark palette and
`[data-theme='light']` overrides it; `@theme inline` re-exports both to Tailwind, so utilities like
`bg-bg` and `text-accent` resolve per theme without any `dark:` variants.

The theme is resolved by a small inline script in `index.html` before first paint, which avoids a
flash of the wrong palette. It must stay inline and blocking.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which typechecks, lints, builds and publishes
`dist/` to GitHub Pages. The repo's Pages source must be set to **GitHub Actions** (Settings →
Pages → Build and deployment).

The site previously ran on Jekyll and served project pages at `/projects/<slug>.html`. The build
writes a meta-refresh stub at each of those paths so old links still resolve to the new
`/projects/<slug>` URLs.
