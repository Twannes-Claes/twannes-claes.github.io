# TTRPG: plan

TTRPG is a battle map app for running tabletop RPG sessions at the table, at `/ttrpg` on the
portfolio. It is not tied to one game: the rules it needs (5 ft cells, 5 and 10 diagonals) are
shared by the common systems. Think Roll20's map, with less clutter and built for one setup: a big screen lying on the table, and
everyone's phone as their controller.

This file is the whole plan. [README.md](README.md) holds the routes and the one-time setup.

---

## 1. The idea in one minute

- A **Game Master (GM)** signs in and builds a **session**: a set of **scenarios**, one battle map
  each (the tavern, the road, the crypt).
- Each scenario gets a background picture, a square or hex grid, props such as trees and rocks,
  **walls** that block sight and movement, and a **spawn point**.
- The GM sets a password and presses **Start**. The editor switches to **play mode**, full
  screen. The GM's screen is mirrored to the big screen on the table. A button shows a big
  **QR code**.
- Players scan it, type the password, enter a character name and add a picture. Their round
  token appears around the spawn point.
- On their phone, a player **drags a path** from their token. The app counts the feet as they go.
  When they let go, they choose **Move** or **Cancel**. The token walks the path on every screen.
- **Fog of war** is shared. What one player sees, everyone sees, and what has been seen stays
  uncovered (dimmed) after they walk away.

---

## 2. Who uses it, and on what

| Who         | Device                            | Signed in how                 | Can do                                                 |
| ----------- | --------------------------------- | ----------------------------- | ------------------------------------------------------ |
| Owner (you) | Any                               | Discord                       | Everything a host can, plus approve other GMs as hosts |
| Host (a GM) | Laptop, mirrored to the 4K screen | Discord (see 6)               | Edit mode: build sessions. Play mode: run them         |
| Player      | Phone                             | No account (anonymous, see 6) | Join with the password, move own token, measure        |

There is no separate table app. The 4K screen just mirrors the GM's laptop, and what it shows is
the editor in **play mode**. Since the players look at that screen, play mode shows the map **as
the players see it**, fog included. The GM gets a **Peek** toggle (hold a key or button) to see
through the fog for a moment.

---

## 3. Look and feel

Roll20 is the reference for **what** a battle map does, not for how it looks. Its UI feels dated
and crowded: grey toolbars, tiny icons, panels everywhere. This one should look like it belongs
on your portfolio.

### Your style, carried over

- **Colours:** the portfolio tokens from `src/styles/index.css`. Warm off-black `#1e1d1f` for
  panels, cream `#fcf8ec` for text, purple `#683c9b` as the accent (selection, active tool, own
  token ring), green `#1e5631` for confirm actions such as **Move**. Copied into `ttrpg.css` as
  `--ttrpg-*` variables, not imported, so the portfolio's stylesheet stays out of the app.
- **Fonts:** Onest for the UI, JetBrains Mono for numbers (feet, grid size), both already
  installed.
- **Dark only.** It is used at a table, often in dim light, and the map is the bright thing on
  screen. No light theme.

### The map comes first

- The canvas fills the whole screen, edge to edge. Every panel **floats** over it: rounded,
  slightly translucent off-black with a backdrop blur, a soft shadow, no hard borders.
- In edit mode: one slim tool rail on the left, the scenario list on the right, the properties
  of the selected thing in a small panel that appears only when something is selected.
- In play mode: almost nothing. One small toolbar that fades out after a few seconds without
  the mouse, so the 4K screen shows just the map.
- Big, clear icons (Font Awesome, already installed) with a tooltip and a keyboard shortcut,
  like V select, W walls, P props, M measure, Q QR code.

### On the map

- **Tokens:** round portraits with a coloured ring, a soft drop shadow, and the name in a small
  pill underneath. The own token on a phone gets a slow pulsing ring.
- **Grid:** thin and subtle by default, so it supports the art instead of fighting it.
- **Path drawing:** a smooth line in the accent colour through the cell centres, a dot per step,
  and a floating pill at the finger with the feet, like `25 ft`, turning red past the speed.
- **Walk animation:** the token glides with easing and a small bob per step, never teleports.
- **Fog:** smoky and soft, see 8.

### Phones

- Built for one hand: the controls sit at the bottom, in thumb reach.
- The Move and Cancel choice is a bottom sheet with two big buttons.
- Short haptic tick per cell while drawing a path (`navigator.vibrate`, where the phone supports
  it).
- The join flow is three short, friendly screens (password, name, picture), not one long form.

### Motion

Short and soft: panels slide and fade in about 150 ms, tokens ease, fog fades in. All of it
turned off for people with `prefers-reduced-motion`.

---

## 4. Where it lives in the repo

