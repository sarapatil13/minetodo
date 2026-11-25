# Minetodo

> Little steps, lovely worlds.

Minetodo is a local-first, browser-based productivity application for planning ordinary work, self-care and small daily wins. **CozyQuest** is an optional world experience inside Minetodo: a cozy isometric meadow that grows from the XP earned by completing real-life tasks.

The two experiences share one task engine and one reward ledger. You can use every productivity feature without ever opening CozyQuest, and you can visit the world whenever the reward loop feels motivating. Nothing about the core task list requires the world.

Phase 2.8 is complete. The baseline for this documentation milestone is `77a8227` (`fix: stabilize Phase 2.8 dashboard integration`).

## Documentation map

- [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) — product principles, requirements and implemented behavior.
- [ARCHITECTURE.md](ARCHITECTURE.md) — module boundaries, data flows, invariants and safe extension guidance.

## Product philosophy

- **Productivity first.** Minetodo works as a straightforward task manager.
- **CozyQuest is optional.** The world rewards progress; it is not a prerequisite for productivity.
- **Gentle, not punitive.** Missed or reopened tasks never take away earned rewards.
- **Permanent progress.** Rewards belong to completion events, not to the current task record.
- **Local-first and private.** Data stays in the current browser profile; there is no account or sync requirement.
- **Small surface area.** Vanilla HTML, CSS and JavaScript run from `index.html` with no build step or backend.

## What is implemented

### Minetodo productivity app

- A **dashboard** as the default landing view, with a welcome section, today's scheduled-task progress, a lifetime completed-step count, XP/points, level progress and resource totals.
- **Sidebar navigation** with Dashboard, My Tasks, Calendar, Focus and CozyQuest entries. Dashboard, My Tasks, Calendar and Focus are focus targets inside the dashboard view; CozyQuest swaps to the world view.
- **Task management:** add, edit, complete, reopen and delete tasks, with All / To do / Completed filters.
- **Task types:** Quick task, Daily habit, Recurring task, Project and Self-care. These are descriptive labels only; automatic recurrence is **not** implemented.
- **Priority** has three independent parts: a Low / Medium / High effort tier, an Urgent flag and an Important flag. Together they select one of 12 fixed reward outcomes.
- **Optional local dates** in `YYYY-MM-DD` form, used by the calendar and daily progress display.
- **A monthly calendar** with previous/next navigation, today and task-date markers, date filtering, a clear-filter control and quick add using the shared task dialog.
- **A focus timer** with a 25-minute Pomodoro preset, custom durations, start/pause/resume/reset, a progress indicator and in-widget completion feedback.
- **Flower appreciation:** one deterministic decorative flower beside each completed task title, with a one-time bloom on completion.
- **Backup and restore:** JSON export/import with validation, confirmation summaries and timestamped local backup keys.
- Responsive layouts and accessible controls for desktop, tablet, mobile and narrow-mobile widths.

### Optional CozyQuest world experience

- A Canvas 2D isometric meadow with terrain, trees, flowers, a pond, a house and progression scenery.
- Panning, pointer-centred wheel/pinch zoom, keyboard zoom/reset, and read-only inspection of objects and pond tiles.
- Four XP-derived world stages, two intermediate milestones and six cosmetic level thresholds.
- Five biomes: Meadow Haven, Whispering Forest, Lakeside Rest, Amber Hollow and Snowy Village.
- A seven-item decoration catalog with typed unlock requirements, independently owned item instances and per-biome placement state.
- Acquire, place, move, remove and switch-biome controls, plus a reset for saved world changes.
- Shared progression: the world reads XP from the same task ledger as the dashboard. No second XP counter exists.
- World-state v2 with legacy v1 migration, validated local persistence, quarantine of malformed data, export/import and rollback-safe commits.
- A distinct in-app CozyQuest view with an introduction, a progression summary and a clear **Back to Minetodo Dashboard** control.

## Visual documentation

There are no committed screenshot or image assets in this repository. The interface is generated from `index.html`, `styles.css` and the Canvas 2D world renderer, so a screenshot can be captured from a local run when one is needed. No image paths are referenced here to avoid broken links.

## Run locally

### Requirements

- A modern browser with Canvas, `localStorage` and `<dialog>` support.
- Node.js for tests, using a release that provides `node:test` and `structuredClone` (Node 18+ recommended).

No package installation, backend, account, framework or build step is required. There is no `package.json` and no npm scripts.

### Open the app

```bash
git clone https://github.com/sarapatil13/minetodo.git
cd minetodo
```

Open `index.html` directly in a browser (`file://`) or serve the folder with any static file server and open the same page over `http://`. All scripts are classic relative-path scripts, so the app is designed to work from `file://`. The optional Google Font in `styles.css` falls back to system sans-serif when offline.

`localStorage` is scoped to the current browser profile and, for `file://` pages, browser behaviour can vary. If a browser blocks local storage on file URLs, use a static server instead.

Progress is not synced between devices or browser profiles.

## Reward model

