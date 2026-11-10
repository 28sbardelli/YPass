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
    await ctx.container.db.knex('locations').where({ id: availableLocation.id }).update({ bathroom: occupiedLocation.id });
    const managerPage = await agent.get('/manager?status=timedout&page=3&appointmentsPage=2');
    const removableKiosk = {
      id: randomUUID(),
      location_id: availableLocation.id,
      name: 'Removable Manager Kiosk',
      kiosk_code: `DEL-${randomUUID()}`,
      active: true,
    };
    await ctx.container.db.knex('kiosks').insert(removableKiosk);
    const managerUser = await ctx.container.db
      .knex('users')
      .where({ primary_email: 'manager@example.test' })
      .first();
    const kioskPassStudent = {
      id: randomUUID(),
      student_number: 'DEL-KIOSK',
      display_name: 'Kiosk Delete Student',
      status: 'active',
    };
    const locationPassStudent = {
      id: randomUUID(),
      student_number: 'DEL-LOCATION',
      display_name: 'Location Delete Student',
      status: 'active',
    };
    const appointmentStudent = {
      id: randomUUID(),
      student_number: 'DEL-APPOINTMENT',
      display_name: 'Location Appointment Student',
      status: 'active',
    };
    await ctx.container.db
      .knex('students')
      .insert([kioskPassStudent, locationPassStudent, appointmentStudent]);
    await ctx.container.db.knex('passes').insert([
      {
        id: randomUUID(),
        student_id: kioskPassStudent.id,
        origin_location_id: availableLocation.id,
        origin_kiosk_id: removableKiosk.id,
        destination_location_id: occupiedLocation.id,
        journey_type: 'one_way',
        status: 'active',
      },
      {
        id: randomUUID(),
        student_id: locationPassStudent.id,
        origin_location_id: occupiedLocation.id,
        origin_kiosk_id: occupiedKiosk.id,
        destination_location_id: availableLocation.id,
        journey_type: 'one_way',
        status: 'active',
      },
    ]);
    await ctx.container.db.knex('appointments').insert({
      id: randomUUID(),
      student_id: appointmentStudent.id,
      origin_location_id: occupiedLocation.id,
      destination_location_id: availableLocation.id,
      created_by: managerUser.id,
      scheduled_at: new Date(Date.now() + 60 * 60 * 1000),
      status: 'scheduled',
    });
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
    const locationForm = managerPage.text.match(
      /<form method="post" action="\/manager\/locations\/update"[\s\S]*?<\/form>/,
    )?.[0];
    expect(locationForm).toContain(
      '<button type="submit" formaction="/manager/locations/delete" formmethod="POST" class="danger-button decline"><img src="/images/trash.svg" width="15" height="15">Delete</button>',
    );
    expect(occupiedKioskForm).toContain(
      '<button type="submit" formaction="/manager/kiosks/delete" formmethod="POST" class="danger-button decline"><img src="/images/trash.svg" width="15" height="15">Delete</button>',
    );
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

    const deletedOccupiedLocation = await agent
      .post('/manager/locations/delete')
      .type('form')
      .send({ _csrf: extractCsrf(managerPage.text), id: occupiedLocation.id });
    expect(deletedOccupiedLocation.status).toBe(302);
    expect(
      await ctx.container.db.knex('locations').where({ id: occupiedLocation.id }).first(),
    ).toBeUndefined();
    expect(await ctx.container.db.knex('locations').where({ id: availableLocation.id }).first()).toMatchObject({
      bathroom: null,
    });
    expect(
      await ctx.container.db.knex('kiosks').where({ id: occupiedKiosk.id }).first(),
    ).toMatchObject({
      location_id: null,
      active: 0,
    });
    const locationPass = await ctx.container.db
      .knex('passes')
      .where({ student_id: locationPassStudent.id })
      .first();
    expect(locationPass).toMatchObject({
      origin_location_id: null,
      status: 'cancelled',
    });
    const appointment = await ctx.container.db
      .knex('appointments')
      .where({ student_id: appointmentStudent.id })
      .first();
    expect(appointment).toMatchObject({
      origin_location_id: null,
      status: 'cancelled',
    });
    const pageAfterLocationDelete = await agent.get('/manager');
    expect(pageAfterLocationDelete.text).toContain('DEL-LOCATION');
    expect(pageAfterLocationDelete.text).toContain('DEL-APPOINTMENT');
    expect(pageAfterLocationDelete.text).toContain('Unassigned → Unassigned Manager Location');
    expect(pageAfterLocationDelete.text).toContain('value="" selected>Unassigned</option>');

    const deletedKiosk = await agent
      .post('/manager/kiosks/delete')
      .type('form')
      .send({ _csrf: extractCsrf(managerPage.text), id: removableKiosk.id });
    expect(deletedKiosk.status).toBe(302);
    expect(
      await ctx.container.db.knex('kiosks').where({ id: removableKiosk.id }).first(),
    ).toBeUndefined();
    expect(
      await ctx.container.db.knex('passes').where({ student_id: kioskPassStudent.id }).first(),
    ).toMatchObject({
      origin_kiosk_id: null,
      status: 'cancelled',
    });

    const reassignedKiosk = await agent
      .post('/manager/kiosks/update')
      .type('form')
      .send({
        _csrf: extractCsrf(managerPage.text),
        id: occupiedKiosk.id,
        name: occupiedKiosk.name,
        kioskCode: occupiedKiosk.kiosk_code,
        locationId: availableLocation.id,
        active: 'true',
      });
    expect(reassignedKiosk.status).toBe(302);

    const deletedLocation = await agent
      .post('/manager/locations/delete')
      .type('form')
      .send({ _csrf: extractCsrf(managerPage.text), id: availableLocation.id });
    expect(deletedLocation.status).toBe(302);
    expect(
      await ctx.container.db.knex('locations').where({ id: availableLocation.id }).first(),
    ).toBeUndefined();
    expect(
      await ctx.container.db.knex('kiosks').where({ id: occupiedKiosk.id }).first(),
    ).toMatchObject({
      location_id: null,
      active: 0,
    });
  });
});

function extractCsrf(html) {
  return html.match(/name="_csrf" value="([^"]+)"/)?.[1] || '';
}
