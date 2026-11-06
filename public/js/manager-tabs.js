(() => {
  const navigationStorageKey = 'yp.manager.navigation';
  const navigationMaxAgeMs = 5 * 60 * 1000;

  const initializeManagerTabs = () => {
    const tabList = document.querySelector('.manager-tabs');
    if (!tabList) return;

    const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
    const panels = Array.from(document.querySelectorAll('.manager-tab-panel'));

    const activateTab = (tab, { moveFocus = false } = {}) => {
      const selectedTab = tab.dataset.tab;

      tabs.forEach((candidate) => {
        const isActive = candidate === tab;
        candidate.classList.toggle('is-active', isActive);
        candidate.setAttribute('aria-selected', String(isActive));
        candidate.tabIndex = isActive ? 0 : -1;
      });

      panels.forEach((panel) => {
        panel.classList.toggle('is-active', panel.dataset.panel === selectedTab);
      });

      if (moveFocus) tab.focus();
    };

    const readSavedNavigation = () => {
      let saved;
      try {
        const serialized = window.sessionStorage.getItem(navigationStorageKey);
        if (!serialized) return null;
        window.sessionStorage.removeItem(navigationStorageKey);
        saved = JSON.parse(serialized);
      } catch {
        return null;
      }

      if (!saved || typeof saved !== 'object') return null;

      const age = Date.now() - saved.savedAt;
      if (
        saved.pathname !== window.location.pathname ||
        !Number.isFinite(saved.scrollY) ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > navigationMaxAgeMs
      ) {
        return null;
      }

      return saved;
    };

    const savedNavigation = readSavedNavigation();
    if (savedNavigation) {
      const savedTab = tabs.find((tab) => tab.dataset.tab === savedNavigation.tab);
      if (savedTab) activateTab(savedTab);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.scrollTo(0, savedNavigation.scrollY));
      });
    }

    document.querySelectorAll('form.manager-form').forEach((form) => {
      form.addEventListener('submit', (event) => {
        const activeTab = tabs.find((tab) => tab.classList.contains('is-active')) || tabs[0];
        try {
          window.sessionStorage.setItem(
            navigationStorageKey,
            JSON.stringify({
              tab: activeTab?.dataset.tab,
              scrollY: window.scrollY,
              pathname: window.location.pathname,
              savedAt: Date.now(),
            }),
          );
        } catch {
          // Navigation still works when storage is unavailable.
        }

        if (form.matches('[data-sis-create]') || form.method.toLowerCase() !== 'post') return;

        const submitter = event.submitter;
        const actionTarget = submitter?.hasAttribute('formaction') ? submitter : form;
        const actionUrl = new URL(actionTarget.formAction || form.action, window.location.href);
        const pageQuery = new URLSearchParams(window.location.search);
        for (const key of new Set(pageQuery.keys())) {
          actionUrl.searchParams.delete(key);
          pageQuery.getAll(key).forEach((value) => actionUrl.searchParams.append(key, value));
        }

        if (actionTarget === form) form.action = actionUrl.toString();
        else actionTarget.formAction = actionUrl.toString();
      });
    });

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activateTab(tab));
      tab.addEventListener('keydown', (event) => {
        let nextIndex;

        switch (event.key) {
          case 'ArrowRight':
            nextIndex = (index + 1) % tabs.length;
            break;
          case 'ArrowLeft':
            nextIndex = (index - 1 + tabs.length) % tabs.length;
            break;
          case 'Home':
            nextIndex = 0;
            break;
          case 'End':
            nextIndex = tabs.length - 1;
            break;
          default:
            return;
        }

        event.preventDefault();
        activateTab(tabs[nextIndex], { moveFocus: true });
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeManagerTabs, { once: true });
  } else {
    initializeManagerTabs();
  }
})();