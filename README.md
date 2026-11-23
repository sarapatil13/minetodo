# Minetodo

A local-first, browser-based prototype for cozy productivity and self-care. **CozyQuest** is the world-building experience inside Minetodo: an isometric voxel-inspired home world that grows as you complete real-life tasks.

## Run it

1. Download or clone this folder.
2. Open `index.html` in a modern browser, directly from disk (`file://`) or through any static file server.
3. Add tasks, choose a priority, and complete them to earn XP, coins, and crafting resources.

No backend, account, package installation, or build step is required. The app uses classic scripts only, so it keeps working from `file://`. The optional Google Font falls back to system sans-serif when offline.

Progress is saved in this browser using `localStorage`. This means it stays on the current device/browser profile and is not synced.

## What's implemented

- Add, edit, delete, complete, and reopen tasks.
- Task types: quick task, daily habit, recurring task, project, self-care. These are labels only; recurrence and calendar behaviour are not implemented.
- Priority is three dimensions: effort tier (low/medium/high), urgent flag, and important flag.
- Derived XP, coins, and resources from a fixed 12-combination reward matrix.
- Permanent reward ledger: completing a task earns a reward once, forever.
- XP levels and a basic resource inventory.
- All / To do / Completed filters.
- A Canvas 2D isometric meadow renderer with terrain, trees, flowers, a pond and a starter house.
- Canonical terrain definitions, aliases, immutable grid queries, and validated terrain updates.
- Pointer-friendly camera panning and pointer-centred wheel/pinch zoom over the meadow.
- Validated local storage, non-destructive v1 migration, and JSON backup/import.
- Gentle approach: no missed-task penalties.

## Current reward rules (prototype values)

Coins are `floor(XP * 0.3)`. Resources use XP bands: `<20` → 1 wood, `20–34` → 2 wood, `35–49` → 2 stone, `>=50` → 1 iron.

| Tier | Flags | XP | Coins | Resource |
|---|---|---:|---:|---|
| Low | none | 10 | 3 | 1 wood |
| Low | urgent | 16 | 4 | 1 wood |
| Low | important | 19 | 5 | 1 wood |
| Low | urgent + important | 25 | 7 | 2 wood |
| Medium | none | 20 | 6 | 2 wood |
| Medium | urgent | 26 | 7 | 2 wood |
| Medium | important | 29 | 8 | 2 wood |
| Medium | urgent + important | 35 | 10 | 2 stone |
| High | none | 35 | 10 | 2 stone |
| High | urgent | 41 | 12 | 2 stone |
| High | important | 44 | 13 | 2 stone |
| High | urgent + important | 50 | 15 | 1 iron |

These are starting values for usability testing, not final game balance. Legacy `critical` tasks migrate to High + Urgent + Important and therefore earn the 50 XP reward.

### Reward lifecycle

Rewards are permanent once earned:

- Completing a task adds exactly one ledger entry and marks the task's reward as claimed.
- Reopening a task does not reverse the reward and does not clear its claimed status.
- Completing a reopened task does not grant a second reward.
- Deleting a completed task removes the task but keeps its earned ledger entry.
- Displayed XP/coins/resources are always `starting baseline + permanent ledger entries`.
- The "tasks completed" count is derived from the tasks that currently have `done === true`.
- Priority cannot be changed while a task is completed; reopen it first.

## Storage and migration

The app uses two `localStorage` keys:

- `cozyquest.mvp.v1` — the original prototype data. It is left untouched.
- `cozyquest.task-engine.v2` — the active state, written as:

```json
{
  "schemaVersion": 2,
  "baseline": { "xp": 0, "coins": 0, "resources": { "wood": 0, "stone": 0, "iron": 0 } },
  "tasks": [],
  "ledger": []
}
```

On first load, valid v1 data is migrated into v2. Known completed-task rewards are moved into the ledger and subtracted from the old totals to form the baseline, so the numbers shown to the user are unchanged. The completed count is recalculated from tasks. Malformed stored data is quarantined under `cozyquest.invalid-backup.<timestamp>` instead of silently overwriting user progress.

## JSON export and import

Use the **Export** and **Import** buttons above the task list.

