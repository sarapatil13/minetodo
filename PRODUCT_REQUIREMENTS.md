# Minetodo and CozyQuest — Product Requirements Document

**Status:** Living PRD — Phase 2.8 implemented and documented; baseline `77a8227`
**Product direction:** Cozy, game-inspired productivity and self-care companion
**Platform:** Responsive, local-first web app; no backend required

This document describes the product as implemented, not a future roadmap. See [README.md](README.md) for the quick start and [ARCHITECTURE.md](ARCHITECTURE.md) for module-level implementation guidance.

## 1. Product vision and problem

Help people make progress on everyday responsibilities and self-care through a gentle loop: complete a real-life action, earn XP/coins/resources, and gradually grow a cozy isometric world.

The initial user is someone who wants one place to manage tasks, routines, focus and self-care, but finds conventional productivity tools emotionally flat or punitive. The product should make progress visible and rewarding without shaming users for missed tasks.

This remains a product hypothesis. It should be validated with conversations about real recent behavior, not assumed from the feature list.

## 2. Product principles

- **Productivity first.** Minetodo is a usable task manager on its own; CozyQuest is an optional reward layer.
- **One shared engine.** Tasks, rewards, XP, unlocks and the world read from the same authoritative state. No second XP counter exists.
- **Local-first and private.** Data lives in the current browser profile. There is no account, backend or cloud sync requirement.
- **Cozy and encouraging.** Missed, reopened or deleted tasks never remove rewards already earned.
- **Permanent completion rewards.** A reward belongs to a completion event, not to the live task record.
- **Responsive and accessible.** Controls work across desktop, tablet, mobile and narrow-mobile widths, with visible focus, labels, live regions and reduced-motion handling.
- **Small dependency surface.** The core experience needs no external AI service, backend, framework, package manager or build step.
- **Explainable progression.** XP, levels, stages, milestones and unlock requirements are derived from task state and documented thresholds.

## 3. Implemented product scope

### Minetodo

- Dashboard as the default landing view with welcome copy, daily scheduled-task progress, lifetime completed-step count, XP/points, level progress, coins and resources.
- Sidebar navigation for Dashboard, My Tasks, Calendar, Focus and CozyQuest. The first four focus or scroll dashboard widgets; only CozyQuest is a separate view.
- Create, view, edit, complete, reopen and delete tasks.
- Task types: Quick task, Daily habit, Recurring task, Project and Self-care.
- Priority: Low / Medium / High effort tier plus independent Urgent and Important flags.
- All / To do / Completed filters, with optional calendar-date filtering.
- Monthly task calendar with month navigation, today and task-date markers, quick add and a clear-filter control.
- Pomodoro and custom focus timers with in-widget feedback.
- Decorative flowers beside completed task titles.
- JSON export/import, local backup keys and recovery handling.

### Optional CozyQuest

- Canvas 2D isometric meadow with camera pan/zoom and read-only object/pond inspection.
- Four world stages, two intermediate milestones and a six-step cosmetic level ladder.
- Five biomes and a seven-item decoration catalog with typed unlock requirements.
- Independently owned item instances, per-biome placement state, move/remove/switch controls and a reset for saved world changes.
- Shared XP and progression derived from the task ledger.
- World-state v2, legacy v1 migration, validation, quarantine, export/import and rollback-safe commits.
- Distinct in-app CozyQuest view with introduction, shared-progress summary and a clear return to Minetodo.

### Explicitly not implemented

Accounts, cloud sync, friend visits or collaborative worlds, voice input, automatic recurrence, AI suggestions, analytics, mood/journal/breathing/self-care workflows, companion interactions, shop/spending economy, crafting, object rotation, full map editor, real-time 3D movement, flower inventory/collection scoring and competitive mechanics.

Task types named **Daily habit** and **Recurring task** are labels only. No automatic recurrence engine or recurring calendar generation exists.

## 4. Dashboard and navigation

- The dashboard is always present in the DOM and is the default view on startup and reload.
- Sidebar entries for My Tasks, Calendar and Focus scroll to and focus their dashboard widgets; they do not create separate routes.
- CozyQuest has a single hash route, `#cozyquest`. All other hashes map to the dashboard. A fresh direct `#cozyquest` load enters CozyQuest; a reload lands on the dashboard.
- Entering CozyQuest clones the inert world template into the live view, toggles a single `body.is-cozyquest` class, updates the page heading/navigation state and mounts the canvas controller.
- Leaving CozyQuest destroys the world handle, clears the cloned markup, removes the body class and restores dashboard focus.
- The return button and cloned world controls are handled by delegated document listeners, so repeated mounts never duplicate bindings.

