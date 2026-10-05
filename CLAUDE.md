# Portfolio

React 19, TypeScript, Tailwind v4 and Vite, prerendered to static HTML with vite-react-ssg.
README.md covers the structure, adding a project and releasing.

## Style

Use the `house-style` skill for any code, comment or commit. `npm run format`, `npm run lint` and
`npm run typecheck` must be clean before finishing.

## React

- The React Compiler (`vite.config.ts`) memoises every component and hook. Never write
  `useCallback`, `useMemo` or `memo`. Handlers are plain arrow functions, derived values plain
  `const`s computed during render.
- The compiler skips a component it cannot handle, without a lint error. Two known causes: a
  dynamic `import()` inside a component, and a `??`, `?.` or ternary inside a `try/catch`. Move the
  import into a module-level function, and use `.catch()` on the promise instead of `try/catch`.
- Effects only sync with something outside React: subscriptions, timers, the DOM, fetches. State
  that can be derived from props or other state is computed during render, never copied in an
  effect.
- Browser state such as the theme or a media query is read with `useSyncExternalStore`, see
  `src/shared/hooks/`.
- Everything must render during the prerender, so `window` and `document` are only touched in
  effects, handlers or behind a `typeof window` check.

## Personal apps

Side projects such as `src/personal/skylanders/` are kept out of the portfolio's bundle:

- Each app lives in its own folder under `src/personal/<app>/`, with its pages, components,
  services, content and styles.
- Its route in `src/routes.tsx` is `lazy`, so nothing of it loads until someone opens that page.
- Fonts and stylesheets are imported by the app's own page, never from `src/styles/` or `main.tsx`.
- Heavy dependencies, such as Firebase, are loaded with a dynamic `import()` when first needed,
  never imported at the top of a file. A demo or signed-out view should not load them at all.
- The portfolio does not import from an app. The one exception is a small entry point like
  `skylanders/entrance/`, which holds only the way in and preloads the lazy route with `import()`.
- Not linked from the portfolio, and marked `noindex` if it is private.
- Check `npm run build` after adding one: the app's code should appear only in its own chunks.
