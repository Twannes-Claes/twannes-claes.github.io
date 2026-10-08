# TTRPG

Battle maps for tabletop sessions, at `/ttrpg`. A game master builds scenarios in the editor and
runs them in play mode on a screen on the table; players join from their phone with a QR code and
a password. Not linked from the portfolio and marked `noindex`.

The full design and build order is in [PLAN.md](PLAN.md).

| Route                | Page              | Who                                 |
| -------------------- | ----------------- | ----------------------------------- |
| `/ttrpg`             | `pages/Dashboard` | Game masters: sign in, sessions     |
| `/ttrpg/edit?s=<id>` | `pages/Editor`    | The game master: edit and play mode |
| `/ttrpg/edit?demo`   | `pages/Editor`    | Anyone: the editor without saving   |
| `/ttrpg/join?s=<id>` | `pages/Join`      | Players, from the QR code           |

## Backend

[Convex](https://www.convex.dev) on the free plan, with the functions in `convex/` (the root
`convex.json` points the CLI there). Two deployments: **dev** for `npm run dev`, **prod** for
the live site. The site and the functions deploy separately: pushing to GitHub Pages does not
change the functions.

- While working on `convex/`, keep `npx convex dev` running in the repo root. It pushes every
  save to the dev deployment and rewrites `convex/_generated/`, which is committed.
- To put the functions live: `npx convex deploy`.

## One-time setup

Secrets (client secrets, keys) only ever go into the Convex deployment through your own
terminal or the Convex dashboard, never into the repo or a chat.

### 1. Convex

1. Sign up at https://www.convex.dev with GitHub.
2. In the repo root, run `npx convex dev`, log in, and create a new project named `ttrpg`. It
   writes `.env.local` (git ignores it) with the dev deployment's address, so `npm run dev` finds
   it, replaces the stand-in files in `convex/_generated/`, and pushes the functions.
   If it complains about esbuild, run `npm approve-scripts esbuild` once and try again.
3. Run `npx @convex-dev/auth` and give `http://localhost:5173` as the site address. It makes the
   keys Convex Auth signs with.
4. Note the dev deployment's **HTTP actions URL**, ending in `.convex.site`, from the Convex
   dashboard, Settings, URL and Deploy Key. Discord sends people back there.

### 2. Discord

1. https://discord.com/developers/applications, **New Application**, name it `TTRPG`.
2. **OAuth2**, Redirects, add `https://<dev deployment>.convex.site/api/auth/callback/discord`.
3. In your terminal, with the Client ID and a fresh secret from **Reset Secret**:
   `npx convex env set AUTH_DISCORD_ID <client id>` and
   `npx convex env set AUTH_DISCORD_SECRET <client secret>`.

### 3. You as the owner

1. `npm run dev`, open http://localhost:5173/ttrpg and sign in.
2. Convex dashboard, **Data**, `users`: copy the `_id` of your row.
3. `npx convex env set OWNER_ID <that id>`. Reload, and the dashboard shows your sessions and the
   hosts list.

### Trying it with phones before going live

Phones on the same Wi-Fi can play against the dev deployment:

1. Put the laptop's network address in `.env.development.local`, for the QR code:
   `VITE_JOIN_ORIGIN=http://192.168.1.20:5173` (the Network line `npm run dev -- --host` prints).
2. Run `npm run dev -- --host`, so phones can reach the dev server.
3. The GM stays on `http://localhost:5173`: sign in, start the session, show the QR code.

Phones need no setup. The GM page needs localhost because the browser only gives some features
(like `crypto.randomUUID`) to localhost and https pages.

### 4. Going live

1. `npx convex deploy` makes the prod deployment and pushes the functions.
2. `npx @convex-dev/auth --prod`, with `https://twannes-claes.github.io` as the site address.
3. Add the prod `.convex.site` callback address to Discord next to the dev one, and set the same
   two `AUTH_DISCORD_*` values with `npx convex env set --prod ...`.
4. Paste the prod deployment's address (`https://<prod deployment>.convex.cloud`) into
   `services/config.ts` in place of the empty string, and release the site.
5. Sign in on the live site, and set `OWNER_ID` with `--prod` to your prod user id, like in 3.
