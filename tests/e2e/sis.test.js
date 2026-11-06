import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';
import { extractCsrf } from './auth.test.js';

describe('SIS administration API', () => {
  let ctx;
  afterEach(async () => {
    if (ctx) await ctx.close();
  });

  it('requires a manager and never returns stored credentials', async () => {
    ctx = await createTestApp({
      SIS_ENABLED: 'true',
      MANAGERS: 'sis-admin@example.test',
      LOCAL_AUTH_EMAIL_FLOW: 'disabled',
      EMAIL_ENABLED: 'false',
    });
    expect((await ctx.request.get('/api/v1/admin/sis/connections')).status).toBe(401);

    const agent = (await import('supertest')).default.agent(ctx.app);
    const registerPage = await agent.get('/auth/register');
    await agent
      .post('/auth/register')
      .type('form')
      .send({
        _csrf: extractCsrf(registerPage.text),
        username: 'sis-admin',
        email: 'sis-admin@example.test',
        password: 'correct-horse-battery',
        displayName: 'SIS Admin',
      });
    const loginPage = await agent.get('/auth/login');
    await agent
      .post('/auth/login')
      .type('form')
      .send({
        _csrf: extractCsrf(loginPage.text),
        username: 'sis-admin',
        password: 'correct-horse-battery',
      });
    const managerPage = await agent.get('/manager');
    const csrf = extractCsrf(managerPage.text);
    expect(managerPage.text).toContain('SIS integrations');
    expect(managerPage.text).toContain('id="manager-tab-sis"');
    expect(managerPage.text).toContain('id="manager-panel-sis"');
    expect(managerPage.text).toContain('/js/sis-manager.js?v=2');

    const created = await agent
      .post('/api/v1/admin/sis/connections')
      .set('x-csrf-token', csrf)
      .send({
        provider: 'mock',
        connectionName: 'Secret test connection',
        configuration: { students: [] },
        credentials: { token: 'super-secret-token' },
        syncIntervalSeconds: 0,
      });
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toContain('super-secret-token');

    const listed = await agent.get('/api/v1/admin/sis/connections');
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain('super-secret-token');

    const connectionId = listed.body.data[0].id;
    const deleted = await agent
      .delete(`/api/v1/admin/sis/connections/${connectionId}`)
      .set('x-csrf-token', csrf);
    expect(deleted.status).toBe(204);

    const afterDelete = await agent.get('/api/v1/admin/sis/connections');
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.data).toHaveLength(0);
  });
});