## 5. Task engine

### Task schema constraints

A valid task has:

- a non-empty string `id`;
- a trimmed `title` between 1 and 90 characters;
- a `type` from `Quick task`, `Daily habit`, `Recurring task`, `Project`, `Self-care`;
- a valid `priority` object with `tier` in `low` / `medium` / `high` and boolean `urgent` and `important` fields;
- an optional `date` string in calendar-valid `YYYY-MM-DD` form, or an empty string;
- boolean `done` and `rewardClaimed` flags;
- a parseable `createdAt` timestamp string.

Invalid dates, titles, priorities, types and flags are rejected by creation/edit paths and by storage validation. Malformed stored records are skipped with reported issues; structurally invalid task state is quarantined.

### Lifecycle behavior

- Creating a task sets `done: false` and `rewardClaimed: false`.
- Completing an open task sets `done: true`, adds one ledger entry when the reward has not been claimed, and sets `rewardClaimed: true`.
- Reopening sets `done: false` and leaves the ledger entry and claim intact.
- Recompleting a reopened task changes `done` back to `true` but adds no second ledger entry.
- Deleting a task removes only the task record. Ledger entries for completed tasks remain.
- Priority is locked while a task is completed. Title, type and date remain editable.
- The displayed completed-task count is `rules.countCompleted(state)`: the number of current tasks with `done === true`. It is intentionally different from the lifetime ledger count.

## 6. Reward system

`src/rules.js` is the sole reward authority. Coins are `floor(XP * 0.3)`. Resource rewards use XP bands: `<20` → 1 wood, `20–34` → 2 wood, `35–49` → 2 stone, `>=50` → 1 iron.

| Tier | Flags | XP | Coins | Resource reward |
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

These are placeholder values for usability testing. Future balancing should consider task size, frequency and abuse cases. Urgency and importance remain independent from effort.

Legacy `critical` priority migrates to High + Urgent + Important, preserving the old 50 XP outcome.

### Permanent-reward invariant

- Displayed XP, coins and resources are always `baseline + ledger entries`.
- Completing a task appends exactly one ledger entry with a priority snapshot and validated reward.
- Reopening does not reverse rewards or clear `rewardClaimed`.
- Recompletion does not pay twice.
- Deleting a completed task keeps the ledger entry and all derived totals.
- Storage validation rejects ledger rewards that do not match their priority snapshot.
- Completion-based unlocks use the permanent ledger count, not the current completed-task count. Reopening or deleting a completed task therefore cannot revoke a decoration or biome unlock.
- Level, world stage and milestone features are derived from lifetime XP and are never stored as progression fields.

Flowers are decorative only and never enter the reward calculation.

## 7. Flower appreciation

- `CQ.flowers` has eight frozen varieties: Cherry blossom, Hibiscus, Sunflower, Tulip, Daisy, Rose, Lotus and Rosette.
- Variety selection is a deterministic FNV-1a hash of the trimmed stable task ID. Filtering, reordering, reloads, reopening and recompletion keep the same flower.
- Missing, empty or non-string IDs receive no flower. Lookup never mutates the task or the returned variety.
- Completed tasks show one small flower beside the title. The span is `aria-hidden`; the existing check button retains its completion label.
- A bloom animation is queued only when a task actually moves from incomplete to complete and is consumed by the next task-list render. Reloads, unrelated renders, calendar selection, navigation and timer ticks do not replay it.
- Reduced motion is respected by CSS and by a JavaScript preference check that omits the bloom class.
- Flowers carry no XP, coins, resources, inventory value, collection score, rewards or storage state. They must never be described as collectibles or currency.

## 8. Calendar

- `CQ.calendar` is pure and uses local calendar components, not UTC conversion.
- It builds a Sunday-first month grid with neighbouring-month padding, a local today marker and task counts derived from `task.date`.
- Undated tasks are never mapped to a calendar day.
- Selecting a date filters the task list by that exact local date and composes with the existing All / To do / Completed filter. Clearing the date restores the full list.
- Selecting a neighbouring-month date moves the visible month to that date.
- Quick add opens the shared task dialog with the selected date, or today's local date when nothing is selected. All validation and creation still flow through the single task-form path.
- Dates must be calendar-valid `YYYY-MM-DD` strings; impossible dates are rejected.
- Automatic recurrence generation and recurring calendar entries are not implemented.

## 9. Focus timer

