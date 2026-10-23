const kioskPendingPanel = document.querySelector('[data-kiosk-pending]');

if (kioskPendingPanel) {
  let checking = false;

  const checkPassStatus = async () => {
    if (checking) return;
    checking = true;
    try {
      const response = await fetch('/kiosk/pass/status', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.ok && !(await response.json()).pending) window.location.replace('/kiosk/pass');
    } catch (_error) {
      // The next poll will retry while the central server is unavailable.
    } finally {
      checking = false;
    }
  };

  checkPassStatus();
  setInterval(checkPassStatus, 2000);
}