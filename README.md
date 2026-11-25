# Minetodo

A local-first, browser-based prototype for cozy productivity and self-care. **CozyQuest** is the world-building experience inside Minetodo: an isometric voxel-inspired home world that grows as you complete real-life tasks.

## Run it

1. Download or clone this folder.
2. Open `index.html` in a modern browser, directly from disk (`file://`) or through any static file server.
3. Add tasks, choose a priority, and complete them to earn XP, coins, and crafting resources.

No backend, account, package installation, or build step is required. The app uses classic scripts only, so it keeps working from `file://`. The optional Google Font falls back to system sans-serif when offline.

Progress is saved in this browser using `localStorage`. Task state and user-owned world changes use separate keys; XP, levels, stages, and unlock availability are recalculated on load, while owned and placed decorations are persisted. This means progress stays on the current device/browser profile and is not synced.

## What's implemented

- Add, edit, delete, complete, and reopen tasks.
- Task types: quick task, daily habit, recurring task, project, self-care. These are labels only; recurrence is not implemented. Existing due dates are shown in the calendar.
- Priority is three dimensions: effort tier (low/medium/high), urgent flag, and important flag.
- Derived XP, coins, and resources from a fixed 12-combination reward matrix.
- Permanent reward ledger: completing a task earns a reward once, forever.
- XP levels and a basic resource inventory.
- A world that grows from earned XP, with four stages and two intermediate milestones.
- A distinct CozyQuest view with a nature-inspired atmosphere, an introduction, shared progression summary, and a clear return to the Minetodo Dashboard.
- Validated, persistent user world changes layered over that derived world, plus a reset for saved changes.
- Phase 2.7: five biomes with palette-based base maps, unlockable decorations, independently owned items, and per-biome placement.
- Biome selector and decoration acquire/place/move/remove controls in the app shell.
- All / To do / Completed filters.
- A monthly task calendar with previous/next navigation, a local today marker, scheduled-date dots, date filtering, a clear-filter control, and quick add through the existing task dialog.
- Pomodoro and custom in-memory focus timers with start, pause, resume, reset, and in-widget completion feedback.
- A small deterministic flower beside each completed task title, with a one-time bloom on completion and no reward or storage changes.
- A Canvas 2D isometric meadow renderer with terrain, trees, flowers, a pond and a starter house.
- Canonical terrain definitions, aliases, immutable grid queries, and validated terrain updates.
- Pointer-friendly camera panning and pointer-centred wheel/pinch zoom over the meadow.
- Read-only inspection of meadow objects and the pond by mouse, touch, and keyboard.
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

The app recognizes four primary `localStorage` keys, plus timestamped backup and recovery keys:

- `cozyquest.mvp.v1` — the original prototype data. It is left untouched.
- `cozyquest.task-engine.v2` — the active task state, written as:

```json
{
  "schemaVersion": 2,
  "baseline": { "xp": 0, "coins": 0, "resources": { "wood": 0, "stone": 0, "iron": 0 } },
  "tasks": [],
  "ledger": []
}
```

- `cozyquest.world-state.v1` — legacy optional, user-owned world deltas. The key is preserved untouched for migration and is no longer written:

```json
{
  "schemaVersion": 1,
  "worldId": "meadow-haven",
  "baseMapId": "sample-meadow-v1",
  "name": "Meadow Haven",
  "createdAt": "",
  "updatedAt": "",
  "objects": { "placed": [], "moved": [], "removed": [] },
  "terrain": []
}
```

- `cozyquest.world-state.v2` — the active world envelope, written as:

```json
{
  "schemaVersion": 2,
  "worldId": "meadow-haven",
  "baseMapId": "sample-meadow-v1",
  "name": "Meadow Haven",
  "createdAt": "",
  "updatedAt": "",
  "activeBiome": "meadow",
  "unlocks": [],
  "ownership": { "items": [] },
  "biomes": {
    "meadow": { "objects": { "placed": [], "moved": [], "removed": [] }, "terrain": [] }
  }
}
```

Both world keys store deltas only: no XP, stage, milestone claim, derived unlock, or reward value. The v2 envelope adds owned item instances (`user:item:*`), placement instances (`user:placement:*`), explicit non-derivable unlock grants, one active biome, and independent per-biome deltas. XP/achievement unlock availability is derived from task state and is never stored. An absent key means no saved user changes.

