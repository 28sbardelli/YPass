import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const sortScript = readFileSync(
  new URL('../../public/js/teacher-sort.js', import.meta.url),
  'utf8',
);

function createSortControl(name) {
  let changeHandler;
  return {
    dataset: { sortControl: name },
    addEventListener(event, handler) {
      if (event === 'change') changeHandler = handler;
    },
    change(value) {
      this.value = value;
      changeHandler();
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

function createSortablePage() {
  const controls = [createSortControl('passes'), createSortControl('appointments')];
  const lists = new Map(
    controls.map((control) => [
      control.dataset.sortControl,
      createSortList([
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
            sortStatus: 'completed',
            sortStudent: 'Bob',
            sortDate: '2026-10-22T12:00:00Z',
          },
        },
      ]),
    ]),
  );

  const document = {
    querySelectorAll() {
      return controls;
    },
    querySelector(selector) {
      const [, name] = selector.match(/data-sort-list="([^"]+)"/);
      return lists.get(name);
    },
  };

  runInNewContext(sortScript, { document });
  return { controls, lists };
}

describe('teacher page sort controls', () => {
  it.each([
    ['status', ['Zoe', 'Bob', 'Alice']],
    ['student', ['Alice', 'Bob', 'Zoe']],
    ['date-desc', ['Zoe', 'Bob', 'Alice']],
    ['date-asc', ['Alice', 'Bob', 'Zoe']],
  ])('sorts passes by %s', (sortBy, expected) => {
    const { controls, lists } = createSortablePage();
    const control = controls[0];

    control.change(sortBy);

    expect(lists.get('passes').children.map((row) => row.dataset.sortStudent)).toEqual(expected);
  });

  it('sorts SQLite millisecond timestamps by their numeric value', () => {
    const { controls, lists } = createSortablePage();
    const rows = lists.get('passes').children;
    rows[0].dataset.sortDate = '1793038598314';
    rows[1].dataset.sortDate = '1793038683161';
    rows[2].dataset.sortDate = '1793038612686';

    controls[0].change('date-desc');
    expect(rows.map((row) => row.dataset.sortStudent)).toEqual(['Alice', 'Bob', 'Zoe']);

    controls[0].change('date-asc');
    expect(rows.map((row) => row.dataset.sortStudent)).toEqual(['Zoe', 'Bob', 'Alice']);
  });

  it('restores the original pass order when Order shown is selected', () => {
    const { controls, lists } = createSortablePage();
    const control = controls[0];

    control.change('student');
    control.change('default');

    expect(lists.get('passes').children.map((row) => row.dataset.sortStudent)).toEqual([
      'Zoe',
      'Alice',
      'Bob',
    ]);
  });

  it('keeps equal and invalid timestamps stable while sorting valid dates', () => {
    const { controls, lists } = createSortablePage();
    const rows = lists.get('passes').children;
    rows[0].dataset.sortDate = '2026-10-23 12:00:00';
    rows[1].dataset.sortDate = '2026-10-23 12:00:00';
    rows[2].dataset.sortDate = 'invalid-date';

    controls[0].change('date-desc');
    expect(rows.map((row) => row.dataset.sortStudent)).toEqual(['Zoe', 'Alice', 'Bob']);

    controls[0].change('date-asc');
    expect(rows.map((row) => row.dataset.sortStudent)).toEqual(['Zoe', 'Alice', 'Bob']);
  });

  it('supports the same sort choices for appointments', () => {
    const { controls, lists } = createSortablePage();
    const control = controls[1];

    control.change('date-asc');

    expect(lists.get('appointments').children.map((row) => row.dataset.sortStudent)).toEqual([
      'Alice',
      'Bob',
      'Zoe',
    ]);
  });
});