It follows the personal-app rules in `CLAUDE.md`, exactly like `src/personal/skylanders/`:
own folder, lazy routes, the backend loaded with a dynamic `import()`, `noindex`, not linked from
the portfolio.

```
convex.json               Points the Convex CLI at src/personal/ttrpg/convex/
src/personal/ttrpg/
  PLAN.md                 This file
  README.md               Routes and the one-time Convex and Discord setup
  types.ts                Scenario, Grid, Wall, Prop, Token, Store
  pages/
    Dashboard.tsx         /ttrpg           Sign in, list of sessions, new session
    Editor.tsx            /ttrpg/edit      The battle map editor, with edit and play mode
    Join.tsx              /ttrpg/join      The phone view, password, character, controls
  map/                    The engine, plain TypeScript, no React in here
    camera.ts             Pan and zoom, screen to world and back
    geometry.ts           Segment crossing, distances
    grid.ts               Square and hex math: cell of a point, neighbours, distance
    path.ts               Turning a finger drag into a path of cells, feet counting
    visibility.ts         Line of sight polygon from walls
    fog.ts                Explored mask, drawing the fog layer
    spawn.ts              Free spots around the spawn point
    render.ts             Draws every layer onto the canvas
    view.ts               Owns the canvas: resizing, gestures, drawing on the next frame
    uvtt.ts               Turns a .dd2vtt file into a scenario
    tools.ts              The edit tools: walls, erase, doors, spawn, grid alignment, props,
                          and the ruler
    props.ts              Prop sizing, hit testing, handles and snapping
    size.ts               Creature sizes: footprints, anchors, squeezing past walls
    walk.ts               The walk animation along a confirmed path
    map.check.ts          Assert-based self check, run with `node`
  components/             Shell (the frame of every page), MapCanvas (mounts map/view.ts),
                          MapEditor (the editor, for the demo and saved sessions), ToolRail,
                          ScenarioList, GridPanel, useHistory (undo and redo), move sheet,
                          and the Convex side: Backend (the provider), Account, SessionList,
                          HostList, SessionEditor
  content/scenarios.ts    The demo map and a blank one, no picture, no network
  convex/                 The backend, deployed with the Convex CLI, see 5
    schema.ts             The tables, and the scenario validator
    auth.ts, auth.config.ts, http.ts   Discord sign in (Convex Auth)
    access.ts             Who may do what: signed in, host, owner, own session
    hosts.ts              Ask to host, approve, decline, remove
    sessions.ts           List, create, rename, delete, load, autosave
    play.ts               Start, end, freeze, switch maps, join, tokens and moves
    pictures.ts           Upload addresses, map pictures, the prop library
    _generated/           Written by `npx convex dev`, committed, not linted
  services/
    config.ts             The Convex address, not secret
    backend.ts            The Convex client and the store for a saved session, only ever
                          dynamically imported
    demo.ts               The store behind ?demo, pictures in the tab, nothing saved
    images.ts             Resize and convert uploads to WebP in the browser
  styles/ttrpg.css
```

### Built like the rest of the project

The Skylanders app and the clean-up passes over the repo settled how things are done here. This
app follows the same patterns rather than inventing new ones:

- **The backend stays out of the bundle.** Everything that touches Convex (`services/backend.ts`
  and the components that use its hooks) is only reached through a module-level `loadAccount()`
  or `loadSession()` with a dynamic `import()` in the pages, like `loadDb()` on the Skylanders
  page. The demo and the prerender never load it.
- **A demo mode.** `?demo` gives the editor `services/demo.ts` instead of the Convex store, both
  implementing `Store` from `types.ts`, like `skylanders/services/demo.ts`. It doubled as the
  way to build phases 1, 3, 5 and 6 before any backend existed, and lets anyone try the app
  without an account.
- **React Compiler rules** from `CLAUDE.md`: no `useCallback`, `useMemo` or `memo`, derived values
  computed during render, effects only for the outside world (the canvas, autosave, pointer
  events, timers), browser state through `useSyncExternalStore` like
  `shared/hooks/useMediaQuery.ts`. No `?.`, `??` or ternaries inside `try/catch`.
- **Prerender safe.** `window`, `document` and the canvas are only touched in effects and
  handlers. The `map/` engine is plain TypeScript, so it never runs during the prerender.
- **React 19 form actions** (`useActionState`) for forms, like the new session form and later
  the password and character forms, like `skylanders/components/PasswordForm.tsx`, with the
  password field left uncontrolled so password managers keep working.
- **Scoped styles.** One `styles/ttrpg.css`, everything under `.ttrpg`, tokens as `--ttrpg-*`,
  imported by the pages themselves.
- **House style** for every file: Allman braces, the import groups, comments that say why, no em
  dashes. `npm run format`, `lint`, `typecheck` and `build` clean at the end of each phase.
