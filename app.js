const $ = (id) => document.getElementById(id);

const rules = window.CQ.rules;
const storage = window.CQ.storage;
const transfer = window.CQ.transfer;
const world = window.CQ.world;
const worldProgression = world.progression;
const worldStateModule = window.CQ.worldState;
const decorations = window.CQ.decorations;
const biomeCatalog = world.biomeCatalog;
const contentCatalog = world.contentCatalog;
const unlocks = world.unlocks;
const stateCommit = window.CQ.stateCommit;
const progressionConfig = window.CQ.progressionConfig;
const baseWorldMap = world.createSampleMeadow();
let worldHandle = null;
let savedWorldState = null;
let recoveryPending = false;
let startupRecovery = null;

function currentXp() {
  return rules.computeTotals(state).xp;
}

const store = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
  keys: () => Object.keys(localStorage)
};

// A failed rollback leaves a durable marker. Replay it before any domain is
// read so a reload finishes the recovery instead of loading mixed state.
startupRecovery = stateCommit.recover(store);
if (!startupRecovery.ok) {
  recoveryPending = true;
  console.warn('CozyQuest commit recovery issue:', startupRecovery.issues);
} else if (startupRecovery.recovered) {
  console.info('CozyQuest recovered a previous state commit.');
}

const loaded = storage.loadState(store);
if (loaded.issues.length) console.warn('CozyQuest storage issues:', loaded.issues);
const loadedWorld = worldStateModule.loadAnyState(store);
if (loadedWorld.issues.length) console.warn('CozyQuest world state issues:', loadedWorld.issues);

let state = loaded.state;
savedWorldState = loadedWorld.state;
let activeFilter = 'all';
let editingId = null;
let toastTimer;

function newId() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // Some browsers hide crypto.randomUUID on file:// pages.
  }
  return String(Date.now()) + '-' + Math.random().toString(36).slice(2);
}

