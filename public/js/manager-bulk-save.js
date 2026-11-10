(() => {
  const buttons = document.querySelectorAll('[data-bulk-save]');
  if (!buttons.length) return;

  const setStatus = (panelName, message, isError = false) => {
    const status = document.querySelector(`[data-bulk-status="${panelName}"]`);
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };

  const savePanel = async (button) => {
    const panelName = button.dataset.bulkSave;
    const panel = document.querySelector(`[data-panel="${panelName}"]`);
    const forms = panel ? [...panel.querySelectorAll('[data-bulk-save-form]')] : [];

    if (!forms.length) {
      setStatus(panelName, 'There are no changes to save.');
      return;
    }

    button.disabled = true;
    setStatus(panelName, 'Saving changes...');

    try {
      for (const form of forms) {
        const response = await fetch(form.action, {
          method: form.method || 'POST',
          body: new URLSearchParams(new FormData(form)),
          credentials: 'same-origin',
          redirect: 'follow',
        });

        if (!response.ok) {
          throw new Error(`Save failed with status ${response.status}`);
        }
      }

      setStatus(panelName, `Saved ${forms.length} ${forms.length === 1 ? 'change' : 'changes'}.`);
      try {
        window.sessionStorage.setItem(
          'yp.manager.navigation',
          JSON.stringify({
            tab: panelName,
            scrollY: window.scrollY,
            pathname: window.location.pathname,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // Reload still works when storage is unavailable.
      }
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      console.error('Manager bulk save failed:', error);
      setStatus(panelName, 'Could not save all changes. Please try again.', true);
      button.disabled = false;
    }
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => savePanel(button));
  });
})();