- **No git writes by Claude.** Each phase ends with a suggested commit message (in the repo's
  `feat(ttrpg): ...` form) and the list of files, and you commit.

### Routes and GitHub Pages

GitHub Pages only serves files that exist. Every route is prerendered by vite-react-ssg, so
`/ttrpg/join` is a real file, but `/ttrpg/join/abc123` would not be and would land on the 404 page.
So the session id goes in the **query string**, the same trick `?demo` uses on the Skylanders
page:

- `/ttrpg/edit?s=<sessionId>` (edit and play mode)
- `/ttrpg/join?s=<sessionId>` (what the QR code holds)

Three lazy routes in `src/routes.tsx`. The join page is the one phones load, so it should stay the
lightest: no editor code in its chunk.

---

## 5. Backend: Convex, free plan

Convex, the same backend as Void Guild, on the free plan: no credit card, no pausing when unused,
and hard limits instead of a bill (past them, writes fail until the next month). Firebase was
the first plan, but its file storage and server code both need the paid Blaze plan.

| Need                       | Convex piece                                 | Notes                                     |
| -------------------------- | -------------------------------------------- | ----------------------------------------- |
| GM accounts                | Convex Auth, Discord provider                | Runs on Convex itself, no second server   |
| Sessions, maps, tokens     | Tables, with live queries for play (phase 4) | 0.5 GB on the free plan                   |
| Background and prop images | File storage                                 | 1 GB, WebP at most 4096 px, a few MB each |
| Player pictures            | Inside the token document (phase 4)          | 256 px WebP, about 20 KB                  |
| Passwords, who sees what   | Queries and mutations, checked on the server | `convex/access.ts`                        |

The free plan also gives 1 million function calls and 1 GB of database reads a month. A move is
**one write** when the player confirms it, not a stream of positions, and every screen animates
the walk itself from the path in that write. A whole evening is a few hundred writes.

The functions deploy separately from the site: GitHub Pages serves the pages, `npx convex
deploy` sends `convex/` to Convex when it changes, see README.md.

---

## 6. Accounts and access

### Hosts (GMs)

A **host** is anyone who may make and run sessions. The point is to share the app with fellow
GMs, so becoming one should not need the Convex dashboard.

- A GM signs in on `/ttrpg` with **Discord** (Convex Auth; the client secrets are
  environment variables of the deployment, never in the repo).
- Not a host yet? The dashboard shows **Ask to host**, which adds a row to `hostRequests`.
- **You (the owner)** see the open requests on your dashboard and press **Approve** or
  **Decline**. Approve adds a row to `hosts`. You can also remove a host later.
- The owner is the user id in the deployment's `OWNER_ID` environment variable, so nobody else
  can approve anyone.
- A host sees and edits only their own sessions; someone else's session id reads as missing.

### Players (phase 4)

- No account, no sign-up. The join page signs them in with Convex Auth's **anonymous** provider,
  which keeps them the same user on that phone, so a reload keeps their character.
- **The password is checked on the server.** Joining is a mutation that compares the password
  with the session's, which only the owner can read, and only then makes the player's token.
- **The server keeps monsters to what players may see.** Players get the map being played,
  walls and all, since the map picture shows the whole level anyway, but only the monsters a
  player can see right now and the GM has not hidden. The dev tools show no monster the table
  does not, see `convex/sight.ts`.

### Access checks

Every query and mutation starts with one of the helpers in `convex/access.ts`:

| Helper           | Lets through                   |
| ---------------- | ------------------------------ |
| `requireUser`    | Anyone signed in               |
| `requireAccount` | Signed in with Discord         |
| `requireHost`    | The owner and approved hosts   |
| `requireOwner`   | Only `OWNER_ID`                |
| `requireSession` | A host, for a session they own |

The live queries the pages follow (`play.status`, `play.scenario`, `play.tokens`) return null
rather than fail for someone who may not see them, so a page shows a message, never a crash.

What the server checks beyond who is asking:

- **Moves.** A player walks only their own token, on the map being played, while the session
  is live and not frozen, starting at the token and never through a wall that blocks movement
  (`pathBlocked` in `map/path.ts`, the rule the view draws by). Speed is not enforced: going too
  far is the GM's call. Every move stays on the map.
- **Uploads.** Anything sent to an upload address is checked when it is registered: only
  pictures, up to 15 MB, or 512 KB for a player's token. Anything else is deleted. A token's old
  picture is deleted when it gets a new one.
- **Sizes.** Session names up to 60 characters, character names 30, passwords 50, ring colours
  `#rrggbb`, 100 maps per session, 30 players per table.

---

## 7. Data model

