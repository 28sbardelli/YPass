const statusPanel = document.getElementById('statusPanel');
const kioskBadge = document.getElementById('kioskBadge');
const kioskCode = document.getElementById('kioskCode');
const kioskLocation = document.getElementById('kioskLocation');
const connectionBadge = document.getElementById('connectionBadge');
const enrollmentPanel = document.getElementById('enrollmentPanel');
const serverUrlInput = document.getElementById('serverUrl');
const enrollmentCodeDisplay = document.getElementById('enrollmentCodeDisplay');
const enrollmentExpiry = document.getElementById('enrollmentExpiry');
let registered = false;

function setStatus(message, tone = 'ok') {
  statusPanel.className = `status ${tone}`;
  statusPanel.innerHTML = `<strong>Status:</strong> ${message}`;
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    kioskBadge.textContent = `${data.kioskCode || 'KIOSK'} • ${data.kioskName || 'Hall Pass Kiosk'}`;
    kioskCode.textContent = data.kioskCode || '--';
    kioskLocation.textContent = data.kioskLocation || '--';
    connectionBadge.textContent = 'Online';
    registered = Boolean(data.registered);
    serverUrlInput.value = data.serverUrl || serverUrlInput.value;
    enrollmentPanel.hidden = registered;
    enrollmentCodeDisplay.textContent = data.enrollmentCode || 'Connecting...';
    enrollmentExpiry.textContent = data.enrollmentCode
      ? 'Waiting for registration in YPass Manager...'
      : 'Unable to connect. Retrying...';
    setStatus(
      registered ? 'Kiosk ready. Please identify the student.' : 'Registration required.',
      registered ? 'ok' : 'warn',
    );
    if (registered) {
      window.location.replace('/kiosk/pass');
    }
    return data;
  } catch (_error) {
    connectionBadge.textContent = 'Offline';
    setStatus('Unable to reach kiosk service.', 'warn');
    return null;
  }
}

async function pollEnrollment() {
  if (registered) return;
  try {
    const response = await fetch('/api/enrollment/status');
    const result = await response.json();
    if (result.ok && result.status === 'complete') {
      setStatus('Registration successful. Connecting to YPass...', 'ok');
      await loadConfig();
    } else if (!response.ok) {
      setStatus(result.message || 'Unable to connect to YPass. Retrying...', 'warn');
    }
  } catch (_error) {
    setStatus('Unable to connect to YPass. Retrying...', 'warn');
  }
}

loadConfig();
pollEnrollment();
setInterval(pollEnrollment, 3000);
