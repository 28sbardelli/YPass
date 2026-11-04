import { ValidationError } from '#errors';

const INACTIVE_STATUSES = new Set(['inactive', 'disabled', 'tobedeleted', 'deleted']);

/**
 * Convert provider-specific student data into the minimal SIS contract.
 * @param {object} record
 * @returns {{sisId: string, firstName: string, lastName: string, active: boolean}}
 */
export function normalizeStudent(record) {
  const sisId = stringValue(
    record?.sisId ?? record?.sourcedId ?? record?.studentNumber ?? record?.id,
  );
  const firstName = stringValue(record?.firstName ?? record?.givenName ?? record?.name?.givenName);
  const lastName = stringValue(record?.lastName ?? record?.familyName ?? record?.name?.familyName);

  if (!sisId) {
    throw new ValidationError('SIS student ID is required');
  }
  if (!firstName || !lastName) {
    throw new ValidationError('SIS student first and last name are required');
  }

  return {
    sisId,
    firstName,
    lastName,
    active: activeValue(record),
  };
}

function stringValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function activeValue(record) {
  if (typeof record?.active === 'boolean') return record.active;
  const status = stringValue(record?.status)?.toLowerCase();
  return !status || !INACTIVE_STATUSES.has(status);
}