```
users, authAccounts, ...                Convex Auth's own tables: name, image, email
hosts                 userId, approvedAt          its existence is the permission
hostRequests          userId, requestedAt

sessions
  ownerId, name
  order: [scenarioId, ...]                  the scenarios in the editor's order
  updatedAt
  live, frozen, activeScenarioId, password  phase 4

scenarios             sessionId, scenario     one document per scenario
  scenario: {
    id, name
    width, height                           world space, the background's pixels when it has one
    background: url | null                  null is a plain floor
    grid: {
      type: 'square' | 'hex' | 'none'
      hexOrientation: 'pointy' | 'flat'
      size                                  one cell in world pixels
      offsetX, offsetY                      to line up with a grid already drawn on the image
      feetPerCell: 5
      color, opacity, visible
    }
    spawn: { x, y }
    props:   [ { id, src, x, y, width, height, rotation } ]
    walls:   [ { id, x1, y1, x2, y2, blocksSight, blocksMove, door?: { open } } ]
  }

pictures              ownerId, storageId, name, src, width, height    the prop library

tokens (phase 4)
  sessionId, userId                         players: their anonymous user
  kind: 'player' | 'npc'
  name, avatar (data URL), color
  scenarioId
  x, y                                      where it stands now (world pixels)
  path: [ {x, y}, ... ]                     the last walk, so every screen can animate it
  movedAt                                   a new value means "animate this path"
  speed, size, hidden

fog (phase 4)         scenario's explored mask, base64, see 8
```

A scenario is one document, so the autosave writes only the scenarios that changed, and undo
and redo stay a stack of earlier copies in the editor. A document holds 1 MB and an array 8192
items, so a map with a few thousand walls fits.

Pictures are stored once and referenced by their address, which never expires.

Fog lives in its own document, so the frequent fog writes never rewrite the scenario.

---

## 8. Fog of war

Three states:

| State       | What players see                                                         |
| ----------- | ------------------------------------------------------------------------ |
| Never seen  | Shadow: a deep, smoky dark, never flat black (see "The look" below)      |
| Seen before | The map, dimmed and slightly desaturated. NPC tokens there are not shown |
| Seen now    | Everything, NPC tokens included (unless hidden)                          |

