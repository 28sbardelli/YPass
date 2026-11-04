const section = document.querySelector('[data-sis-create]');
const message = document.querySelector('[data-sis-message]');

if (section) {
  const csrf = section.querySelector('[name="_csrf"]').value;
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || 'SIS request failed');
    return body;
  };

  section.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(section);
    const provider = form.get('provider');
    const configuration = {
      baseUrl: form.get('baseUrl'),
      version: form.get('version'),
      authType: form.get('authType'),
    };
    const credentials = {
      username: form.get('username'),
      password: form.get('password'),
      token: form.get('token'),
    };
    try {
      await request('/api/v1/admin/sis/connections', {
        method: 'POST',
        body: JSON.stringify({
          _csrf: csrf,
          provider,
          connectionName: form.get('connectionName'),
          configuration,
          credentials,
          syncIntervalSeconds: Number(form.get('syncIntervalSeconds') || 0),
        }),
      });
      message.textContent = 'Connection saved. Reloading...';
      window.location.reload();
    } catch (error) {
      message.textContent = error.message;
    }
  });

  document.querySelectorAll('[data-sis-connection]').forEach((row) => {
    const id = row.dataset.connectionId;
    const history = row.querySelector('[data-sis-history]');
    const run = async (path, method = 'POST') => {
      const body = method === 'POST' ? JSON.stringify({ _csrf: csrf }) : undefined;
      return request(`/api/v1/admin/sis/connections/${id}${path}`, { method, body });
    };
    row.querySelector('[data-sis-test]').addEventListener('click', async () => {
      try {
        await run('/test');
        message.textContent = 'Connection test succeeded.';
      } catch (error) {
        message.textContent = error.message;
      }
    });
    row.querySelector('[data-sis-sync]').addEventListener('click', async () => {
      try {
        await run('/sync');
        message.textContent = 'Synchronization completed.';
        window.location.reload();
      } catch (error) {
        message.textContent = error.message;
      }
    });
    row.querySelector('[data-sis-history-toggle]').addEventListener('click', async () => {
      try {
        const result = await run('/sync-history', 'GET');
        history.textContent = JSON.stringify(result.data, null, 2);
        history.hidden = !history.hidden;
      } catch (error) {
        message.textContent = error.message;
      }
    });
    row.querySelector('[data-sis-delete]').addEventListener('click', async () => {
      if (!window.confirm('Delete this SIS connection?')) return;
      try {
        await run('', 'DELETE');
        window.location.reload();
      } catch (error) {
        message.textContent = error.message;
      }
    });
  });
}
