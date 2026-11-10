import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';

describe('manager form navigation', () => {
  let ctx;
  afterEach(async () => {
    if (ctx) await ctx.close();
  });

  it('keeps filters and pagination query state after saving a manager form', async () => {
    ctx = await createTestApp({
      MANAGERS: 'manager@example.test',
      LOCAL_AUTH_EMAIL_FLOW: 'disabled',
      EMAIL_ENABLED: 'false',
    });
    const { default: request } = await import('supertest');
    const agent = request.agent(ctx.app);

    const registerPage = await agent.get('/auth/register');
    await agent
      .post('/auth/register')
      .type('form')
      .send({
        _csrf: extractCsrf(registerPage.text),
        username: 'manager',
        email: 'manager@example.test',
        password: 'correct-horse-battery',
        displayName: 'Manager, Test',
      });
    const loginPage = await agent.get('/auth/login');
    await agent
      .post('/auth/login')
      .type('form')
      .send({
        _csrf: extractCsrf(loginPage.text),
        username: 'manager',
        password: 'correct-horse-battery',
      });

    const availableLocation = {
      id: randomUUID(),
      name: 'Unassigned Manager Location',
      type: 'one_way',
      active: true,
    };
    await ctx.container.db.knex('locations').insert(availableLocation);
    const occupiedLocation = await ctx.container.db.knex('locations').where({ name: 'Main Office' }).first();
    const occupiedKiosk = await ctx.container.db.knex('kiosks').where({ location_id: occupiedLocation.id }).first();
    const managerPage = await agent.get('/manager?status=timedout&page=3&appointmentsPage=2');
    expect(managerPage.text).toContain('data-kiosk-search');
    expect(managerPage.text).toContain('data-kiosk-code=');
    const registrationForm = managerPage.text.match(
      /<form method="post" action="\/manager\/kiosks\/enrollment\/complete"[\s\S]*?<\/form>/,
    )?.[0];
    expect(registrationForm).toContain(`value="${availableLocation.id}"`);
    expect(registrationForm).not.toContain(`value="${occupiedLocation.id}"`);
    const occupiedKioskForm = managerPage.text.match(
      new RegExp(`<form method="post" action="/manager/kiosks/update"[\\s\\S]*?name="id" value="${occupiedKiosk.id}"[\\s\\S]*?<\\/form>`),
    )?.[0];
    expect(occupiedKioskForm).toContain(`value="${occupiedLocation.id}" selected`);
    expect(managerPage.text).toContain('data-manager-pass-search');
    expect(managerPage.text).toContain('data-manager-appointment-search');
    expect(managerPage.text).toContain('data-user-role-search');
    const saved = await agent
      .post('/manager/students/create?status=timedout&page=3&appointmentsPage=2')
      .type('form')
      .send({
        _csrf: extractCsrf(managerPage.text),
        studentNumber: 'STU-100',
        studentName: 'Test Student',
        status: 'inactive',
      });

    expect(saved.status).toBe(302);
    const redirect = new URL(saved.headers.location, 'http://localhost');
    expect(redirect.pathname).toBe('/manager');
    expect(redirect.searchParams.get('status')).toBe('timedout');
    expect(redirect.searchParams.get('page')).toBe('3');
    expect(redirect.searchParams.get('appointmentsPage')).toBe('2');

    const updatedPage = await agent.get(saved.headers.location);
    expect(updatedPage.text).toContain('class="staff-row manager-form student-row"');
    expect(updatedPage.text).toMatch(/<option value="inactive" selected>Inactive<\/option>/);
  });
});

function extractCsrf(html) {
  return html.match(/name="_csrf" value="([^"]+)"/)?.[1] || '';
}