**Seen now** is computed on every screen, every frame, from the current positions of all player
tokens: for each one, a line of sight polygon cast against the walls that block sight (the
classic angular sweep, see Red Blob Games' "2D visibility"). Sight has **no range limit**, it goes
until a wall; battle maps are small enough for that. The union of those polygons is what is lit. Because it is computed locally from positions, the fog
**slides open as a token walks**, on every screen, with no extra writes.

**Seen before** is the explored mask: a low resolution bitmap, a few samples per grid cell. A
60 by 40 cell map at 2 samples per cell is 9,600 bits, about 1.2 KB. When a walk ends, the
moving player's phone marks every sample that was lit along the path and merges it into the mask
in a transaction, so two players moving at once both count.

### The look

The fog should feel like shadow and haze, not like a black sheet with holes cut in it.

- **Smoky, not black.** The unseen area is a very dark blue-grey, with a fog texture on top: a
  tiling noise image generated once in the browser, drawn twice at different scales, both
  drifting slowly in different directions. That gives a subtle, living smoke.
- **Soft edges.** The lit and explored shapes are drawn into the fog mask with a blur
  (`ctx.filter = 'blur(...)'`), so the edge between seen and unseen fades over roughly half a
  cell instead of a hard line. The smoke also shows faintly over the explored area, so it reads
  as "remembered", not "lit".
- **Distance haze.** Sight is unlimited, but the far part of what a token sees fades a little:
  the lit area is cut out with a radial gradient around each player token, fully clear nearby
  and slightly hazy towards the far edges. Feels like looking into the distance, without
  hiding anything.
- **Reveal animation.** Newly lit areas fade in over a few hundred milliseconds instead of
  popping.

Drawing: the fog is painted on an offscreen canvas (smoke, then the explored area cut to dim,
then the lit polygons cut out with `destination-out`, all blurred) and laid over the map. It is
drawn at a lower resolution than the screen and scaled up, which makes the blur cheap and keeps
it smooth on the 4K screen.

**Fallback:** `ctx.filter` works in Chrome, Firefox and Safari 18+. On an older phone the edges
are just sharper, nothing breaks.

GM tools for fog: **Peek** (see through it for a moment), **Reveal area** (drag a box), and
**Reset fog** for a scenario.

---

## 9. The editor

A full screen canvas with a toolbar on the left and the scenario list on the right.

### Scenarios

Add, rename, duplicate, reorder, delete. Each one is its own battle map.

### Import from Dungeondraft or Dungeon Alchemist

The main way in. Both export **Universal VTT** files (`.dd2vtt`, plain JSON), and one file holds
everything a scenario needs:

| In the file                                                        | Becomes                                         |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| `image` (base64 PNG)                                               | The background, converted to WebP and uploaded  |
| `resolution.pixels_per_grid`, `map_origin`, `map_size`             | A square grid lined up with the picture exactly |
| `line_of_sight`, `objects_line_of_sight` (polylines in grid units) | Walls, scaled to pixels                         |
| `portals` (position, bounds, closed)                               | Doors, see below                                |
| `lights`                                                           | Ignored for now                                 |

Drop the file on the editor (or pick it), and a new scenario appears with picture, grid and
walls done. Everything can still be edited by hand afterwards. The import is a pure function
from the JSON to a scenario, so `map.check.ts` tests it against a small sample file.

### Doors

Since the import brings doors along anyway, they are in the first version. A door is a wall with
a `door` flag. Closed, it blocks sight and movement; open, neither. Drawn as a small door icon on
the wall. The GM clicks it to open or close, in edit and in play mode. Players cannot open doors
themselves; they ask the GM, like at a real table.

### Background

**Picture** in the scenario list (or drop a picture on the editor) makes a new map from a
plain picture, for maps that do not come from Dungeondraft. Pictures, imported ones too, are
converted to WebP in the browser (max 4096 px on the long side, sharp on a 4K screen) before
they go to Convex file storage, so a 20 MB PNG becomes a few MB.

### Grid

- Type: none, square, hex (pointy or flat).
- **Align to the picture:** many battle map images have a grid drawn on them. Drag a box over one
  drawn cell and the app sets `size` and `offset` from it. Fine tune with arrow keys.
- Colour, opacity, show or hide (a hidden grid still drives snapping and movement).
- Feet per cell, 5 by default.

### Props

- **No built-in set, and no AI-made art.** The free CC0 packs are pixel art or too small for a
  4K screen, and the good painted packs (Forgotten Adventures, 2-Minute Tabletop) may be used
  but not shared in a public repo. So every GM uploads the human-made art they own into their
  own library, kept in Convex file storage for all their sessions, never in the repo.
- Pick a picture in the library, click the map to place it. Its size comes from the picture,
  one cell per 200 pixels of its longest side, the size painted props are usually made at.
- Select to move, scale from the corner handle, turn from the top handle, delete with Del.
- Snaps to the grid (cells, half-cell sizes, 15 degree turns); Alt places freely.

### Walls (the collider layer)

- Click, click, click to draw a chain of wall segments, double click or Esc to finish.
- A rectangle tool for rooms.
- Snaps to grid corners by default, free with Alt.
- Per wall: blocks sight, blocks movement (a window blocks movement but not sight).
- An eraser, and a toggle to hide the wall layer while dressing the map.
- **Preview fog:** drop a test token and see what it would see.

### Spawn point

Click to place. Players appear here when they join or when the scenario changes.

### Saving

Autosave a second after the last change, sending only the scenarios that changed, with a small
"Saving" or "Saved" in the corner. Closing the tab before it saved asks first. Undo and redo with
Ctrl+Z and Ctrl+Y.

---

## 10. Movement

### Drawing a path (phone, or mouse)

1. Press on your own token and drag.
2. As the finger enters a new cell, it is added to the path. Skipping cells (a fast flick) fills
   the gap with a straight line of cells. Going back onto the previous cell removes the last
   step, so you can undo by retracing.
3. A step that crosses a wall that blocks movement is refused, the path stays at the last good
   cell.
4. A label at the finger shows the running total, like **25 ft**, and turns red past the token's
   speed. It warns, it does not block; the GM rules on dashing.
5. Let go: a bottom sheet with **Move 25 ft** and **Cancel**. Ending on an occupied cell is not
   allowed.

### Creature sizes

Every token, player or monster, has a size, with the footprint the common systems use:

| Size                | Square grid | Hex grid                     |
| ------------------- | ----------- | ---------------------------- |
| Tiny, Small, Medium | 1 cell      | 1 hex                        |
| Large               | 2 by 2      | 3 hexes (a triangle)         |
| Huge                | 3 by 3      | 7 hexes (a hex and its ring) |
| Gargantuan          | 4 by 4      | 19 hexes (two rings)         |

- The picture is drawn over the whole footprint.
- A path moves the whole footprint. Each step checks every cell of it, so a Large ogre cannot
  squeeze through a one-cell gap or slide its corner through a wall.
- Occupied cells, spawn placement and the end of a path all use the full footprint.
- Sight is cast from the centre of the footprint.
- Players pick their size when they join (Medium by default); the GM sets it on monsters and can
  change anyone's.

Tiny creatures share a cell in the rules; here they take one cell like Small, to keep it simple.

### Freeze

Anyone moves whenever they like, until combat. The GM then presses **Freeze**: `frozen` goes true
on the session, the rules refuse every player move, and phones show a clear "Movement paused by
the GM" banner, with path drawing disabled. The GM can still move every token, and unfreezes
when it is someone's turn or the fight is over. Turns themselves are called out at the table.

### Counting feet

- **Hex:** every step is one cell, 5 ft.
- **Square:** straight steps 5 ft. Diagonals alternate **5, 10, 5, 10**, counted over the
  whole path: the 1st, 3rd, 5th diagonal cost 5 ft, the 2nd, 4th, 6th cost 10 ft, with
  straight steps in between not resetting the count. So two diagonals and a straight step are
  20 ft. One rule for every scenario, no setting.
- **No grid:** the path is a free line, length converted to feet with `feetPerCell / size`.

### The walk

Move writes `{ x, y, path, movedAt }` to the token. Every screen sees the new `movedAt` and
animates the token along `path` at a steady pace. Fog follows along (see 8). At the end, the
mover's phone updates the explored mask.

### GM movement

In play mode the GM drags any token freely (NPCs, or a player who fell through a trap),
no confirmation, no counting.

### Measuring

A ruler tool for everyone: drag from A to B, see the distance in feet, snapped to cells on a grid
and counted with the same 5, 10 diagonal rule.
Local only, it is not shown to others.

---

## 11. Playing a session

### Starting (GM)

1. In the editor, **Start session**. Set or change the password.
2. The session goes `live` and the editor switches to play mode, full screen, on the active
   scenario. The laptop is mirrored to the 4K screen.
3. Play mode asks the browser to stay awake (Screen Wake Lock API) and goes full screen
   (Fullscreen API), so the screen does not dim mid-fight.
4. **Back to edit mode** at any time to fix something mid-session (a forgotten wall). Players
   stay connected; changes show up on their phones when saved.

### Play mode

The editor tools disappear. A thin toolbar that hides itself after a few seconds without the
mouse:

- Scenario switcher (players follow, see below)
- **QR code**: a full screen overlay with a huge QR code and the short link written under it.
  The password is not in it; the GM says it out loud.
- **Freeze** player movement (see 10)
- Peek, Reveal area, Reset fog
- Open and close doors by clicking them
- Add NPC or monster token: just a name and a picture, shown round with a border like the
  players, hidden or not. Drag it, delete it. No HP or stats.
- Ruler
- **End session**: `live` goes false, phones show "The session has ended"

The canvas renders at the screen's real pixel density, so a 4K screen is sharp.

### Joining (player)

1. Scan the QR code, `/ttrpg/join?s=<id>` opens.
2. Type the password.
3. Character name, and a picture: take a photo or pick one. It is cropped to a centred square
   and shrunk to 256 px in the browser, then shown round. A colour for the ring is picked
   automatically and can be changed.
4. The token appears at the spawn point. If that cell is taken, the nearest free cells around it
   are tried in rings, without passing through walls, with room for the token's full size.
5. The phone shows the map centred on their token, with pinch to zoom and two finger pan.

Come back on the same phone and you skip straight to step 5.

### Switching scenario

The GM picks another scenario (the next level). Every screen follows, and **all player tokens
respawn around the new scenario's spawn point**, every time, also when going back to a scenario
they were in before. The GM's laptop does the placing for everyone in one batched write, so two
phones never race for the same cell. NPC tokens belong to their scenario and stay where they were.

---

## 12. Later, not in the first version

Kept out on purpose so the first version ships. Each is a clean add-on.

| Feature              | Why later                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Initiative tracker   | Turn order, and unlocking movement only for whoever's turn it is (Freeze covers it for now) |
| Lights               | The `.dd2vtt` light sources, for dark dungeons                                              |
| Pings                | Tap and hold to flash a spot on every screen                                                |
| Live path preview    | Show a player's path in play mode while they are still drawing it                           |
| Lights, darkvision   | Per token vision ranges and light sources                                                   |
| Dice, HP, conditions | Most tables already do this on paper or in a character app                                  |

---

## 13. Dependencies

| Need              | Choice                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Drawing           | Plain Canvas 2D. A few hundred props, walls and tokens are nothing for it                                |
| Pan, zoom, drag   | Pointer Events, they cover mouse, touch and pen in one API                                               |
| Grid and hex math | Written here, about 100 lines, after Red Blob Games' hex guide                                           |
| Visibility        | Written here, after Red Blob Games' 2D visibility article                                                |
| Image resizing    | `createImageBitmap` and a canvas, `toBlob('image/webp')`                                                 |
| Photo capture     | `<input type="file" accept="image/*" capture="user">`                                                    |
| Backend           | `convex`, `@convex-dev/auth` and its `@auth/core`, loaded only by the signed-in pages, never by the demo |
| **QR code**       | **`uqr`**, a tiny dependency free generator, loaded only when the QR button is pressed                   |

### Performance and the renderer

Canvas 2D is drawn by the GPU in every current browser. Measured at 4K: a normal frame 5.5 ms, a
frame where a walk rebuilds the fog 13 ms, both inside 60 fps. Two things made it slow before,
and are worth remembering:

- **Big blurs are expensive.** The fog is drawn at 24 pixels per cell, blurred, then stretched;
  at 2048 pixels across the blur alone took about 100 ms.
- **Stretching to 4K costs per stretch.** Fog and smoke are combined on the small canvas so one
  picture is stretched per frame, with the browser's plain smoothing ('high' cost four times
  as much and looks no different on blurred fog).

