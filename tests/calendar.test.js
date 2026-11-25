const test = require('node:test');
const assert = require('node:assert/strict');
const calendar = require('../src/calendar.js');
const rules = require('../src/rules.js');
const storage = require('../src/storage.js');

test('localDateKey uses local calendar components and pads month/day', () => {
  assert.equal(calendar.localDateKey(new Date(2026, 10, 5, 23, 45, 12)), '2026-11-05');
  assert.equal(calendar.localDateKey(new Date(2024, 1, 29, 0, 30)), '2024-02-29');
  assert.equal(calendar.localDateKey(new Date(2000, 0, 1)), '2000-01-01');
  assert.equal(calendar.localDateKey(new Date(NaN)), null);
});

test('daysInMonth and shiftMonth handle month boundaries and leap years', () => {
  assert.equal(calendar.daysInMonth(2024, 1), 29);
  assert.equal(calendar.daysInMonth(2023, 1), 28);
  assert.equal(calendar.daysInMonth(2000, 1), 29);
  assert.equal(calendar.daysInMonth(1900, 1), 28);
  assert.equal(calendar.daysInMonth(2026, 10), 30);
  assert.equal(calendar.daysInMonth(2026, 11), 31);

  assert.deepEqual(calendar.shiftMonth(2024, 11, 1), { year: 2025, month: 0 });
  assert.deepEqual(calendar.shiftMonth(2025, 0, -1), { year: 2024, month: 11 });
  assert.deepEqual(calendar.shiftMonth(2024, 1, 12), { year: 2025, month: 1 });
  assert.throws(() => calendar.shiftMonth(2024, 12, 1), TypeError);
});

test('parseLocalDateKey rejects malformed and impossible local dates', () => {
  assert.deepEqual(calendar.parseLocalDateKey('2024-02-29'), {
    year: 2024, month: 1, day: 29, key: '2024-02-29'
  });
  assert.equal(calendar.parseLocalDateKey('2023-02-29'), null);
  assert.equal(calendar.parseLocalDateKey('2026-13-01'), null);
  assert.equal(calendar.parseLocalDateKey('2026-11-5'), null);
  assert.equal(calendar.parseLocalDateKey(''), null);
  assert.equal(calendar.parseLocalDateKey(null), null);
});

test('task writers and storage reject impossible calendar dates', () => {
  for (const value of ['', '2024-02-29', '2000-02-29', '2026-11-05']) {
    assert.equal(rules.isValidDate(value), true, value);
  }
  for (const value of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-00-10',
    '2026-04-00', '2026-11-5', '2026-1-01', 'not-a-date']) {
    assert.equal(rules.isValidDate(value), false, value);
  }

  const raw = storage.emptyState();
  raw.tasks.push({
    id: 'task-bad-date', title: 'Impossible date', type: 'Quick task', date: '2026-02-31',
    priority: { tier: 'low', urgent: false, important: false }, done: false,
    createdAt: '2026-11-24T00:00:00.000Z', rewardClaimed: false
  });
  const checked = storage.validateState(raw);
  assert.equal(checked.ok, false);
  assert.ok(checked.issues.includes('task date invalid'));
  assert.equal(checked.state.tasks.length, 0);
});

test('mapTasksByDate counts scheduled tasks and leaves undated tasks unscheduled', () => {
  const tasks = [
    { title: 'a', date: '2026-11-05' },
    { title: 'b', date: '2026-11-05' },
    { title: 'c', date: '2026-11-06' },
    { title: 'd', date: '' },
    { title: 'e' }
  ];
  assert.deepEqual(calendar.mapTasksByDate(tasks), {
    '2026-11-05': 2,
    '2026-11-06': 1
  });
  assert.deepEqual(calendar.mapTasksByDate(null), {});
  assert.deepEqual(calendar.tasksForDate(tasks, '2026-11-05'), [tasks[0], tasks[1]]);
  assert.deepEqual(calendar.tasksForDate(tasks, ''), []);
});

test('buildMonth generates a February leap month with today and task markers', () => {
  const tasks = [
    { date: '2024-02-29' },
    { date: '2024-02-29' },
    { date: '2024-02-14' },
    { date: '' }
  ];
  const month = calendar.buildMonth(2024, 1, {
    today: new Date(2024, 1, 29),
    tasks,
    selectedDateKey: '2024-02-29'
  });

  assert.equal(month.year, 2024);
  assert.equal(month.month, 1);
  assert.equal(month.label, 'February 2024');
  assert.deepEqual(month.weekdays, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.equal(month.cells.length % 7, 0);
  assert.equal(month.cells.filter((cell) => cell && cell.inMonth).length, 29);

  const today = month.cells.find((cell) => cell && cell.key === '2024-02-29');
  assert.equal(today.isToday, true);
  assert.equal(today.isSelected, true);
  assert.equal(today.taskCount, 2);
  assert.equal(today.hasTasks, true);

  const other = month.cells.find((cell) => cell && cell.key === '2024-02-14');
  assert.equal(other.taskCount, 1);
  assert.equal(other.hasTasks, true);
  assert.equal(other.isToday, false);

  assert.equal(month.cells.some((cell) => cell && cell.key === '2024-03-01'), true);
  assert.equal(month.cells.some((cell) => cell && cell.key === ''), false);
});

test('buildMonth includes neighbouring month days across a year boundary', () => {
  const month = calendar.buildMonth(2025, 0, { showOutsideDays: true });
  assert.equal(month.cells[0].key, '2024-12-29');
  assert.equal(month.cells[0].inMonth, false);
  assert.equal(month.cells[month.cells.length - 1].key, '2025-02-01');
  assert.equal(month.cells[month.cells.length - 1].inMonth, false);
  assert.equal(month.weeks.every((week) => week.length === 7), true);
});

test('buildMonth can use blanks instead of outside-month days', () => {
  const month = calendar.buildMonth(2026, 10, { showOutsideDays: false });
  assert.equal(month.weeks.every((week) => week.length === 7), true);
  assert.equal(month.cells.filter((cell) => cell === null).length > 0, true);
  assert.equal(month.cells.filter((cell) => cell && cell.inMonth).length, 30);
  assert.equal(month.cells.find((cell) => cell && cell.key === '2026-11-05').isToday, false);
});