function levelInfo(xp) {
  const levels = progressionConfig.LEVELS;
  let current = levels[0];
  let next = levels[1];
  for (let i = 0; i < levels.length; i++) {
    if (xp >= levels[i][1]) {
      current = levels[i];
      next = levels[i + 1] || null;
    }
  }
  return { name: current[0], base: current[1], next };
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayProgress() {
  const today = localDateKey(new Date());
  const scheduled = state.tasks.filter((task) => task.date === today);
  return {
    total: scheduled.length,
    done: scheduled.filter((task) => task.done === true).length,
    unscheduled: state.tasks.filter((task) => !task.date).length
  };
}

function renderStats() {
  const totals = rules.computeTotals(state);
  const level = levelInfo(totals.xp);
  $('coins').textContent = totals.coins;
  $('xp').textContent = totals.xp;
  $('done-count').textContent = rules.countCompleted(state);
  $('wood').textContent = totals.resources.wood;
  $('stone').textContent = totals.resources.stone;
  $('iron').textContent = totals.resources.iron;
  $('level-name').textContent = level.name;
  $('level-label').textContent = `Level ${progressionConfig.LEVELS.findIndex((entry) => entry[0] === level.name) + 1} · ${level.name}`;
  if (level.next) {
    const span = level.next[1] - level.base;
    const earned = totals.xp - level.base;
    $('level-progress-text').textContent = `${earned} / ${span} XP`;
    $('xp-bar').style.width = `${Math.min(100, earned / span * 100)}%`;
    $('next-level').textContent = `${level.next[1] - totals.xp} XP to ${level.next[0]}`;
  } else {
    $('level-progress-text').textContent = 'Max level';
    $('xp-bar').style.width = '100%';
    $('next-level').textContent = 'Your meadow is thriving!';
  }

  const daily = todayProgress();
  if ($('daily-progress-text')) {
    $('daily-progress-text').textContent = `${daily.done} of ${daily.total} task${daily.total === 1 ? '' : 's'} complete`;
    $('daily-progress-fill').style.width = daily.total ? `${daily.done / daily.total * 100}%` : '0%';
    if (daily.total) {
      $('daily-progress-note').textContent = daily.done === daily.total
        ? 'All caught up. Lovely work.'
        : `${daily.total - daily.done} still waiting for you.`;
    } else if (daily.unscheduled) {
      $('daily-progress-note').textContent =
        `${daily.unscheduled} undated task${daily.unscheduled === 1 ? '' : 's'} on your list; none scheduled for today.`;
    } else {
      $('daily-progress-note').textContent = 'Add a task scheduled for today.';
    }
  }
}

function featureLabel(id) {
  const feature = worldProgression.FEATURES.find((entry) => entry.id === id);
  return feature ? feature.label : id;
}

function stageName(id) {
  const stage = worldProgression.STAGES.find((entry) => entry.id === id);
  return stage ? stage.name : id;
}

function growthEvent(result) {
  if (!result) return '';
  const additions = Array.from(result.addedFeatures || []).map(featureLabel);
  if (result.stageChanged) {
    const transition = `${stageName(result.previous.stageId)} → ${result.progress.stage.name}`;
    return additions.length ? `${transition}: ${additions.join(', ')}` : transition;
  }
  if (additions.length) return `${result.progress.stage.name}: ${additions.join(', ')}`;
  if (Array.from(result.removedFeatures || []).length) {
    return `World restored to ${result.progress.stage.name}.`;
  }
  return '';
}

function withGrowthFeedback(message, result) {
  const event = growthEvent(result);
  return event ? `${message} · ${event}` : message;
}

function updateWorldGrowth(result) {
  if (!$('world-growth')) return;
  const progress = result.progress;
  const row = $('world-growth');
  row.hidden = progress.xp === 0;

  $('world-stage-name').textContent = progress.stage.name;
  $('world-stage-xp').textContent = `${progress.xp} XP`;
  $('world-next-unlock').textContent = progress.nextUnlock
    ? `Next world feature at ${progress.nextUnlock.minXp} XP: ${progress.nextUnlock.label}`
    : 'Every world feature is blooming.';
  $('world-growth-features').textContent = progress.unlockedFeatures.length
    ? Array.from(progress.unlockedFeatures).map(featureLabel).join(' · ')
    : 'The meadow is resting.';

  const event = growthEvent(result);
  const eventEl = $('world-growth-event');
  eventEl.textContent = event;
  eventEl.hidden = !event;
  $('world-progress-status').textContent = event
    ? `${progress.stage.name}. ${event}. ${$('world-next-unlock').textContent}.`
    : `${progress.stage.name}. ${$('world-next-unlock').textContent}.`;
}

function syntheticGrowthResult(xp) {
  const progress = worldProgression.worldProgress(xp);
  return {
    xp: progress.xp,
    progress,
    previous: { stageId: 'starting-meadow', unlockedFeatures: [] },
    stageChanged: progress.stage.id !== 'starting-meadow',
    addedFeatures: progress.unlockedFeatures,
    removedFeatures: []
  };
}

function issueText(issue) {
  if (typeof issue === 'string') return issue;
  if (!issue || typeof issue !== 'object') return String(issue);
  return (issue.path ? issue.path + ': ' : '') + (issue.message || 'invalid');
}

function composeWorldScene(xp, worldStateToCompose) {
  let composition;
  if (worldStateToCompose && worldStateToCompose.schemaVersion === 2) {
    const active = decorations.activeModifications(worldStateToCompose, {
      taskState: state,
      enforceUnlocks: false
    });
    if (!active.ok) {
      throw new Error(active.issues.map(issueText).join('; ') || 'Active biome could not be composed.');
    }
    if (active.issues.length) {
      console.warn('CozyQuest skipped world placements:', active.issues.map(issueText));
    }
    const biomeId = worldStateToCompose.activeBiome;
    composition = world.content.compose({
      baseMap: biomeCatalog.createBaseMap(biomeId),
      xp,
      state: active.modifications,
      palette: biomeCatalog.paletteFor(biomeId)
    });
  } else {
    composition = world.content.compose({
      baseMap: baseWorldMap,
      xp,
      state: worldStateToCompose
    });
  }
  if (!composition.ok) {
    const details = composition.issues.length
      ? ': ' + composition.issues.map(issueText).join('; ')
      : '';
    throw new Error((composition.error || 'World composition failed') + details);
  }
  return composition;
}

function applyWorldComposition(composition, xp) {
  // Phase 2.8.1 has no live CozyQuest view. Composition still validates the
  // derived world during state commits, but no renderer is created here.
  if (!worldHandle) return syntheticGrowthResult(xp);

  const update = { xp, scene: composition.scene };
  const checked = worldHandle.preflightProgression(update);
  if (!checked.ok) {
    throw new Error(checked.error || checked.issues.map(issueText).join('; ') || 'World update preflight failed.');
  }
  return worldHandle.setProgression(update);
}

function hasWorldModifications(worldStateToCheck) {
  if (!worldStateToCheck) return false;
  if (worldStateToCheck.schemaVersion === 2) {
    if (worldStateToCheck.ownership.items.length) return true;
    return Object.keys(worldStateToCheck.biomes).some((biomeId) => {
      const delta = worldStateToCheck.biomes[biomeId];
      return delta.objects.placed.length || delta.objects.moved.length ||
        delta.objects.removed.length || delta.terrain.length;
    });
  }
  return Boolean(
    worldStateToCheck.objects &&
    (
      worldStateToCheck.objects.placed.length ||
      worldStateToCheck.objects.moved.length ||
      worldStateToCheck.objects.removed.length ||
      worldStateToCheck.terrain.length
    )
  );
}

function reloadStoredState() {
  const reloaded = storage.loadState(store);
  if (reloaded.issues.length) console.warn('CozyQuest storage issues:', reloaded.issues);
  const reloadedWorld = worldStateModule.loadAnyState(store);
  if (reloadedWorld.issues.length) console.warn('CozyQuest world state issues:', reloadedWorld.issues);

  state = reloaded.state;
  savedWorldState = reloadedWorld.state;
  render();

  const xp = currentXp();
  if (worldHandle) {
    try {
      applyWorldComposition(composeWorldScene(xp, savedWorldState), xp);
    } catch (error) {
      console.warn('CozyQuest world refresh issue:', error);
    }
  }
  updateWorldGrowth(syntheticGrowthResult(xp));
}

function reportRollbackFailure(rollback, action) {
  recoveryPending = true;
  const detail = rollback && rollback.issues && rollback.issues.length
    ? ' ' + rollback.issues.join('; ')
    : '';
  const marker = rollback && rollback.recoveryKey
    ? ' A recovery marker was saved; reload the page to finish recovery.'
    : ' Reload the page and check the browser console.';
  console.warn('CozyQuest rollback failure:', action, rollback);
  notify(action + ' and rollback could not finish.' + marker + detail, 'error');
}

function handleCommitFailure(committed) {
  const rollback = committed.rollback;
  const rollbackFailed = committed.recoveryRequired ||
    (rollback && (!rollback.ok || (rollback.issues && rollback.issues.length)));
  if (rollbackFailed) {
    reportRollbackFailure(rollback || committed, 'Update failed');
    return false;
  }

  reloadStoredState();
  const detail = committed.issues && committed.issues.length
    ? committed.issues.join('; ')
    : 'unknown error';
  notify('Update cancelled: ' + detail, 'error');
  return false;
}

// localStorage cannot atomically commit two keys. stateCommit validates,
// composes, preflights, and preserves both previous values before writing; the
// live world is changed only after every storage write succeeds.
function commitState(nextState, settings = {}) {
  const domains = settings.domains || { task: true, world: false };
  const nextWorldState = domains.world
    ? (settings.worldState === undefined ? savedWorldState : settings.worldState)
    : savedWorldState;
  const previousXp = currentXp();

  const committed = stateCommit.commit({
    store,
    now: new Date().toISOString(),
    current: { taskState: state, worldState: savedWorldState },
    next: {
      taskState: domains.task ? nextState : state,
      worldState: nextWorldState
    },
    domains,
    backup: settings.backup === true
  });
  if (!committed.ok) return handleCommitFailure(committed);

  let result;
  try {
    result = applyWorldComposition(committed.composition, committed.xp);
  } catch (error) {
    const undone = committed.rollback();
    if (!undone.ok) {
      reportRollbackFailure(undone, 'World update failed');
      render();
      updateWorldGrowth(syntheticGrowthResult(previousXp));
      return false;
    }
    reloadStoredState();
    notify('World update failed: ' + error.message, 'error');
    return false;
  }

  state = committed.taskState;
  savedWorldState = committed.worldState;
  if (committed.issues.length) console.warn('CozyQuest state issues:', committed.issues);
  render();
  updateWorldGrowth(result);
  if (settings.message) notify(withGrowthFeedback(settings.message, result), settings.tone);
  return true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function priorityLabel(priority) {
  const base = priority.tier[0].toUpperCase() + priority.tier.slice(1);
  return base + (priority.urgent ? ' · Urgent' : '') + (priority.important ? ' · Important' : '');
}

function priorityModifiers(priority) {
  return `${priority.tier}${priority.urgent ? ' urgent' : ''}${priority.important ? ' important' : ''}`;
}

function badgeClass(priority) {
  return `priority-dot ${priorityModifiers(priority)}`;
}

function renderTasks() {
  const list = $('task-list');
  const tasks = state.tasks.filter((t) => activeFilter === 'all' || (activeFilter === 'open' ? !t.done : t.done));
  $('task-count').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;

  if (!tasks.length) {
    list.innerHTML =
      `<div class="empty-state"><div>` +
      `${activeFilter === 'done' ? '🌼' : '🌷'}</div>` +
      `<b>${activeFilter === 'done' ? 'Your completed tasks will bloom here.' : 'Your adventure starts with one small step.'}</b>` +
      `<p>${activeFilter === 'done' ? 'Complete a task to see your progress.' : 'Add a task to earn your first rewards.'}</p>` +
      `</div>`;
    return;
  }

  list.innerHTML = tasks.map((t) => {
    const reward = rules.rewardFor(t.priority);
    const modifiers = priorityModifiers(t.priority);
    const due = t.date
      ? ` · Due ${new Date(`${t.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : '';
    return (
      `<article class="task-item ${t.done ? 'completed' : ''} ${modifiers}">` +
      `<button class="task-check" data-action="toggle" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Complete task'}">${t.done ? '✓' : ''}</button>` +
      `<div class="task-main"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.type)}${due}</small></div>` +
      `<span class="${badgeClass(t.priority)}">${escapeHtml(priorityLabel(t.priority))}</span>` +
      `<span class="task-reward">+${reward.xp} XP · +${reward.coins} 🪙</span>` +
      `<div class="task-actions">` +
      `<button data-action="edit" data-id="${t.id}" aria-label="Edit task">✎</button>` +
      `<button data-action="delete" data-id="${t.id}" aria-label="Delete task">×</button>` +
      `</div></article>`
    );
  }).join('');
}

function decorationEvaluation() {
  return { taskState: state, worldState: savedWorldState };
}

function describeIssue(issue) {
  return issueText(issue);
}

function renderBiomeControls() {
  if (!$('biome-select')) return;
  const worldV2 = savedWorldState.schemaVersion === 2;
  const select = $('biome-select');
  const activeBiome = worldV2 ? savedWorldState.activeBiome : 'meadow';
  const evaluation = worldV2
    ? biomeCatalog.evaluateUnlocks(decorationEvaluation())
    : { available: { meadow: true } };

  select.innerHTML = biomeCatalog.all().map((biome) => {
    const unlocked = unlocks.isUnlocked(biome.id, evaluation);
    const hint = unlocked ? '' : ' · ' + unlocks.describeRequirement(biome.unlock);
    return `<option value="${biome.id}"${biome.id === activeBiome ? ' selected' : ''}${unlocked ? '' : ' disabled'}>` +
      `${escapeHtml(biome.name + hint)}</option>`;
  }).join('');
  select.disabled = !worldV2;

  const biome = biomeCatalog.getBiome(activeBiome);
  $('world-name').textContent = biome ? biome.name : 'Meadow Haven';
  $('biome-hint').textContent = worldV2
    ? (unlockedBiomeCount(evaluation) + ' of ' + biomeCatalog.all().length + ' biomes unlocked')
    : 'Saved with an older world format.';
}

function unlockedBiomeCount(evaluation) {
  return biomeCatalog.all().filter((biome) => unlocks.isUnlocked(biome.id, evaluation)).length;
}

function renderDecorationControls() {
  if (!$('decor-catalog') || !$('decor-owned') || !$('decor-placed')) return;
  if (!savedWorldState || savedWorldState.schemaVersion !== 2) {
    $('decor-catalog').innerHTML = '';
    $('decor-owned').innerHTML = '<p class="muted">Decorations unlock with world state v2.</p>';
    $('decor-placed').innerHTML = '';
    $('placement-hint').textContent = '';
    return;
  }

  const evaluation = unlocks.evaluate(decorationEvaluation());
  const ownedByCatalog = new Set(savedWorldState.ownership.items.map((item) => item.catalogId));
  $('decor-catalog').innerHTML = contentCatalog.all().map((item) => {
    const unlocked = unlocks.isUnlocked(item.id, evaluation);
    const owned = ownedByCatalog.has(item.id);
    const label = owned ? 'Owned' : unlocked ? 'Acquire' : unlocks.describeRequirement(item.unlock);
    return `<div class="decor-item"><span>${escapeHtml(item.label)}</span>` +
      `<button type="button" data-decor-action="acquire" data-id="${item.id}"${!unlocked || owned ? ' disabled' : ''}>` +
      `${escapeHtml(label)}</button></div>`;
  }).join('');

  const placedOwners = new Set();
  Object.keys(savedWorldState.biomes).forEach((biomeId) => {
    savedWorldState.biomes[biomeId].objects.placed.forEach((record) => placedOwners.add(record.ownedId));
  });
  $('decor-owned').innerHTML = savedWorldState.ownership.items.length
    ? savedWorldState.ownership.items.map((item) => {
      const def = contentCatalog.getItem(item.catalogId);
      const label = def ? def.label : item.catalogId;
      const placed = placedOwners.has(item.id);
      return `<div class="decor-item"><span>${escapeHtml(label)}</span>` +
        `<button type="button" data-decor-action="place" data-id="${item.id}"${placed ? ' disabled' : ''}>` +
        `${placed ? 'Placed' : 'Place'}</button></div>`;
    }).join('')
    : '<p class="muted">Acquire a decoration to see it here.</p>';

  const activeBiome = savedWorldState.activeBiome;
  const placed = savedWorldState.biomes[activeBiome].objects.placed;
  $('decor-placed').innerHTML = placed.length
    ? placed.map((record) => {
      const owned = savedWorldState.ownership.items.find((item) => item.id === record.ownedId);
      const def = owned ? contentCatalog.getItem(owned.catalogId) : null;
      const label = def ? def.label : record.kind;
      return `<div class="decor-item"><span>${escapeHtml(label)} · ${record.col},${record.row}</span>` +
        `<span class="decor-actions">` +
        `<button type="button" data-decor-action="move" data-id="${record.id}">Move</button>` +
        `<button type="button" data-decor-action="remove" data-id="${record.id}">Remove</button>` +
        `</span></div>`;
    }).join('')
    : '<p class="muted">Nothing placed in this biome yet.</p>';

  const active = decorations.activeModifications(savedWorldState, {
    taskState: state,
    enforceUnlocks: false
  });
  $('placement-hint').textContent = active.ok && active.issues.length
    ? active.issues.length + ' saved placement(s) skipped for this biome.'
    : '';
}

function mutateDecoration(action, id) {
  const settings = { taskState: state, now: new Date().toISOString() };
  let result;
  if (action === 'acquire') result = decorations.acquire(savedWorldState, id, settings);
  else if (action === 'place') {
    const cell = { col: Number($('place-col').value), row: Number($('place-row').value) };
    result = decorations.place(savedWorldState, id, cell, settings);
  } else if (action === 'move') {
    const cell = { col: Number($('place-col').value), row: Number($('place-row').value) };
    result = decorations.move(savedWorldState, id, cell, settings);
  } else if (action === 'remove') result = decorations.remove(savedWorldState, id, settings);
  else if (action === 'biome') result = decorations.switchBiome(savedWorldState, id, settings);
  else return;

  if (!result.ok) {
    notify('Could not update the world: ' + result.issues.map(describeIssue).join('; '), 'error');
    return;
  }
  commitState(state, {
    domains: { task: false, world: true },
    worldState: result.state,
    message: 'World updated 🌿',
    tone: 'success'
  });
}

function render() {
  renderStats();
  renderTasks();
  renderBiomeControls();
  renderDecorationControls();
}

function notify(message, tone = 'info') {
  const el = $('toast');
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function readPriority() {
  const checked = document.querySelector('input[name="tier"]:checked');
  return {
    tier: checked ? checked.value : 'medium',
    urgent: $('priority-urgent').checked,
    important: $('priority-important').checked
  };
}

function setPriority(priority) {
  const input = document.querySelector(`input[name="tier"][value="${priority.tier}"]`);
  if (input) input.checked = true;
  $('priority-urgent').checked = priority.urgent;
  $('priority-important').checked = priority.important;
}

function updateRewardPreview() {
  const reward = rules.rewardFor(readPriority());
  $('reward-preview').textContent = `+${reward.xp} XP · +${reward.coins} coins · ${reward.amount} ${reward.label.toLowerCase()}`;
}

function openDialog(task = null) {
  editingId = task?.id ?? null;
  $('dialog-title').textContent = task ? 'Edit task' : 'Add a task';
  $('task-title').value = task?.title || '';
  $('task-type').value = task?.type || 'Quick task';
  $('task-date').value = task?.date || '';
  setPriority(task?.priority || { tier: 'medium', urgent: false, important: false });

  const locked = !!(task && task.done);
  document.querySelectorAll('input[name="tier"], #priority-urgent, #priority-important').forEach((input) => {
    input.disabled = locked;
  });
  $('reward-preview').textContent = locked
    ? 'Priority is locked until this task is reopened.'
    : '';
  if (!locked) updateRewardPreview();

  $('save-task').textContent = task ? 'Save changes' : 'Save task';
  $('task-dialog').showModal();
  $('task-title').focus();
}

function closeDialog() {
  $('task-dialog').close();
  editingId = null;
}

document.querySelectorAll('input[name="tier"], #priority-urgent, #priority-important').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.disabled) updateRewardPreview();
  });
});

