const $ = (id) => document.getElementById(id);

const rules = window.CQ.rules;
const storage = window.CQ.storage;
const transfer = window.CQ.transfer;

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
  const levels = [
    ['Seedling', 0],
    ['Sprout', 100],
    ['Sapling', 250],
    ['Bloom', 500],
    ['Grove Keeper', 900],
    ['Forest Guardian', 1400]
  ];
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
  $('level-label').textContent = `Level ${['Seedling', 'Sprout', 'Sapling', 'Bloom', 'Grove Keeper', 'Forest Guardian'].indexOf(level.name) + 1} · ${level.name}`;
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

function persistAndRender() {
  const saved = storage.saveState(store, state);
  if (!saved.ok) console.warn('CozyQuest save issues:', saved.issues);
  render();
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
    state = result.state;
    notify('Task updated 🌿', 'success');
  } else {
    const created = rules.createTask({ ...fields, priority: readPriority() }, { id: newId(), now: new Date().toISOString() });
    if (!created.ok) { notify('Could not add task: ' + created.issues[0], 'error'); return; }
    state = structuredClone(state);
    state.tasks.unshift(created.task);
    notify('A new adventure added 🌱', 'success');
  }
  persistAndRender();
  closeDialog();
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
      state = result.state;
      if (result.entry) {
        const reward = result.entry.reward;
        const label = rules.rewardFor(result.entry.prioritySnapshot).label;
        notify(`+${reward.xp} XP · +${reward.coins} coins · +${reward.amount} ${label} ✨`, 'success');
      } else {
        notify('Completed again — reward already earned 🌿', 'info');
      }
    } else {
      const result = rules.reopenTask(state, task.id);
      if (!result.ok) { notify('Could not reopen task.', 'error'); return; }
      state = result.state;
      notify('Task moved back to your list. Rewards stay earned.', 'info');
    }
  } else if (action === 'edit') {
    openDialog(task);
    return;
  } else if (action === 'delete') {
    if (!confirm(`Delete “${task.title}”?`)) return;
    const result = rules.deleteTask(state, task.id);
    if (!result.ok) { notify('Could not delete task.', 'error'); return; }
    state = result.state;
    notify('Task removed. Earned rewards stay with you.', 'info');
  }

  persistAndRender();
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
    state = result.state;
    persistAndRender();
    notify('Backup imported 🌿', 'success');
  };
  reader.onerror = () => notify('Could not read that file.', 'error');
  reader.readAsText(file);
});

render();
window.CQ.world?.mount(document.getElementById('world-canvas'));
