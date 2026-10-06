# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Andy Apples: a 2D vine-swinging browser game. UI text, code comments and READMEs are in Dutch; keep new comments and UI text in Dutch. There is no build step, no package manager and there are no external assets (graphics and audio are generated in code). The only external dependency is `@supabase/supabase-js`, which is lazy-loaded from jsDelivr and only when `CONFIG.supabase` in `js/config.js` is filled in.

- `index.html`: the HTML screens plus `<link>`/`<script>` tags
- `css/style.css`
- `js/*.js`: the game, as plain classic scripts (see below)
- `android/`: wraps the same files in a WebView APK
- `ios/`: wraps the same files in an unsigned WKWebView `.ipa` that users sign themselves (Sideloadly/AltStore). `build_ipa.py` (macOS only, no Xcode project: `swiftc` + a hand-written `Info.plist`) reuses `game_assets`/`GAME_DIRS` from `android/build_apk.py` and the Android icon. `.github/workflows/ios.yml` builds it on a macOS runner after game changes on `main` and uploads it to the `ios` release. The Swift app injects a `window.AndroidBridge` shim (same functions as the Android bridge) so `IN_APP`/`appScreen()` work unchanged; keep the two bridges in sync.
- `og-andy.jpg`: the 1200×630 link-preview image (Discord and other sites) referenced by the `og:`/`twitter:` meta tags in `index.html`. Those tags use absolute URLs on `https://stijnbarendse.nl/appel/`; update them if the game moves. It is not packed into the APK.
- `art/`: promo images (GitHub social preview, README banner, wallpapers, release banner), see `art/README.md`. Not part of the game or the APK.
- `uitnodiging.html` + `og-uitnodiging.jpg`: the page that multiplayer invite links point to (`mpInviteLink` in `mp-online.js`: `…/uitnodiging#join=lobby-id`, without `.html`: the hosting resolves it and redirects `.html` URLs to extensionless ones). Link previews never see the `#…` part, so a separate page is the only way to give invites their own title and image; it immediately redirects to `./#join=…`, where `checkJoinLink` in `main.js` picks it up. Neither file is packed into the APK.

GitHub Pages deploys from `main` root. Work happens on `claude/*` branches that are merged into `main` via PRs.

## Commands

- **Run**: open `index.html` in a browser. It must keep working via `file://`, which is why there are no ES modules.
- **Version stamp**: run `node tools/version.mjs` before every commit that changes `index.html`, `css/` or `js/` (and again after rebasing onto new upstream commits). It hashes those files into `js/version.js` (`GAME_VERSION`), `version.json` and the `?v=` query on every script/stylesheet tag in `index.html`. Online play requires the same version (see the version section at the top of `mp-online.js`: `verCheck`/`verGate`, `ver` in lobby presence and in `join`, the public lobby channel is per version). The smoke test fails if the stamp is stale; `.github/workflows/version.yml` restamps after a push to `main` as a safety net. `android/build_apk.py` strips the `?v=` queries.
- **Smoke test**: `node tools/smoke.mjs` (Node 18+, finds `chromium`/`google-chrome` itself or uses `CHROME=...`). It needs no npm packages; it drives headless Chromium over the DevTools protocol.
  - It clicks through the menus and plays Endless (with a head-start, a trip to space, the Matrix secret, the automatic giant-vine biome transition, going underwater and opening a loot box), the career (world map with the unlock and world-clear cutscenes, the loading screen, save migration, upgrade scaling, a boss level and a failed level) and career levels (including the four style biomes), split-screen, Kiwi and the chase mode.
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

`version, config, util, data, save, audio, view, world, physics, effects, render-bg, render-world, model3d, online, mp-online, mp-local, mp-br, mp-arena, career, levels, worldmap, game, main`

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
  - adding a biome: besides the `BIOMES` entry, extend the per-biome arrays (`features`, the `key`/`minor` line, `BOSSES`, `CYCLE_ORDER`) and give a new `style` its entries in `render-bg.js` (`MTN`, `TRUNK`, the bark map, `treeSprite`, the forest layer), a biome jingle in `audio.js` and map decoration in `worldmap.js`
  - `diffAt` (difficulty, which also rises with `upgradePower`), `timeScale` (tempo, including the biome-transition slow motion) and `paletteAt`
  - `RARITY`/`LOOT`/`rollLoot` (loot boxes and cosmetics of the kinds in `COSM_KINDS`: fur colour, hat, suit and trail; opening, buying (`CRATE_PRICE`) and the wardrobe live in `game.js`, drawing in `render-world.js`, the 3D versions in `model3d.js`, trails in `cosmTrail` in `physics.js`)
