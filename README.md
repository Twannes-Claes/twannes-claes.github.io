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

| Script              | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Dev server on http://localhost:5173              |
| `npm run build`     | Prerenders every route to `dist/` as static HTML |
| `npm run preview`   | Serves the built `dist/` locally                 |
| `npm run typecheck` | `tsc --noEmit` over `src/` and `vite.config.ts`  |
| `npm run lint`      | ESLint                                           |
| `npm run format`    | Prettier                                         |

`typecheck` and `lint` both run in CI before the build, so either one failing blocks the deploy.

## Adding a project

1. Create `src/content/projects/<slug>.tsx` exporting a `Project`. Copy an existing one as a
   starting point; `src/content/types.ts` documents every field.
2. Register it in `src/content/projects/index.ts`.

`order` controls position within a category (ascending) and `active: false` hides a project from the
home page while keeping its page reachable. The route and the prerendered HTML file are both
generated from that list, so there is nothing else to wire up.

Images live in `public/assets/projects/<slug>/` and are referenced by absolute path
(`/assets/projects/<slug>/card.png`).

Page copy is JSX rather than strings, so emphasis and lists are real markup. Font Awesome icons are
imported as objects, which means a wrong icon name fails to compile instead of silently rendering
nothing.

## Structure

```
src/content/        All copy and project data (typed)
src/components/     Nav, buttons, cards, carousel, gallery, SEO
src/pages/          Home, ProjectPage, NotFound
src/hooks/          useTheme, useMediaQuery
src/styles/         Tailwind entry, design tokens, component classes
src/routes.tsx      One static route per project, derived from the content
public/assets/      Images, PDFs, cursors, arrow.svg
.github/workflows/  CI: typecheck, lint, build, deploy
```

Everything in the repo root is there because its tooling requires it: `index.html` is Vite's
entry, `tsconfig.json` covers both `src/` and `vite.config.ts`, and Prettier's settings live in
the `"prettier"` block of `package.json` rather than a separate dotfile.

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

### URLs

The build writes each project to `dist/projects/<slug>.html`, which happens to be the exact path
Jekyll used, so links from before the rewrite still resolve with no redirects or aliases involved.
The 404 page lands at `dist/404.html`, which is the only path GitHub Pages reads it from.

The canonical URL is the extensionless `/projects/<slug>`, which static hosts serve from the same
`.html` file. A page reached at the `.html` address has its URL rewritten by the inline script in
`index.html` before the router boots, so React Router always sees the clean path.

This relies on the host resolving `/projects/<slug>` to `<slug>.html`. GitHub Pages does; if a
future host does not, set `ssgOptions: { dirStyle: 'nested' }` in `vite.config.ts` and publish a
copy of each page at the old `.html` path instead.