The authority for all rewards is `src/rules.js`. Coins are `floor(XP * 0.3)`. Resources use XP bands: `<20` → 1 wood, `20–34` → 2 wood, `35–49` → 2 stone, `>=50` → 1 iron.

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

These are prototype values for usability testing, not final game balance. Legacy `critical` priority migrates to High + Urgent + Important and therefore maps to the 50 XP row.

### Permanent reward invariant

- Completing a task adds exactly one ledger entry and marks the task's reward as claimed.
- Reopening does not reverse the reward or clear the claim.
- Completing a reopened task does not pay again.
- Deleting a completed task removes the task but keeps its ledger entry.
- Displayed XP, coins and resources are always `baseline + permanent ledger entries`.
- The displayed completed-task count comes from tasks that currently have `done === true`; it is not a lifetime reward counter.
- Completion-based unlocks use the permanent ledger, so reopening or deleting a completed task cannot revoke them.
- Priority cannot be edited while a task is completed; reopen it first.

Flowers never change this economy. They carry no XP, coins, resources, inventory value or collection score.

## Data, persistence and recovery

All data is stored in browser `localStorage`. Writes are validated before they happen, and malformed data is quarantined rather than silently overwritten.

| Key | Responsibility |
|---|---|
| `cozyquest.mvp.v1` | Original legacy task data. Migrated once, then left untouched. |
| `cozyquest.task-engine.v2` | Active task state: `schemaVersion`, `baseline`, `tasks`, `ledger`. |
| `cozyquest.invalid-backup.<timestamp>` | Quarantined malformed task state. |
| `cozyquest.backup.<timestamp>` | Automatic pre-import task backups, newest three kept. |
| `cozyquest.world-state.v1` | Legacy world deltas. Preserved for migration; no longer written. |
| `cozyquest.world-state.v2` | Active world envelope: ownership, explicit grants, active biome and per-biome deltas. |
| `cozyquest.invalid-world-backup.<timestamp>` | Quarantined malformed world state. |
| `cozyquest.world-backup.<timestamp>` | Automatic pre-import / pre-reset world backups, newest three kept. |
| `cozyquest.commit-recovery.v1` | Durable marker used when a two-domain rollback cannot finish. |

Task migration moves known completed-task rewards into the ledger and subtracts them from old totals to form the baseline, so displayed numbers do not change. World v1 migration maps legacy placements into owned instances and meadow placements with stable derived IDs; the v1 key is never rewritten or deleted.

World state stores **deltas only**. XP, level, stage, milestone features, unlock availability from XP or achievements, coins and resources are derived from task state and are never stored as world progression fields. Occupied-cell collisions are detected later by `CQ.world.content.compose()` and `CQ.world.decorations.place()`, which skip the conflicting placement and report an issue.

### Export and import

Use **Export** and **Import** above the task list.

- Export downloads `cozyquest-backup-YYYY-MM-DD.json` containing the app name, schema version, timestamp, v2 task state and, when available, the current world state.
- Import validates the whole file before showing a confirmation with task, completed, ledger and derived-total counts, plus whether world changes are included.
- Files are capped at 1 MB. Foreign envelopes, unsupported versions, malformed JSON, forged ledger rewards and invalid explicit world blocks are rejected before confirmation or writes.
- An absent `world` block restores tasks and keeps the current world. A valid v1 world block is migrated to v2 before the commit so it replaces the saved world as intended.
- Before applying an accepted import, current task state and any replaced world state are saved under their timestamped backup keys.

`localStorage` has no cross-key transaction. `CQ.stateCommit.commit()` validates both domains, composes and preflights the world scene, preserves previous raw values, writes optional backups and only then writes the requested keys. A failed write rolls back the bytes it changed. If rollback also fails, a recovery marker is written and replayed on the next page load; further commits are blocked until that reload happens.

## Project structure

