import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';

describe('kiosk pass flow', () => {
  let ctx;

  afterEach(async () => {
    if (ctx) {
      await ctx.close();
      ctx = null;
    }
  });

  it('identifies a student by barcode and creates a pending pass request', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled' });
    const agent = (await import('supertest')).default.agent(ctx.app);
    const studentId = 'student-kiosk-test';
    await ctx.container.db.knex('students').insert({
      id: studentId,
      student_number: '10001',
      display_name: 'Jordan Test',
      status: 'active',
    });

    const registerPage = await agent.get('/auth/register');
    const registered = await agent
      .post('/auth/register')
      .type('form')
      .send({
        _csrf: extractCsrf(registerPage.text),
        username: 'kiosk-operator',
        email: 'kiosk-operator@example.test',
        password: 'correct-horse-battery',
        displayName: 'Kiosk Operator',
      });
    expect(registered.status).toBe(302);

    const loginPage = await agent.get('/auth/login');
    const loggedIn = await agent
      .post('/auth/login')
      .type('form')
      .send({
        _csrf: extractCsrf(loginPage.text),
        username: 'kiosk-operator',
        password: 'correct-horse-battery',
      });
    expect(loggedIn.status).toBe(302);

    const kioskPage = await agent.get('/kiosk?kiosk=main-office');
    expect(kioskPage.status).toBe(200);
    const scan = await agent
      .post('/kiosk/scan')
      .type('form')
      .send({
        _csrf: extractCsrf(kioskPage.text),
        kioskCode: 'main-office',
        studentNumber: '10001',
      });
    expect(scan.status).toBe(200);
    expect(scan.text).toContain('Jordan Test');
    expect(scan.text).toContain('Choose destination');

    const destination = await ctx.container.db
      .knex('locations')
      .whereNot('name', 'Main Office')
      .first();
    const pass = await agent
      .post('/kiosk/pass')
      .type('form')
      .send({
        _csrf: extractCsrf(scan.text),
        kioskCode: 'main-office',
        studentNumber: '10001',
        studentName: 'Jordan Test',
        destinationLocationId: destination.id,
      });
    expect(pass.status).toBe(200);
    expect(pass.text).toContain('teacher must approve');

    const stored = await ctx.container.db.knex('passes').where({ student_id: studentId }).first();
    expect(stored.status).toBe('pending_approval');
  });

  it('requires a central kiosk session for the server-rendered pass page', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled' });
    const location = await ctx.container.db.knex('locations').first();
    const started = await ctx.container.kioskService.startEnrollment({ softwareVersion: '2.1.0' });
    await ctx.container.kioskService.completeEnrollment({
      enrollmentCode: started.enrollmentCode,
      name: 'Central Pass Kiosk',
      locationId: location.id,
      type: 'ROUND_TRIP',
      reqLike: { requestId: 'test', serverUrl: 'http://central.test' },
    });
    const credentials = await ctx.container.kioskService.enrollmentStatus({
      enrollmentCode: started.enrollmentCode,
      enrollmentToken: started.enrollmentToken,
    });

    expect((await ctx.request.get('/kiosk/pass')).status).toBe(401);

    const agent = (await import('supertest')).default.agent(ctx.app);
    const session = await agent
      .post('/api/v1/kiosks/session')
      .set('x-kiosk-code', credentials.kiosk.code)
      .set('x-kiosk-secret', credentials.credentials.secret);
    expect(session.status).toBe(200);

    const page = await agent.get('/kiosk/pass');
    expect(page.status).toBe(200);
    expect(page.text).toContain('Central Pass Kiosk');
    expect(page.text).not.toContain('name="kioskCode"');
  });
});

function extractCsrf(html) {
  return html.match(/name="_csrf" value="([^"]+)"/)?.[1] || '';
}