$('open-add').addEventListener('click', () => openDialog());
$('close-dialog').addEventListener('click', closeDialog);
$('cancel-dialog').addEventListener('click', closeDialog);

$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('task-title').value.trim();
  if (!title) return;
  const fields = { title, type: $('task-type').value, date: $('task-date').value };

  if (editingId) {
    const current = state.tasks.find((t) => t.id === editingId);
    if (!current) { closeDialog(); return; }
    const patch = current.done ? fields : { ...fields, priority: readPriority() };
    const result = rules.editTask(state, editingId, patch);
    if (!result.ok) { notify('Could not update task: ' + result.issues[0], 'error'); return; }
    if (commitState(result.state, { message: 'Task updated 🌿', tone: 'success' })) closeDialog();
    return;
  }

  const created = rules.createTask({ ...fields, priority: readPriority() }, { id: newId(), now: new Date().toISOString() });
  if (!created.ok) { notify('Could not add task: ' + created.issues[0], 'error'); return; }
  const next = structuredClone(state);
  next.tasks.unshift(created.task);
  if (commitState(next, { message: 'A new adventure added 🌱', tone: 'success' })) closeDialog();
});

$('task-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const task = state.tasks.find((t) => t.id === btn.dataset.id);
  if (!task) return;
  const action = btn.dataset.action;

  if (action === 'toggle') {
    if (!task.done) {
      const result = rules.completeTask(state, task.id, { entryId: newId(), now: new Date().toISOString() });
      if (!result.ok) { notify('Could not complete task.', 'error'); return; }
      if (result.entry) {
        const reward = result.entry.reward;
        const label = rules.rewardFor(result.entry.prioritySnapshot).label;
        commitState(result.state, {
          message: `+${reward.xp} XP · +${reward.coins} coins · +${reward.amount} ${label} ✨`,
          tone: 'success'
        });
      } else {
        commitState(result.state, { message: 'Completed again — reward already earned 🌿', tone: 'info' });
      }
    } else {
      const result = rules.reopenTask(state, task.id);
      if (!result.ok) { notify('Could not reopen task.', 'error'); return; }
      commitState(result.state, {
        message: 'Task moved back to your list. Rewards stay earned.',
        tone: 'info'
      });
    }
    return;
  }

  if (action === 'edit') {
    openDialog(task);
    return;
  }

  if (action === 'delete') {
    if (!confirm(`Delete “${task.title}”?`)) return;
    const result = rules.deleteTask(state, task.id);
    if (!result.ok) { notify('Could not delete task.', 'error'); return; }
    commitState(result.state, {
      message: 'Task removed. Earned rewards stay with you.',
      tone: 'info'
    });
  }
});