`?debug` shows frames per second and milliseconds per frame on any device, for checking the
table screen and phones.

**No three.js.** It is a 3D scene graph, and none of it would be used. If a device ever runs
short, the next step is plain WebGL2 with a few shaders and no dependency, in this order:

1. The fog and smoke in one fragment shader, with the explored mask as a texture: almost no
   work per frame on the CPU, which helps phones and their batteries most.
2. Sight on the GPU with shadow geometry (a dark quad stretched away from the light behind each
   wall), for maps with thousands of walls, where the CPU sweep is O(walls²).
3. Batched props, for maps with hundreds of large ones.

Only `map/render.ts` and `map/fog.ts` draw, so that switch leaves everything else alone.

---

## 14. Build order

The proof of concept is the whole plan: all phases, in this order. Each phase ends with
something usable, so the doable-or-not answer shows up early (phase 1 and 3 hold the hardest
parts: the engine and the fog).

### Phase 0: Setup

- A Convex project on the free plan, Convex Auth with Discord, see README.md.
- Folder, three lazy routes, `noindex`, empty pages.
- Check `npm run build`: the TTRPG code is only in its own chunks.

### Phase 1: The map engine

- Camera with pan and zoom, background picture, square and hex grid.
- Grid math, path building, feet counting, spawn rings.
- `map.check.ts` with asserts for the math, run with `node src/personal/ttrpg/map/map.check.ts`.
- **Done when:** a hard coded scenario can be panned and zoomed on a phone and on the 4K screen.
- **Built.** Try it at `/ttrpg/edit?demo`, with a switch between square, pointy hex and flat hex.
  Creature footprints wait for phase 5.

