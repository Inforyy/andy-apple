# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Andy Apples: a 2D vine-swinging browser game. UI text, code comments and READMEs are in Dutch; keep new comments and UI text in Dutch. There is no build step, no package manager and there are no external assets (graphics and audio are generated in code). The only external dependency is `@supabase/supabase-js`, which is lazy-loaded from jsDelivr and only when `CONFIG.supabase` in `js/config.js` is filled in.

- `index.html`: the HTML screens plus `<link>`/`<script>` tags
- `css/style.css`
- `js/*.js`: the game, as plain classic scripts (see below)
- `android/`: wraps the same files in a WebView APK
- `og.jpg`: the 1200×630 link-preview image (Discord and other sites) referenced by the `og:`/`twitter:` meta tags in `index.html`. Those tags use absolute URLs on `https://stijnbarendse.nl/appel/`; update them if the game moves. It is not packed into the APK.

GitHub Pages deploys from `main` root. Work happens on `claude/*` branches that are merged into `main` via PRs.

## Commands

- **Run**: open `index.html` in a browser. It must keep working via `file://`, which is why there are no ES modules.
- **Smoke test**: `node tools/smoke.mjs` (Node 18+, finds `chromium`/`google-chrome` itself or uses `CHROME=...`). It needs no npm packages; it drives headless Chromium over the DevTools protocol.
  - It clicks through the menus and plays Endless (with a head-start, a trip to space, a biome transition, going underwater and opening a loot box), the career (world map with the unlock and world-clear cutscenes, a boss level and a failed level) and career levels (including the four style biomes), split-screen, Kiwi and the chase mode.
  - It fails on any JS exception or `console.error`.
  - `ANDY_URL=http://localhost:8000/ node tools/smoke.mjs` runs the same test against a server, as GitHub Pages would serve it.
- **Benchmark**: `node tools/perf.mjs` (same setup as the smoke test) prints fps, p95, simulation/render time and the cost of the background buffer per quality level and biome, plus the tile-cache size after 30 s. Headless Chromium usually renders in software (SwiftShader), so compare before/after on the same machine rather than reading the absolute numbers.
- **Build the APK** (in `android/`; needs Python 3, JDK 17+ and three Maven jars in `tools/`, see `android/README.md`):
  ```sh
  python3 build_apk.py --tools tools --keystore andy.p12 --storepass PASS --version 1.3 --code 4
  ```
  - It packs `index.html`, `css/` and `js/` (`GAME_DIRS`) as assets. **If you add a new top-level folder the game needs, add it to `GAME_DIRS`.**
  - The committed `android/AndyApples.apk` goes stale whenever the game changes.
  - An update only installs over the old version with the same key and a higher `--code`. Keystores are gitignored.
- **Debug-password hash** (`DBG_HASH` in `js/view.js`): see the `node -e` one-liner in `README.md`.

## Architecture

### Script loading: classic scripts sharing one global scope
`index.html` loads the scripts in this fixed order:

`config, util, data, save, audio, view, world, physics, effects, render-bg, render-world, online, mp-online, mp-local, career, game, main`

Top-level `let`/`const`/`function` in these classic scripts share the global lexical scope. Any file can therefore read **and reassign** another file's `let` (e.g. `camX`, `G`, `vines`, `save`), which the code relies on heavily. This is why the code does not use ES modules: imported bindings are read-only, and `type="module"` doesn't work on `file://`. Consequences:

- **Load-time rule**: code that runs while a file loads may only use things from *earlier* files. Function hoisting does not cross files.
  - Page wiring (`on('btn…')`, `addEventListener`, the first `resize()`) lives in `xxxInit()` functions: `viewInit`, `mpInit`, `lbInit`, `accountInit`, `uiInit`, `inputInit`.
  - `js/main.js` calls these after all files are loaded, in the original listener order.
  - New wiring goes into the relevant init function, never at top level.
- Top-level names are global, so avoid names that exist on `window` (`name`, `top`, `open`, `status`, …).
- Each file starts with `'use strict';` and a Dutch header comment saying what it contains.

### Where things live
- `data.js` is the place for content and balance:
  - constants, `BIOMES` (start distance, palette, bonus) and `features(biomeIndex)` (per-biome odds)
  - upgrade formulas and `UPGRADES`, XP/`LEVELS`/`levelInfo`, `VINE_LOOK`, `AI_LV`
  - `biomeSeg` (which biome segment is at a distance; after the last biome the biomes repeat in `CYCLE_ORDER`), `inBiomeBuffer`, `upgradePower`
  - `diffAt` (difficulty, which also rises with `upgradePower`), `timeScale` (tempo, including the biome-transition slow motion) and `paletteAt`
  - `RARITY`/`LOOT`/`rollLoot` (loot boxes and cosmetics; opening and the wardrobe live in `game.js`, drawing in `render-world.js`)
