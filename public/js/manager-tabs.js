(() => {
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