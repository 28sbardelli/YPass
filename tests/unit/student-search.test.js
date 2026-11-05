import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const searchScript = readFileSync(
  new URL('../../public/js/student-search.js', import.meta.url),
  'utf8',
);

function createSearchPage(students, locationNames = []) {
  let inputHandler;
  let locationInputHandler;
  const search = {
    value: '',
    addEventListener(event, handler) {
      if (event === 'input') inputHandler = handler;
    },
  };
  const locationSearch = {
    value: '',
    addEventListener(event, handler) {
      if (event === 'input') locationInputHandler = handler;
    },
  };
  const rows = students.map(({ name, id }) => ({
    dataset: { studentName: name, studentId: id },
    hidden: false,
  }));
  const locations = locationNames.map((name) => ({
    dataset: { locationName: name },
    hidden: false,
  }));
  const document = {
    readyState: 'complete',
    querySelector(selector) {
      if (selector === '[data-student-search]') return search;
      if (selector === '[data-location-search]') return locationSearch;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-student-name]') return rows;
      if (selector === '[data-location-name]') return locations;
      return [];
    },
  };

  runInNewContext(searchScript, { document });
  return {
    rows,
    locations,
    search(value) {
      search.value = value;
      inputHandler();
    },
    searchLocations(value) {
      locationSearch.value = value;
      locationInputHandler();
    },
  };
}

describe('manager student search', () => {
  it('filters student names and IDs case-insensitively and restores rows when cleared', () => {
    const { rows, search } = createSearchPage([
      { name: 'Alice Smith', id: 'A-101' },
      { name: 'Bob Jones', id: 'B-202' },
    ]);

    search('ALICE');
    expect(rows.map(({ hidden }) => hidden)).toEqual([false, true]);

    search('b-202');
    expect(rows.map(({ hidden }) => hidden)).toEqual([true, false]);

    search('');
    expect(rows.map(({ hidden }) => hidden)).toEqual([false, false]);
  });

  it('filters locations by name case-insensitively and restores rows when cleared', () => {
    const { locations, searchLocations } = createSearchPage([], ['Main Office', 'Library']);

    searchLocations('LIB');
    expect(locations.map(({ hidden }) => hidden)).toEqual([true, false]);

    searchLocations('');
    expect(locations.map(({ hidden }) => hidden)).toEqual([false, false]);
  });
});