```text
index.html                    UI shell, dashboard widgets, world template, classic script order
app.js                        UI bootstrap, routing, event handlers, commit guard, rendering
styles.css                    layout, theme, responsive breakpoints, reduced-motion rules
README.md                     product and developer entry point
PRODUCT_REQUIREMENTS.md        implemented product requirements and history
ARCHITECTURE.md                module boundaries, data flows, invariants, extension guidance

src/rules.js                  pure priority, reward and task lifecycle rules
src/storage.js                task validation, v1 migration, task storage helpers
src/transfer.js               JSON backup envelope and strict import parsing
src/progressionConfig.js      shared cosmetic level, stage and milestone thresholds
src/worldState.js             v1/v2 world validation, migration, storage, quarantine, backups
src/world/decorations.js      ownership, placement, movement, removal, biome switching
src/stateCommit.js            validated two-domain commits, rollback and recovery
src/calendar.js               pure local-month generation and task/date mapping
src/focusTimer.js             pure timestamp-based Pomodoro/custom timer state
src/flowers.js                pure deterministic decorative flower assignment

src/world/coords.js           grid/screen transforms, tile picking and scene bounds
src/world/tiles.js            canonical terrain definitions, aliases, variant helper
src/world/map.js              deterministic sample meadow data
src/world/mapValidation.js    structured map validation
src/world/grid.js             immutable grid queries and updates
src/world/scene.js            draw-command composition and deterministic depth sorting
src/world/renderer.js         procedural Canvas 2D drawing primitives
src/world/progression.js      pure XP derivation and world composition
src/world/camera.js           camera state, viewport transforms, pan and zoom
src/world/cameraInput.js      canvas pointer/wheel/keyboard input owner
src/world/hitTest.js          renderer-derived hit shapes and target picking
src/world/selectableTargets.js stable object and pond target index
src/world/interactionState.js immutable hover, selection, focus and pointer state
src/world/infoPanel.js        DOM-only detail panel updates
src/world/interaction.js      tap, hover, keyboard and selection lifecycle
src/world/controller.js       DPR-aware sizing, scheduling, lifecycle and cleanup
src/world/contentCatalog.js   frozen catalog of unlockable decorations
src/world/unlocks.js          typed, side-effect-free unlock requirement evaluator
src/world/biomeCatalog.js     biome definitions, palettes and deterministic base maps
src/world/content.js          pure composition of progression and saved deltas
src/world/index.js            public `CQ.world.mount(...)` adapter and module exposure

tests/*.test.js               dependency-free `node:test` suites
```

Modules in `src/` use a small UMD wrapper: browsers get namespaced globals such as `window.CQ.rules` and `window.CQ.world`, while Node `require()` loads the same files directly for tests. No ES modules, framework or bundler is involved. `styles.css` includes one optional Google Font `@import`; it falls back to system sans-serif offline, and no script or data requires the network.

## Testing

Run the full suite from the repository root:

```bash
node --test
```

The suite is hermetic: no network calls, real browser automation or credentials are required. It covers the reward matrix and invariants, task lifecycle and migration, storage quarantine and backup pruning, export/import rejection cases, script order and shell contracts, calendar dates, timer transitions, flower determinism and bloom behavior, world geometry and rendering, camera and pointer semantics, interaction lifecycle, progression, world-state validation, two-domain commits and recovery, unlocks, biomes and decorations. See [ARCHITECTURE.md](ARCHITECTURE.md) for how the tests are organized.

Browser checks remain manual. A useful regression pass covers:

1. Add, edit, complete, reopen and delete a task; reload and confirm totals and ledger behavior.
2. Switch filters, navigate months, select/clear a date and quick-add a dated task.
3. Start, pause, resume, reset and complete a focus timer; confirm no reward is awarded.
4. Enter and leave CozyQuest several times; check pan/zoom/inspection, biome switching, decoration actions and reset.
5. Export, import and intentionally reject a malformed backup.
6. Check desktop, tablet and narrow-mobile widths, keyboard focus and reduced-motion behavior.

## Developer notes

- Add new logic as a pure UMD module when possible, load it in `index.html` before its consumers, and add a `node:test` suite under `tests/`.
- Keep `file://` compatibility: no ES modules, `fetch()`-loaded assets, bare imports or build-only syntax. Guard optional browser APIs such as `crypto.randomUUID` and `localStorage`.
- Bind shell listeners once at startup. World-template controls use delegated document listeners because the template is cloned on each entry; never bind directly to cloned nodes.
- Always call `worldHandle.destroy()` when leaving CozyQuest and rely on `CQ.world.mount(...)` to replace an existing canvas handle. Do not create extra intervals or duplicate canvas listeners.
- Keep reward calculations in `src/rules.js` and derive totals from baseline plus ledger. Do not add a second XP counter or stored totals field.
- Prefer targeted renders: the timer tick only updates focus DOM, and calendar selection updates the calendar and task list. Avoid full `render()` calls in hot paths.
- Test persistence changes with a fake `localStorage`-like store that can fail reads/writes; cover quarantine, backup pruning, rollback and recovery replay.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing task schema, rewards, world state, navigation or rendering.

### Where to start

A new contributor or coding agent should: read this README, then [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md), then [ARCHITECTURE.md](ARCHITECTURE.md); run `node --test`; make the smallest change inside one module boundary; add or update tests; and review the full diff before committing.

## Scope boundary

Implemented in Phase 2.8: the productivity dashboard, sidebar navigation, calendar and focus widgets, flower appreciation, CozyQuest visual identity, responsive polish and the integration stabilizations through `77a8227`.

Not implemented: accounts, cloud sync, friend visits or collaborative worlds, voice input, automatic recurring-task generation, recurrence-aware calendar entries, AI suggestions, analytics, mood/journal/breathing/self-care workflows, companion interactions, a shop/spending economy, crafting, object rotation, a full map editor, real-time 3D movement, flower inventory/collection scoring or competitive mechanics. These are possible later stages, not current features.

## Git workflow

Work on one feature branch at a time, run `node --test`, inspect the complete diff and keep commits focused. Do not commit credentials, real personal task data or generated browser state. Keep `main` stable, use meaningful commit messages, and review changes before merging or tagging a milestone. Do not rewrite shared history after a branch has been pushed.