On first load, valid v1 task data is migrated into v2. Known completed-task rewards are moved into the ledger and subtracted from the old totals to form the baseline, so the numbers shown to the user are unchanged. The completed count is recalculated from tasks. A valid v1 world state is deterministically migrated into the v2 meadow bucket: legacy placements become owned instances plus placement records with stable derived IDs, and moves, removals, terrain, names, timestamps, salts, and references are preserved. The v1 key is not rewritten or deleted. Malformed task data is quarantined under `cozyquest.invalid-backup.<timestamp>` instead of silently overwriting user progress. Malformed or unsupported world data is quarantined under `cozyquest.invalid-world-backup.<timestamp>` and never affects task state.

## JSON export and import

Use the **Export** and **Import** buttons above the task list.

- Export downloads a `cozyquest-backup-YYYY-MM-DD.json` envelope containing the app name, schema version, timestamp, full v2 task state, and an optional `world` block with user-owned world changes (v1 or v2).
- Import validates the whole file before asking for confirmation. The confirmation shows task count, completed count, ledger count, derived totals, and whether world changes are included.
- A backup without `world` restores task state and keeps the current world. A backup with valid `world` replaces saved world changes. Explicit but invalid world data is rejected before confirmation or writes.
- Before applying an accepted import, the current task state is saved under `cozyquest.backup.<timestamp>`; when world state is being replaced, it is also saved under `cozyquest.world-backup.<timestamp>`. The newest three of each are kept.
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
src/progressionConfig.js    shared cosmetic level, stage and milestone thresholds
src/world/coords.js          grid/screen transforms, tile picking and scene bounds
src/world/tiles.js           canonical terrain definitions, aliases and variant helper
src/world/map.js             deterministic sample meadow data using tile definitions
src/world/mapValidation.js   structured map validation
src/world/grid.js            immutable grid queries and updates
src/world/renderer.js        procedural Canvas 2D drawing primitives
src/world/scene.js           draw-command composition and deterministic depth sorting
src/world/progression.js     pure XP derivation and deterministic world composition
src/world/camera.js          camera state, viewport transforms, pan, zoom and constraints
src/world/cameraInput.js     sole canvas listener owner; pan, pinch, hover, tap and key semantics
src/world/hitTest.js         renderer-derived hit shapes and painter-order target picking
src/world/selectableTargets.js  stable object and pond target index with derived descriptions
src/world/interactionState.js   immutable hover, selection, focus and pointer state
src/world/infoPanel.js       DOM-only detail panel updates and close handling
src/world/interaction.js     tap, hover, keyboard focus, selection and feedback lifecycle
src/world/controller.js      DPR-aware sizing, camera and interaction lifecycle, scheduling and cleanup
src/world/content.js         pure composition of derived progression and saved user deltas
src/world/contentCatalog.js  frozen catalog of unlockable decoration definitions
src/world/unlocks.js         pure, typed unlock requirement evaluator
src/world/biomeCatalog.js    biome definitions, palettes and deterministic base maps
src/world/index.js           public CQ.world.mount(...) adapter
src/worldState.js            v1/v2 world state validation, migration, storage, quarantine and backups
src/world/decorations.js     ownership, placement, movement, removal and biome switching layer
src/stateCommit.js           validated two-domain commits, rollback and recovery marker
src/calendar.js         pure local-date month generation and task/date mapping
src/focusTimer.js       pure time-based Pomodoro/custom timer state
src/flowers.js          pure deterministic decorative flower assignment
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

## Phase 2.4 interactive objects

Phase 2.4 adds read-only inspection to the existing world. It does not move, place, edit, delete, or persist objects, and it is not connected to task rewards. The default camera, sample meadow fingerprint, command order, and unselected screenshots are unchanged: feedback is an additive overlay pass that is omitted when no object is hovered, focused, or selected.

### Controls