### Phase 2: The editor

- Discord sign in, host check, Ask to host, owner approval list, dashboard with sessions.
- Scenarios, `.dd2vtt` import, background upload, grid and grid alignment, props, walls, doors,
  spawn.
- Autosave, undo and redo.
- **Already built, in `/ttrpg/edit?demo`:** Edit and Play modes; the tool rail (move, walls,
  erase, doors, spawn, grid) with V W E D S G as keys; the grid panel with box alignment; the
  scenario list (new, import, rename, duplicate, delete, switching respawns the tokens); undo and
  redo; the `.dd2vtt` import; doors that the game master opens with a click in Play mode. The
  tools live in `map/tools.ts`, so the self-check clicks them too.
- **Props, built:** no built-in set; game masters upload the human-made art they own (P in the
  rail). Pick a picture and click to place it, sized one cell per 200 pixels; then move, scale
  from the corner, turn from the top handle, Delete to remove. Snaps to cells, half cells and 15
  degrees unless Alt is held. A whole drag is one step to undo. The maths is in `map/props.ts`.
- **Backend, built on Convex:** sign in with Discord, Ask to host and the owner's
  approval list, the dashboard with sessions (new, open, delete), the editor loading a session
  and autosaving the changed scenarios, maps from a plain picture, and map and prop pictures
  shrunk to WebP and uploaded, with the prop library kept per game master. Tried on the dev
  deployment: signing in, owner approval and a saved session that survives a reload.
- **Done when:** a session with two scenarios can be built and survives a reload.

### Phase 3: Fog of war

- Line of sight, the lit and explored layers, fog preview in the editor.
- **Done when:** a test token behind a wall cannot see the other room.
- **Built, ahead of phase 2.** In `/ttrpg/edit?demo`, drag either token and the fog opens around
  it; both tokens light the map together, and Reset fog forgets what was seen. Still to come with
  later phases: the reveal fade-in (phase 6) and syncing what was seen (phase 5).

### Phase 4: Going live

