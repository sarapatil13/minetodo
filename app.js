const $ = (id) => document.getElementById(id);

const rules = window.CQ.rules;
const storage = window.CQ.storage;
const transfer = window.CQ.transfer;
const world = window.CQ.world;
const worldProgression = world.progression;
const progressionConfig = window.CQ.progressionConfig;
const baseWorldMap = world.createSampleMeadow();
let worldHandle = null;

const store = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
  keys: () => Object.keys(localStorage)
};

const loaded = storage.loadState(store);
if (loaded.issues.length) console.warn('CozyQuest storage issues:', loaded.issues);

let state = loaded.state;
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

function prepareProgression(xp) {
  if (!worldHandle) return null;
  const prepared = {
    xp,
    scene: worldProgression.createProgressionScene(baseWorldMap, xp)
  };
  const checked = worldHandle.preflightProgression(prepared);
  if (!checked.ok) throw new Error(checked.error);
  return prepared;
}

function restoreWorld(xp) {
  if (!worldHandle) return;
  const currentXp = worldHandle.inspect().progression.xp;
  if (currentXp === xp) return;
  worldHandle.setProgression({
    xp,
    scene: worldProgression.createProgressionScene(baseWorldMap, xp)
  });
}

// State, storage, progress display and the world are committed together. The
// scene is preflighted before saving; if the in-place world update fails, the
// previous state is restored and saved again so no mismatched stage is shown.
function commitState(nextState, options) {
  const settings = options || {};
  const previousState = state;
  const xp = rules.computeTotals(nextState).xp;
  let prepared = null;

  try {
    prepared = prepareProgression(xp);
  } catch (error) {
    notify('World update cancelled: ' + error.message, 'error');
    return false;
  }

  const saved = storage.saveState(store, nextState);
  if (!saved.ok) console.warn('CozyQuest save issues:', saved.issues);
  state = nextState;

  try {
    const result = worldHandle
      ? worldHandle.setProgression(prepared)
      : syntheticGrowthResult(xp);
    if (!worldHandle) {
      worldHandle = world.mount(document.getElementById('world-canvas'), {
        infoPanel: document.getElementById('world-info-panel'),
        xp
      });
    }
    render();
    updateWorldGrowth(result);
    if (settings.message) notify(withGrowthFeedback(settings.message, result), settings.tone);
    return true;
  } catch (error) {
    state = previousState;
    const restored = storage.saveState(store, previousState);
    if (!restored.ok) console.warn('CozyQuest save issues:', restored.issues);
    render();
    try {
      restoreWorld(rules.computeTotals(previousState).xp);
    } catch (rollbackError) {
      console.warn('CozyQuest world rollback issue:', rollbackError);
    }
    updateWorldGrowth(syntheticGrowthResult(rules.computeTotals(previousState).xp));
    notify('World update failed: ' + error.message, 'error');
    return false;
  }
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

function render() {
  renderStats();
  renderTasks();
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
    const text = transfer.exportState(state, { now: new Date().toISOString() });
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
    const message =
      'Import this backup?\n\n' +
      `Tasks: ${s.taskCount} (${s.doneCount} done)\n` +
      `Reward entries: ${s.ledgerCount}\n` +
      `XP: ${s.xp} · coins: ${s.coins}\n` +
      `Wood ${s.resources.wood} · stone ${s.resources.stone} · iron ${s.resources.iron}`;
    if (!confirm(message)) return;
    const backup = storage.backupState(store, state, { now: new Date().toISOString() });
    if (!backup.ok) { notify('Import cancelled: backup failed.', 'error'); return; }
    commitState(result.state, { message: 'Backup imported 🌿', tone: 'success' });
  };
  reader.onerror = () => notify('Could not read that file.', 'error');
  reader.readAsText(file);
});

render();
const initialXp = rules.computeTotals(state).xp;
worldHandle = world.mount(document.getElementById('world-canvas'), {
  infoPanel: document.getElementById('world-info-panel'),
  xp: initialXp
});
updateWorldGrowth(syntheticGrowthResult(initialXp));
