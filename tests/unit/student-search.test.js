import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const searchScript = readFileSync(
  new URL('../../public/js/student-search.js', import.meta.url),
  'utf8',
);

function createSearchPage(
  students,
  locationNames = [],
  kioskData = [],
  passData = [],
  appointmentData = [],
  userRoleData = [],
) {
  let inputHandler;
  let locationInputHandler;
  let kioskInputHandler;
  let passInputHandler;
  let appointmentInputHandler;
  let userRoleInputHandler;
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
  const passSearch = {
    value: '',
    addEventListener(event, handler) {
      if (event === 'input') passInputHandler = handler;
    },
  };
  const appointmentSearch = {
    value: '',
    addEventListener(event, handler) {
      if (event === 'input') appointmentInputHandler = handler;
    },
  };
  const userRoleSearch = {
    value: '',
    addEventListener(event, handler) {
      if (event === 'input') userRoleInputHandler = handler;
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
  const passes = passData.map(({ student, number, origin, destination, status }) => ({
    dataset: {
      passStudent: student,
      passNumber: number,
      passOrigin: origin,
      passDestination: destination,
      passStatus: status,
    },
    hidden: false,
  }));
  const appointments = appointmentData.map((searchText) => ({
    dataset: { appointmentSearchText: searchText },
    hidden: false,
  }));
  const userRoles = userRoleData.map((searchText) => ({
    dataset: { userRoleSearchText: searchText },
    hidden: false,
  }));
  const document = {
    readyState: 'complete',
    querySelector(selector) {
      if (selector === '[data-student-search]') return search;
      if (selector === '[data-location-search]') return locationSearch;
      if (selector === '[data-kiosk-search]') return kioskSearch;
      if (selector === '[data-manager-pass-search]') return passSearch;
      if (selector === '[data-manager-appointment-search]') return appointmentSearch;
      if (selector === '[data-user-role-search]') return userRoleSearch;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-student-name]') return rows;
      if (selector === '[data-location-name]') return locations;
      if (selector === '[data-kiosk-name]') return kiosks;
      if (selector === '[data-manager-pass-row]') return passes;
      if (selector === '[data-manager-appointment-row]') return appointments;
      if (selector === '[data-user-role-row]') return userRoles;
      return [];
    },
  };

  runInNewContext(searchScript, { document });
  return {
    rows,
    locations,
    kiosks,
    passes,
    appointments,
    userRoles,
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
    searchPasses(value) {
      passSearch.value = value;
      passInputHandler();
    },
    searchAppointments(value) {
      appointmentSearch.value = value;
      appointmentInputHandler();
    },
    searchUserRoles(value) {
      userRoleSearch.value = value;
      userRoleInputHandler();
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

  it('filters manager passes by student, ID, route, or status and restores rows when cleared', () => {
    const { passes, searchPasses } = createSearchPage([], [], [], [
      {
        student: 'Alice Smith',
        number: 'A-101',
        origin: 'Main Office',
        destination: 'Library',
        status: 'active',
      },
      {
        student: 'Bob Jones',
        number: 'B-202',
        origin: 'Gym',
        destination: 'Nurse',
        status: 'completed',
      },
    ]);

    searchPasses('B-202');
    expect(passes.map(({ hidden }) => hidden)).toEqual([true, false]);

    searchPasses('LIBRARY');
    expect(passes.map(({ hidden }) => hidden)).toEqual([false, true]);

    searchPasses('');
    expect(passes.map(({ hidden }) => hidden)).toEqual([false, false]);
  });

  it('filters manager appointments by student, location, or status', () => {
    const { appointments, searchAppointments } = createSearchPage([], [], [], [], [
      'Alice A-101 Main Office Library scheduled',
      'Bob B-202 Gym Nurse cancelled',
    ]);

    searchAppointments('GYM');
    expect(appointments.map(({ hidden }) => hidden)).toEqual([true, false]);

    searchAppointments('');
    expect(appointments.map(({ hidden }) => hidden)).toEqual([false, false]);
  });

  it('filters user roles by display name, email, or role', () => {
    const { userRoles, searchUserRoles } = createSearchPage([], [], [], [], [], [
      'Alice Smith alice@example.test teacher',
      'Bob Jones bob@example.test student',
    ]);

    searchUserRoles('BOB@EXAMPLE');
    expect(userRoles.map(({ hidden }) => hidden)).toEqual([true, false]);

    searchUserRoles('teacher');
    expect(userRoles.map(({ hidden }) => hidden)).toEqual([false, true]);
  });
});
