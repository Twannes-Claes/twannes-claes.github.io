---
name: house-style
description: The code style and commenting conventions for this portfolio. Use when writing or editing TypeScript, React, CSS or config in this repo, when reviewing comments, and before committing.
---

# House style

Two halves: formatting, which tooling enforces, and commenting, which it cannot.
Run `npm run format` (ESLint `--fix` plus Prettier) and `npm run lint` after editing.

## Formatting

`eslint.config.ts` is the source of truth for `.ts` and `.tsx`, Prettier handles
everything else (`.prettierignore` excludes TypeScript, because Prettier cannot
place braces on their own line). The rules that get forgotten most:

- Braces on their own line, Allman, matching the C++ and C# conventions used elsewhere.
- 4-space indent, single quotes in TypeScript, double quotes in JSX, semicolons, trailing commas.
- A single-line body takes no braces and sits on the next line:

```ts
if (!cameFromHome)
    return;
```

- A blank line after a run of declarations, after a block, and before a `return`.
- A blank line after a braceless body too, including when the block ends there,
  because otherwise the body runs straight into the closing line:

```ts
    else if (!hash)
        window.scrollTo({ top: 0, behavior: 'instant' });

}, [key, hash]);
```

- Aim for 100 column lines, but keep a single expression on one line even when it
  runs a little past: a ternary, a short call, a Tailwind class string. Only break
  code when the formatter does it. Do not split a ternary over `?` and `:` lines or
  put each argument on its own line just to get under 100:

```ts
const name = version ? (version.title ?? `${version.name} ${details.name}`) : details.name;
```

## Not enforced, still expected

- **Import groups**, separated by blank lines: external packages, then local
  types, then local modules, then sibling components. Alphabetical by module path
  within a group. Type-only imports use `import type`, or an inline `type` inside
  an existing import.
- **Named exports** for components and helpers. Pages are the exception, they
  default-export.
- **Props** get an `interface <Name>Props` above the component when there is more
  than one, otherwise they are typed inline.
- **No manual memoisation.** The React Compiler memoises every component, so handlers
  are plain arrow functions and derived values plain `const`s. No `useCallback`,
  `useMemo` or `memo`.
- Helper functions sit above the component that uses them.

## Commenting

A comment earns its place by saying something the code cannot. Never restate the
code, and never leave a comment that names something which no longer exists.

**Keep them short.** One line is the default. Write the surprise and stop, do not
explain around it: a reader who knows the language does not need the mechanism
spelled out, only the reason it is there. Anything that runs past three lines
needs three lines of reasoning to carry it, and most of the time it does not have
them. Prefer trimming a comment to deleting it, but delete it if what is left is
the code said twice.

Four shapes, all written as full sentences ending in a full stop:

1. A JSDoc block above an export, for why it exists and what a reader would
   otherwise get wrong. This is where the reasoning goes, including framework
   behaviour that forced the approach.
2. A one-line JSDoc on an interface field, a small helper or a constant, when a
   few words settle it.
3. A plain block comment after the imports, for a fact that governs the whole
   file rather than any one function.
4. A `//` line above a statement, for the reason behind that statement. Inside
   JSX the same thing in braces.

Rules of tone:

- **No em dashes.** Use a comma, a full stop, or "so" and "because".
- Present tense, plain words, no "obviously", no "note that", no apologies.
- Explain the why, not the what. "Seeded with the landing page, which the snippet
  has already counted." beats "Sets counted to the pathname."
- Name the constraint that made the code look odd, so nobody tidies it away.
  Anything pointing at another file names that file.
- An empty `catch` always carries a comment saying what was swallowed and why
  that is safe.
- Comments do wrap at 100 columns, strictly, unlike code.

## Before finishing

- `npm run format`, then `npm run lint` and `npm run typecheck` clean.
- Reread every comment touched. Does it still describe the code below it, and
  does it say something the code does not?
- No em dashes anywhere, in code, comments, README or commit message.