document.querySelectorAll('.filter').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;
  renderTasks();
}));

$('export-json').addEventListener('click', () => {
  try {
    const text = transfer.exportState(state, {
      now: new Date().toISOString(),
      worldState: savedWorldState
    });
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cozyquest-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Backup downloaded 🌿', 'success');
  } catch (error) {
    notify('Export failed: ' + error.message, 'error');
  }
});

$('import-json').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = transfer.parseImport(String(reader.result), { now: new Date().toISOString() });
    if (!result.ok) { notify('Import rejected: ' + result.error, 'error'); return; }
    const s = result.summary;
    const worldLine = result.hasWorld
      ? '\nWorld changes: included; they will replace your saved world changes.'
      : '\nWorld changes: not included; your current world will be kept.';
    const skippedLine = result.worldIssues.length
      ? `\nWorld notes: ${result.worldIssues.length} invalid saved record(s) were skipped.`
      : '';
    const message =
      'Import this backup?\n\n' +
      `Tasks: ${s.taskCount} (${s.doneCount} done)\n` +
      `Reward entries: ${s.ledgerCount}\n` +
      `XP: ${s.xp} · coins: ${s.coins}\n` +
      `Wood ${s.resources.wood} · stone ${s.resources.stone} · iron ${s.resources.iron}` +
      worldLine + skippedLine;
    if (!confirm(message)) return;
    commitState(result.state, {
      domains: { task: true, world: result.hasWorld },
      worldState: result.worldState,
      backup: true,
      message: 'Backup imported 🌿',
      tone: 'success'
    });
  };
  reader.onerror = () => notify('Could not read that file.', 'error');
  reader.readAsText(file);
});