- `mp-br.js` holds the online battle royale mode (`game.mp.mode === 'br'`, `brOn()`): a small arena (`BR_X0`..`BR_X1`, `genUntil` stops there), fruit weapons (`BR_WEAPONS`) and pickups, mouse aiming (`brPointerDown`/`Move`/`Up`, wired in `inputInit`), a storm that shrinks the arena, and free swing direction (`brOn()` checks in `physics.js`: no forward bias in `attach`, pumping, `release`, air drift or vine tilt). Shots travel as `'br'` messages (relayed by the host like `'s'`); only the player who is hit computes the damage, and eliminations are `'ev'` messages with `by` (the killer).
- `mp-arena.js` holds the online arena modes (`ARENA`, `arenaMode()`, `M.ar`): **king** (Koning van de liaan), **waves** (Overleven) and **ctf** (Vlag veroveren). `arenaStart` replaces the world with a fixed vine layout (`arenaVine`, ids from 100 so every vine is coupled via `ghostPin`); `freeSwing()` (also true for battle royale) replaces the old `brOn()` checks for free swing direction in `physics.js`/`view.js`. Hooks from the engine: `arenaStep` (from `mpStep`), `arenaDied` (from `mpDied`: respawn after `AR_RESPAWN`, or an extra life), `arenaGrab`/`arenaAttached` (from `tryGrab`), `arenaJump` (standing on a base), `arenaTimeK` (in `timeScale`), `arenaOver`/`arenaRank`/`arenaResult`/`arenaHud`/`arenaDraw`/`arenaOverlay`. Shared messages are `'ar'` (relayed by the host like `'br'`): `bump` (the victim applies it), and for king/ctf the host is authoritative (`arenaHostMsg` for claims, `arenaHostTick` from `mpTick`, `'st'` state broadcasts). Waves are deterministic from the match seed and `M.t` (`waveGen`), so they need no messages; bots play waves with `waveBotThink` (dodging via `waveDanger`).
- `online.js` holds the Supabase client (`getSb`, `sbOn`), leaderboard (`lbOn`) and accounts. `mp-online.js` uses the same client for lobbies.
- `game.js` holds game flow, screens, the debug screen, `uiInit` (all menu buttons), input and HUD.
- `career.js` holds what runs inside a career level: time limit, challenges (`CHALLENGES` in `data.js`), power-ups (`pups`, `run.pow`) and boss fights (`run.boss`, `run.projs`).
- `levels.js` holds the special career levels, built by `levelBuild()` at the end of `resetWorld`:
  - **Tower** (`levelInfo().tower`, `towerOn()`, `run.tower`): a vertical climb. `towerBuild` replaces the world with `TW_STEPS` vines per floor and one-way stone rings (`towerLand`, landing only from above; `towerJump` from a ring aims at the lowest vine of the floor above). `genUntil` does nothing in a tower, `finishX` is `Infinity` and landing on the top ring completes the level; `run.dist` is the height. `drawTowerBg` replaces the whole background with a 3D cylinder whose bricks rotate with `camX` (angle = x / radius) and a perspective landscape (`TW_SCENE`); falling objects are `run.tower.drops`.
  - **Castle** (every boss level, `castleOn()`, `run.castle`): lava (`drawHazard(palettePure(4))`, no underwater), a wall with windows over the normal background (`drawCastleWall`), chains instead of vines (`v.chain`, set in `makeVine`), and obstacles (`axe`, `geyser`, `crusher`, the spiked ceiling `CASTLE_CEIL`) that call `careerHurt`.
  - **Modifiers** (`levelInfo().mod`, `MODS`/`MOD_ORDER` in `data.js`): read through `modGrav()` (air and swing gravity), `modSize()` (drawing), `modGrip()` (grab reach), `modTempo()` (`timeScale`) and `modBounce()` (in `hitHazard`).
- `worldmap.js` holds the career world map: a 3D island per world (8 levels: a tower at `TOWER_IDX`, the boss castle last) drawn on `#mapCanvas` with a perspective camera (`mp(x, y, z)`; `MAP.zoom` moves the camera closer or further away via `mapDist()`, it never changes the lens), replacing the game view while `curScreen === 'career'`. It also has `openCareer`, `mapFrame`, the unlock/world-clear cutscenes driven by `save.career.anim`, and the zoom-in plus fake loading screen (`MAP.go`, `MAP.load`) before `startReady`.
- `model3d.js` is a tiny 3D renderer for a 2D canvas:
  - Buildings and hats are triangle meshes (spheres, cylinders, cones, boxes), flat-shaded, with an inverted-hull ink outline (`r3Tris`/`drawTris`, same-colour batches).
  - `drawAndy3D` draws Andy from `myLook()` as smooth, gradient-shaded ellipsoids and capsules with ink outlines, posed and animated from a `pose` object.
  - Every model is one entry in `R3.list`, sorted on its foot point by `r3Flush`, so models never cut through each other. Map buildings are built in `worldmap.js`.
