import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app.js';

describe('staff pass controls', () => {
  let ctx;

  afterEach(async () => {
    if (ctx) {
      await ctx.close();
      ctx = null;
    }
  });

  it('limits approval to the teacher who owns a pass location and supports appointments', async () => {
    ctx = await createTestApp();
    const teacherId = randomUUID();
    const otherUserId = randomUUID();
    const users = [teacherId, otherUserId].map((id, index) => ({
      id,
      display_name: index ? 'Other Teacher' : 'Teacher One',
      primary_email: `${id}@example.test`,
      status: 'active',
    }));
    await ctx.container.db.knex('users').insert(users);
    const mainOffice = await ctx.container.db
      .knex('locations')
      .where({ name: 'Main Office' })
      .first();
    const counseling = await ctx.container.db
      .knex('locations')
      .where({ name: 'Counseling Office' })
      .first();
    await ctx.container.db
      .knex('locations')
      .where({ id: counseling.id })
      .update({ teacher_user_id: teacherId });

    const requested = await ctx.container.passService.requestPass({
      kioskCode: 'main-office',
      studentNumber: '111111',
      studentName: 'Test Student 111111',
      destinationLocationId: counseling.id,
    });
    await expect(
      ctx.container.passService.approvePass({ passId: requested.pass.id, userId: otherUserId }),
    ).rejects.toMatchObject({ status: 404 });

    const approved = await ctx.container.passService.approvePass({
      passId: requested.pass.id,
      userId: teacherId,
    });
    expect(approved.status).toBe('active');
    expect(approved.timeout_at).toBeTruthy();

    const appointment = await ctx.container.passService.createAppointment({
      userId: teacherId,
      studentNumber: '111111',
      studentName: 'Test Student 111111',
      originLocationId: counseling.id,
      destinationLocationId: mainOffice.id,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      notes: 'Testing appointment',
    });
    expect(appointment.appointment.status).toBe('scheduled');

    const manager = await ctx.container.passService.managerDashboard({ status: 'active' });
    expect(manager.passes).toHaveLength(1);
    expect(manager.passes[0].id).toBe(requested.pass.id);

    await ctx.container.db
      .knex('passes')
      .where({ id: requested.pass.id })
      .update({ timeout_at: new Date(Date.now() - 60 * 1000) });
    const timedOut = await ctx.container.passService.managerDashboard({ status: 'timedout' });
    expect(timedOut.passes).toHaveLength(1);
    expect(timedOut.passes[0].id).toBe(requested.pass.id);
    expect(timedOut.passes[0].display_status).toBe('timedout');
  });

  it('lets managers create and update students, locations, and kiosks', async () => {
    ctx = await createTestApp();
    const teacherId = randomUUID();
    await ctx.container.db.knex('users').insert({
      id: teacherId,
      display_name: 'Manager Teacher',
      primary_email: `${teacherId}@example.test`,
      status: 'active',
    });

    const student = await ctx.container.passService.createManagerStudent({
      studentNumber: '999999',
      studentName: 'New Student',
      status: 'active',
    });
    await expect(
      ctx.container.passService.createManagerStudent({
        studentNumber: '999999',
        studentName: 'Duplicate Student',
        status: 'active',
      }),
    ).rejects.toMatchObject({ status: 409 });
    await ctx.container.passService.updateManagerStudent({
      id: student.id,
      studentNumber: '999999',
      studentName: 'Updated Student',
      status: 'inactive',
    });

    const location = await ctx.container.passService.createManagerLocation({
      name: 'New Location',
      type: 'one_way',
      teacherUserId: teacherId,
      active: true,
    });
    const kiosk = await ctx.container.passService.createManagerKiosk({
      name: 'New Kiosk',
      kioskCode: 'new-kiosk',
      locationId: location.id,
      active: true,
    });
    await ctx.container.passService.updateManagerLocation({
      id: location.id,
      name: 'Updated Location',
      type: 'round_trip',
      teacherUserId: '',
      active: false,
    });
    await ctx.container.passService.updateManagerKiosk({
      id: kiosk.id,
      name: 'Updated Kiosk',
      kioskCode: 'updated-kiosk',
      locationId: location.id,
      active: false,
    });

    await expect(
      ctx.container.db.knex('students').where({ id: student.id }).first(),
    ).resolves.toMatchObject({
      display_name: 'Updated Student',
      status: 'inactive',
    });
    await expect(
      ctx.container.db.knex('locations').where({ id: location.id }).first(),
    ).resolves.toMatchObject({
      name: 'Updated Location',
      active: 0,
    });
    await expect(
      ctx.container.db.knex('kiosks').where({ id: kiosk.id }).first(),
    ).resolves.toMatchObject({
      kiosk_code: 'updated-kiosk',
      active: 0,
    });
  });
});
