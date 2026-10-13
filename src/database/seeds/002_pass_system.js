import { randomUUID } from 'node:crypto';
import { sha256 } from '#utils/crypto.js';

const LOCATIONS = [
  {
    name: 'Counseling Office',
    type: 'round_trip',
    kioskName: 'Counseling kiosk',
    kioskCode: 'counseling-main',
  },
  {
    name: 'Main Office',
    type: 'round_trip',
    kioskName: 'Main Office kiosk',
    kioskCode: 'main-office',
  },
];

const TEST_STUDENT = {
  student_number: '111111',
  display_name: 'Test Student 111111',
  status: 'active',
};

const SAMPLE_STUDENTS = [
  'Avery Brooks',
  'Jordan Carter',
  'Morgan Davis',
  'Riley Ellis',
  'Casey Foster',
  'Taylor Grant',
  'Quinn Harris',
  'Parker James',
  'Reese Knight',
  'Rowan Lewis',
  'Hayden Moore',
  'Emerson Nelson',
  'Finley Owens',
  'Kendall Parker',
  'Blake Quinn',
  'Sawyer Reed',
  'Alexis Scott',
  'Dakota Turner',
  'Harper Underwood',
  'Charlie Vaughn',
  'Robin Walker',
  'Jamie Xavier',
  'Logan Young',
  'Peyton Zimmerman',
  'Skyler Adams',
].map((display_name, index) => ({
  student_number: String(200001 + index),
  display_name,
  status: 'active',
}));

/**
 * Seed the baseline pass-flow fixtures used by local development and tests.
 * @param {import('knex').Knex} knex
 */
export async function seed(knex) {
  const students = [TEST_STUDENT, ...SAMPLE_STUDENTS];
  for (const student of students) {
    const exists = await knex('students').where({ student_number: student.student_number }).first();
    if (!exists) {
      await knex('students').insert({ id: randomUUID(), ...student });
    }
  }

  for (const location of LOCATIONS) {
    let locationRow = await knex('locations').where({ name: location.name }).first();
    if (!locationRow) {
      locationRow = {
        id: randomUUID(),
        name: location.name,
        type: location.type,
        teacher_user_id: null,
        active: true,
      };
      await knex('locations').insert(locationRow);
    }

    const kioskExists = await knex('kiosks').where({ kiosk_code: location.kioskCode }).first();
    if (!kioskExists) {
      await knex('kiosks').insert({
        id: randomUUID(),
        location_id: locationRow.id,
        name: location.kioskName,
        kiosk_code: location.kioskCode,
        secret_hash: sha256('change-me'),
        active: true,
      });
    }
  }
}
