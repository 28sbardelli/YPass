import { describe, expect, it } from 'vitest';
import { normalizeStudent } from '#services/sis/sis-normalizer.js';

describe('SIS student normalizer', () => {
  it('keeps only the canonical student fields', () => {
    expect(
      normalizeStudent({
        sourcedId: '10001',
        givenName: 'James',
        familyName: 'Anderson',
        status: 'active',
        email: 'james@example.test',
        grades: ['10'],
      }),
    ).toEqual({
      sisId: '10001',
      firstName: 'James',
      lastName: 'Anderson',
      active: true,
    });
  });

  it('accepts already canonical records', () => {
    expect(
      normalizeStudent({ sisId: '10002', firstName: 'Ada', lastName: 'Lovelace', active: false }),
    ).toEqual({
      sisId: '10002',
      firstName: 'Ada',
      lastName: 'Lovelace',
      active: false,
    });
  });

  it('rejects records without a usable SIS id or name', () => {
    expect(() => normalizeStudent({ givenName: 'James', familyName: 'Anderson' })).toThrow(
      /SIS student ID/,
    );
    expect(() => normalizeStudent({ sourcedId: '10003', givenName: 'James' })).toThrow(
      /first and last name/,
    );
  });
});
