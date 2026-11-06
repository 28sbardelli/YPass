import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

let managerTabsScript;
beforeAll(async () => {
  managerTabsScript = await readFile(
    new URL('../../public/js/manager-tabs.js', import.meta.url),
    'utf8',
  );
});

function createManagerPage({ storage = new Map(), href, scrollY = 0, selectedTab = 'students' }) {
  const tabs = ['students', 'locations', 'kiosks', 'passes', 'appointments', 'user-roles'].map(
    (name) => createTab(name, name === selectedTab),
  );
  const panels = tabs.map((tab) => ({
    dataset: { panel: tab.dataset.tab },
    classList: createClassList(tab.dataset.tab === selectedTab),
  }));
  const listeners = new Map();
  const form = {
    method: 'post',
    action: '/manager/students/create',
    matches: () => false,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const url = new URL(href);
  const frames = [];
  const scrollCalls = [];
  const document = {
    readyState: 'complete',
    querySelector(selector) {
      return selector === '.manager-tabs' ? { querySelectorAll: () => tabs } : null;
    },
    querySelectorAll(selector) {
      if (selector === '.manager-tab-panel') return panels;
      if (selector === 'form.manager-form') return [form];
      return [];
    },
  };
  const window = {
    location: { href: url.href, pathname: url.pathname, search: url.search },
    scrollY,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    requestAnimationFrame: (callback) => frames.push(callback),
    scrollTo: (_x, y) => scrollCalls.push(y),
  };

  runInNewContext(managerTabsScript, { document, window, URL, URLSearchParams });
  return { form, listeners, tabs, panels, frames, scrollCalls, storage, window };
}

function createTab(name, active) {
  const attributes = new Map();
  return {
    dataset: { tab: name },
    classList: createClassList(active),
    tabIndex: active ? 0 : -1,
    setAttribute: (key, value) => attributes.set(key, value),
    focus() {},
    addEventListener() {},
  };
}

function createClassList(initiallyActive) {
  const values = new Set(initiallyActive ? ['is-active'] : []);
  return {
    contains: (value) => values.has(value),
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    },
  };
}

describe('manager tab navigation', () => {
  it('stores the active tab and scroll offset and carries the current query onto form posts', () => {
    const page = createManagerPage({
      href: 'http://localhost/manager?status=timedout&page=3&appointmentsPage=2',
      scrollY: 680,
      selectedTab: 'appointments',
    });

    page.listeners.get('submit')({});

    expect(new URL(page.form.action, 'http://localhost').searchParams.get('page')).toBe('3');
    expect(new URL(page.form.action, 'http://localhost').searchParams.get('appointmentsPage')).toBe(
      '2',
    );
    expect(JSON.parse(page.storage.get('yp.manager.navigation'))).toMatchObject({
      tab: 'appointments',
      scrollY: 680,
      pathname: '/manager',
    });
  });

  it('restores a saved tab and scroll position once after the redirect', () => {
    const storage = new Map([
      [
        'yp.manager.navigation',
        JSON.stringify({
          tab: 'appointments',
          scrollY: 680,
          pathname: '/manager',
          savedAt: Date.now(),
        }),
      ],
    ]);
    const page = createManagerPage({
      storage,
      href: 'http://localhost/manager?page=3',
      selectedTab: 'students',
    });

    expect(page.tabs.find((tab) => tab.classList.contains('is-active')).dataset.tab).toBe(
      'appointments',
    );
    expect(storage.has('yp.manager.navigation')).toBe(false);
    page.frames.shift()();
    page.frames.shift()();
    expect(page.scrollCalls).toEqual([680]);
  });
});