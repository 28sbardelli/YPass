import { z } from 'zod';

const kioskCode = z.string().trim().min(1).max(64);
const studentNumber = z.string().trim().min(1).max(64);

export const kioskEnrollmentSchema = z.object({
  enrollmentCode: z.string().trim().min(9).max(16),
  softwareVersion: z.string().trim().max(64).optional(),
});

export const kioskEnrollmentStartSchema = z.object({
  softwareVersion: z.string().trim().max(64).optional(),
});

export const kioskEnrollmentStatusSchema = z.object({
  enrollmentCode: z.string().trim().min(9).max(16),
  enrollmentToken: z.string().trim().length(64),
});

export const kioskScanSchema = z.object({
  kioskCode,
  studentNumber,
  _csrf: z.string().optional(),
});

export const kioskSessionScanSchema = kioskScanSchema.omit({ kioskCode: true });

export const createPassRequestSchema = z.object({
  kioskCode,
  studentNumber,
  studentName: z.string().trim().min(1).max(120),
  destinationLocationId: z.string().uuid(),
  _csrf: z.string().optional(),
});

export const kioskSessionPassSchema = createPassRequestSchema.omit({ kioskCode: true });
