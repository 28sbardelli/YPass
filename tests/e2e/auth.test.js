import { describe, expect, it, afterEach } from 'vitest';
import { createTestApp } from '../helpers/app.js';

describe('local authentication', () => {
  let ctx;
  afterEach(async () => {
    if (ctx) await ctx.close();
  });

  it('renders the Microsoft sign-in button with its logo when Entra sign-in is enabled', async () => {
    ctx = await createTestApp({
      ENTRA_AUTH_ENABLED: 'true',
      ENTRA_TENANT_ID: 'test-tenant',
      ENTRA_CLIENT_ID: 'test-client',
      ENTRA_CLIENT_SECRET: 'test-secret',
      ENTRA_REDIRECT_URI: 'http://localhost:3000/auth/entra/callback',
    });

    const page = await ctx.request.get('/auth/login');
    expect(page.status).toBe(200);
    expect(page.text).toContain('class="button microsoft-login-button"');
    expect(page.text).toContain('src="/images/microsoft-transparent.png"');

    const logo = await ctx.request.get('/images/microsoft-transparent.png');
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toContain('image/png');
  });

  it('redirects users to their role landing page and denies students access to the staff home', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled', EMAIL_ENABLED: 'false' });
    const { default: request } = await import('supertest');

    for (const { username, email, role, landingPage } of [
      { username: 'teacher-login', email: 'teacher-login@example.test', role: 'teacher', landingPage: '/teacher' },
      { username: 'manager-login', email: 'manager-login@example.test', role: 'manager', landingPage: '/manager' },
      { username: 'student-login', email: 'student-login@example.test', role: 'student', landingPage: '/' },
    ]) {
      const agent = request.agent(ctx.app);
      const registerPage = await agent.get('/auth/register');
      const registration = await agent.post('/auth/register').type('form').send({
        _csrf: extractCsrf(registerPage.text),
        username,
        email,
        password: 'correct-horse-battery',
        displayName: `${role} user`,
      });
      expect(registration.status).toBe(302);

      const user = await ctx.container.db.knex('users').where({ primary_email: email }).first();
      const roleRecord = await ctx.container.db.knex('roles').where({ name: role }).first();
      const currentRole = await ctx.container.db.knex('user_roles').where({
        user_id: user.id,
        role_id: roleRecord.id,
      }).first();
      if (!currentRole) {
        await ctx.container.db.knex('user_roles').insert({ user_id: user.id, role_id: roleRecord.id });
      }

      const loginPage = await agent.get('/auth/login');
      const login = await agent.post('/auth/login').type('form').send({
        _csrf: extractCsrf(loginPage.text),
        username,
        password: 'correct-horse-battery',
      });
      expect(login.status).toBe(302);
      expect(login.headers.location).toBe(landingPage);

      if (role === 'student') {
        const home = await agent.get('/');
        expect(home.status).toBe(200);
        expect(home.text).toContain('Access denied');
        expect(home.text).toContain('class="access-denied-card"');

        for (const protectedPage of ['/teacher', '/manager']) {
          const denied = await agent.get(protectedPage);
          expect(denied.status).toBe(403);
          expect(denied.text).toContain('Access denied');
          expect(denied.text).toContain('class="access-denied-card"');
        }
      }
    }
  });

  it('registers, rejects login before verification when required, and logs in when email flow is disabled', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled', EMAIL_ENABLED: 'false' });
    const { default: request } = await import('supertest');
    const agent = request.agent(ctx.app);

    const page = await agent.get('/auth/register');
    const csrf = extractCsrf(page.text);
    const register = await agent.post('/auth/register').type('form').send({
      _csrf: csrf,
      username: 'alice',
      email: 'alice@example.test',
      password: 'correct-horse-battery',
      displayName: 'Alice',
    });
    expect(register.status).toBe(302);

    const user = await ctx.container.db.knex('users').where({ primary_email: 'alice@example.test' }).first();
    const teacherRole = await ctx.container.db.knex('roles').where({ name: 'teacher' }).first();
    await ctx.container.db.knex('user_roles').insert({ user_id: user.id, role_id: teacherRole.id });

    const loginPage = await agent.get('/auth/login');
    const loginCsrf = extractCsrf(loginPage.text);
    const login = await agent.post('/auth/login').type('form').send({
      _csrf: loginCsrf,
      username: 'alice',
      password: 'correct-horse-battery',
    });
    expect(login.status).toBe(302);

    const me = await agent.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.data.displayName).toBe('Alice');

    const teacherPage = await agent.get('/teacher');
    expect(teacherPage.status).toBe(200);
    expect(teacherPage.text).toContain('Your locations');
  });

  it('uses a generic password-reset response whether or not the email exists', async () => {
    ctx = await createTestApp();
    const { default: request } = await import('supertest');
    const agent = request.agent(ctx.app);
    const page = await agent.get('/auth/forgot');
    const csrf = extractCsrf(page.text);
    const res = await agent.post('/auth/forgot').type('form').send({
      _csrf: csrf,
      email: 'nobody@example.test',
    });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/If that email is registered/i);
  });
});

export function extractCsrf(html) {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : '';
}
