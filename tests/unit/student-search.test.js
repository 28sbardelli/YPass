import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const searchScript = readFileSync(
  new URL('../../public/js/student-search.js', import.meta.url),
  'utf8',
);

function createSearchPage(students, locationNames = [], kioskData = []) {
  let inputHandler;
  let locationInputHandler;
  let kioskInputHandler;
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
  const kioskSearch = {
    value: '',
    addEventListener(event, handler) {
      if (event === 'input') kioskInputHandler = handler;
    },
  };
  const rows = students.map(({ name, id }) => ({
    dataset: { studentName: name, studentId: id },
    hidden: false,
  }));
  const locations = locationNames.map(({ name, teacher = '' }) => ({
    dataset: { locationName: name, locationTeacher: teacher },
    hidden: false,
  }));
  const kiosks = kioskData.map(({ name, code, location }) => ({
    dataset: { kioskName: name, kioskCode: code, kioskLocation: location },
    hidden: false,
  }));
  const document = {
    readyState: 'complete',
    querySelector(selector) {
      if (selector === '[data-student-search]') return search;
      if (selector === '[data-location-search]') return locationSearch;
      if (selector === '[data-kiosk-search]') return kioskSearch;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-student-name]') return rows;
      if (selector === '[data-location-name]') return locations;
      if (selector === '[data-kiosk-name]') return kiosks;
      return [];
    },
  };

  runInNewContext(searchScript, { document });
  return {
    rows,
    locations,
    kiosks,
    search(value) {
      search.value = value;
      inputHandler();
    },
    searchLocations(value) {
      locationSearch.value = value;
      locationInputHandler();
    },
    searchKiosks(value) {
      kioskSearch.value = value;
      kioskInputHandler();
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
    const { locations, searchLocations } = createSearchPage([], [
      { name: 'Main Office' },
      { name: 'Library', teacher: 'Jordan Lee' },
    ]);

    searchLocations('JORDAN');
    expect(locations.map(({ hidden }) => hidden)).toEqual([true, false]);

    searchLocations('LIB');
    expect(locations.map(({ hidden }) => hidden)).toEqual([true, false]);

    searchLocations('');
    expect(locations.map(({ hidden }) => hidden)).toEqual([false, false]);
  });

  it('filters kiosks by name, code, or location and restores rows when cleared', () => {
    const { kiosks, searchKiosks } = createSearchPage([], [], [
      { name: 'Main Entrance', code: 'K-101', location: 'Front Office' },
      { name: 'Library Kiosk', code: 'K-202', location: 'Library' },
    ]);

    searchKiosks('K-202');
    expect(kiosks.map(({ hidden }) => hidden)).toEqual([true, false]);

    searchKiosks('FRONT');
    expect(kiosks.map(({ hidden }) => hidden)).toEqual([false, true]);

    searchKiosks('');
    expect(kiosks.map(({ hidden }) => hidden)).toEqual([false, false]);
  });
});