- Export downloads a `cozyquest-backup-YYYY-MM-DD.json` envelope containing the app name, schema version, timestamp, and full v2 state.
- Import validates the whole file before asking for confirmation. The confirmation shows task count, completed count, ledger count, and derived totals.
- Before applying an accepted import, the current state is saved under `cozyquest.backup.<timestamp>`. The newest three backups are kept.
- Imports are capped at 1 MB. Malformed JSON, foreign backups, unsupported versions, and forged or arbitrary reward ledger values are rejected safely.
- Because v2 stores no standalone totals fields, stray imported XP/coin/completed values are ignored; totals are always recalculated from the baseline plus the validated ledger.

## Project layout

```text
index.html              UI and classic script load order
app.js                  UI bootstrap and event handlers
styles.css              layout and theme
src/rules.js            pure priority, reward, and task lifecycle rules
src/storage.js          validation, migration, and localStorage helpers
src/transfer.js         export/import envelope and strict parsing
src/world/coords.js          grid/screen transforms, tile picking and scene bounds
src/world/tiles.js           canonical terrain definitions, aliases and variant helper
src/world/map.js             deterministic sample meadow data using tile definitions
src/world/mapValidation.js   structured map validation
src/world/grid.js            immutable grid queries and updates
src/world/renderer.js        procedural Canvas 2D drawing primitives
src/world/scene.js           draw-command composition and deterministic depth sorting
src/world/camera.js          camera state, viewport transforms, pan, zoom and constraints
src/world/cameraInput.js     pointer, wheel, pinch and keyboard camera controls
src/world/controller.js      DPR-aware sizing, camera lifecycle, redraw scheduling and cleanup
src/world/index.js           public CQ.world.mount(...) adapter
tests/*.test.js         dependency-free node:test suites
```

The modules in `src/` are UMD-style: browsers get namespaced globals such as `window.CQ.rules` and `window.CQ.world`, while Node `require()` can load them directly for tests. No ES modules, network-loaded assets, frameworks, or build tools are required.

## Phase 2.1 world renderer

The meadow is a real isometric grid rather than static CSS artwork. Tiles use a 48×24 diamond projection, with an explicit inverse transform and a deterministic tile-picking rule for shared edges and corners. Ground tiles and objects share one painter's-order queue, so foreground terrain can occlude the base of a tall object while equal-depth objects still follow a stable row/column/id tie-break.

`CQ.world.mount(canvas)` renders a deterministic 11×9 meadow. It fits the complete scene bounds, including tree and house height and pond details, into the available canvas. The controller keeps the backing store in sync with CSS size and device pixel ratio, schedules a single redraw per frame on resize, and exposes `destroy()` for cleanup. Rendering is independent of task rules, storage, rewards, and import/export.

Phase 2.1 was intentionally a rendering foundation. It did not include player movement, camera drag/zoom, free placement, inventory, crafting, shops, biomes, multiplayer, or cloud sync. The world is not yet connected to task completions.

## Phase 2.2 grid and tile system

Phase 2.2 adds a data layer underneath the unchanged renderer. Canonical terrain definitions live in `src/world/tiles.js` and contain only `id`, `label`, `walkable`, `visualCategory`, and `variants`. The canonical types are `grass`, `dirt`, `water`, `stone`, and `sand`; each has five deterministic visual variants.

The sample meadow keeps its original raw terrain IDs: `path` is an alias for canonical `dirt`, and `pond` is an alias for canonical `water`. Aliases are resolution rules only. They never rewrite stored tile data, so all Phase 2.1 positions, raw IDs, and variants remain byte-for-byte compatible. Canonical queries include aliases: asking for `dirt` returns both raw `dirt` and raw `path` tiles, and asking for `water` returns both raw `water` and raw `pond` tiles.

The variant formula remains exactly `(col * 7 + row * 11 + salt * 5) % variants`. The sample uses salt `1`; object variants continue to use their original per-object salts. All terrain definitions declare five variants, so newly declared terrain types remain within the sample's existing variant range.

### Public APIs

`CQ.world.mount(...)` is unchanged. Phase 2.2 adds these public members:

- `CQ.world.tiles.resolveTerrainType(id)`, `getTerrainDefinition(id)`, `isAllowedTerrainType(id)`, `isValidVariant(id, variant)`, and `variantFor(col, row, salt, variants)`.
- `CQ.world.grid.createGrid(width, height, options)`, `adoptGrid(map)`, `isInBounds(grid, col, row)`, `indexOf(grid, col, row)`, `getTile(grid, col, row)`, `getNeighbors(grid, col, row, options)`, `getTilesByType(grid, terrain)`, and `updateTile(grid, col, row, patch)`.
- `CQ.world.validateMap(map)` returns structured error objects.
- `CQ.world.assertValidMap(map)` returns the map unchanged or throws `CQ.world.WorldMapError`.
- `CQ.world.WorldMapError` exposes `code` and an `errors` array.

`createGrid()` builds a validated row-major terrain grid with an empty object list. `adoptGrid()` validates and deeply clones a JSON-shaped map. `getTile()` returns a detached tile copy. `getNeighbors()` returns detached `{ col, row, tile }` entries in a deterministic cardinal order, with optional diagonals via `{ diagonal: true }`. `getTilesByType()` returns detached `{ col, row, tile }` entries in row-major order. `indexOf()` returns a row-major flat index, or `-1` when out of bounds.

Updates are immutable functional updates. `updateTile()` validates the anchor and patch, deeply clones the whole map, applies the patch only to the target tile, revalidates the candidate, and returns the new map. The original map, unrelated tiles, object records, and nested metadata are never mutated. Accessors never return references into the internal map.

Validation is strict about the required map structure, positive integer dimensions, rectangular tile rows, recognized terrain IDs (including aliases), variant ranges, and object IDs/kinds/anchors/variants. Harmless future metadata fields on the map, tiles, and objects are preserved and accepted. Each validation error has the shape `{ code, path, message, details }`, with paths such as `tiles[3][6].variant` or `objects[2].col`.

Phase 2.2 is still a model-layer milestone. It does not add movement, placement tools, terrain editing in the UI, task-to-world rewards, biomes, inventory, crafting, or persistence of world maps. The renderer still draws the legacy `grass`, `path`, and `pond` visuals; canonical `dirt`, `water`, `stone`, and `sand` IDs validate correctly but currently fall back to the renderer's grass palette until a later rendering phase gives them dedicated artwork.

## Phase 2.3 camera and navigation

Phase 2.3 adds a view-layer camera without changing world data, terrain definitions, grid APIs, scene composition, or renderer primitives. The renderer still receives the same scene commands; the controller changes only the canvas transform that positions those commands on screen.

### Coordinate spaces

- **Grid space** is the map's integer or fractional `(col, row)` coordinates.
- **Scene space** is the isometric pixel output of `coords.gridToScreen()`, before camera movement.
- **CSS screen space** is canvas-local CSS pixels. Pointer input always uses this space.
- **Backing store space** is device pixels. It is still handled only by the existing DPR transform.

The camera stores `focusX`, `focusY`, and `zoom`. `focusX`/`focusY` are scene-space coordinates at the center of the camera's content rectangle, so zoom is preserved across resize. The default focus is the center of `scene.bounds` and the default zoom is `1`. At that state the composed transform is mathematically identical to the Phase 2.1 fit transform, so desktop, tablet, and mobile screenshots remain unchanged.

### Zoom configuration

Zoom configuration is part of the camera state as an immutable `limits` object: `{ minZoom, maxZoom, zoomStep }`. Defaults are `0.6`, `3`, and `1.15`. Pass custom values to `CQ.world.mount(canvas, { camera: { minZoom, maxZoom, zoomStep } })` or to `CQ.world.camera.createCamera(bounds, options)`. The same object is used by `createCamera()`, `cloneCamera()`, `resetCamera()`, `normalizeCamera()`, `zoomCamera()`, and `clampCamera()`; operations after creation do not accept a second, conflicting set of limits. Invalid values fall back to defaults, reversed bounds fall back to defaults, and the default zoom is clamped into the configured range.

### Public camera API