- `CQ.focusTimer` is pure and accepts an injectable clock for deterministic tests.
- The preset is 25 minutes; custom durations are clamped to 1–1440 minutes.
- Supported controls: start, pause, resume, reset and custom duration setting.
- Remaining time is calculated from a target timestamp, so delayed or skipped ticks do not drift.
- The app owns one 250 ms interval. It updates timer DOM only and is cleared on pause, reset, completion and `pagehide`; `pageshow` resynchronizes the UI from the timer model.
- Timer state is memory-only. Completion feedback stays in the widget and awards no XP, coins, resources or rewards.

## 10. CozyQuest

### World structure

- World state v2 is the active envelope: world identity, `activeBiome`, explicit non-derivable `unlocks`, `ownership.items` and one delta bucket per biome.
- Deltas contain placed, moved and removed objects plus terrain patches. They never contain XP, stage, milestone claim, derived unlock availability or reward values.
- Derived progression produces a base scene from XP; saved user deltas are applied second. `CQ.world.content.compose()` validates the resulting map, preserves scene bounds and reports skipped conflicts.
- `CQ.world.unlocks` evaluates closed, typed requirement objects (`always`, `xp`, `completed-tasks`, `ledger-entries`, `achievement`, `grant`, `event`, `purchase`, `all`, `any`). Unknown or malformed definitions are rejected rather than interpreted.
- XP comes from `rules.computeTotals(state).xp`; completion counts used for unlocks come from the ledger; non-derivable grants come from world state.

### Progression and content

Cosmetic levels are `Seedling` 0, `Sprout` 100, `Sapling` 250, `Bloom` 500, `Grove Keeper` 900 and `Forest Guardian` 1400.

World stages are Starting Meadow (0), Growing Meadow (100), Developed Village (500) and Thriving Village (1400), with intermediate accents at 250 and 900 XP. All features are monotonic and derived; a lower imported XP total can legitimately lower the derived stage.

The seven decoration catalog entries are Daisy Cluster (100 XP), Lavender Bush (250 XP), Little Oak (500 XP), Cattail Reeds (900 XP), Picket Fence (1400 XP), Cottage Accent (10 lifetime completion rewards) and Snowdrop Cluster (20 lifetime reward entries). Every entry has `autoGrant: false`: unlocking grants availability only, never ownership.

The five biomes are Meadow Haven (always), Whispering Forest (10 lifetime completion rewards), Lakeside Rest (500 XP), Amber Hollow (900 XP) and Snowy Village (20 lifetime reward entries). Each biome reuses the meadow object layout with deterministic terrain presets and palettes, preserving grid dimensions and scene bounds.

### Ownership and placement

- A catalog definition is distinct from an owned instance (`user:item:*`) and a placement instance (`user:placement:*`).
- An owned instance can be placed at most once across all biomes. Moving preserves both IDs; removing deletes only the placement and preserves ownership.
- Unlocks are enforced when acquiring, placing or switching biomes. Composition uses `enforceUnlocks: false` so reopening or deleting tasks cannot reverse an earned unlock or owned decoration.
- Switching biomes changes only `activeBiome`; other biomes' deltas remain intact. Incompatible saved placements are retained but skipped with issues until a compatible biome is active.
- **Reset world changes** clears saved deltas and explicit grants after confirmation. It does not change tasks, XP, levels, stages or earned unlock availability.

### Legacy migration

A valid v1 world delta is deterministically migrated into the v2 meadow bucket: legacy placements become owned instances plus placements with stable derived IDs, while moves, removals, terrain, names, timestamps, salts and references are preserved. Migration is side-effect free until an explicit save or commit, and the v1 key is never rewritten or deleted.

## 11. Persistence, backup and recovery

| Key | Responsibility |
|---|---|
| `cozyquest.mvp.v1` | Original task data; migrated and preserved untouched. |
| `cozyquest.task-engine.v2` | Active task state with `schemaVersion`, `baseline`, `tasks`, `ledger`. |
| `cozyquest.invalid-backup.<timestamp>` | Quarantine for malformed task data. |
| `cozyquest.backup.<timestamp>` | Timestamped task backups before accepted imports; newest three kept. |
| `cozyquest.world-state.v1` | Legacy world deltas; preserved untouched. |
| `cozyquest.world-state.v2` | Active world state v2 envelope. |
| `cozyquest.invalid-world-backup.<timestamp>` | Quarantine for malformed world data; never affects task state. |
| `cozyquest.world-backup.<timestamp>` | Timestamped world backups before accepted imports and world resets; newest three kept. |
| `cozyquest.commit-recovery.v1` | Durable marker replayed at startup when rollback could not complete. |

Task v1 migration moves known completed-task rewards into the ledger and subtracts them from old totals to form the baseline, preserving displayed totals. The completed count is recalculated from current tasks.

