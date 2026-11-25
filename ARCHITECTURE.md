# Minetodo and CozyQuest — Architecture and Developer Guide

This document explains how the Phase 2.8 implementation fits together and where changes are safe. It describes the code as it exists at baseline `77a8227`. Product behavior is summarized in [README.md](README.md) and specified in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md).

The application is a local-first static page. There is no server, build output, package manifest, framework, ES module graph or backend API. `index.html` loads classic scripts in dependency order; `app.js` wires those modules to one persistent DOM shell.

## 1. Application entry point

- `index.html` is the entry point. It contains:
  - the always-present dashboard view;
  - the sidebar and topbar shell;
  - an inert `<template id="cozyquest-world-template">` for the optional world view;
  - the shared task dialog;
  - the ordered `<script src="...">` list.
- `styles.css` owns all visual states, including `body.is-cozyquest`, responsive breakpoints and reduced-motion rules.
- `app.js` is the only browser controller. It loads storage at startup, renders the dashboard, owns navigation, binds shell listeners and commits state changes.

Startup sequence in `app.js`:

1. Resolve `window.CQ` modules.
2. Replay any `cozyquest.commit-recovery.v1` marker.
3. Load task state and world state from `localStorage`.
4. Create the calendar month, in-memory focus timer and bloom set.
5. Render dashboard stats, calendar, tasks and world controls.
6. Apply the initial view: dashboard on reload, otherwise honor a fresh `#cozyquest` hash.

## 2. Script loading order

All scripts are classic scripts. The order in `index.html` is a dependency contract; do not reorder without tracing consumers.

```text
src/rules.js
src/storage.js
src/transfer.js
src/progressionConfig.js
src/world/coords.js
src/world/tiles.js
src/world/map.js
src/world/contentCatalog.js
src/world/unlocks.js
src/world/biomeCatalog.js
src/world/mapValidation.js
src/world/grid.js
src/world/scene.js
src/world/progression.js
src/world/camera.js
src/world/hitTest.js
src/world/renderer.js
src/world/selectableTargets.js
src/world/content.js
src/world/interactionState.js
src/world/infoPanel.js
src/world/cameraInput.js
src/world/interaction.js
src/world/controller.js
src/world/index.js
src/worldState.js
src/world/decorations.js
src/stateCommit.js
src/calendar.js
src/focusTimer.js
src/flowers.js
app.js
```

Important order constraints:

- World primitives and catalogs load before `src/world/index.js`, which exposes the public `CQ.world` namespace and `mount(...)`.
- `src/world/content.js` loads before the public world adapter.
- `src/worldState.js` loads before `src/world/decorations.js`, `src/stateCommit.js` and `app.js`.
- `src/progressionConfig.js` loads before world progression and `app.js`.
- `src/calendar.js`, `src/focusTimer.js` and `src/flowers.js` load before `app.js`.
- `src/transfer.js` is loaded before `src/worldState.js` on purpose: it resolves the world validator lazily at export/import time instead of at script evaluation time.
- `app.js` is always last.

A test in `tests/app-shell.test.js` checks that every script is loaded exactly once and that key ordering constraints still hold.

## 3. Module responsibilities

### Application and pure productivity modules

| Module | Responsibility |
|---|---|
| `app.js` | DOM controller, routing, listeners, commit guard, targeted rendering |
| `src/rules.js` | Priority validation, 12-combination reward matrix, task lifecycle, totals, invariants |
| `src/storage.js` | Task schema validation, v1 migration, active v2 key, quarantine and task backups |
| `src/transfer.js` | Export envelope, strict import parsing, 1 MB limit, validation summaries |
| `src/progressionConfig.js` | Shared level, stage and milestone thresholds |
| `src/calendar.js` | Pure local-date month cells, date keys, task/date counts |
| `src/focusTimer.js` | Pure timestamp-based timer state with injectable clock |
| `src/flowers.js` | Pure deterministic decorative flower assignment |

### Persistence and world orchestration

| Module | Responsibility |
|---|---|
| `src/worldState.js` | v1/v2 world validation, migration, key dispatch, quarantine and backups |
| `src/world/decorations.js` | Acquire, place, move, remove, switch biome, sync auto-grants, active deltas |
| `src/stateCommit.js` | Two-domain preflight, writes, rollback and recovery marker replay |

### World engine