- `online.js` holds the Supabase client (`getSb`, `sbOn`), leaderboard (`lbOn`) and accounts. `mp-online.js` uses the same client for lobbies.
- `game.js` holds game flow, screens, the debug screen, `uiInit` (all menu buttons), input and HUD.
- `career.js` holds the career mode: the world map (a pseudo-3D island per world drawn on `#mapCanvas`, replacing the game view while `curScreen === 'career'`; `openCareer`, `mapFrame`, the unlock/world-clear cutscenes driven by `save.career.anim`), and what runs inside a career level: time limit, challenges (`CHALLENGES` in `data.js`), power-ups (`pups`, `run.pow`) and boss fights (`run.boss`, `run.projs`). `levelInfo(n)` in `data.js` defines each level (world, boss, length, time, challenges, difficulty).

### Core ideas
- **Fixed-step simulation with interpolated rendering.**
  - `frame()` (in `main.js`) runs `step(DT)` at `STEP = 1/120` s, at most 12 steps per frame.
  - Rendering interpolates Andy between the last two steps (`renderAlpha`, `interpBegin`/`interpEnd`).
  - Effective tempo = `GAME_SPEED` × `timeScale()`. `timeScale()` = `BASE_SPEED` × the debug speed × the Endless ramp. Adjust the tempo in `timeScale`/`BASE_SPEED`, not in `GAME_SPEED`.
- **World state is global `let`s** (`vines, apples, foes, …`, `G` = the gorilla, `run`, `camX/camY`), plus `game` (mode/pause/career/mp). `resetWorld()` rebuilds it.
- **Deterministic generation.**
  - `genUntil(x)` streams vine columns (three lanes in a wave), apples, enemies and specials ahead of the camera.
  - It uses `genRandom`, which is a seeded `mulberry32` in career levels and multiplayer (all players get an identical world), and `Math.random` otherwise.
  - Anything that affects world layout must use `genRandom`/`grand`, never `Math.random`. `vineSeq` must stay in sync between players.
- **Physics**: vines are Verlet ropes. While attached, Andy swings as a pendulum around the grip point.
- **Per-world state**: `WORLD_VARS` in `world.js` lists every variable that belongs to one world, with a getter, a setter and an initial value.
  - Split-screen and Kiwi give each player their own world with the same seed.
  - `mp-local.js` swaps worlds in and out of the globals via `grabWorld`/`putWorld`/`useWorld`/`freshWorld`.
  - **A new per-world variable must be added to `WORLD_VARS`**, or the two players will silently share it.
- **Kiwi (AI opponent)** runs on the local split-screen machinery (`localStart(cfg, aiLvl)`).
  - It "presses" through `press`/`unpress` like a human (`aiSet`).
  - It decides when to release by predicting its landing spot (`aiScore`/`aiThink`).
- **Online multiplayer** supports lobbies of 2–20 players (`MP_MAX`) in a star network.
  - Each guest has one WebRTC link to the host, and the host relays everyone's state (`onLinkMsg`).
  - Everyone simulates their own Andy in the same seeded world; the others are drawn as extra gorillas.
  - Supabase Realtime (broadcast + presence) is used only to list lobbies and for signalling.
- **Upgrades** are pure functions of level, read through `lvl(id)`, which returns 0 during multiplayer.
- **Save system**: `localStorage['andyApples.save.v1']`.
  - Always go through `normalizeSave()` (it validates and clamps every field and migrates old saves) and `persist()` (which also marks the cloud save dirty).
  - A new save field needs `defaultSave()` + `normalizeSave()`. There is no export/import UI: saving is silent (browser), and online saving requires an account.
- **Supabase is optional**. When it isn't configured, the Account and Leaderboard buttons are hidden. `sbOn()`/`lbOn()` guard all online code. The required SQL (tables `saves`, `scores`, RPC `submit_score`) is in `README.md`; keep it in sync with the client's queries.
- **Adaptive quality**: `adaptQuality()` measures 2-s windows and `qualityWindow()` steps `qLevel` (0–4) up and down and remembers it (`andyApples.quality5`).
  - A step down is verified: if the next window isn't clearly better, the step is undone and `perf.capped` stops further downgrades that session (e.g. a phone capping rAF at 30 fps in power-saving mode).
  - Heavy visuals should respect `Q`/`qLevel`.
- **Background tiles**: `tileLayer()` in `render-bg.js` only copies the part of a tile between the layer's content top (`L.top`) and the line below which a later opaque layer covers it (`bgCover`). Tiles of biomes no longer in view and tiles far behind the camera are dropped right away. If you change a layer's shapes, keep `L.top`, `L.empty` and `bgCover` true to what is actually drawn.
- **Android bridge**: `IN_APP` (the user agent contains `AndyApplesApp` and `window.AndroidBridge` exists) routes copying to the bridge. `window.__andyBack` is called from `MainActivity.java`; keep it intact.
- **Test hook**: `window.__andy` (in `main.js`) exposes state and functions for the smoke test and console debugging. Extend it when a test needs more.

## Docs
`README.md` (Dutch) is the user-facing feature list, controls, code overview and Supabase setup guide. Update it when you add features, biomes or upgrades, or change setup steps.