- Hover a selectable object or the pond with a mouse to show subtle focus feedback and a pointer cursor. Moving off the target clears hover; drags and pinches do not leave a stale hover because camera changes recompute it from the cached pointer.
- Click/tap a target to select it and open its detail panel. Click/tap empty terrain to clear the selection. A stationary pointer taps; moving beyond the threshold permanently classifies the gesture as a pan. Multi-touch, `pointercancel`, and lost pointer capture never tap.
- Default tap thresholds are `6` CSS pixels for mouse and `10` for touch, configured through `CQ.world.mount(canvas, { tapThresholds: { mouse, touch } })`. The separate hit tolerances are `2` CSS pixels for mouse and `10` for touch and can be overridden with `toleranceCss`.
- With the canvas focused, `ArrowRight`/`ArrowDown` move to the next target and `ArrowLeft`/`ArrowUp` move to the previous target without wrapping. `Enter` or `Space` selects the focused target, and `Escape` clears the selection and returns focus to the canvas. All handled keys prevent page scrolling. The existing `+`/`=`, `-`/`_`, and `0` camera shortcuts still work.
- The detail panel's close button also clears the selection and restores focus. Its pointer and keyboard events stop propagation, so panel interaction cannot start a world pan.

### Accessibility

The canvas is an `application` region named `CozyQuest interactive isometric meadow` and described by screen-reader-only instructions in `#world-controls-help`. The existing visible focus outline remains. The panel is a hidden-by-default `region` labelled by `#world-object-title`; only existing map fields are shown, written with `textContent` rather than HTML. Missing panel markup leaves all canvas interaction working.

### Targets and hit testing

Objects use stable IDs derived from `object.id` (`object:<id>`), never array indexes. The pond is still terrain, not an object record; its synthetic ID is derived from sorted tile keys, for example `terrain:pond:8,5|9,5|8,6|9,6`. Only supported object kinds and connected `pond`/`water` terrain become selectable targets.

Hit shapes mirror the renderer's actual artwork: leaf silhouettes, house faces, flower petals, fence posts and rails, pond diamonds, and their visible side faces. `coords.OBJECT_EXTENTS` remains fit-only and is not used as a final hitbox. Touch tolerance is capped on narrow artwork so transparent gaps are not selectable.

All candidates share the same `scene.commands` order. Objects use their command index; a pond candidate uses the command index of the specific tile under the pointer. The later-painted candidate wins, with target ID and then tile coordinate providing deterministic tie-breaks.

This model intentionally treats only objects and pond tiles as occluders. Other non-selectable terrain is not modeled as an occluder, so a selectable object visually behind ordinary grass may still be pickable. There is no story clustering, placement, editing, deletion, persistence, inventory, crafting, player movement, or task-to-world reward coupling in this phase.

### Public interaction APIs

`CQ.world.mount(...)` still returns the same world handle and `inspect().view` still has exactly `{ x, y, scale }`. Phase 2.4 adds:

- `CQ.world.selectableTargets.buildSelectableTargets(scene, options)`, `describeTarget(target)`, and `ISSUE_CODES`.
- `CQ.world.hitTest.pick(screenPoint, context, pointerType)`, `pickAtScenePoint(point, targets, options)`, `anchorForTarget(target)`, `shapesForTarget(target)`, and the mouse/touch tolerance constants.
- `CQ.world.interactionState.createState(targetCount)` and its immutable `setHover`, `setSelected`, `setKeyboardFocus`, `moveFocus`, and `setPointer` helpers.
- `CQ.world.infoPanel.attach(element, handlers)` for optional DOM markup; it is a no-op when the element is missing.
- `CQ.world.interaction.create(canvas, dependencies)` for standalone interaction handles with `handleTap`, `handleHoverMove`, `handleHoverEnd`, `refreshHover`, `handleNavigate`, `handleActivate`, `handleClear`, `feedback`, `inspect`, and `destroy`.

`mount()` accepts `{ infoPanel, tapThresholds, toleranceCss, targetOptions }`. The controller owns the interaction lifecycle and exposes a frozen snapshot as `inspect().interaction`, including hover, selection, keyboard focus, cached pointer, target IDs, target issues, and panel state. `destroy()` closes the panel, clears hover state, and leaves no duplicate listeners.

## Phase 2.5 XP-based world growth

Phase 2.5 connects the world to the existing task economy. The only source of progression is `CQ.rules.computeTotals(state).xp` — the same baseline-plus-ledger total already used by the header and reward rules. No second XP counter, stored stage, milestone claim flag, persisted world map, reward matrix value, schema field, or ledger rule was added. Reopening or deleting a task never reduces earned XP, and completing a reopened task never awards twice.

