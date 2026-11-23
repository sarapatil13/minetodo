const $ = (id) => document.getElementById(id);

const STORAGE_KEY = 'cozyquest.mvp.v1';

const rewards = {
  low: { xp: 10, coins: 3, resource: 'wood', amount: 1, label: 'Wood' },
  medium: { xp: 20, coins: 6, resource: 'wood', amount: 2, label: 'Wood' },
  high: { xp: 35, coins: 10, resource: 'stone', amount: 2, label: 'Stone' },
  critical: { xp: 50, coins: 15, resource: 'iron', amount: 1, label: 'Iron' }
};

const defaults = {
  tasks: [],
  xp: 0,
  coins: 0,
  resources: { wood: 0, stone: 0, iron: 0 },
  completed: 0
};

let state = loadState();
let activeFilter = 'all';
let editingId = null;
let toastTimer;

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...defaults,
      ...stored,
      resources: { ...defaults.resources, ...(stored.resources || {}) }
    };
  } catch {
    return structuredClone(defaults);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  const level = levelInfo(state.xp);
  $('coins').textContent = state.coins;
  $('xp').textContent = state.xp;
  $('done-count').textContent = state.completed;
  $('wood').textContent = state.resources.wood;
  $('stone').textContent = state.resources.stone;
  $('iron').textContent = state.resources.iron;
  $('level-name').textContent = level.name;
  $('level-label').textContent = `Level ${['Seedling', 'Sprout', 'Sapling', 'Bloom', 'Grove Keeper', 'Forest Guardian'].indexOf(level.name) + 1} · ${level.name}`;
  if (level.next) {
    const span = level.next[1] - level.base;
    const earned = state.xp - level.base;
    $('level-progress-text').textContent = `${earned} / ${span} XP`;
    $('xp-bar').style.width = `${Math.min(100, earned / span * 100)}%`;
    $('next-level').textContent = `${level.next[1] - state.xp} XP to ${level.next[0]}`;
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
    const r = rewards[t.priority];
    const due = t.date
      ? ` · Due ${new Date(`${t.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : '';
    return (
      `<article class="task-item ${t.done ? 'completed' : ''}">` +
      `<button class="task-check" data-action="toggle" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Complete task'}">${t.done ? '✓' : ''}</button>` +
      `<div class="task-main"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.type)}${due}</small></div>` +
      `<span class="priority-dot ${t.priority}">${t.priority === 'critical' ? 'Urgent' : t.priority[0].toUpperCase() + t.priority.slice(1)}</span>` +
      `<span class="task-reward">+${r.xp} XP · +${r.coins} 🪙</span>` +
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

function notify(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function openDialog(task = null) {
  editingId = task?.id ?? null;
  $('dialog-title').textContent = task ? 'Edit task' : 'Add a task';
  $('task-title').value = task?.title || '';
  $('task-type').value = task?.type || 'Quick task';
  $('task-date').value = task?.date || '';
  document.querySelector(`input[name="priority"][value="${task?.priority || 'medium'}"]`).checked = true;
  $('save-task').textContent = task ? 'Save changes' : 'Save task';
  $('task-dialog').showModal();
  $('task-title').focus();
}

function closeDialog() {
  $('task-dialog').close();
  editingId = null;
}

$('open-add').addEventListener('click', () => openDialog());
$('close-dialog').addEventListener('click', closeDialog);
$('cancel-dialog').addEventListener('click', closeDialog);

$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('task-title').value.trim();
  if (!title) return;
  const data = {
    title,
    type: $('task-type').value,
    date: $('task-date').value,
    priority: document.querySelector('input[name="priority"]:checked').value
  };
  if (editingId) {
    const task = state.tasks.find((t) => t.id === editingId);
    Object.assign(task, data);
    notify('Task updated 🌿');
  } else {
    state.tasks.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      ...data,
      done: false,
      createdAt: new Date().toISOString()
    });
    notify('A new adventure added 🌱');
  }
  persist();
  render();
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
      const r = rewards[task.priority];
      task.done = true;
      task.rewardGranted = true;
      task.grantedReward = { ...r };
      state.xp += r.xp;
      state.coins += r.coins;
      state.resources[r.resource] += r.amount;
      state.completed += 1;
      notify(`+${r.xp} XP · +${r.coins} coins · +${r.amount} ${r.label} ✨`);
    } else {
      task.done = false;
      if (task.rewardGranted) {
        const r = task.grantedReward || rewards[task.priority];
        state.xp = Math.max(0, state.xp - r.xp);
        state.coins = Math.max(0, state.coins - r.coins);
        state.resources[r.resource] = Math.max(0, state.resources[r.resource] - r.amount);
        state.completed = Math.max(0, state.completed - 1);
        task.rewardGranted = false;
        task.grantedReward = null;
      }
      notify('Task moved back to your list.');
    }
  } else if (action === 'edit') {
    openDialog(task);
    return;
  } else if (action === 'delete') {
    if (!confirm(`Delete “${task.title}”?`)) return;
    state.tasks = state.tasks.filter((t) => t.id !== task.id);
    notify('Task removed.');
  }

  persist();
  render();
});

document.querySelectorAll('.filter').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.filter;
  renderTasks();
}));

render();
