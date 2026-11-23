# CozyQuest — Product Requirements Document

**Status:** MVP definition / prototype 0.1  
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
| Reward rule | Every completed task earns both coins and resources; quantity/rarity varies by priority |
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
- Functional crafting, item shop, building placement, biome unlocks.
- Analytics dashboards and AI predictions/suggestions.

These are intentionally staged, not rejected. The MVP should first prove that managing and completing tasks with the reward loop is useful and understandable.

## 6. User stories and acceptance criteria

1. **As a user, I can add a task** so I can capture something I need to do. Done when a valid title can be saved and appears in the task list.
2. **As a user, I can edit or delete a task** so my list stays accurate. Done when edits persist and deletion removes only the selected task after confirmation.
3. **As a user, I can complete a task** so I can see progress. Done when it moves to Completed and rewards are credited once.
4. **As a user, I can choose priority** so more demanding/important work can earn better rewards. Done when reward amounts and resource tier follow the selected priority.
5. **As a user, I can reopen a completed task** so I can correct an accidental completion. Done when the task returns to To do and its previously granted prototype reward is reversed.
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

## 8. Data and privacy

- First prototype stores data in browser `localStorage` on the current device/browser.
- This is not cloud backup and does not automatically sync across devices.
- Do not store credentials or sensitive personal information in source control.
- When accounts/friends are introduced, private tasks remain private by default. For every shared item define who can view, edit, and delete it; test with two separate accounts.

## 9. Quality and testing

- Test create/edit/delete/complete/reopen and reload persistence.
- Test empty task lists and each filter.
- Test every priority's reward mapping and ensure a task rewards only once.
- Test mobile and desktop layouts.
- Ask a person unfamiliar with the app to use it without explanation; observe pauses and confusion, then fix the most important issue first.

## 10. Roadmap aligned to Samagra modules

### Module 1 — Philosophy and building the right thing
- Make requirements explicit and testable.
- Validate the user problem with short interviews about the last time someone struggled to manage tasks or maintain a routine.
- Prototype the smallest finished loop and test it before adding breadth.

### Module 2 — The first flight
- Stage 1: task CRUD and local persistence (current prototype).
- Stage 2: robust data handling, undo/history, recurring-task behaviour, edge-case tests.
- Stage 3: authentication only when multi-user features are ready; private-by-default ownership and explicit view/edit/delete permissions for sharing.
- Stage 4: later, explore gentle deadline-risk warnings from historical task data; avoid data leakage and explain why a warning appears. Keep user choice in control.

### Module 3 — Code journaling
- Use Git commits as working checkpoints; commit only when the app works.
- Use meaningful commit messages and inspect every diff.
- Keep secrets and private user data out of GitHub; add `.gitignore` before adding environment files.
- Develop risky features on branches; test old flows before merging.
- Use pull requests for review when collaborators join.
- Revert pushed shared changes rather than rewriting shared history; tag stable milestones.

## 11. Open decisions for later

- Exact biome progression and unlock conditions.
- Shop catalogue and item pricing.
- Companion type, personality, and care mechanics.
- Whether friends can only visit or also collaborate, and the permissions for each action.
- Voice-input provider and privacy behaviour.
- Whether the eventual product should remain web-first or add a native mobile client.
