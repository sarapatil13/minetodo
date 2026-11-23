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
- A cozy isometric-inspired meadow scene.
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
index.html          UI and classic script load order
app.js              UI bootstrap and event handlers
styles.css          layout and theme
src/rules.js        pure priority, reward, and task lifecycle rules
src/storage.js      validation, migration, and localStorage helpers
src/transfer.js     export/import envelope and strict parsing
tests/*.test.js     dependency-free node:test suites
```

The modules in `src/` are UMD-style: browsers get `window.CQ`, while Node `require()` can load them directly for tests.

## Tests

Run the complete automated suite from this directory:

```bash
node --test
```

The suite covers the 12-combination matrix, coin/resource formulas, complete/reopen/recomplete cycles, permanent rewards after deletion, priority locking, v1 migration, storage validation/quarantine/backup pruning, and import/export rejection cases.

## MVP boundary

This slice intentionally does not include login, cloud sync, friend visits, shared worlds, AI suggestions, analytics, a focus timer, breathing exercises, journal entries, real crafting, real-time 3D movement, recurrence, or calendar scheduling. Those should be added in stages after the core task loop has been tested.

## Suggested next stages

1. Validate the task/reward loop with real users and improve confusing interactions.
2. Add an in-app migration report and an undo/history view.
3. Add focus timer and self-care flows.
4. Add an actual isometric tile map, placement, crafting, and unlocks.
5. Add accounts, privacy rules, friend permissions, and cloud sync only when sharing is ready.
6. Add analytics and AI suggestions using consent-aware, explainable data.

## Git workflow

Work on one feature branch at a time, test it, inspect the diff, and merge only when the old task flows still work. Keep `main` and release tags stable. Never commit `.env`, credentials, or real personal task data. Use meaningful commit messages and tag stable milestones (for example `v0.1.0`).