`CQ.world.mount(...)` is unchanged, and `inspect().view` still contains exactly `{ x, y, scale }`. Phase 2.3 adds `CQ.world.camera` with:

- `createCamera(bounds, options)`, `cloneCamera(camera)`, `resetCamera(camera, bounds)`, and `normalizeCamera(camera, bounds, viewport)`.
- `createViewport(size, baseScale, settings)` and `viewTransform(viewport, camera)`.
- `sceneToScreen(point, viewport, camera)` and `screenToScene(point, viewport, camera)`.
- `gridToScreen(col, row, viewport, camera, sceneOptions)`, `screenToGrid(x, y, viewport, camera, sceneOptions)`, and `screenToTile(x, y, viewport, camera, sceneOptions)`.
- `panCamera(camera, deltaCss, viewport, bounds)`, `zoomCamera(camera, factor, anchorCss, viewport, bounds)`, and `clampCamera(camera, bounds, viewport)`.

Camera functions return new frozen state objects and never mutate their inputs. `inspect()` additionally exposes `camera` and `viewport` snapshots for diagnostics.

### Controls and constraints

- Drag with mouse, pen, or one finger to pan. Pointer capture is used where available, and lost capture is handled explicitly.
- Use the wheel to zoom around the pointer. Trackpad pinch/wheel deltas are normalized across pixel, line, and page modes.
- Use two fingers to pinch-zoom and pan by midpoint movement.
- When the canvas has keyboard focus, `+`/`=` zoom in, `-`/`_` zoom out, and `0` resets. No visible zoom controls were added.

Zooming normally keeps the scene point under the pointer fixed. Viewport constraints take priority: after a zoom or pan, the camera is clamped so some world remains visible. If anchor preservation conflicts with a world boundary, the camera moves to the closest legal position and the anchor shifts. When a world is smaller than the content rectangle on an axis, that axis stays centered and does not pan; this also means pointer-anchor preservation is intentionally skipped for small worlds. Zooming at an edge keeps at least a small overlap of the world inside the viewport.

The controller establishes a valid viewport and backing store before attaching input. Input getters resynchronize against the current canvas size, so wheel and pointer events never use a stale viewport. Resize preserves the focused scene point and zoom, then reapplies constraints. One input handle owns all listeners, and `destroy()` removes them idempotently without adding a second animation loop.

### Scope

Phase 2.3 does not add player movement, tile interaction, terrain editing, placement, world-map persistence, camera persistence, task rewards, rotation, minimaps, visible zoom buttons, dependencies, or a build system. It continues to run from `file://` with classic scripts.

## Tests

Run the complete automated suite from this directory:

```bash
node --test
```

The suite covers the 12-combination matrix, coin/resource formulas, complete/reopen/recomplete cycles, permanent rewards after deletion, priority locking, v1 migration, storage validation/quarantine/backup pruning, import/export rejection cases, isometric coordinate transforms and tile picking, deterministic map data, scene depth ordering, canvas drawing dispatch, DPR sizing, mount/cleanup behavior, canonical terrain definitions and aliases, structured map validation, immutable grid access, terrain updates, camera defaults and transforms, pointer-centred and constrained zoom, custom zoom limits, panning calculations, viewport boundaries, pointer input, resize handling, and controller cleanup.

## MVP boundary

This slice intentionally does not include login, cloud sync, friend visits, shared worlds, AI suggestions, analytics, a focus timer, breathing exercises, journal entries, real crafting, real-time 3D movement, recurrence, or calendar scheduling. Those should be added in stages after the core task loop has been tested.

## Suggested next stages

1. Validate the task/reward loop with real users and improve confusing interactions.
2. Add an in-app migration report and an undo/history view.
3. Add focus timer and self-care flows.
4. Extend the rendered world with movement, placement, crafting, and unlocks.
5. Add accounts, privacy rules, friend permissions, and cloud sync only when sharing is ready.
6. Add analytics and AI suggestions using consent-aware, explainable data.

## Git workflow

Work on one feature branch at a time, test it, inspect the diff, and merge only when the old task flows still work. Keep `main` and release tags stable. Never commit `.env`, credentials, or real personal task data. Use meaningful commit messages and tag stable milestones (for example `v0.1.0`).