| Layer | Modules | Responsibility |
|---|---|---|
| Geometry | `coords.js`, `tiles.js`, `map.js`, `mapValidation.js`, `grid.js` | Isometric transforms, terrain definitions, deterministic sample map, structured validation, immutable grid queries |
| Composition | `scene.js`, `progression.js`, `content.js`, `contentCatalog.js`, `unlocks.js`, `biomeCatalog.js` | Draw commands, XP-derived scenery, user-delta composition, typed unlocks, biome palettes |
| Rendering | `renderer.js`, `controller.js` | Canvas 2D drawing, DPR sizing, redraw scheduling, lifecycle cleanup |
| Camera/input | `camera.js`, `cameraInput.js`, `hitTest.js`, `selectableTargets.js`, `interactionState.js`, `infoPanel.js`, `interaction.js` | Pan/zoom state, pointer semantics, target picking, immutable interaction state, detail panel |
| Adapter | `world/index.js` | Public `CQ.world.mount(...)` and namespace exposure |

### UMD convention

Each module follows this pattern:

```js
(function (root, factory) {
  const api = factory(/* Node requires or browser globals */);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CQ = root.CQ || {}).someModule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (...) {
  'use strict';
  // pure logic or stable API
  return { ... };
});
```

Browser consumers read `window.CQ.*`; Node tests can `require('../src/*.js')`. This is what allows the same source to run from `file://` and under `node:test`.

## 4. Task engine and reward ledger

The task engine is pure and lives in `src/rules.js`. `app.js` never recomputes rewards.

```text
task form
  -> rules.createTask / rules.editTask
  -> app.commitState
  -> stateCommit.commit
  -> storage.saveState (task key)
  -> render -> rules.computeTotals
```

Completion is the only reward-producing path:

```text
complete click
  -> rules.completeTask
      -> done = true
      -> append one ledger entry when rewardClaimed is false
      -> rewardClaimed = true
  -> app.commitState
  -> stateCommit.commit (both domain validation + scene preflight)
  -> render / updateWorldGrowth
```

Key properties:

- `computeTotals(state)` returns `baseline + ledger`. It is used by the dashboard header, level display and world composition.
- `countCompleted(state)` counts current tasks with `done === true`. It is a display count, not a lifetime count.
- `assertInvariants(state)` rejects duplicate ledger IDs, forged rewards, orphan claims and negative totals.
- Storage validation re-checks ledger rewards against their priority snapshots.
- Completion-based unlocks read the ledger length, not the live completed-task count.

Do not add a stored `xp`, `coins`, `completedCount`, stage or milestone claim field. These are derived values.

## 5. Reward calculation and ledger

The reward table is defined once in `src/rules.js` as `XP_MATRIX` and derived helpers:

```text
priority key = none | urgent | important | both
XP           = XP_MATRIX[tier][priorityKey]
coins        = floor(XP * 0.3)
resource     = wood 1 (<20) | wood 2 (20-34) | stone 2 (35-49) | iron 1 (>=50)
```

A ledger entry stores its `taskId`, a copy of the priority at completion time and the computed reward. It can outlive its task. Display totals and world progression are safe to recompute from this permanent record.

**Warning:** changing the matrix or formula changes historical ledgers on validation because entries must match their priority snapshots. Treat this as a schema-level change requiring tests, migration analysis and product approval, not a balancing tweak in the UI.

## 6. World-state architecture

World state v2 is an envelope of user-owned deltas:

```text
{
  schemaVersion: 2,
  worldId, baseMapId, name, createdAt, updatedAt,
  activeBiome,
  unlocks: [explicit non-derivable grants],
  ownership: { items: [user:item:*] },
  biomes: {
    meadow|forest|lakeside|autumn|snowy: {
      objects: { placed, moved, removed },
      terrain: [...]
    }
  }
}
```

Rules:

- XP, level, stage, milestone features, achievement unlocks and XP unlocks are derived, never stored.
- Only one biome is active. Switching does not delete other biome buckets.
- Catalog definition → owned instance → placement are three distinct identities. An owned instance may be placed at most once across all biomes.
- Removing a placement keeps ownership. Moving preserves ownership and placement IDs.
- Base and progression object IDs are reserved for user-created records.
- Unlocks are enforced by `decorations.acquire/place/switchBiome`; composition passes `enforceUnlocks: false` so saved placements are not revoked by reopening or deleting tasks.
- Incompatible saved placements are kept in state, skipped by composition with issues, and become visible again when a compatible biome is active.
- v1 state is migrated deterministically into the meadow bucket and the v1 key is never rewritten or deleted.
- Structural failures are quarantined under `cozyquest.invalid-world-backup.<timestamp>` and never affect task state.