- **Upgrades are bought in steps**: `save.upgrades[id]` holds the number of steps bought (`upSteps`); each level has `u.tiers` steps (1 for `whole` counters like balloons and helmets), so `u.steps = u.max * u.tiers`. `lvl(id)` returns the effective (fractional) level, 0 in multiplayer and scaled by `CAREER_UP` in the career. Old saves without `upt` are converted in `normalizeSave`.
- **Biome transition** (Endless, `physics.js`): around every biome boundary the island ends and there is only sky and open sea (`voidEdges`, `drawVoid`, `drawIslandEdge`; the camera shows the sea while `G.auto`), with `TRANS.n` giant vines over it (`TRANS`/`transVineX` in `data.js`). `gapBoundary` (in `world.js`) keeps normal vines away and puts apples along the swing arcs; `drawBiomeCliffs` draws the void, the cliffs and the giant vines, and `clipVoid` keeps the water and foreground out of the void. `checkTrans` makes Andy grab the first vine automatically (`G.auto`, driven by `autoSwing` in real seconds: swing, fly to the next vine, and so on), and releases him after the last with extra speed.
- **Jumpscare**: clicking the apple in the main-menu logo 10× quickly (`scareClick`/`jumpscare` in `game.js`, sound `Sfx.scare`).
- **Secret**: releasing hard backwards from the very first vine (`v.first`, `MATRIX_VX`) and flying into the wall behind the start rock opens the Matrix scene (`run.matrix`, `drawMatrix`): the world freezes, Kiwi talks in speech bubbles, then Andy is back on the rock. Each visit has its own lines (`MATRIX_VISITS`, counted in `save.matrixSeen`); after the third the Matrix is locked, and it never opens in multiplayer, split-screen or against Kiwi.
- `levelInfo(n)` in `data.js` defines each level: world, tower/boss, length, time, challenges and difficulty. It also scales with `upgradePower()`, so the career gets harder with more upgrades.
- Old saves with 5 levels per world are remapped by `migrateCareer` in `save.js` (`save.career.lpw`).

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
  - Supabase Realtime (broadcast + presence) lists lobbies and does the signalling.
  - **Two transports in parallel**: when a guest joins, the host starts WebRTC *and* a per-link Realtime channel (`relayOpen`/`guestRelay`, `andy-relay-<host>-<guest>`) at the same time. The link comes up on whichever works first (`linkUp`); `sendLink` uses the data channel when it's open (`dcOpen`) and otherwise the relay (`rOk`, batched every `RELAY_MS`). If the data channel opens later, traffic switches to direct; if it drops, traffic falls back to the relay. Direct often fails when players share a wifi network (mDNS candidates, no NAT hairpinning). `CONFIG.turn` optionally adds a TURN server.
  - **Public lobby** (`MP.pub`, id `pub`, channel `andy-lobby-pub` with presence): always listed first. The host is elected via presence (`pubLeader`: an existing host stays host, otherwise the earliest `ts`); when the host leaves, the others re-elect (`pubSync`). The host auto-starts a round `PUB_WAIT` after there are 2 players and picks the mode from votes (`pubRound`).
  - **Bots** (`MP.bots`, own lobbies only, not in battle royale): the host simulates each bot in its own world (`WORLD_VARS` swap via `botIn`/`botOut`, like Kiwi) in `mpBotsStep` (called from `frameSolo`), driven by `aiThink(A)`, and sends their state as normal `'s'`/`'ev'` messages. While `botSim` is set, sounds (`Sfx.quiet`), banners and music changes are suppressed.
- **Upgrades** are pure functions of level, read through `lvl(id)`, which returns 0 during multiplayer.
- **Save system**: `localStorage['andyApples.save.v1']`.
  - Always go through `normalizeSave()` (it validates and clamps every field and migrates old saves) and `persist()` (which also marks the cloud save dirty).
  - A new save field needs `defaultSave()` + `normalizeSave()`. There is no export/import UI: saving is silent (browser), and online saving requires an account.
- **Supabase is optional**. When it isn't configured, the Account and Leaderboard buttons are hidden. `sbOn()`/`lbOn()` guard all online code. The required SQL (tables `saves`, `scores`, RPC `submit_score`) is in `README.md`; keep it in sync with the client's queries.
- **Adaptive quality**: `adaptQuality()` measures 2-s windows and `qualityWindow()` steps `qLevel` (0–4) up and down and remembers it (`andyApples.quality5`).
  - A step down is verified: if the next window isn't clearly better, the step is undone and `perf.capped` stops further downgrades that session (e.g. a phone capping rAF at 30 fps in power-saving mode).
  - Heavy visuals should respect `Q`/`qLevel`.
- **Background tiles**: `tileLayer()` in `render-bg.js` only copies the part of a tile between the layer's content top (`L.top`) and the line below which a later opaque layer covers it (`bgCover`). Tiles of biomes no longer in view and tiles far behind the camera are dropped right away. If you change a layer's shapes, keep `L.top`, `L.empty` and `bgCover` true to what is actually drawn.
- **Android bridge**: `IN_APP` (the user agent contains `AndyApplesApp` and `window.AndroidBridge` exists) routes copying to the bridge, and the Screen settings to `setFullscreen`/`setLandscape` (`appScreen()` in `view.js`; stored natively in SharedPreferences). `window.__andyBack` is called from `MainActivity.java`; keep it intact.
- **Test hook**: `window.__andy` (in `main.js`) exposes state and functions for the smoke test and console debugging. Extend it when a test needs more.

## Docs
`README.md` (Dutch) is the user-facing feature list, controls, code overview and Supabase setup guide. Update it when you add features, biomes or upgrades, or change setup steps.
