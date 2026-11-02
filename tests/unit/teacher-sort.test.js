import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const sortScript = readFileSync(
  new URL('../../public/js/teacher-sort.js', import.meta.url),
  'utf8',
);

function createSortControl(name, value) {
  let clickHandler;
  return {
    dataset: { sortControl: name, sortValue: value },
    attributes: {
      'aria-pressed': String(value === (name === 'passes' ? 'status' : 'default')),
    },
    getAttribute(attribute) {
      return this.attributes[attribute];
    },
    addEventListener(event, handler) {
      if (event === 'click') clickHandler = handler;
    },
    setAttribute(attribute, nextValue) {
      this.attributes[attribute] = nextValue;
    },
    click() {
      clickHandler();
    },
  };
}

function createFilterControl(value) {
  let clickHandler;
  return {
    dataset: { filterControl: 'passes', filterValue: value },
    attributes: { 'aria-pressed': 'false' },
    getAttribute(attribute) {
      return this.attributes[attribute];
    },
    addEventListener(event, handler) {
      if (event === 'click') clickHandler = handler;
    },
    setAttribute(attribute, nextValue) {
      this.attributes[attribute] = nextValue;
    },
    click() {
      clickHandler();
    },
  };
}

function createSortList(rows) {
  return {
    get children() {
      return rows;
    },
    append(row) {
      rows.splice(rows.indexOf(row), 1);
      rows.push(row);
    },
  };
}

function createSortablePage(passStatuses) {
  const sortOptions = ['default', 'status', 'student', 'date-desc', 'date-asc'];
  const controls = ['passes', 'appointments'].flatMap((name) =>
    sortOptions.map((option) => createSortControl(name, option)),
  );
  const filterControls = ['pending_approval', 'active', 'arrived', 'returning', 'completed', 'cancelled', 'expired'].map(createFilterControl);
  const passRows = passStatuses
    ? passStatuses.map((status) => ({ dataset: { sortStatus: status, sortStudent: status, sortDate: '' } }))
    : [
        { dataset: { sortStatus: 'active', sortStudent: 'Zoe', sortDate: '2026-10-23T12:00:00Z' } },
        {
          dataset: {
            sortStatus: 'pending_approval',
            sortStudent: 'Alice',
            sortDate: '2026-10-21T12:00:00Z',
          },
        },
        {
          dataset: {
            sortStatus: 'cancelled',
            sortStudent: 'Bob',
            sortDate: '2026-10-22T12:00:00Z',
          },
        },
      ];
  const appointmentRows = [
    { dataset: { sortStatus: 'active', sortStudent: 'Zoe', sortDate: '2026-10-23T12:00:00Z' } },
    {
      dataset: {
        sortStatus: 'pending_approval',
        sortStudent: 'Alice',
        sortDate: '2026-10-21T12:00:00Z',
      },
    },
    {
      dataset: {
        sortStatus: 'cancelled',
        sortStudent: 'Bob',
        sortDate: '2026-10-22T12:00:00Z',
      },
    },
  ];
  const lists = new Map([
    ['passes', createSortList(passRows)],
    ['appointments', createSortList(appointmentRows)],
  ]);

  const document = {
    querySelectorAll(selector) {
      if (selector === '[data-sort-control][data-sort-value]') return controls;
      if (selector === '[data-filter-control][data-filter-value]') return filterControls;
      const match = selector?.match(/data-sort-control="([^"]+)"/);
      if (match) return controls.filter((control) => control.dataset.sortControl === match[1]);
      const filterMatch = selector?.match(/data-filter-control="([^"]+)"/);
      return filterMatch
        ? filterControls.filter((control) => control.dataset.filterControl === filterMatch[1])
        : [];
    },
    querySelector(selector) {
      const [, name] = selector.match(/data-sort-list="([^"]+)"/);
      return lists.get(name);
    },
  };

  runInNewContext(sortScript, { document });
  return { controls, filterControls, lists };
}

function clickSort(controls, listName, sortValue) {
  controls.find(
    (control) =>
      control.dataset.sortControl === listName && control.dataset.sortValue === sortValue,
  ).click();
}

function clickFilter(controls, status) {
  controls.find((control) => control.dataset.filterValue === status).click();
}

