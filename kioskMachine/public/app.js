const statusPanel = document.getElementById('statusPanel');
const enrollmentCodeDisplay = document.getElementById('enrollmentCodeDisplay');
const enrollmentExpiry = document.getElementById('enrollmentExpiry');
let registered = false;

function setStatus(message, tone = 'ok') {
  statusPanel.className = `status ${tone}`;
  statusPanel.replaceChildren();
  const label = document.createElement('strong');
  label.textContent = 'Status: ';
  statusPanel.append(label, document.createTextNode(message));
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    registered = Boolean(data.registered);
    enrollmentCodeDisplay.textContent = data.enrollmentCode || 'Connecting...';
    enrollmentExpiry.textContent = data.enrollmentCode
      ? 'Waiting for registration in YPass Manager...'
      : 'Unable to connect. Retrying...';
    if (registered) {
      window.location.replace('/kiosk/pass');
      return data;
    }
    setStatus('Registration required.', 'warn');
    return data;
  } catch (_error) {
    setStatus('Unable to reach kiosk service.', 'warn');
    return null;
  }
}

async function pollEnrollment() {
  if (registered) {
    window.location.replace('/kiosk/pass');
    return;
  }
  try {
    const response = await fetch('/api/enrollment/status');
    const result = await response.json();
    if (result.ok && result.status === 'complete') {
      registered = true;
      setStatus('Registration successful. Loading pass page...', 'ok');
      window.location.replace('/kiosk/pass');
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