if ($('biome-select')) $('biome-select').addEventListener('change', (e) => mutateDecoration('biome', e.target.value));

if ($('world-controls-panel')) $('world-controls-panel').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-decor-action]');
  if (!btn || btn.disabled) return;
  mutateDecoration(btn.dataset.decorAction, btn.dataset.id);
});

if ($('reset-world')) $('reset-world').addEventListener('click', () => {
  if (!hasWorldModifications(savedWorldState)) {
    notify('The world already has no saved changes.', 'info');
    return;
  }
  const confirmed = confirm(
    'Reset all saved world changes?\n\n' +
    'This removes decorations, moves, removals, and terrain patches you saved. ' +
    'XP, the world stage, and earned decorations are derived from tasks and will stay exactly as they are.'
  );
  if (!confirmed) return;

  const freshWorld = worldStateModule.emptyV2State();
  freshWorld.createdAt = savedWorldState.createdAt || new Date().toISOString();
  freshWorld.updatedAt = new Date().toISOString();
  commitState(state, {
    domains: { task: false, world: true },
    worldState: freshWorld,
    backup: true,
    message: 'World changes reset 🌱',
    tone: 'info'
  });
});

render();
updateWorldGrowth(syntheticGrowthResult(currentXp()));

if (startupRecovery && startupRecovery.recovered) {
  notify('Recovered a previous update before loading your progress.', 'info');
} else if (recoveryPending) {
  notify('A commit recovery marker needs attention. Reload to retry recovery; details are in the browser console.', 'error');
}
