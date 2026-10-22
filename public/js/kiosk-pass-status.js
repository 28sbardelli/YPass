const kioskPendingPanel = document.querySelector('[data-kiosk-pending]');

if (kioskPendingPanel) {
  const checkPassStatus = async () => {
    try {
      const response = await fetch('/kiosk/pass/status', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (response.ok && !(await response.json()).pending) window.location.reload();
    } catch (_error) {
      // The next poll will retry while the central server is unavailable.
    }
  };

  setInterval(checkPassStatus, 2000);
}