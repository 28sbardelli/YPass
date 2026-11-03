function formatActiveDuration(totalSeconds, label) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${label} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateActivePassTimers() {
  const now = Date.now();
  document.querySelectorAll('[data-active-pass-timer]').forEach((timer) => {
    const activeSince = Date.parse(timer.dataset.activeSince);
    if (!Number.isFinite(activeSince)) return;
    if (timer.dataset.activeLive !== 'true') return;
    const elapsedSeconds = Math.max(0, Math.floor((now - activeSince) / 1000));
    timer.textContent = formatActiveDuration(
      elapsedSeconds,
      timer.dataset.activeDurationLabel || 'Active for',
    );
  });
}

function formatFinishedTimes() {
  document.querySelectorAll('[data-finished-at]').forEach((time) => {
    const finishedAt = new Date(time.dataset.finishedAt);
    if (Number.isNaN(finishedAt.getTime())) return;
    time.textContent = `Finished ${new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(finishedAt)}`;
  });
}

updateActivePassTimers();
formatFinishedTimes();
window.setInterval(updateActivePassTimers, 1000);
