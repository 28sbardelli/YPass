import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('database migration manifest', () => {
  it('restores the historically applied 012 migration files', async () => {
    const migrationDir = path.join(process.cwd(), 'src/database/migrations');
    const files = readdirSync(migrationDir).filter((file) => file.endsWith('.js')).sort();

    expect(files).toContain('012_appointment_student_time_unique.js');
    expect(files).toContain('012_staff_roles.js');
    expect(files).toContain('016_repair_staff_roles.js');

    const [appointmentUnique, staffRoles, repairStaffRoles] = await Promise.all([
      import(pathToFileURL(path.join(migrationDir, '012_appointment_student_time_unique.js')).href),
      import(pathToFileURL(path.join(migrationDir, '012_staff_roles.js')).href),
      import(pathToFileURL(path.join(migrationDir, '016_repair_staff_roles.js')).href),
    ]);

    expect(typeof appointmentUnique.up).toBe('function');
    expect(typeof appointmentUnique.down).toBe('function');
    expect(typeof staffRoles.up).toBe('function');
    expect(typeof staffRoles.down).toBe('function');
    expect(typeof repairStaffRoles.up).toBe('function');
    expect(typeof repairStaffRoles.down).toBe('function');
  });
});