## 7. Navigation and view lifecycle

There is one hash router in `app.js`:

- `hashForView(view)` maps CozyQuest to `#cozyquest` and everything else to `#dashboard`.
- `viewFromHash()` reads `#cozyquest` as the world view; any other hash is dashboard.
- `requestView()` sets the hash or applies the view directly when the hash is already correct.
- `handleRouteChange()` is the single `hashchange` listener.
- A reload always lands on the dashboard. A fresh direct `#cozyquest` load enters CozyQuest.

`enterCozyQuest()` clones the template, hides the dashboard, reveals the world view, toggles `body.is-cozyquest`, updates nav/heading state, renders stats and mounts the world with the current XP. On failure it tears everything down and returns to the dashboard with an error toast.

`leaveCozyQuest()` destroys the controller, clears the clone, reveals the dashboard, removes the body class and restores focus to the sidebar or requested dashboard widget.

Sidebar entries for My Tasks, Calendar and Focus do not create separate views; they call `focusDashboardTarget()` after routing to the dashboard.

## 8. Rendering and controller lifecycle

The world composition path is:

```text
base map / biome map
  -> progression features from derived XP
  -> active world deltas from saved state
  -> validated scene + draw commands + target index
  -> world.mount(...) or handle.setProgression(...)
  -> controller schedules one animation frame
  -> Canvas 2D renderer draws backdrop, tiles and objects
```

Lifecycle rules:

- `CQ.world.mount(canvas, options)` destroys any previous handle stored on the same canvas before mounting a new one.
- The controller owns canvas, window and pointer listeners; it exposes an idempotent `destroy()`.
- `app.js` never rebinds cloned world controls. Biome, decoration and return actions use delegated document listeners guarded by `cozyView.contains(...)`.
- Dashboard commits still compose and preflight saved world state, but they do not touch a hidden or nonexistent controller; they return a synthetic growth result instead.
- The world is updated in place with `preflightProgression()` and `setProgression()`, never remounted just because a task changed.
- If the live target index cannot be replaced, the world is rolled back before task state changes are finalized.

Render discipline in `app.js`:

- `render()` calls `renderStats()`, `renderCalendar()`, `renderTasks()`, `renderBiomeControls()` and `renderDecorationControls()`.
- Calendar selection calls only `renderCalendar()` and `renderTasks()`.
- The focus interval calls only `updateFocusUI()`; it never calls `render()` or rebuilds the task list.
- Bloom IDs are consumed by the next `renderTasks()`, so unrelated renders do not replay animations.

## 9. Persistence and recovery

Two logical domains use separate keys and are committed together only when needed:

```text
stateCommit.commit({
  current: { taskState, worldState },
  next: { taskState, worldState },
  domains: { task: true, world: false|true },
  backup: true|false
})
```

Commit phases:

1. Validate task state with `storage.validateState`.
2. Validate world state with `worldState.validateAnyState`.
3. Derive XP from task state.
4. Compose and validate the active biome scene.
5. Preflight map, target index and scene bounds.
6. Preserve previous raw key values.
7. Write optional backups (newest three per domain retained).
8. Write only requested domain keys.
9. On failure, roll back bytes written in this commit.
10. If rollback fails, write `cozyquest.commit-recovery.v1`.

Startup calls `stateCommit.recover(store)` before loading either domain. A successfully replayed marker is cleared. An unreadable or unsupported marker is reported without touching state. While `recoveryPending` is true, `app.commitState()` blocks further writes until the page is reloaded.

Load order after recovery:

```text
storage.loadState -> worldState.loadAnyState -> render -> applyView
```

Task v1 migration and world v1 migration are side-effect free until an explicit save or commit. Malformed task or world values are quarantined under timestamped prefixes instead of being overwritten.

## 10. Backup and import pipeline

Export:

```text
validated task state + optional validated world state
  -> { app, schemaVersion, exportedAt, state, world? }
  -> pretty JSON download
```

Import:

```text
file text
  -> 1 MB UTF-8 check
  -> JSON parse
  -> app/schema/timestamp checks
  -> task validation + derived summary
  -> optional world validation
  -> confirmation summary
  -> v1 world block migrated to v2 when present
  -> stateCommit.commit with backup: true
```

Rules:

- An absent `world` field means keep the current world.
- A present but invalid world block is rejected before confirmation or writes.
- The app migrates a valid v1 world block to v2 before commit so it replaces an existing v2 key.
- Pre-import writes preserve current task bytes and, when replaced, world bytes under timestamped backup keys.
- The confirmation summary reports task, completed, ledger, XP, coin and resource counts plus world inclusion.
- Imports never trust stored totals fields; all totals are recalculated from validated baseline plus ledger.

