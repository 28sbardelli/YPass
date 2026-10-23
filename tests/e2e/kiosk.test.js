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
    const student = await ctx.container.db
      .knex('students')
      .where({ student_number: '111111' })
      .first();

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
        studentNumber: student.student_number,
      });
    expect(scan.status).toBe(200);
    expect(scan.text).toContain(student.display_name);
    expect(scan.text).toContain('Choose destination');
    expect(scan.text).toContain('id="destinationSearch"');
    expect(scan.text).toContain('name="destinationLocationId"');
    expect(scan.text).toContain('data-destination-option');
    expect(scan.text).toContain('data-destination-list hidden');
    expect(scan.text).not.toContain('>Confirm full name</label>');
    expect(scan.text).not.toContain('id="studentName"');

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
        studentNumber: student.student_number,
        studentName: student.display_name,
        destinationLocationId: destination.id,
      });
    expect(pass.status).toBe(200);
    expect(pass.text).toContain('teacher must approve');
    expect(pass.text).toContain(
      'This kiosk is locked until the teacher accepts or cancels the pass.',
    );
    expect(pass.text).toContain('id="lockedStudentNumber"');
    expect(pass.text).not.toContain('Request teacher approval');

    const refreshed = await agent.get('/kiosk?kiosk=main-office');
    expect(refreshed.status).toBe(200);
    expect(refreshed.text).toContain('Destination locked: waiting for teacher approval.');

    const blocked = await agent
      .post('/kiosk/pass')
      .type('form')
      .send({
        _csrf: extractCsrf(pass.text),
        kioskCode: 'main-office',
        studentNumber: '222222',
        studentName: student.display_name,
        destinationLocationId: destination.id,
      });
    expect(blocked.status).toBe(200);
    expect(blocked.text).toContain(student.display_name);

    const stored = await ctx.container.db.knex('passes').where({ student_id: student.id }).first();
    expect(stored.status).toBe('pending_approval');
  });

  it('requires a central kiosk session for the server-rendered pass page', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled' });
    const kiosk = await ctx.container.db
      .knex('kiosks')
      .where({ kiosk_code: 'main-office' })
      .first();

    expect((await ctx.request.get('/kiosk/pass')).status).toBe(401);

    const agent = (await import('supertest')).default.agent(ctx.app);
    const session = await agent
      .post('/api/v1/kiosks/session')
      .set('x-kiosk-code', kiosk.kiosk_code)
      .set('x-kiosk-secret', 'change-me');
    expect(session.status).toBe(200);

    const page = await agent.get('/kiosk/pass');
    expect(page.status).toBe(200);
    expect(page.text).toContain(kiosk.name);
    expect(page.text).not.toContain('name="kioskCode"');

    const student = await ctx.container.db.knex('students').where({ student_number: '111111' }).first();
    const destination = await ctx.container.db
      .knex('locations')
      .whereNot('id', kiosk.location_id)
      .first();
    const scan = await agent
      .post('/kiosk/scan')
      .type('form')
      .send({ _csrf: extractCsrf(page.text), studentNumber: student.student_number });
    const requested = await agent
      .post('/kiosk/pass')
      .type('form')
      .send({
        _csrf: extractCsrf(scan.text),
        studentNumber: student.student_number,
        studentName: student.display_name,
        destinationLocationId: destination.id,
      });
    expect(requested.status).toBe(200);

    const pendingStatus = await agent.get('/kiosk/pass/status');
    expect(pendingStatus.body).toEqual({ pending: true });

    const origin = await ctx.container.db.knex('locations').where({ id: kiosk.location_id }).first();
    const pass = await ctx.container.db
      .knex('passes')
      .where({ student_id: student.id, origin_location_id: origin.id })
      .first();
    await ctx.container.passService.approvePass({
      passId: pass.id,
      userId: origin.teacher_user_id,
    });

    const resolvedStatus = await agent.get('/kiosk/pass/status');
    expect(resolvedStatus.body).toEqual({ pending: false });
    const reset = await agent.get('/kiosk/pass');
    expect(reset.text).toContain('id="studentNumber"');
    expect(reset.text).not.toContain('Destination locked: waiting for teacher approval.');

    const declinedStudent = await ctx.container.db
      .knex('students')
      .where({ student_number: '200001' })
      .first();
    const declinedScan = await agent
      .post('/kiosk/scan')
      .type('form')
      .send({ _csrf: extractCsrf(reset.text), studentNumber: declinedStudent.student_number });
    const declinedRequest = await agent
      .post('/kiosk/pass')
      .type('form')
      .send({
        _csrf: extractCsrf(declinedScan.text),
        studentNumber: declinedStudent.student_number,
        studentName: declinedStudent.display_name,
        destinationLocationId: destination.id,
      });
    expect(declinedRequest.status).toBe(200);
    const declinedPass = await ctx.container.db
      .knex('passes')
      .where({ student_id: declinedStudent.id, origin_location_id: origin.id })
      .first();
    await ctx.container.passService.cancelPass({
      passId: declinedPass.id,
      userId: origin.teacher_user_id,
    });

    expect((await agent.get('/kiosk/pass/status')).body).toEqual({ pending: false });
  });

  it('does not show destination selection after a round-trip pass ends', async () => {
    ctx = await createTestApp({ LOCAL_AUTH_EMAIL_FLOW: 'disabled' });
    const agent = (await import('supertest')).default.agent(ctx.app);
    const registerPage = await agent.get('/auth/register');
    await agent
      .post('/auth/register')
      .type('form')
      .send({
        _csrf: extractCsrf(registerPage.text),
        username: 'round-trip-operator',
        email: 'round-trip-operator@example.test',
        password: 'correct-horse-battery',
        displayName: 'Round Trip Operator',
      });
    const loginPage = await agent.get('/auth/login');
    await agent
      .post('/auth/login')
      .type('form')
      .send({
        _csrf: extractCsrf(loginPage.text),
        username: 'round-trip-operator',
        password: 'correct-horse-battery',
      });
    const student = await ctx.container.db
      .knex('students')
      .where({ student_number: '111111' })
      .first();
    const origin = await ctx.container.db.knex('locations').where({ name: 'Main Office' }).first();
    const destination = await ctx.container.db
      .knex('locations')
      .where({ type: 'round_trip' })
      .whereNot({ id: origin.id })
      .first();
    const destinationKiosk = await ctx.container.db
      .knex('kiosks')
      .where({ location_id: destination.id })
      .first();
    const request = await ctx.container.passService.requestPass({
      kioskCode: 'main-office',
      studentNumber: student.student_number,
      studentName: student.display_name,
      destinationLocationId: destination.id,
    });
    await ctx.container.passService.approvePass({
      passId: request.pass.id,
      userId: origin.teacher_user_id,
    });
    await ctx.container.passService.scanStudent({
      kioskCode: destinationKiosk.kiosk_code,
      studentNumber: student.student_number,
    });
    await ctx.container.passService.scanStudent({
      kioskCode: destinationKiosk.kiosk_code,
      studentNumber: student.student_number,
    });

    const kioskPage = await agent.get('/kiosk?kiosk=main-office');
    const page = await agent
      .post('/kiosk/scan')
      .type('form')
      .send({
        _csrf: extractCsrf(kioskPage.text),
        kioskCode: 'main-office',
        studentNumber: student.student_number,
      });

    expect(page.status).toBe(200);
    expect(page.text).toContain('Pass ended');
    expect(page.text).not.toContain('Choose destination');
  });
});

function extractCsrf(html) {
  return html.match(/name="_csrf" value="([^"]+)"/)?.[1] || '';
}