The cosmetic level ladder is shared through `CQ.progressionConfig.LEVELS` instead of being duplicated in `app.js`. Levels are grouped into exactly four world stages, with exactly two intermediate accent milestones:

| XP | World stage | Milestone / feature | Visual unlock |
|---:|---|---|---|
| 0 | Starting Meadow | — | unchanged sample meadow |
| 100 | Growing Meadow | `meadow-wildflowers` | wildflowers appear |
| 250 | Growing Meadow | `meadow-path-accent` | a meadow path and fence appear |
| 500 | Developed Village | `village-annex` | a village annex appears |
| 900 | Developed Village | `village-garden` | a garden grove appears |
| 1400 | Thriving Village | `thriving-canopy` | the thriving canopy appears |

There are no other world thresholds. Every unlock is derived from XP, monotonic, and still present at higher XP. The 250 and 900 accents are real feature IDs in the derived feature set, update the next-unlock message, and add distinct objects and path tiles. At 1400 and beyond all features are unlocked and the message reads “Every world feature is blooming.”

Maps are composed from a fresh `CQ.world.createSampleMeadow()`; the base factory is never mutated or overwritten. Generated records use stable `progression-*` IDs and only the existing supported object kinds. They occupy fixed interior anchors, so every composed map validates, has unique IDs and anchors, keeps every base object unchanged, and has exactly the same `sceneBounds()` as the zero-XP meadow. Three grass-to-path tile patches use the existing tile validator with salt `3`. The zero-XP map is byte-for-byte the original sample meadow, and zero-XP screenshots remain unchanged; the progress row is hidden at 0 XP while still exposing text to assistive technology.

In Phase 2.5, state and the derived world were updated through one preflighted commit. `app.js` validated the composed map, target index, XP and bounds before saving, then called the in-place controller update. The world handle, camera focus/zoom, canvas listeners, target identity, and `inspect().view` shape are preserved; the world is never remounted on a task update. If the live target index could not be replaced, the previous world and XP were restored before the state was rolled back. Phase 2.6 keeps the in-place update model but separates task and world storage domains.

Imports recompute the derived stage from the imported ledger. An import with less lifetime XP can therefore lower the derived stage and remove decorations that are no longer earned; this is intentional because nothing about stage is persisted. Exports and the authoritative ledger are unchanged.

### Public progression APIs

`CQ.world.mount(...)` keeps its existing shape and optionally accepts `{ xp }` for an initial derived stage. The returned world handle adds `preflightProgression({ xp, scene })` and `setProgression({ xp, scene })`, and `inspect()` adds a frozen `progression` snapshot with `xp`, `stageId`, `stageName`, `unlockedFeatures`, and `nextUnlockId`.

Phase 2.5 also adds:

- `CQ.progressionConfig` with `LEVELS`, `WORLD_STAGES`, and `WORLD_MILESTONES`.
- `CQ.world.progression` with `STAGES`, `MILESTONES`, `FEATURES`, `FEATURE_CONTENT`, `normalizeXp`, `stageForXp`, `featuresForXp`, `featureIdsForXp`, `nextFeatureAfter`, `worldProgress`, `composeProgressionMap`, and `createProgressionScene`.

Phase 2.5 does not add player movement, object placement or editing, world-map persistence, biomes, inventory, crafting, shops, cloud sync, new reward values, or additional unlock thresholds.

## Phase 2.6 persistent world state

Phase 2.6 persists only user-owned world modifications. XP, level, stage, milestone decorations, progression terrain patches, coins, and resources remain derived. The only XP authority is still `rules.computeTotals(state).xp`; task mutations never rewrite `cozyquest.world-state.v1`. `src/world/content.js` is a pure module with no localStorage, DOM, app state, or UI callbacks.

### Storage and validation

The active key is `cozyquest.world-state.v1` with `schemaVersion: 1`. It holds deltas only: `objects.placed`, `objects.moved`, `objects.removed`, and `terrain`. An absent key means no saved user changes. `CQ.worldState` exposes `emptyState()`, `validateState()`, `loadState()`, `saveState()`, `backupState()`, `createId()`, and `reservedIds()`.

