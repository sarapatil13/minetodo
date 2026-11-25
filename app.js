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
const calendar = window.CQ.calendar;
const focusTimerModule = window.CQ.focusTimer;
const flowers = window.CQ.flowers;
const baseWorldMap = world.createSampleMeadow();
let worldHandle = null;
let activeView = 'dashboard';
let pendingFocusTarget = null;
const COZYQUEST_HASH = '#cozyquest';
const DASHBOARD_HASH = '#dashboard';
const DASHBOARD_FOCUS_TARGETS = ['tasks', 'calendar', 'focus'];
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
} else {
  recoveryPending = false;
  if (startupRecovery.recovered) console.info('CozyQuest recovered a previous state commit.');
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

const initialCalendarDate = new Date();
let calendarMonth = calendar.monthOf(initialCalendarDate) ||
  { year: initialCalendarDate.getFullYear(), month: initialCalendarDate.getMonth() };
let selectedDateKey = null;
const focusTimer = focusTimerModule.createTimer({ now: () => Date.now() });
let focusInterval = null;
let focusLabel = 'Pomodoro (25m)';
let recentlyCompletedFlowers = new Set();

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

function renderCalendar() {
  const grid = $('calendar-grid');
  if (!grid) return;
  const month = calendar.buildMonth(calendarMonth.year, calendarMonth.month, {
    tasks: state.tasks,
    today: new Date(),
    selectedDateKey
  });
  $('calendar-month-label').textContent = month.label;
  grid.innerHTML = month.weeks.map((week) => (
    '<div class="calendar-week" role="row">' + week.map((cell) => {
      if (!cell) return '<span class="calendar-day is-blank" role="gridcell"></span>';
      const classes = ['calendar-day'];
      if (!cell.inMonth) classes.push('is-outside');
      if (cell.isToday) classes.push('is-today');
      if (cell.isSelected) classes.push('is-selected');
      if (cell.hasTasks) classes.push('has-tasks');
      const taskPhrase = cell.hasTasks
        ? `, ${cell.taskCount} scheduled task${cell.taskCount === 1 ? '' : 's'}`
        : '';
      const label = calendar.formatLongDate(cell.key) + taskPhrase;
      return `<button type="button" class="${classes.join(' ')}" role="gridcell" ` +
        `data-date="${cell.key}" data-in-month="${cell.inMonth}" ` +
        `aria-label="${escapeHtml(label)}"` +
        `${cell.isToday ? ' aria-current="date"' : ''}` +
        `${cell.isSelected ? ' aria-pressed="true"' : ''}>` +
        `<span class="calendar-day-number">${cell.day}</span>` +
        `${cell.hasTasks ? '<span class="calendar-task-dot" aria-hidden="true"></span>' : ''}` +
        `</button>`;
    }).join('') + '</div>'
  )).join('');
  $('calendar-selection').textContent = selectedDateKey
    ? `Showing ${calendar.formatLongDate(selectedDateKey)}`
    : 'Showing all tasks';
  $('calendar-clear').hidden = !selectedDateKey;
}

function shiftCalendarMonth(delta) {
  calendarMonth = calendar.shiftMonth(calendarMonth.year, calendarMonth.month, delta);
  renderCalendar();
}

function selectCalendarDate(dateKeyValue, wasOutsideMonth) {
  const parsed = calendar.parseLocalDateKey(dateKeyValue);
  if (!parsed) return;
  if (wasOutsideMonth) calendarMonth = { year: parsed.year, month: parsed.month };
  selectedDateKey = parsed.key;
  renderCalendar();
  renderTasks();
}

function clearCalendarSelection() {
  if (!selectedDateKey) return;
  selectedDateKey = null;
  renderCalendar();
  renderTasks();
}

function updateFocusUI(state) {
  const widget = $('focus-widget');
  if (!widget) return;
  const statusLabels = {
    idle: 'Ready', running: 'Focusing', paused: 'Paused', complete: 'Complete'
  };
  widget.dataset.state = state.status;
  $('focus-display').textContent = state.clock;
  $('focus-status').textContent = `${statusLabels[state.status] || state.status} · ${focusLabel}`;
  $('focus-progress').style.width = `${Math.round(state.progress * 100)}%`;
  $('focus-feedback').hidden = state.status !== 'complete';
  $('focus-start').disabled = state.status === 'running';
  $('focus-pause').disabled = state.status !== 'running';
  $('focus-resume').disabled = state.status !== 'paused';
  $('focus-reset').disabled = state.status === 'idle' && state.remainingMs === state.durationMs;
}

function stopFocusInterval() {
  if (focusInterval === null) return;
  clearInterval(focusInterval);
  focusInterval = null;
}

function syncFocusInterval(state) {
  if (state.status !== 'running') {
    stopFocusInterval();
    return;
  }
  if (focusInterval !== null) return;
  focusInterval = setInterval(() => {
    const next = focusTimer.tick();
    updateFocusUI(next);
    if (next.completed) stopFocusInterval();
  }, 250);
}

function applyFocusState(state) {
  updateFocusUI(state);
  syncFocusInterval(state);
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
  const levelNumber = progressionConfig.LEVELS.findIndex((entry) => entry[0] === level.name) + 1;
  $('level-label').textContent = `Level ${levelNumber} · ${level.name}`;
  if ($('cozy-xp')) {
    $('cozy-xp').textContent = totals.xp;
    $('cozy-level').textContent = `Level ${levelNumber} · ${level.name}`;
  }
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

function nextUnlockText(progress) {
  return progress.nextUnlock
    ? `Next world feature at ${progress.nextUnlock.minXp} XP: ${progress.nextUnlock.label}`
    : 'Every world feature is blooming.';
}

function updateCozyQuestGrowth(progress) {
  const fill = $('cozy-progress-fill');
  if (!fill) return;
  const percent = Math.max(0, Math.min(100, progress.percent));
  $('cozy-stage-name').textContent = progress.stage.name;
  $('cozy-stage-xp').textContent = `${progress.xp} XP`;
  fill.style.width = `${percent}%`;
  const track = $('cozy-progress-track');
  if (track) track.setAttribute('aria-valuenow', String(Math.round(percent)));
  $('cozy-next-unlock').textContent = nextUnlockText(progress);
}

function updateWorldGrowth(result) {
  const progress = result.progress;
  const nextUnlock = nextUnlockText(progress);
  const row = $('world-growth');
  if (row) {
    row.hidden = progress.xp === 0;

    $('world-stage-name').textContent = progress.stage.name;
    $('world-stage-xp').textContent = `${progress.xp} XP`;
    $('world-next-unlock').textContent = nextUnlock;
    $('world-growth-features').textContent = progress.unlockedFeatures.length
      ? Array.from(progress.unlockedFeatures).map(featureLabel).join(' · ')
      : 'The meadow is resting.';

    const event = growthEvent(result);
    const eventEl = $('world-growth-event');
    eventEl.textContent = event;
    eventEl.hidden = !event;
    $('world-progress-status').textContent = event
      ? `${progress.stage.name}. ${event}. ${nextUnlock}.`
      : `${progress.stage.name}. ${nextUnlock}.`;
  }

  updateCozyQuestGrowth(progress);
}

function syntheticGrowthResult(xp, previousXp = xp) {
  const progress = worldProgression.worldProgress(xp);
  const previousStage = worldProgression.stageForXp(previousXp);
  const previousFeatures = worldProgression.featureIdsForXp(previousXp);
  return {
    xp: progress.xp,
    progress,
    previous: { xp: previousXp, stageId: previousStage.id, unlockedFeatures: previousFeatures },
    stageChanged: previousStage.id !== progress.stage.id,
    addedFeatures: progress.unlockedFeatures.filter((id) => previousFeatures.indexOf(id) === -1),
    removedFeatures: previousFeatures.filter((id) => progress.unlockedFeatures.indexOf(id) === -1)
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

function applyWorldComposition(composition, xp, previousXp = xp) {
  // Dashboard commits still compose and preflight saved world state, but they
  // never touch a hidden or nonexistent controller.
  if (activeView !== 'cozyquest' || !worldHandle) return syntheticGrowthResult(xp, previousXp);

  const update = { xp, scene: composition.scene };
  const checked = worldHandle.preflightProgression(update);
  if (!checked.ok) {
    throw new Error(checked.error || checked.issues.map(issueText).join('; ') || 'World update preflight failed.');
  }
  return worldHandle.setProgression(update);
}

function hashForView(view) {
  return view === 'cozyquest' ? COZYQUEST_HASH : DASHBOARD_HASH;
}

function viewFromHash() {
  return location.hash === COZYQUEST_HASH ? 'cozyquest' : 'dashboard';
}

function isReloadNavigation() {
  try {
    if (typeof performance === 'undefined') return false;
    if (typeof performance.getEntriesByType === 'function') {
      const entries = performance.getEntriesByType('navigation');
      if (entries && entries.length) return entries[0].type === 'reload';
    }
    if (performance.navigation) {
      return performance.navigation.type === performance.navigation.TYPE_RELOAD ||
        performance.navigation.type === 1;
    }
  } catch {
    // Navigation timing is optional on some file:// browsers.
  }
  return false;
}

function replaceHash(hash) {
  try {
    if (typeof history === 'undefined' || typeof history.replaceState !== 'function') {
      location.hash = hash;
      return;
    }
    history.replaceState(null, '', location.href.split('#')[0] + hash);
  } catch {
    location.hash = hash;
  }
}

function destroyWorld() {
  if (!worldHandle) return;
  const handle = worldHandle;
  worldHandle = null;
  try {
    handle.destroy();
  } catch (error) {
    console.warn('CozyQuest world cleanup issue:', error);
  }
}

function updatePageHeading(view) {
  if (!$('page-title')) return;
  if (view === 'cozyquest') {
    $('page-eyebrow').textContent = 'COZYQUEST · YOUR HOME BIOME';
    $('page-title').textContent = 'A cozy world that grows with you';
  } else {
    $('page-eyebrow').textContent = 'YOUR LITTLE CORNER OF THE WORLD';
    $('page-title').textContent = 'Your gentle dashboard';
  }
}

function updateNavState(key) {
  document.querySelectorAll('.sidebar-nav [data-view]').forEach((item) => {
    const active = item.dataset.view === key;
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function focusDashboardTarget(target) {
  const targetSelectors = {
    dashboard: '.sidebar-nav [data-view="dashboard"]',
    tasks: '#tasks-widget',
    calendar: '#calendar-widget',
    focus: '#focus-widget'
  };
  const el = target && targetSelectors[target] ? document.querySelector(targetSelectors[target]) : null;
  if (!el) return;
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  if (typeof el.focus === 'function') {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }
}

function enterCozyQuest() {
  const template = $('cozyquest-world-template');
  const cozyView = $('view-cozyquest');
  const dashboardView = $('view-dashboard');
  if (!template || !cozyView || !dashboardView) {
    notify('CozyQuest view is unavailable.', 'error');
    return;
  }
  if (activeView === 'cozyquest' && worldHandle && $('world-canvas')) return;

  destroyWorld();
  cozyView.replaceChildren(template.content.cloneNode(true));

  // The cloned canvas must be visible before the controller measures it.
  dashboardView.hidden = true;
  cozyView.hidden = false;
  activeView = 'cozyquest';
  document.body.classList.add('is-cozyquest');
  updatePageHeading('cozyquest');
  updateNavState('cozyquest');
  renderStats();

  try {
    const xp = currentXp();
    const composition = composeWorldScene(xp, savedWorldState);
    worldHandle = world.mount($('world-canvas'), {
      scene: composition.scene,
      xp,
      infoPanel: $('world-info-panel')
    });
    if (!worldHandle) throw new Error('World controller could not be created.');
    renderBiomeControls();
    renderDecorationControls();
    updateWorldGrowth(syntheticGrowthResult(xp, xp));
  } catch (error) {
    destroyWorld();
    cozyView.replaceChildren();
    cozyView.hidden = true;
    dashboardView.hidden = false;
    activeView = 'dashboard';
    document.body.classList.remove('is-cozyquest');
    updatePageHeading('dashboard');
    updateNavState('dashboard');
    if (location.hash === COZYQUEST_HASH) replaceHash(DASHBOARD_HASH);
    notify('CozyQuest could not open: ' + error.message, 'error');
  }
}

function leaveCozyQuest(focusTarget = null) {
  const wasCozyQuest = activeView === 'cozyquest';
  destroyWorld();
  const cozyView = $('view-cozyquest');
  const dashboardView = $('view-dashboard');
  if (cozyView) {
    cozyView.hidden = true;
    cozyView.replaceChildren();
  }
  if (dashboardView) dashboardView.hidden = false;
  activeView = 'dashboard';
  document.body.classList.remove('is-cozyquest');
  updatePageHeading('dashboard');
  const navKey = DASHBOARD_FOCUS_TARGETS.includes(focusTarget) ? focusTarget : 'dashboard';
  updateNavState(navKey);
  if (wasCozyQuest || focusTarget) focusDashboardTarget(navKey);
}

function applyView(view, options = {}) {
  if (view === 'cozyquest') enterCozyQuest();
  else leaveCozyQuest(options.focusTarget || null);
}

function requestView(view, options = {}) {
  const hash = hashForView(view);
  if (location.hash !== hash) {
    pendingFocusTarget = options.focusTarget || null;
    location.hash = hash;
    return;
  }
  applyView(view, options);
}

function handleRouteChange() {
  const focusTarget = pendingFocusTarget;
  pendingFocusTarget = null;
  applyView(viewFromHash(), { focusTarget });
}

function hasWorldModifications(worldStateToCheck) {
  if (!worldStateToCheck) return false;
  if (worldStateToCheck.schemaVersion === 2) {
    if (Array.isArray(worldStateToCheck.unlocks) && worldStateToCheck.unlocks.length) return true;
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
  updateWorldGrowth(syntheticGrowthResult(xp, xp));
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
  // A failed rollback reads an older durable snapshot on the next load. Block
  // further writes until that load happens, or they would be silently reverted.
  if (recoveryPending) {
    notify('A saved commit could not be rolled back. Reload the page before making more changes.', 'error');
    return false;
  }
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
    result = applyWorldComposition(committed.composition, committed.xp, previousXp);
  } catch (error) {
    const undone = committed.rollback();
    if (!undone.ok) {
      reportRollbackFailure(undone, 'World update failed');
      render();
      updateWorldGrowth(syntheticGrowthResult(previousXp, previousXp));
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

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function takeRecentCompletions() {
  const ids = recentlyCompletedFlowers;
  recentlyCompletedFlowers = new Set();
  return ids;
}

function flowerMarkup(task, bloomingIds) {
  if (task.done !== true) return '';
  const flower = flowers.flowerForTask(task);
  if (!flower) return '';
  const blooming = !prefersReducedMotion() && bloomingIds.has(task.id);
  return `<span class="task-flower${blooming ? ' is-blooming' : ''}" ` +
    `data-flower="${flower.id}" aria-hidden="true">${flower.glyph}</span>`;
}

function visibleTasks() {
  const dated = selectedDateKey
    ? state.tasks.filter((t) => t.date === selectedDateKey)
    : state.tasks;
  return dated.filter((t) => activeFilter === 'all' || (activeFilter === 'open' ? !t.done : t.done));
}

function renderTasks() {
  const list = $('task-list');
  const tasks = visibleTasks();
  const bloomingIds = takeRecentCompletions();
  $('task-count').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;

  if (!tasks.length) {
    const title = selectedDateKey
      ? 'No tasks scheduled for this date.'
      : activeFilter === 'done'
        ? 'Your completed tasks will bloom here.'
        : 'Your adventure starts with one small step.';
    const copy = selectedDateKey
      ? 'Clear the date filter to see every task.'
      : activeFilter === 'done'
        ? 'Complete a task to see your progress.'
        : 'Add a task to earn your first rewards.';
    list.innerHTML =
      `<div class="empty-state"><div>` +
      `${activeFilter === 'done' && !selectedDateKey ? '🌼' : '🌷'}</div>` +
      `<b>${title}</b><p>${copy}</p>` +
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
      `<div class="task-main"><b>${escapeHtml(t.title)}${flowerMarkup(t, bloomingIds)}</b><small>${escapeHtml(t.type)}${due}</small></div>` +
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
  renderCalendar();
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

function openDialog(task = null, defaults = {}) {
  editingId = task?.id ?? null;
  $('dialog-title').textContent = task ? 'Edit task' : 'Add a task';
  $('task-title').value = task?.title || '';
  $('task-type').value = task?.type || 'Quick task';
  $('task-date').value = task ? (task.date || '') : (defaults.date || '');
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
      recentlyCompletedFlowers.add(task.id);
      const committed = result.entry
        ? commitState(result.state, {
          message: `+${result.entry.reward.xp} XP · +${result.entry.reward.coins} coins · +${result.entry.reward.amount} ${rules.rewardFor(result.entry.prioritySnapshot).label} ✨`,
          tone: 'success'
        })
        : commitState(result.state, { message: 'Completed again — reward already earned 🌿', tone: 'info' });
      if (!committed) recentlyCompletedFlowers.delete(task.id);
    } else {
      recentlyCompletedFlowers.delete(task.id);
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

$('calendar-prev').addEventListener('click', () => shiftCalendarMonth(-1));
$('calendar-next').addEventListener('click', () => shiftCalendarMonth(1));
$('calendar-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-date]');
  if (!btn) return;
  selectCalendarDate(btn.dataset.date, btn.dataset.inMonth !== 'true');
});
$('calendar-clear').addEventListener('click', clearCalendarSelection);
$('calendar-add').addEventListener('click', () => openDialog(null, {
  date: selectedDateKey || calendar.localDateKey(new Date())
}));

$('focus-pomodoro').addEventListener('click', () => {
  stopFocusInterval();
  focusLabel = 'Pomodoro (25m)';
  $('focus-minutes').value = '25';
  applyFocusState(focusTimer.setDuration(focusTimerModule.POMODORO_SECONDS));
});

$('focus-custom').addEventListener('click', () => {
  stopFocusInterval();
  const seconds = focusTimerModule.normalizeDurationSeconds(Number($('focus-minutes').value) * 60);
  const minutes = Math.round(seconds / 60);
  $('focus-minutes').value = String(minutes);
  focusLabel = `Custom (${minutes}m)`;
  applyFocusState(focusTimer.setDuration(seconds));
});

$('focus-start').addEventListener('click', () => applyFocusState(focusTimer.start()));
$('focus-pause').addEventListener('click', () => applyFocusState(focusTimer.pause()));
$('focus-resume').addEventListener('click', () => applyFocusState(focusTimer.resume()));
$('focus-reset').addEventListener('click', () => {
  stopFocusInterval();
  applyFocusState(focusTimer.reset());
});
window.addEventListener('pagehide', stopFocusInterval);
window.addEventListener('pageshow', () => applyFocusState(focusTimer.tick()));

// A v1 world block is a valid backup, but loadAnyState prefers an existing v2
// key. Migrate it before committing so the imported world actually replaces
// the saved one instead of being written to a key that is never read.
function normalizeImportedWorld(worldStateToImport, now) {
  if (!worldStateToImport || worldStateToImport.schemaVersion === worldStateModule.SCHEMA_VERSION_V2) {
    return { ok: true, state: worldStateToImport, issues: [] };
  }
  const migrated = worldStateModule.migrateV1State(worldStateToImport, { now });
  return { ok: migrated.ok, state: migrated.state, issues: migrated.issues.slice() };
}

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
    const importedAt = new Date().toISOString();
    const result = transfer.parseImport(String(reader.result), { now: importedAt });
    if (!result.ok) { notify('Import rejected: ' + result.error, 'error'); return; }
    let importedWorld;
    if (result.hasWorld) {
      const normalized = normalizeImportedWorld(result.worldState, importedAt);
      if (!normalized.ok) {
        notify('Import rejected: world backup could not be migrated. ' + normalized.issues.join('; '), 'error');
        return;
      }
      importedWorld = normalized.state;
    }
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
      worldState: importedWorld,
      backup: true,
      message: 'Backup imported 🌿',
      tone: 'success'
    });
  };
  reader.onerror = () => notify('Could not read that file.', 'error');
  reader.readAsText(file);
});

const sidebarNav = document.querySelector('.sidebar-nav');
if (sidebarNav) sidebarNav.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  const key = btn.dataset.view;
  requestView(key === 'cozyquest' ? 'cozyquest' : 'dashboard', {
    focusTarget: DASHBOARD_FOCUS_TARGETS.includes(key) ? key : null
  });
});

window.addEventListener('hashchange', handleRouteChange);

// World controls are cloned into the live view, so a stable document listener
// handles them once instead of rebinding to each newly cloned element.
document.addEventListener('change', (e) => {
  const target = e.target;
  if (!target || target.id !== 'biome-select') return;
  const cozyView = $('view-cozyquest');
  if (!cozyView || cozyView.hidden || !cozyView.contains(target)) return;
  mutateDecoration('biome', target.value);
});

document.addEventListener('click', (e) => {
  const target = e.target;
  const cozyView = $('view-cozyquest');
  if (!cozyView || cozyView.hidden || !target || typeof target.closest !== 'function') return;

  const backBtn = target.closest('#back-to-dashboard');
  if (backBtn && cozyView.contains(backBtn)) {
    requestView('dashboard');
    return;
  }

  const decorBtn = target.closest('#world-controls-panel button[data-decor-action]');
  if (decorBtn && cozyView.contains(decorBtn) && !decorBtn.disabled) {
    mutateDecoration(decorBtn.dataset.decorAction, decorBtn.dataset.id);
    return;
  }

  const resetBtn = target.closest('#reset-world');
  if (!resetBtn || !cozyView.contains(resetBtn)) return;
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
applyFocusState(focusTimer.snapshot());
const startupXp = currentXp();
updateWorldGrowth(syntheticGrowthResult(startupXp, startupXp));

// A reload always lands on the dashboard. A fresh direct #cozyquest load still
// enters CozyQuest, and later hash changes drive back/forward navigation.
const initialView = isReloadNavigation() || viewFromHash() !== 'cozyquest'
  ? 'dashboard'
  : 'cozyquest';
if (initialView === 'dashboard' && location.hash && location.hash !== DASHBOARD_HASH) {
  replaceHash(DASHBOARD_HASH);
}
applyView(initialView);

if (startupRecovery && startupRecovery.recovered) {
  notify('Recovered a previous update before loading your progress.', 'info');
} else if (recoveryPending) {
  notify('A commit recovery marker needs attention. Reload to retry recovery; details are in the browser console.', 'error');
}
