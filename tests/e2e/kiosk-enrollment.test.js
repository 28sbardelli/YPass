import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestApp } from '../helpers/app.js';

describe('kiosk enrollment', () => {
  let ctx;

  afterEach(async () => {
    if (ctx) {
      await ctx.close();
      ctx = null;
    }
  });

  it('enrolls once and never stores the plaintext kiosk secret', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled' });
    const managerId = randomUUID();
    await ctx.container.db.knex('users').insert({
      id: managerId,
      display_name: 'Enrollment Manager',
      primary_email: `${managerId}@example.test`,
      status: 'active',
    });
    const location = await ctx.container.db.knex('locations').first();
    const created = await ctx.container.kioskService.createEnrollmentCode({
      createdBy: managerId,
      name: 'Library Kiosk',
      locationId: location.id,
    });

    const enrolled = await ctx.request.post('/api/v1/kiosks/enroll').send({
      enrollmentCode: created.code,
      softwareVersion: '1.2.3',
    });

    expect(enrolled.status).toBe(201);
    expect(enrolled.body.success).toBe(true);
    expect(enrolled.body.credentials.secret).toHaveLength(64);
    const kiosk = await ctx.container.db
      .knex('kiosks')
      .where({ kiosk_code: enrolled.body.kiosk.code })
      .first();
    expect(kiosk.secret_hash).not.toBe(enrolled.body.credentials.secret);
    expect(kiosk.software_version).toBe('1.2.3');
    expect(kiosk.type).toBeUndefined();

    const replay = await ctx.request.post('/api/v1/kiosks/enroll').send({
      enrollmentCode: created.code,
      softwareVersion: '1.2.3',
    });
    expect(replay.status).toBe(409);
  });

  it('generates a unique kiosk code when existing kiosks use custom codes', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled' });
    const managerId = randomUUID();
    await ctx.container.db.knex('users').insert({
      id: managerId,
      display_name: 'Enrollment Manager',
      primary_email: `${managerId}@example.test`,
      status: 'active',
    });
    const location = await ctx.container.db.knex('locations').first();
    const existing = await ctx.container.db.knex('kiosks').where({ kiosk_code: 'KIOSK-001' }).first();
    if (!existing) {
      await ctx.container.db.knex('kiosks').insert({
        id: randomUUID(),
        location_id: location.id,
        name: 'Existing numbered kiosk',
        kiosk_code: 'KIOSK-001',
        active: true,
      });
    }
    const created = await ctx.container.kioskService.createEnrollmentCode({
      createdBy: managerId,
      name: 'Custom code kiosk',
      locationId: location.id,
    });

    const enrolled = await ctx.request.post('/api/v1/kiosks/enroll').send({
      enrollmentCode: created.code,
      softwareVersion: '1.2.3',
    });

    expect(enrolled.status).toBe(201);
    expect(enrolled.body.kiosk.code).toBe('KIOSK-002');
  });

  it('lets an unconfigured kiosk start enrollment and receive credentials after manager completion', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled' });
    const started = await ctx.request.post('/api/v1/kiosks/enrollment/start').send({
      softwareVersion: '2.0.0',
    });
    expect(started.status).toBe(201);
    expect(started.body.enrollmentCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(started.body.enrollmentToken).toHaveLength(64);

    const location = await ctx.container.db.knex('locations').first();
    const completed = await ctx.container.kioskService.completeEnrollment({
      enrollmentCode: started.body.enrollmentCode,
      name: 'Automatic Kiosk',
      locationId: location.id,
      reqLike: { requestId: 'test', serverUrl: 'http://central.test' },
    });
    expect(completed.kiosk.code).toMatch(/^KIOSK-/);

    const delivered = await ctx.container.kioskService.enrollmentStatus({
      enrollmentCode: started.body.enrollmentCode,
      enrollmentToken: started.body.enrollmentToken,
    });
    expect(delivered.status).toBe('complete');
    expect(delivered.credentials.secret).toHaveLength(64);
    const replay = await ctx.container.kioskService.enrollmentStatus({
      enrollmentCode: started.body.enrollmentCode,
      enrollmentToken: started.body.enrollmentToken,
    });
    expect(replay.status).toBe('registered');
  });

  it('registers a kiosk through the manager web form using the kiosk enrollment code', async () => {
    ctx = await createTestApp({
      LOCAL_AUTH_EMAIL_FLOW: 'disabled',
      MANAGERS: 'kiosk-manager@example.test',
    });
    const { default: request } = await import('supertest');
    const agent = request.agent(ctx.app);
    const registerPage = await agent.get('/auth/register');
    const registration = await agent.post('/auth/register').type('form').send({
      _csrf: extractCsrf(registerPage.text),
      username: 'kiosk-manager',
      email: 'kiosk-manager@example.test',
      password: 'correct-horse-battery',
      displayName: 'Kiosk Manager',
    });
    expect(registration.status).toBe(302);

    const loginPage = await agent.get('/auth/login');
    const login = await agent.post('/auth/login').type('form').send({
      _csrf: extractCsrf(loginPage.text),
      username: 'kiosk-manager',
      password: 'correct-horse-battery',
    });
    expect(login.status).toBe(302);

    const started = await ctx.request.post('/api/v1/kiosks/enrollment/start').send({
      softwareVersion: '2.0.0',
    });
    expect(started.status).toBe(201);
    const managerPage = await agent.get('/manager');
    expect(managerPage.status).toBe(200);
    const location = await ctx.container.db.knex('locations').where({ name: 'Main Office' }).first();
    const response = await agent.post('/manager/kiosks/enrollment/complete').type('form').send({
      _csrf: extractCsrf(managerPage.text),
      name: 'Newly Registered Kiosk',
      enrollmentCode: started.body.enrollmentCode,
      locationId: location.id,
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/manager');
    const kiosk = await ctx.container.db.knex('kiosks').where({ name: 'Newly Registered Kiosk' }).first();
    expect(kiosk).toBeDefined();
    expect(kiosk.location_id).toBe(location.id);

    const invalidCodeResponse = await agent.post('/manager/kiosks/enrollment/complete').type('form').send({
      _csrf: extractCsrf(managerPage.text),
      name: 'Invalid Code Kiosk',
      enrollmentCode: 'ABCD-EFGH',
      locationId: location.id,
    });
    expect(invalidCodeResponse.status).toBe(404);
    expect(invalidCodeResponse.text).toContain('Enrollment code is invalid or expired');
    expect(
      await ctx.container.db.knex('kiosks').where({ name: 'Invalid Code Kiosk' }).first(),
    ).toBeUndefined();
  });

  it('rejects a manager completion that duplicates a kiosk name at the location', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled' });
    const location = await ctx.container.db.knex('locations').first();
    const existingKiosk = await ctx.container.db.knex('kiosks').where({ location_id: location.id }).first();
    const started = await ctx.container.kioskService.startEnrollment({});

    await expect(
      ctx.container.kioskService.completeEnrollment({
        enrollmentCode: started.enrollmentCode,
        name: existingKiosk.name,
        locationId: location.id,
      }),
    ).rejects.toThrow('A kiosk with that name already exists at this location');
  });
});

function extractCsrf(html) {
  return html.match(/name="_csrf" value="([^"]+)"/)?.[1] || '';
}