Validation is deterministic and uses canonical ordering. Structural or unsupported-schema failures are quarantined under `cozyquest.invalid-world-backup.<timestamp>`; cleaned states with invalid individual records return `ok: true` plus issues after those records are skipped. Duplicate IDs are never resolved arbitrarily, reserved base or progression IDs are rejected for user-created objects, and bad kinds, coordinates, salts, terrain, or occupied cells are reported. World quarantine never affects task state.

### Composition and rendering

`CQ.world.content.compose({ baseMap, xp, state })` applies derived progression first and saved user deltas second, returning a validated scene plus any issues. The base meadow factory is not mutated, IDs and ordering are stable, and scene bounds remain unchanged. `CQ.world.mount(...)` still returns one canvas and the same handle API; commits preflight the composed scene and update it in place without remounting or duplicating listeners.

### Commits and recovery

`CQ.stateCommit.commit(...)` validates both domains, composes and preflights the scene, preserves previous raw values, writes optional backups, then writes only the requested domain keys. Failed writes roll back to the previous bytes. `localStorage` does not provide cross-key atomicity: the app validates and preflights before writing, handles write and rollback exceptions, and reports any rollback failure explicitly instead of claiming atomicity.

If a rollback write also fails, `cozyquest.commit-recovery.v1` is saved and replayed by `CQ.stateCommit.recover(store)` at startup before any domain is loaded. Failure-injection tests cover task-state write failure, world-state write failure, task rollback failure, world rollback failure, and backup write failure.

Task-only mutations write only the task key. World edits and reset write only the world key. Imports select task-only or task+world domains from the backup envelope; an absent `world` block is not a world reset.

### Backup, import, and reset

Backups include an optional `world` block. An older task-only backup restores task state while keeping the existing world. An explicit invalid world block is rejected before confirmation or writes. The **Reset world changes** control asks for confirmation, clears only saved user deltas, and leaves task state and derived progression unchanged; cancelling or having no saved changes writes nothing.

### Public APIs and scope

Phase 2.6 adds `CQ.worldState`, `CQ.stateCommit`, and `CQ.world.content`; `CQ.world.mount(...)` and its handle API are unchanged. `index.html` loads world content before `src/world/index.js` and persistence helpers before `app.js`, still with classic scripts from `file://`. This phase does not add an editor UI, inventory or crafting, shops or economy, new biomes, multiplayer or cloud sync, camera persistence, or object rotation.

## Phase 2.7 unlockable decorations and biomes

Phase 2.7 adds content progression on top of the Phase 2.6 delta layer. XP still has exactly one authority, `CQ.rules.computeTotals(state).xp`; no reward value, threshold, stage, feature ID, ledger rule, or 11×9/scene-bound behavior changed.

### Catalog and unlocks

`CQ.world.contentCatalog` is a frozen list of seven definitions: Daisy Cluster (100 XP), Lavender Bush (250 XP), Little Oak (500 XP), Cattail Reeds (900 XP), Picket Fence (1400 XP), Cottage Accent (10 completed tasks), and Snowdrop Cluster (20 reward entries). Every entry has `autoGrant: false`, so unlocking only grants availability — nothing is owned automatically.

`CQ.world.unlocks` evaluates closed, typed requirement objects (`always`, `xp`, `completed-tasks`, `ledger-entries`, `achievement`, `grant`, `event`, `purchase`, `all`, `any`). It derives XP from `computeTotals`, completed-task counts from live tasks, ledger counts from the permanent ledger, and achievements from reconstructible state. Only non-derivable grants (event/purchase/explicit achievement) are read from the v2 `unlocks` array. Unknown or malformed definitions are rejected with issues; no string is parsed, evaluated, or interpreted. The evaluator is pure, frozen, and side-effect free.

### Biomes

`CQ.world.biomeCatalog` defines `meadow` (always), `forest` (10 completed tasks), `lakeside` (500 XP), `autumn` (900 XP), and `snowy` (20 reward entries). `createBaseMap(id)` clones the meadow object layout and applies a deterministic terrain preset with salt `11`; `paletteFor(id)` supplies biome colors to the existing renderer. Object extents, grid dimensions, and `coords.sceneBounds()` are unchanged, and no new terrain IDs were introduced. Exactly one biome is active at a time. Switching only changes `activeBiome` — every other biome's deltas stay intact.

