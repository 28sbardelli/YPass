import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const searchScript = readFileSync(
  new URL('../../public/js/kiosk-destination-search.js', import.meta.url),
  'utf8',
);

function createSearchPage(destinations) {
  let inputHandler;
  let submitHandler;
  const searchInput = {
    value: '',
    validationMessage: '',
    addEventListener(event, handler) {
      if (event === 'input') inputHandler = handler;
    },
    setCustomValidity(message) {
      this.validationMessage = message;
    },
    reportValidity() {},
  };
  const destinationValue = { value: '' };
  const destinationList = { hidden: true };
  const destinationEmpty = { hidden: true };
  const form = {
    addEventListener(event, handler) {
      if (event === 'submit') submitHandler = handler;
    },
  };
  const options = destinations.map(({ id, name, teacher = '' }) => ({
    dataset: {
      locationId: id,
      locationName: name,
      locationTeacher: teacher,
      searchText: `${name} ${teacher}`,
      defaultLocation: 'false',
    },
    hidden: true,
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener() {},
  }));
  const document = {
    querySelector(selector) {
      if (selector === '[data-destination-search]') return searchInput;
      if (selector === '[data-destination-value]') return destinationValue;
      if (selector === '[data-destination-list]') return destinationList;
      if (selector === '[data-destination-empty]') return destinationEmpty;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-destination-option]') return options;
      return [];
    },
  };
  searchInput.closest = () => form;

  runInNewContext(searchScript, { document });
  return {
    destinationValue,
    searchInput,
    input(value) {
      searchInput.value = value;
      inputHandler();
    },
    submit() {
      let prevented = false;
      submitHandler({
        preventDefault() {
          prevented = true;
        },
      });
      return prevented;
    },
  };
}

describe('kiosk destination search', () => {
  it('accepts a manually typed exact location name without selecting a suggestion', () => {
    const page = createSearchPage([{ id: 'library-id', name: 'Library', teacher: 'Jordan Lee' }]);

    page.input('  lIbRaRy  ');

    expect(page.destinationValue.value).toBe('library-id');
    expect(page.submit()).toBe(false);
    expect(page.searchInput.validationMessage).toBe('');
  });

  it('resolves a manually typed unique teacher name to the assigned location', () => {
    const page = createSearchPage([
      { id: 'library-id', name: 'Library', teacher: 'Jordan Lee' },
      { id: 'office-id', name: 'Main Office', teacher: 'Taylor Morgan' },
    ]);

    page.input('jordan lee');

    expect(page.destinationValue.value).toBe('library-id');
    expect(page.submit()).toBe(false);
  });

  it('requires a valid destination when manually entered text does not match', () => {
    const page = createSearchPage([{ id: 'library-id', name: 'Library', teacher: 'Jordan Lee' }]);

    page.input('Unknown room');

    expect(page.destinationValue.value).toBe('');
    expect(page.submit()).toBe(true);
    expect(page.searchInput.validationMessage).toMatch(/choose a matching location or teacher/i);
  });
});
