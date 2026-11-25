# CozyQuest — Product Requirements Document

**Status:** Living PRD — MVP definition plus the implemented Phase 2.7 world-content slice  
**Product direction:** Cozy, game-inspired productivity and self-care companion  
**Initial platform:** Responsive web app, local-first  

## 1. Product vision

Help people make progress on everyday responsibilities and self-care through a gentle, rewarding loop: complete real-life actions, earn XP/coins/resources, and gradually grow a cozy isometric voxel world.

## 2. Target user and problem

Initial target: an individual who wants one place to manage tasks, routines, focus, and self-care, but finds conventional productivity tools emotionally flat or overly punitive. The product should make progress visible and rewarding without shaming users for missed tasks.

This is a product hypothesis. Module 1's design-thinking approach calls for testing it through conversations about real recent behaviour, not assuming that the feature list proves demand.

## 3. Product principles

- Cozy and encouraging; no punishment for missed tasks.
- Private by default; sharing is an explicit later choice.
- Finish a small useful version before expanding scope.
- Rewards should reinforce meaningful effort, not encourage repetitive reward farming.
- AI suggestions must be explainable and leave decisions with the user.
- Local-first for the first version; be clear that browser-local data is device/browser specific.

## 4. Confirmed product decisions

| Area | Requirement |
|---|---|
| World style | Cozy |
| World view | 2D isometric voxel-inspired |
| Building | Both free placement and unlockable/prebuilt structures |
| Task types | Quick, daily, recurring, projects, calendar, self-care |
| Priority | Simple levels plus urgent/important distinction |
| Input | Manual and voice (voice deferred from first MVP) |
| Focus timer | Pomodoro and custom (later phase) |
| Rewards | XP, levels, coins, resources, achievements, items, biomes |
| Reward rule | Every completed task earns both coins and resources; quantity/rarity varies by priority. Rewards are permanent: reopening or deleting a task never reverses them, and recompleting never pays twice. |
| Missed tasks | Gentle handling; no loss of earned rewards |
| Self-care | Mood, journal, habits, breathing, reflection |
| Companion | Yes |
| Social | Friends can visit; shared/collaborative world rules to be defined later |
| Storage | Local-first initially |
| Additional | Analytics, themes, AI suggestions |

## 5. MVP scope — first finished useful version

### Must have
- Create, view, edit, delete, complete, and reopen tasks.
- Task title, type, due date, and priority.
- All / To do / Completed views.
- Persist tasks and progress locally across browser reloads.
- Award XP, coins, and a resource for each completed task.
- Priority affects XP, coin quantity, and resource type/rarity.
- Show level progress and resource inventory.
- Gentle empty states and clear feedback.
- Basic responsive layout and an isometric-inspired home-world preview.

### Not in first MVP
- Accounts/authentication and cloud sync.
- Friends, visits, collaborative worlds, permissions.
- Voice input.
- Full calendar, recurring automation, subtasks/project boards.
- Focus timer.
- Mood journal, breathing, reflection workflows.
- Companion interactions.
- Functional crafting, item shop, spending/purchase ledger, object rotation, a full map editor, multiplayer, and cloud sync.
- Analytics dashboards and AI predictions/suggestions.

These are intentionally staged, not rejected. The MVP should first prove that managing and completing tasks with the reward loop is useful and understandable. Phase 2.7 later added decoration acquisition/placement and biome switching; those are described in §11 and do not imply a shop, crafting, spending, rotation, multiplayer, or cloud sync.

## 6. User stories and acceptance criteria

1. **As a user, I can add a task** so I can capture something I need to do. Done when a valid title can be saved and appears in the task list.
2. **As a user, I can edit or delete a task** so my list stays accurate. Done when edits persist and deletion removes only the selected task after confirmation.
3. **As a user, I can complete a task** so I can see progress. Done when it moves to Completed and rewards are credited once.
4. **As a user, I can choose priority** so more demanding/important work can earn better rewards. Done when reward amounts and resource tier follow the selected priority.
5. **As a user, I can reopen a completed task** so I can correct an accidental completion. Done when the task returns to To do and its previously earned XP, coins, resources, and ledger entry stay in place; completing it again does not grant a second reward.
6. **As a user, I can refresh the page** so my progress remains. Done when tasks, XP, coins, and resources are restored from local storage.
7. **As a user, I can filter tasks** so I can focus on what needs attention. Done when All, To do, and Completed filters show the correct tasks.

## 7. Reward economy — initial balancing hypothesis

| Priority | XP | Coins | Resource reward |
|---|---:|---:|---|
| Low | 10 | 3 | 1 wood |
| Medium | 20 | 6 | 2 wood |
| High | 35 | 10 | 2 stone |
| Urgent + important | 50 | 15 | 1 iron |

Values are placeholders for testing. Future balancing should account for task size, frequency, and abuse cases. Avoid making urgent tasks the default best strategy; urgency and importance should be distinct from effort where possible.

### Permanent-reward invariant

A reward belongs to the completion event, not to the live task record. Completing a task appends exactly one ledger entry and marks the task's reward claimed. Reopening the task does not remove the entry or clear the claim; deleting the task removes the task but keeps its entry. Totals are always `baseline + ledger` and the completed-task count is derived from tasks currently marked done. Consequently, reopening or deleting a task must never reduce lifetime XP, revoke a world/achievement unlock, or remove an owned decoration. This invariant applies to the avatar economy and to every derived or owned world reward.