### Ownership and placement

World state v2 (`cozyquest.world-state.v2`) keeps three separate identities: catalog item → owned instance (`user:item:*`) → placement instance (`user:placement:*`). An owned instance can be placed at most once across *all* biomes. Moving keeps the placement and ownership IDs; removing deletes only the placement and keeps ownership; acquiring adds an owned instance without placing it. `CQ.decorations` (loaded as `src/world/decorations.js` after `src/worldState.js`) exposes `acquire`, `place`, `move`, `remove`, `switchBiome`, `syncAutoGrants`, and `activeModifications`, all returning frozen results with structured issues. `syncAutoGrants` is a no-op for the current catalog because every `autoGrant` is false.

### Migration, composition, and permanent rewards

`CQ.worldState.migrateV1State` deterministically maps legacy placed records into owned instances and meadow placements with stable derived IDs, preserving IDs, names, timestamps, kinds, coordinates, salts, moves, removals, terrain, and references. The v1 key is never rewritten or deleted. `CQ.stateCommit` and `CQ.transfer` accept both v1 and v2 world state via `validateAnyState`/`saveAnyState`/`backupAnyState`; recovery markers record which key was in use.

For v2, `decorations.activeModifications(state, { taskState, enforceUnlocks: false })` converts the active biome's deltas to the v1 shape consumed by `world.content.compose`, skipping incompatible saved placements with issues while leaving them stored for a compatible biome. Unlocks are enforced when acquiring, placing, or switching biomes — not at render time — so reopening or deleting a task cannot reverse an earned unlock or owned decoration.

The app shell now exposes a biome selector, catalog/owned/placed lists, placement cell inputs, acquire/place/move/remove buttons, and the existing reset control. There is no shop, crafting, spending, purchase ledger, rotation, multiplayer, cloud sync, or full map editor.

## Phase 2.8.3 calendar and focus widgets

Phase 2.8.3 makes both dashboard widgets functional without changing the task engine, reward matrix, permanent ledger, world state v2, export/import, or CozyQuest lifecycle.

`CQ.calendar` is a pure UMD module. `buildMonth()` produces Sunday-first local calendar cells for any month, with leap-year-safe day counts, neighbouring-month padding, today markers, and scheduled-task counts derived from the existing `task.date` strings. Undated tasks are never mapped to a calendar day. Selecting a date combines with the existing All / To do / Completed filter; clearing the date restores the full list. The calendar quick-add control opens the existing task dialog with the selected local date prefilled, and all validation/creation still goes through the single task-form path.

`CQ.focusTimer` is a pure UMD module with an injectable clock. Its state is only in memory. Remaining time is computed from a target timestamp rather than fixed interval decrements, so delayed or skipped ticks do not cause drift. The app owns one 250 ms interval, clears it on pause, reset, completion, and `pagehide`, and only writes timer DOM on each tick; the full application render and task list are untouched. Completion feedback stays inside the focus widget and is separate from XP, points, and rewards.

## Phase 2.8.4 flower appreciation

Phase 2.8.4 adds a small decorative flower beside completed task titles without changing the task schema, reward matrix, permanent ledger, world state, export/import, or task lifecycle.

`CQ.flowers` is a pure UMD module with eight frozen varieties. A deterministic FNV-1a hash of the stable task ID selects one variety, so the same flower appears after reloads, filtering, reordering, reopening, and recompletion. Missing, empty, or non-string IDs receive no flower, and lookup never mutates the task or the returned variety.

The bloom class is queued in a transient in-memory set only when a task actually moves from incomplete to complete, then consumed by the next render. Reloads, unrelated full renders, calendar selection, navigation, and timer ticks therefore show existing flowers without replaying the animation. The flower span is `aria-hidden`, and both a CSS media query and a JavaScript preference check disable the bloom for `prefers-reduced-motion`. Flowers carry no XP, coins, resources, inventory, collection score, or persistence.

## Phase 2.8.5 CozyQuest integration and visual identity

Phase 2.8.5 gives CozyQuest a distinct in-app atmosphere without introducing a second application. The shared sidebar, topbar, task engine, router, and world lifecycle remain in place; a single `body.is-cozyquest` state restyles the shell while Minetodo keeps its mint-green productivity identity.