## 11. Testing architecture

All tests use Node's built-in runner:

```bash
node --test
```

There is no test framework dependency and no browser automation. The suite is organized by concern under `tests/`:

- **Pure logic:** rewards, invariants, tasks, storage, transfer, state commits, calendar, timer, flowers, unlocks, world geometry and progression.
- **Contract tests:** read `index.html`, `styles.css` and `app.js` as text to assert script order, required IDs, CSS hooks, listener counts and render-discipline constraints.
- **VM-based tests:** execute small extracted functions with injected globals to check routing, growth announcements and date handling.
- **Failure-injection tests:** use fake `localStorage`-like stores that can fail reads, writes, backups and rollbacks.
- **Determinism tests:** fixed clocks/IDs and repeated composition verify stable ordering and IDs.

When adding tests, keep them hermetic: no network, no real credentials, no live browser and no dependence on wall-clock timing beyond injected clocks.

## 12. Invariants and extension boundaries

### Non-negotiable invariants

1. XP, coins, resources, levels, stages and milestone features are derived from baseline plus ledger. No second authority.
2. Reopening, recompleting and deleting cannot reduce earned totals or revoke earned unlocks.
3. The current completed count comes from live `done` flags; completion unlocks come from the permanent ledger.
4. World state stores user deltas only, never derived progression or stored totals.
5. Classic scripts and `file://` compatibility must remain intact.
6. One hashchange listener, one focus interval, one delegated document click listener for world controls, and one owned canvas controller at a time.
7. Malformed persisted data is quarantined; a failed commit either rolls back or leaves a recovery marker.
8. Flowers are decorative only and never become currency, inventory or collection scoring.

### Safe extension pattern for a new UMD module

1. Choose a pure responsibility and avoid DOM, storage and timers where possible.
2. Use the existing UMD wrapper and export a frozen API.
3. In Node tests, `require()` the module directly and test it with injected clocks or stores.
4. In the browser, add a single classic `<script>` in `index.html` before its first consumer and never add `type="module"`.
5. Expose new world internals through `src/world/index.js` if they are part of the world namespace.
6. Add the smallest possible binding in `app.js`; prefer delegated listeners and targeted renders.
7. Update tests, README/PRD/ARCHITECTURE where behavior or structure changes.

### Where to make common changes

| Change | Start here | Also verify |
|---|---|---|
| Reward values or priority rules | `src/rules.js` | `tests/rewards.test.js`, `tests/invariants.test.js`, PRD table, ledger validation |
| Task fields or validation | `src/rules.js`, `src/storage.js` | migration, transfer, tests, docs |
| Dashboard widget | new pure module + `app.js` | script order, shell contract test, render discipline |
| Calendar or timer behavior | `src/calendar.js`, `src/focusTimer.js` | widget contract tests, app binding, no full render in ticks |
| Flower appearance/behavior | `src/flowers.js`, `app.js`, `styles.css` | deterministic tests, bloom queue, reduced motion |
| Decoration catalog or biome | `src/world/contentCatalog.js`, `src/world/biomeCatalog.js` | unlock evaluator, migration, composition, docs |
| World rendering/camera | `src/world/*` | controller cleanup, hit testing, script order |
| Persistence schema | `src/storage.js` and/or `src/worldState.js` | migration, transfer, `stateCommit`, recovery tests |
| Navigation/listeners | `app.js` | navigation lifecycle tests, duplicate-listener checks |
| Responsive styling | `styles.css` | shell contract tests, manual browser pass |

### Do not

- Add a framework, backend, bundler, package script, ES module import or required network-loaded asset to preserve the static `file://` model. The existing Google Font `@import` is optional and must stay nonessential.
- Bind listeners directly to elements cloned from the CozyQuest template.
- Add a second interval, animation loop or canvas controller.
- Store derived XP, stages, unlock availability or reward totals.
- Trust imported reward values or allow arbitrary ledger entries.
- Skip the full `node --test` run and diff review before committing.

## 13. Contributor starting point

For a new contributor or coding agent: read [README.md](README.md), then this architecture document and [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md); run `node --test`; locate the owning module in the table above; make the smallest change behind a test; verify script order and file:// compatibility; review the complete diff; then commit on the current feature branch with a focused message.

Codex environment setup, agent configuration and any `AGENTS.md` handoff are deliberately outside this documentation milestone and must be planned separately.