Export produces a JSON envelope with app name, schema version, timestamp, task state and optional world state. Import is capped at 1 MB and validates JSON shape, app identity, schema version, timestamp, task state and any explicit world block before confirmation. A v1 world block is migrated to v2 before commit so it replaces the saved world correctly. An absent world block means "keep the current world", not "reset the world".

`localStorage` lacks cross-key atomicity. `CQ.stateCommit.commit()` validates task and world state, derives XP, composes and preflights the scene, preserves previous raw values, writes optional backups, then writes only the requested domain keys. A failed write rolls back the bytes already written. If rollback fails, a recovery marker is saved, replayed before domain loads on the next startup, and further commits are blocked until that reload occurs.

No credentials or sensitive personal data belong in source control. Browser-local task data should not be committed.

## 12. Quality and testing

Run the complete hermetic suite from the repository root:

```bash
node --test
```

Automated coverage includes the 12-combination reward matrix, formulas, invariant and stress cases, task lifecycle, date validation, migration, storage validation and quarantine, backup pruning, export/import rejection, script order and shell contracts, calendar generation, timer lifecycle, flower determinism and bloom contracts, world geometry and rendering, camera and interaction semantics, progression, world-state validation, two-domain commits and recovery, unlocks, biomes and decorations.

Browser regression is manual: task CRUD and reload, filters, calendar and quick add, focus lifecycle, repeated CozyQuest entry/exit, canvas controls, decoration actions, reset, export/import, responsive widths, keyboard focus and reduced motion.

## 13. Historical implementation decisions

These decisions remain in force unless explicitly revised:

- **Phase 2.1:** the Canvas meadow is an isometric grid with a single painter-order queue; rendering is independent of tasks and rewards.
- **Phase 2.2:** canonical terrain definitions and aliases resolve queries without rewriting stored raw IDs; grid operations are immutable.
- **Phase 2.3:** camera focus is stored in scene-space coordinates so zoom survives resize; one input handle owns listeners.
- **Phase 2.4:** object/pond inspection is read-only and uses renderer-derived hit shapes with deterministic painter-order tie-breaks.
- **Phase 2.5:** XP-derived stages and milestones are recomputed from the ledger; no stage or claim is persisted.
- **Phase 2.6:** only user-owned world deltas are persisted; two-domain commits preflight and roll back, with a durable recovery marker when rollback fails.
- **Phase 2.7:** world state v2 separates catalog definitions, owned instances and placements; unlock descriptors are typed and never evaluated as strings.
- **Phase 2.8:** the dashboard became the default workspace; calendar, focus and flower modules are pure UMD modules; CozyQuest gained a shared-shell identity; responsive polish covered laptop through narrow mobile; the stabilization commit tightened date validation, growth announcements, focus restoration, world-import migration and recovery gating.

## 14. Acceptance criteria

1. A user can add, edit, complete, reopen and delete a task, and valid changes survive reload.
2. Every priority combination awards the documented XP, coins and resource exactly once.
3. Reopening, recompleting and deleting never reduce lifetime totals or revoke unlocks.
4. Calendar dates are calendar-valid; undated tasks stay unscheduled and no recurrence is generated.
5. Focus sessions stay in memory and award no rewards.
6. Flowers are stable, decorative and reduced-motion safe.
7. CozyQuest uses the dashboard's XP, preserves per-biome deltas, and returns cleanly to the dashboard.
8. Malformed localStorage data is quarantined without corrupting the other domain.
9. Exports/imports validate before writing and keep pre-existing backups limited to three per domain.
10. `node --test` passes after any change.

## 15. Roadmap and open decisions

These are later stages, not commitments in the current product:

- Validate the task/reward loop with real users and improve confusing interactions.
- Add an in-app migration report and an undo/history view.
- Add optional self-care flows around the implemented calendar, focus and appreciation features.
- Extend the world with movement, a fuller editor, crafting or new unlock tiers only after the core loop is validated.
- Define account, privacy and permission rules before any sharing or cloud sync.
- Explore analytics or explainable AI suggestions only with consent-aware data handling.

Open decisions include the future companion, voice-input provider, native mobile client, social permissions and whether to enlarge the fixed biome/catalog sets.

## 16. Git discipline for contributors

Work on one focused branch at a time, run the test suite, inspect the full diff and keep commits meaningful. Keep `main` stable, tag verified milestones, and avoid secrets, credentials or real personal task data in commits. Review before merging, and do not rewrite shared history after a push. See [ARCHITECTURE.md](ARCHITECTURE.md) for safe extension boundaries and [README.md](README.md) for commands.
