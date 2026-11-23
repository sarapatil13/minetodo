# minetodo

# CozyQuest MVP

A local-first, browser-based prototype for a cozy productivity + self-care app with an isometric voxel-inspired home world.

## Run it

1. Download and unzip this folder.
2. Open `index.html` in a modern browser.
3. Add tasks, choose a priority, and complete them to earn XP, coins, and crafting resources.

No backend, account, or build step is required. Progress is saved in this browser using `localStorage`.

## What's implemented

- Add, edit, delete, complete, and reopen tasks.
- Task types: quick task, daily habit, recurring task, project, self-care.
- Priorities: low, medium, high, urgent + important.
- Priority-based XP, coins, and resources.
- XP levels and a basic resource inventory.
- All / To do / Completed filters.
- A cozy isometric-inspired meadow scene.
- Local persistence on the current browser/device.
- Gentle approach: no missed-task penalties.

## Current reward rules (prototype values)

| Priority | XP | Coins | Resource |
|---|---:|---:|---|
| Low | 10 | 3 | 1 wood |
| Medium | 20 | 6 | 2 wood |
| High | 35 | 10 | 2 stone |
| Urgent + important | 50 | 15 | 1 iron |

These are starting values for usability testing, not final game balance. Reopening a completed task reverses its prototype reward so the same task cannot be repeatedly farmed.

## MVP boundary

This first slice intentionally does not include login, cloud sync, friend visits, shared worlds, AI suggestions, analytics, a focus timer, breathing exercises, journal entries, crafting, or real-time 3D movement. Those should be added in stages after the core task loop has been tested.

## Suggested next stages

1. Validate the task/reward loop with a few real users and improve confusing interactions.
2. Add undo/history and recurring-task behaviour; test persistence and edge cases.
3. Add focus timer and self-care flows.
4. Add an actual isometric tile map, placement, inventory, crafting, and unlocks.
5. Add accounts, privacy rules, friend permissions, and cloud sync only when sharing is ready.
6. Add analytics and AI suggestions using consent-aware, explainable data.

## Git workflow

Start with a clean initial commit. Work on one feature branch at a time, test it, inspect the diff, and merge only when the old task flows still work. Never commit `.env`, credentials, or real personal task data. Use meaningful commit messages and tag a stable milestone (for example `v0.1.0`).
