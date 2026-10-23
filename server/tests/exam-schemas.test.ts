import { describe, expect, it } from 'vitest';
import {
  createExamSessionSchema,
  createExamScheduleSchema,
  enterMarksSchema,
  requestGradeChangeSchema,
  assignInvigilatorsSchema,
} from '../src/modules/exams/exams.schemas';

describe('Examination request validation', () => {
  it('rejects an exam session whose end date precedes its start date', () => {
    expect(createExamSessionSchema.safeParse({
      academicTermId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010',
      name: 'Winter exams',
      startDate: '2026-12-20',
      endDate: '2026-12-10',
    }).success).toBe(false);
  });

  it('rejects schedules with invalid time ranges or pass marks above maximum', () => {
    const base = {
      examSessionId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010',
      subjectId: 'b0184c98-7f09-4b16-a22c-95b8dbf2a010',
      examDate: '2026-12-20',
      startTime: '09:00',
      endTime: '08:59',
      maxMarks: 100,
      passMarks: 101,
    };
    expect(createExamScheduleSchema.safeParse(base).success).toBe(false);
  });

  it('rejects duplicate students and absent marks that are not zero', () => {
    const id = 'a0184c98-7f09-4b16-a22c-95b8dbf2a010';
    expect(enterMarksSchema.safeParse({
      examScheduleId: id,
      marks: [
        { studentId: id, marksObtained: 12, isAbsent: true },
        { studentId: id, marksObtained: 12, isAbsent: false },
      ],
    }).success).toBe(false);
  });

  it('requires a reason for grade changes', () => {
    expect(requestGradeChangeSchema.safeParse({
      examMarkId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010',
      proposedMarks: 40,
      reason: '  no  ',
    }).success).toBe(false);
  });

  it('rejects duplicate invigilators in a schedule assignment', () => {
    const id = 'a0184c98-7f09-4b16-a22c-95b8dbf2a010';
    expect(assignInvigilatorsSchema.safeParse({ userIds: [id, id] }).success).toBe(false);
    expect(assignInvigilatorsSchema.safeParse({ userIds: [id] }).success).toBe(true);
  });
});