## 8. Data and privacy

- First prototype stores data in browser `localStorage` on the current device/browser.
- This is not cloud backup and does not automatically sync across devices.
- Do not store credentials or sensitive personal information in source control.
- When accounts/friends are introduced, private tasks remain private by default. For every shared item define who can view, edit, and delete it; test with two separate accounts.

## 9. Quality and testing

- Test create/edit/delete/complete/reopen and reload persistence.
- Test empty task lists and each filter.
- Test every priority's reward mapping and ensure a task rewards only once, including after reopen/delete cycles.
- Test unlock derivation, deterministic v1→v2 migration, ownership/placement invariants, and biome isolation.
- Test mobile and desktop layouts.
- Ask a person unfamiliar with the app to use it without explanation; observe pauses and confusion, then fix the most important issue first.

## 10. Roadmap aligned to Samagra modules

### Module 1 — Philosophy and building the right thing
- Make requirements explicit and testable.
- Validate the user problem with short interviews about the last time someone struggled to manage tasks or maintain a routine.
- Prototype the smallest finished loop and test it before adding breadth.

### Module 2 — The first flight
- Stage 1: task CRUD, permanent rewards, and local persistence (delivered).
- Stage 1/2 world slice: Phases 2.1–2.7 — deterministic isometric renderer, grid/terrain model, camera and inspection, XP-derived growth, persisted user deltas, and the Phase 2.7 catalog/biome/decoration layer (delivered).
- Stage 2: robust data handling, an undo/history view, recurring-task behaviour, edge-case tests.
- Stage 3: authentication only when multi-user features are ready; private-by-default ownership and explicit view/edit/delete permissions for sharing.
- Stage 4: later, explore gentle deadline-risk warnings from historical task data; avoid data leakage and explain why a warning appears. Keep user choice in control.

### Module 3 — Code journaling
- Use Git commits as working checkpoints; commit only when the app works.
- Use meaningful commit messages and inspect every diff.
- Keep secrets and private user data out of GitHub; add `.gitignore` before adding environment files.
- Develop risky features on branches; test old flows before merging.
- Use pull requests for review when collaborators join.
- Revert pushed shared changes rather than rewriting shared history; tag stable milestones.

## 11. Phase 2.7 world content (implemented)

Phase 2.7 adds unlockable decorations, independently owned items, and multiple biomes without changing the task economy, reward matrix, XP thresholds, four stages, two milestones, feature IDs, 11×9 grid, or scene bounds.

- **Content catalog** (`CQ.world.contentCatalog`) is a frozen, pure list of seven items. Each item has a stable `decor:*` ID, supported biomes, a typed unlock descriptor, and `autoGrant: false`. Catalog entries describe types, never owned copies or placements.
- **Unlock evaluator** (`CQ.world.unlocks`) reads only `rules.computeTotals(state).xp`, `rules.countCompleted(state)`, and ledger length for derivable requirements. Achievement requirements are derived from task state; only event/purchase/explicit achievement grants are stored in world state. Descriptors are closed typed objects, frozen, side-effect-free, and reject unknown or malformed definitions — no strings are parsed or evaluated.
- **Biome catalog** (`CQ.world.biomeCatalog`) defines five biomes: `meadow` (always), `forest` (10 completed tasks), `lakeside` (500 XP), `autumn` (900 XP), and `snowy` (20 reward entries). Each biome clones the meadow object layout and varies terrain/palette only, so grid dimensions and `coords.sceneBounds()` are unchanged. New palettes are used instead of new terrain IDs.
- **World state v2** (`cozyquest.world-state.v2`) is one envelope containing ownership records, explicit unlock grants, one `activeBiome`, and per-biome object/terrain deltas. `unlocked`, `owned` (`user:item:*`), and `placed` (`user:placement:*`) are distinct. An owned instance may be placed at most once across all biomes; moving preserves placement and ownership IDs; removing preserves ownership. XP unlocks and derivable achievements are never stored as unlock records.
- **Deterministic migration** converts v1 deltas into v2 meadow ownership/placements with stable derived IDs, preserving identity, names, timestamps, moves, removals, terrain, salts, and references. The v1 key is never rewritten or deleted; migration is side-effect free until an explicit save/commit.
- **Composition and switching** keep one active biome. Switching never deletes or overwrites another biome's deltas. Incompatible saved placements are retained in state, skipped during composition with reported issues, and restored when a compatible biome is active. Unlocks are enforced at acquire/place/switch time, not at render time, so reopening or deleting a task cannot reverse an earned reward.
- **App controls** let the player choose a biome, acquire unlocked items, place/move/remove decorations at a chosen cell, and reset saved world changes.

Out of scope for this phase: shop, crafting, spending, purchase ledger, rotation, multiplayer, cloud sync, full map editor, new reward values, and new XP thresholds.

## 12. Open decisions for later

- Whether to extend the five fixed biomes and seven catalog items defined in Phase 2.7.
- Shop catalogue and item pricing (no shop, crafting, spending, or purchase ledger exists yet).
- Companion type, personality, and care mechanics.
- Whether friends can only visit or also collaborate, and the permissions for each action.
- Voice-input provider and privacy behaviour.
- Whether the eventual product should remain web-first or add a native mobile client.
