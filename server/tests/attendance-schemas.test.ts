import { describe, expect, it } from 'vitest';
import { absenceJustificationSchema, attendanceRosterQuerySchema, attendanceSummaryQuerySchema, markAttendanceSchema, markSubjectAttendanceSchema, subjectRosterQuerySchema } from '../src/modules/attendance/attendance.schemas';

describe('Attendance request validation', () => {
  it('rejects impossible calendar dates', () => {
    expect(attendanceRosterQuerySchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
  });

  it('rejects duplicate students within one marking batch', () => {
    const id = 'a0184c98-7f09-4b16-a22c-95b8dbf2a010';
    expect(markAttendanceSchema.safeParse({
      sectionId: id,
      date: '2026-10-24',
      records: [
        { studentId: id, status: 'PRESENT' },
        { studentId: id, status: 'ABSENT' },
      ],
    }).success).toBe(false);
  });

  it('accepts a valid date and attendance status', () => {
    expect(attendanceRosterQuerySchema.safeParse({ date: '2026-10-24' }).success).toBe(true);
  });

  it('requires a valid attendance record and a meaningful guardian explanation', () => {
    expect(absenceJustificationSchema.safeParse({ attendanceRecordId: 'bad', reason: 'Sick' }).success).toBe(false);
    expect(absenceJustificationSchema.safeParse({ attendanceRecordId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010', reason: '  ill  ' }).success).toBe(false);
    expect(absenceJustificationSchema.safeParse({ attendanceRecordId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010', reason: 'Child was ill' }).success).toBe(true);
  });

  it('validates subject period bounds and duplicate students', () => {
    const id = 'a0184c98-7f09-4b16-a22c-95b8dbf2a010';
    expect(subjectRosterQuerySchema.safeParse({ date: '2026-10-24', subjectId: id, periodNumber: '0' }).success).toBe(false);
    expect(markSubjectAttendanceSchema.safeParse({ sectionId: id, subjectId: id, date: '2026-10-24', periodNumber: 2, records: [{ studentId: id, status: 'PRESENT' }, { studentId: id, status: 'ABSENT' }] }).success).toBe(false);
    expect(markSubjectAttendanceSchema.safeParse({ sectionId: id, subjectId: id, date: '2026-10-24', periodNumber: 2, records: [{ studentId: id, status: 'PRESENT' }] }).success).toBe(true);
  });

  it('validates attendance summary date order and monitoring thresholds', () => {
    expect(attendanceSummaryQuerySchema.safeParse({ startDate: '2026-10-20', endDate: '2026-10-01', thresholdPercent: '10', minimumSchoolDays: '10' }).success).toBe(false);
    expect(attendanceSummaryQuerySchema.safeParse({ startDate: '2026-10-01', endDate: '2026-10-24', thresholdPercent: '101', minimumSchoolDays: '10' }).success).toBe(false);
    expect(attendanceSummaryQuerySchema.safeParse({ startDate: '2026-10-01', endDate: '2026-10-24', thresholdPercent: '10', minimumSchoolDays: '10' }).success).toBe(true);
  });
});
