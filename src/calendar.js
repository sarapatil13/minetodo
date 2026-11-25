(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).calendar = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  const MONTH_NAMES = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]);

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function makeLocalDate(year, month, day) {
    const date = new Date(0);
    date.setHours(0, 0, 0, 0);
    // setFullYear avoids the special 0-99 two-digit-year behaviour of the Date
    // constructor, while keeping every calculation in local calendar time.
    date.setFullYear(year, month, day);
    return date;
  }

  function isValidYearMonth(year, month) {
    return Number.isInteger(year) && Number.isInteger(month) && month >= 0 && month <= 11;
  }

  function assertYearMonth(year, month) {
    if (!isValidYearMonth(year, month)) {
      throw new TypeError('year must be an integer and month must be 0-11');
    }
  }

  function dateKey(year, month, day) {
    assertYearMonth(year, month);
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
      throw new TypeError('day is outside the requested month');
    }
    return `${year}-${pad2(month + 1)}-${pad2(day)}`;
  }

  function localDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function parseLocalDateKey(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    if (!isValidYearMonth(year, month)) return null;
    const date = makeLocalDate(year, month, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month ||
      date.getDate() !== day
    ) return null;
    return { year, month, day, key: value };
  }

  function daysInMonth(year, month) {
    assertYearMonth(year, month);
    return makeLocalDate(year, month + 1, 0).getDate();
  }

  function monthOf(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return { year: date.getFullYear(), month: date.getMonth() };
  }

  function shiftMonth(year, month, delta) {
    assertYearMonth(year, month);
    if (!Number.isInteger(delta)) throw new TypeError('delta must be an integer');
    const shifted = makeLocalDate(year, month + delta, 1);
    return { year: shifted.getFullYear(), month: shifted.getMonth() };
  }

  function monthLabel(year, month) {
    assertYearMonth(year, month);
    return `${MONTH_NAMES[month]} ${year}`;
  }

  function formatLongDate(value) {
    const parsed = parseLocalDateKey(value);
    if (!parsed) return '';
    const date = makeLocalDate(parsed.year, parsed.month, parsed.day);
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      }).format(date);
    } catch {
      return parsed.key;
    }
  }

  function mapTasksByDate(tasks) {
    const counts = {};
    if (!Array.isArray(tasks)) return counts;
    for (const task of tasks) {
      if (!task || typeof task.date !== 'string' || task.date === '') continue;
      counts[task.date] = (counts[task.date] || 0) + 1;
    }
    return counts;
  }

  function tasksForDate(tasks, value) {
    if (!Array.isArray(tasks) || typeof value !== 'string' || value === '') return [];
    return tasks.filter((task) => task && task.date === value);
  }

  function buildMonth(year, month, options = {}) {
    assertYearMonth(year, month);
    const today = options.today;
    let todayKey = null;
    if (typeof today === 'string') todayKey = parseLocalDateKey(today) ? today : null;
    else if (today instanceof Date) todayKey = localDateKey(today);

    const counts = options.tasks !== undefined
      ? mapTasksByDate(options.tasks)
      : (options.taskCounts || {});
    const selectedKey = typeof options.selectedDateKey === 'string' ? options.selectedDateKey : null;
    const showOutsideDays = options.showOutsideDays !== false;

    const firstWeekday = makeLocalDate(year, month, 1).getDay();
    const totalDays = daysInMonth(year, month);
    const lastWeekday = makeLocalDate(year, month, totalDays).getDay();
    const cells = [];

    function createCell(day) {
      const date = makeLocalDate(year, month, day);
      const key = localDateKey(date);
      const taskCount = Number.isFinite(counts[key]) ? counts[key] : 0;
      return {
        key,
        day: date.getDate(),
        year: date.getFullYear(),
        month: date.getMonth(),
        inMonth: date.getFullYear() === year && date.getMonth() === month,
        isToday: key === todayKey,
        isSelected: key === selectedKey,
        taskCount,
        hasTasks: taskCount > 0
      };
    }

    if (showOutsideDays) {
      const firstCellDay = 1 - firstWeekday;
      const lastCellDay = totalDays + (6 - lastWeekday);
      for (let day = firstCellDay; day <= lastCellDay; day++) cells.push(createCell(day));
    } else {
      for (let i = 0; i < firstWeekday; i++) cells.push(null);
      for (let day = 1; day <= totalDays; day++) cells.push(createCell(day));
      while (cells.length % 7 !== 0) cells.push(null);
    }

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return {
      year,
      month,
      label: monthLabel(year, month),
      weekdays: WEEKDAYS.slice(),
      cells,
      weeks,
      todayKey,
      selectedKey
    };
  }

  return {
    WEEKDAYS,
    MONTH_NAMES,
    dateKey,
    localDateKey,
    parseLocalDateKey,
    daysInMonth,
    monthOf,
    shiftMonth,
    monthLabel,
    formatLongDate,
    mapTasksByDate,
    tasksForDate,
    buildMonth
  };
});