The existing world template now opens with a CozyQuest heading, a short introduction explaining that Minetodo tasks grow the world, and a prominent **Back to Minetodo Dashboard** button. That button uses the existing delegated document listener and hash router, so it cannot accumulate duplicate bindings across repeated mounts. A progression summary shows XP, level, world stage, stage progress, and the next unlock beside the canvas.

The summary reads the same derived values as the dashboard: `renderStats()` supplies XP and level from `rules.computeTotals()`, while `updateWorldGrowth()` supplies stage and percent from the existing `worldProgression.worldProgress()` result. Entering CozyQuest composes the live world with `currentXp()`, so tasks completed in Minetodo are reflected immediately. No reward, ledger, task, or world-state calculation was duplicated or changed. Flowers remain completed-task decoration and never appear as CozyQuest currency or collectibles.

The visual layer uses CSS gradients, broader world canvas sizing, a responsive hero/progress layout, reduced-motion-safe transitions, and accessible focus styling. Desktop, tablet and mobile layouts keep the canvas, biome selector, decoration catalog, placement controls, reset, and backup/export/import behavior intact.

## Tests

Run the complete automated suite from this directory:

```bash
node --test
```

The suite covers the 12-combination matrix, coin/resource formulas, complete/reopen/recomplete cycles, permanent rewards after deletion, priority locking, v1 migration, storage validation/quarantine/backup pruning, import/export rejection cases, isometric coordinate transforms and tile picking, deterministic map data, scene depth ordering, canvas drawing dispatch and additive focus feedback, DPR sizing, mount/cleanup behavior, canonical terrain definitions and aliases, structured map validation, immutable grid access, terrain updates, camera defaults and transforms, pointer-centred and constrained zoom, custom zoom limits, panning calculations, viewport boundaries, semantic pointer input, tap/pan/pinch classification, stable target indexing, renderer-derived shape hit testing, immutable interaction state, panel behavior, hover/selection/keyboard flows, resize handling, controller cleanup, XP stage/milestone derivation, deterministic progression composition, in-place target replacement, rollback-safe progression commits, versioned world-state validation and quarantine, pure world composition, two-domain commit and recovery handling, world-aware backup envelopes, and classic script order/reset control. Phase 2.7 also covers typed unlock derivation, catalog/biome determinism, v1→v2 migration fidelity, ownership/placement invariants, biome isolation, and the new app-shell controls. Phase 2.8.3 also covers local-date month generation, leap years and month boundaries, date/task mapping, the full timer lifecycle, custom durations, delayed-tick drift, completion transitions, and the widget DOM/CSS contracts. Phase 2.8.4 also covers deterministic variety assignment and distribution, invalid IDs, input immutability, bloom queue consumption, reduced-motion guards, decorative accessibility, and the no-reward/no-storage contracts. Phase 2.8.5 also covers the CozyQuest hero/return/progression contracts, shared body-class transitions, delegated routing, preserved world control IDs, responsive visual identity, and the single derived XP/world-progression calculation paths.

## MVP boundary

This slice intentionally does not include login, cloud sync, friend visits, shared worlds, AI suggestions, analytics, breathing exercises, journal entries, a shop/spending economy, crafting, object rotation, a full map editor, real-time 3D movement, recurrence, recurring automation, recurring calendar entries, flower inventory, collection scoring, or competitive mechanics. Those should be added in stages after the core task loop has been tested.

## Suggested next stages

1. Validate the task/reward loop with real users and improve confusing interactions.
2. Add an in-app migration report and an undo/history view.
3. Add self-care flows around the now-implemented calendar, focus timer, flower appreciation, and CozyQuest identity.
4. Extend the grown world with movement, a full in-app map editor (beyond the current decoration controls), crafting, and new unlock tiers.
5. Add accounts, privacy rules, friend permissions, and cloud sync only when sharing is ready.
6. Add analytics and AI suggestions using consent-aware, explainable data.

## Git workflow

Work on one feature branch at a time, test it, inspect the diff, and merge only when the old task flows still work. Keep `main` and release tags stable. Never commit `.env`, credentials, or real personal task data. Use meaningful commit messages and tag stable milestones (for example `v0.1.0`).