- Password, Start and End session, play mode, QR overlay.
- Join page: anonymous sign in, password, name and picture, spawn placement.
- Tokens on every screen, live. Scenario switch respawns everyone.
- **Done when:** two phones can join and both appear in play mode on the 4K screen.
- **Part 1, built:** Start (with the password), End and the QR code beside Edit and Play; the
  map switcher in the play dock, which respawns every player on the new map; the join page
  (anonymous sign in, password, then name, ring colour and picture), placed on the server in
  `convex/play.ts` with `map/spawn.ts`; tokens live on every screen, moves written once and
  walked everywhere, Freeze for real. Tried with one browser as a player on dev.
- **Part 2, built:**
  - The phone opens on its own token, about 8 cells across, with a ring in its colour that
    breathes (still, for reduced motion). See `focusOwn` in `map/view.ts`.
  - Monsters and NPCs from the Monsters button in the play dock (`components/Monsters.tsx`): a
    name, size, ring colour, picture, and hidden or not, added in the middle of the GM's screen.
    Hide, show and remove them from the same panel, drag them on the map.
  - Players only receive monsters a player can see and the GM has not hidden. The server keeps
    an `inSight` flag on each monster (`convex/sight.ts`), redone by every write that changes
    sight, with a line test (`inSight` in `map/visibility.ts`) that agrees with the polygons.
  - The explored fog is shared: the GM's table screen saves what was seen 1.5 s after it last
    changed, merged on the server (`fog` table, `play.saveFog`), and every screen and reload
    starts from it. Reset fog raises an epoch, so every screen forgets and a stale save is dropped.

### Phase 5: Movement

- Path drawing with feet, Move and Cancel, the walk animation, fog following, explored mask.
- Creature sizes and footprints, Freeze, GM dragging and NPC tokens, ruler.
- **Done when:** a player walks into a dark room on their phone and it opens up on the TV.
- **Built, ahead of phases 2 and 4, in Play mode of `/ttrpg/edit?demo`:** drag from a player to
  draw a path (5, 10 diagonals, red past their speed), Move or Cancel, the walk with fog
  following it, sizes with real footprints (`map/size.ts`, the demo's Large ogre), monsters
  hidden until a player sees them and dragged freely by the GM, Freeze, and the ruler. A move is
  `{ x, y, path, movedAt }` on the token and every screen plays it (`map/walk.ts`), so phase 4
  only has to put that in Convex, done in phase 4.

### Phase 6: Play mode polish

- Wake lock, full screen, auto hiding toolbar, Peek, Reveal area, Reset fog.
- Then the first real session, and a list of what felt clunky.
- **Built, in Play mode of `/ttrpg/edit?demo`:** the dock (Ruler, Reveal, Peek, Freeze, Reset
  fog, full screen), Peek while the button or Space is held, the screen kept awake, controls
  that fade out after 3 seconds without the mouse, fog changes that blend in over 600 ms, like fog clearing, and
  the `?debug` frame display. See `components/PlayDock.tsx` and `components/useScreen.ts`.
- **Since then:** players see from a small lamp of five points, so light stops crisply at walls
  while shadows past a corner fade (`lampOf` in `map/fog.ts`), and seen before is cut to what
  was lit, so neither shows through a wall. Tokens fade in and out like the fog. The cloud button
  in the dock opens how the fog looks (`components/FogPanel.tsx`): how fast it clears, softness,
  how much of seen rooms shows, far haze and smoke, saved per session (`play.setFogLook`) so
  every screen looks the same.

---

## 15. Open questions

Decided:

- **Backend:** Convex on the free plan. No credit card, no pausing, hard limits instead of a bill.
  Firebase's Storage and Cloud Functions need the paid Blaze plan, Supabase pauses free projects
  after a week without use.
- **Image storage:** Convex file storage, 1 GB, pictures as WebP of at most 4096 px.
- **The 4K screen:** mirrors the GM's laptop, showing the editor in play mode. No separate table
  app or GM device.
- **Scenario switch:** every player respawns at the new scenario's spawn point.
- **Fog:** smoky shadow (never flat black), dimmed for seen before, clear for seen now. Sight is
  unlimited up to walls, with soft blurred edges and a light haze in the distance.
- **Diagonals:** 5, 10, 5, 10, always.
- **Hosts:** fellow GMs can host. They ask from the dashboard, you approve.
- **Sign in:** Discord only, through Convex Auth. Only GMs sign in, and they all have Discord.
- **NPCs and monsters:** a name and a picture, round with a border. No HP.
- **Props:** no built-in set and no AI-made art; game masters upload the art they own.
- **Route:** `/ttrpg`, one general name for every system.

- **Proof of concept:** the full plan, phases 0 to 6.
- **Creature sizes:** from the start, Large 2x2 up to Gargantuan 4x4, with real footprints.
- **Movement:** free for everyone, with a GM Freeze button for combat.
- **Maps:** mostly Dungeondraft and Dungeon Alchemist, so `.dd2vtt` import and doors are in the
  first version.

Still open: nothing that blocks phase 0.