describe('teacher page sort controls', () => {
  it.each([
    ['status', ['Alice', 'Zoe', 'Bob']],
    ['student', ['Alice', 'Bob', 'Zoe']],
    ['date-desc', ['Zoe', 'Bob', 'Alice']],
    ['date-asc', ['Alice', 'Bob', 'Zoe']],
  ])('sorts passes by %s', (sortBy, expected) => {
    const { controls, lists } = createSortablePage();
    clickSort(controls, 'passes', sortBy);

    expect(lists.get('passes').children.map((row) => row.dataset.sortStudent)).toEqual(expected);
  });

  it('sorts SQLite millisecond timestamps by their numeric value', () => {
    const { controls, lists } = createSortablePage();
    const rows = lists.get('passes').children;
    rows.find((row) => row.dataset.sortStudent === 'Zoe').dataset.sortDate = '1793038598314';
    rows.find((row) => row.dataset.sortStudent === 'Alice').dataset.sortDate = '1793038683161';
    rows.find((row) => row.dataset.sortStudent === 'Bob').dataset.sortDate = '1793038612686';

    clickSort(controls, 'passes', 'date-desc');
    expect(rows.map((row) => row.dataset.sortStudent)).toEqual(['Alice', 'Bob', 'Zoe']);

    clickSort(controls, 'passes', 'date-asc');
    expect(rows.map((row) => row.dataset.sortStudent)).toEqual(['Zoe', 'Bob', 'Alice']);
  });

  it('restores the original pass order when Order shown is selected', () => {
    const { controls, lists } = createSortablePage();
    clickSort(controls, 'passes', 'student');
    clickSort(controls, 'passes', 'default');

    expect(lists.get('passes').children.map((row) => row.dataset.sortStudent)).toEqual([
      'Zoe',
      'Alice',
      'Bob',
    ]);
  });

  it('marks the selected sort button as pressed', () => {
    const { controls } = createSortablePage();

    clickSort(controls, 'passes', 'student');

    expect(
      controls
        .filter((control) => control.dataset.sortControl === 'passes')
        .map((control) => control.attributes['aria-pressed']),
    ).toEqual(['false', 'false', 'true', 'false', 'false']);
  });

  it('starts with passes sorted by status', () => {
    const statuses = ['completed', 'active', 'pending_approval', 'arrived'];
    const { lists, controls } = createSortablePage(statuses);

    expect(lists.get('passes').children.map((row) => row.dataset.sortStatus)).toEqual([
      'pending_approval',
      'active',
      'arrived',
      'completed',
    ]);
    expect(
      controls
        .filter((control) => control.dataset.sortControl === 'passes')
        .find((control) => control.dataset.sortValue === 'status').attributes['aria-pressed'],
    ).toBe('true');
  });

  it.each(['pending_approval', 'active', 'arrived', 'returning', 'completed', 'cancelled', 'expired'])(
    'filters passes by %s status',
    (status) => {
      const statuses = [
        'pending_approval',
        'active',
        'arrived',
        'returning',
        'completed',
        'cancelled',
        'expired',
      ];
      const { filterControls, lists } = createSortablePage(statuses);
      const rows = lists.get('passes').children;

      clickFilter(filterControls, status);

      expect(rows.filter((row) => !row.hidden).map((row) => row.dataset.sortStatus)).toEqual([
        status,
      ]);
      expect(
        filterControls.map((control) => control.attributes['aria-pressed']),
      ).toEqual(statuses.map((item) => String(item === status)));
    },
  );

  it('shows multiple selected pass statuses together', () => {
    const statuses = ['pending_approval', 'active', 'arrived', 'completed'];
    const { filterControls, lists } = createSortablePage(statuses);
    const rows = lists.get('passes').children;

    clickFilter(filterControls, 'pending_approval');
    clickFilter(filterControls, 'completed');

    expect(rows.filter((row) => !row.hidden).map((row) => row.dataset.sortStatus)).toEqual([
      'pending_approval',
      'completed',
    ]);
  });

  it('shows all passes when no status filters are selected', () => {
    const statuses = ['active', 'completed'];
    const { filterControls, lists } = createSortablePage(statuses);
    const rows = lists.get('passes').children;

    clickFilter(filterControls, 'completed');
    clickFilter(filterControls, 'completed');

    expect(rows.every((row) => !row.hidden)).toBe(true);
  });

  it('does not include a separate all-status filter', () => {
    const { filterControls } = createSortablePage();

    expect(filterControls.some((control) => control.dataset.filterValue === 'all')).toBe(false);
  });

  it('keeps equal and invalid timestamps stable while sorting valid dates', () => {
    const { controls, lists } = createSortablePage();
    const rows = lists.get('passes').children;
    rows.find((row) => row.dataset.sortStudent === 'Zoe').dataset.sortDate = '2026-10-23 12:00:00';
    rows.find((row) => row.dataset.sortStudent === 'Alice').dataset.sortDate = '2026-10-23 12:00:00';
    rows.find((row) => row.dataset.sortStudent === 'Bob').dataset.sortDate = 'invalid-date';

    clickSort(controls, 'passes', 'date-desc');
    expect(rows.map((row) => row.dataset.sortStudent)).toEqual(['Alice', 'Zoe', 'Bob']);

    clickSort(controls, 'passes', 'date-asc');
    expect(rows.map((row) => row.dataset.sortStudent)).toEqual(['Alice', 'Zoe', 'Bob']);
  });

  it('supports the same sort choices for appointments', () => {
    const { controls, lists } = createSortablePage();
    clickSort(controls, 'appointments', 'date-asc');

    expect(lists.get('appointments').children.map((row) => row.dataset.sortStudent)).toEqual([
      'Alice',
      'Bob',
      'Zoe',
    ]);
  });

  it('keeps appointment statuses in alphabetical order', () => {
    const { controls, lists } = createSortablePage();

    clickSort(controls, 'appointments', 'status');

    expect(lists.get('appointments').children.map((row) => row.dataset.sortStudent)).toEqual([
      'Zoe',
      'Bob',
      'Alice',
    ]);
  });
});
