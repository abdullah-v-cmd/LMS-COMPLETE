import { prisma } from '../../utils/prisma';
import { CorrectionStatus, ExamSessionStatus, SubjectResultStatus, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../types';
import { calculateGrade, DEFAULT_GRADE_BANDS } from './grading';
import { env } from '../../config/env';
import { signReportCard, verifyReportCardSignature } from './report-card-integrity';
import { AssessmentService } from '../assessment/assessment.service';

export class ExamsService {
  static async getGradingScale(institutionId: string) {
    const bands = await prisma.institutionGradeBand.findMany({ where: { institutionId }, orderBy: { minimumPercentage: 'desc' }, select: { id: true, minimumPercentage: true, gradeLetter: true, gpa: true } });
    return { source: bands.length ? 'institution' : 'default', bands: bands.length ? bands : DEFAULT_GRADE_BANDS };
  }

  static async setGradingScale(institutionId: string, bands: Array<{ minimumPercentage: number; gradeLetter: string; gpa: number }>) {
    return prisma.$transaction(async (tx) => {
      await tx.institutionGradeBand.deleteMany({ where: { institutionId } });
      await tx.institutionGradeBand.createMany({ data: bands.map((band) => ({ ...band, gradeLetter: band.gradeLetter.toUpperCase(), institutionId })) });
      return tx.institutionGradeBand.findMany({ where: { institutionId }, orderBy: { minimumPercentage: 'desc' }, select: { id: true, minimumPercentage: true, gradeLetter: true, gpa: true } });
    }, { isolationLevel: 'Serializable' });
  }

  static async getExamSessions(institutionId: string) {
    return prisma.examSession.findMany({
      where: { institutionId },
      include: {
        academicTerm: { include: { academicYear: { select: { id: true, name: true } } } },
        schedules: {
          include: {
            subject: true,
            assessmentItems: {
              select: {
                id: true,
                title: true,
                maxMarks: true,
                weightagePercentage: true,
                category: { select: { id: true, name: true, weightagePercentage: true } },
              },
            },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  static async getInvigilatorCandidates(institutionId: string) {
    return prisma.teacherProfile.findMany({
      where: { institutionId, user: { isActive: true } },
      select: { id: true, employeeCode: true, user: { select: { id: true, firstName: true, lastName: true, role: true } } },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
  }

  static async getScheduleInvigilators(institutionId: string, scheduleId: string) {
    const schedule = await prisma.examSchedule.findFirst({ where: { id: scheduleId, examSession: { institutionId } }, select: { id: true } });
    if (!schedule) throw { status: 404, message: 'Exam schedule not found' };
    return prisma.examInvigilator.findMany({
      where: { institutionId, examScheduleId: scheduleId, isActive: true },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true, teacherProfile: { select: { employeeCode: true } } } } },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
  }

  static async assignInvigilators(institutionId: string, scheduleId: string, assignedByUserId: string, userIds: string[]) {
    const schedule = await prisma.examSchedule.findFirst({
      where: { id: scheduleId, examSession: { institutionId } },
      include: { examSession: { select: { status: true } } },
    });
    if (!schedule) throw { status: 404, message: 'Exam schedule not found' };
    if (schedule.examSession.status === ExamSessionStatus.PUBLISHED) throw { status: 409, message: 'Published exam sessions cannot be changed' };

    return prisma.$transaction(async (tx) => {
      const candidates = await tx.teacherProfile.findMany({
        where: { institutionId, userId: { in: userIds }, user: { isActive: true } },
        select: { userId: true },
      });
      if (candidates.length !== userIds.length) throw { status: 400, message: 'Every invigilator must be an active staff member in this institution' };

      if (userIds.length) {
        const existing = await tx.examInvigilator.findMany({
          where: { institutionId, userId: { in: userIds }, isActive: true, examScheduleId: { not: scheduleId } },
          include: { examSchedule: { select: { id: true, examDate: true, startTime: true, endTime: true, roomNumber: true, examSession: { select: { name: true } } } } },
        });
        const sameDay = existing.filter((assignment) => assignment.examSchedule.examDate.toISOString().slice(0, 10) === schedule.examDate.toISOString().slice(0, 10)
          && assignment.examSchedule.startTime < schedule.endTime && assignment.examSchedule.endTime > schedule.startTime);
        if (sameDay.length) throw { status: 409, message: 'An invigilator is already assigned to an overlapping exam schedule', conflicts: sameDay.map((item) => ({ userId: item.userId, examScheduleId: item.examScheduleId, session: item.examSchedule.examSession.name, roomNumber: item.examSchedule.roomNumber })) };
      }

      await tx.examInvigilator.updateMany({ where: { institutionId, examScheduleId: scheduleId, isActive: true, userId: { notIn: userIds } }, data: { isActive: false } });
      for (const userId of userIds) {
        await tx.examInvigilator.upsert({
          where: { examScheduleId_userId: { examScheduleId: scheduleId, userId } },
          update: { institutionId, assignedByUserId, assignedAt: new Date(), isActive: true },
          create: { institutionId, examScheduleId: scheduleId, userId, assignedByUserId },
        });
      }
      return tx.examInvigilator.findMany({
        where: { institutionId, examScheduleId: scheduleId, isActive: true },
        include: { user: { select: { id: true, firstName: true, lastName: true, role: true, teacherProfile: { select: { employeeCode: true } } } } },
        orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      });
    }, { isolationLevel: 'Serializable' });
  }

  static async getMarksRoster(institutionId: string, user: AuthenticatedUser, scheduleId: string) {
    const schedule = await prisma.examSchedule.findFirst({
      where: { id: scheduleId, examSession: { institutionId } },
      select: {
        id: true,
        subjectId: true,
        maxMarks: true,
        passMarks: true,
        roomNumber: true,
        pushStatus: true,
        pushedAt: true,
        pushedByUserId: true,
        pushVersion: true,
        subject: { select: { id: true, name: true, code: true } },
        examSession: { select: { id: true, status: true, name: true, academicTermId: true } },
        assessmentItems: {
          select: {
            id: true,
            title: true,
            maxMarks: true,
            weightagePercentage: true,
            category: { select: { id: true, name: true, weightagePercentage: true } },
          },
        },
      },
    });
    if (!schedule) throw { status: 404, message: 'Exam schedule not found' };
    const teacherRoles: UserRole[] = [UserRole.ROLE_SUBJECT_TEACHER, UserRole.ROLE_TEACHING_ASSISTANT];
    const teacherRole = teacherRoles.includes(user.role);
    const teacher = teacherRole ? await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } }) : null;
    if (teacherRole && !teacher) throw { status: 403, message: 'Teacher profile is not assigned to this institution' };
    const assignments = await prisma.teacherAssignment.findMany({ where: { subjectId: schedule.subjectId, ...(teacher ? { teacherId: teacher.id } : {}), section: { classGrade: { institutionId } } }, select: { sectionId: true } });
    const sectionIds = [...new Set(assignments.map((item) => item.sectionId))];
    if (!sectionIds.length) return { schedule, students: [] };
    const students = await prisma.studentProfile.findMany({
      where: { institutionId, sectionId: { in: sectionIds }, status: 'ENROLLED' },
      select: {
        id: true,
        admissionNumber: true,
        rollNumber: true,
        sectionId: true,
        section: {
          select: {
            id: true,
            name: true,
            classGrade: { select: { id: true, name: true, level: true } },
          },
        },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ sectionId: 'asc' }, { rollNumber: 'asc' }],
    });
    const marks = await prisma.examMark.findMany({ where: { examScheduleId: schedule.id, studentId: { in: students.map((student) => student.id) } }, select: { id: true, studentId: true, marksObtained: true, isAbsent: true, remarks: true } });
    const byStudent = new Map(marks.map((mark) => [mark.studentId, mark]));

    const sections = await prisma.section.findMany({
      where: { id: { in: sectionIds } },
      select: { id: true, name: true, classGrade: { select: { id: true, name: true } } },
    });

    return {
      schedule,
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        className: s.classGrade.name,
        label: `${s.classGrade.name} - ${s.name}`,
      })),
      students: students.map((student) => ({ ...student, mark: byStudent.get(student.id) ?? null })),
    };
  }

  static async getPendingGradeChanges(institutionId: string) {
    return prisma.gradeChangeRequest.findMany({
      where: { status: CorrectionStatus.PENDING, examMark: { examSchedule: { examSession: { institutionId } } } },
      include: {
        examMark: {
          include: {
            student: { select: { admissionNumber: true, rollNumber: true, user: { select: { firstName: true, lastName: true } } } },
            examSchedule: { include: { subject: true, examSession: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  static async createExamSession(institutionId: string, data: { academicTermId: string; name: string; startDate: string; endDate: string }) {
    const term = await prisma.academicTerm.findFirst({
      where: { id: data.academicTermId, academicYear: { institutionId } },
    });
    if (!term) throw { status: 404, message: 'Academic term not found in this institution' };
    return prisma.examSession.create({
      data: {
        institutionId,
        academicTermId: data.academicTermId,
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: ExamSessionStatus.SCHEDULED,
      },
    });
  }

  static async createExamSchedule(institutionId: string, data: { examSessionId: string; subjectId: string; examDate: string; startTime: string; endTime: string; maxMarks: number; passMarks: number; roomNumber?: string; assessmentItemId?: string | null }) {
    const [session, subject] = await Promise.all([
      prisma.examSession.findFirst({ where: { id: data.examSessionId, institutionId } }),
      prisma.subject.findFirst({ where: { id: data.subjectId, institutionId } }),
    ]);
    if (!session) throw { status: 404, message: 'Exam session not found in this institution' };
    if (!subject) throw { status: 404, message: 'Subject not found in this institution' };
    const examDate = new Date(data.examDate);
    if (examDate < session.startDate || examDate > session.endDate) {
      throw { status: 400, message: 'Exam date must fall within the exam session dates' };
    }
    if (session.status === ExamSessionStatus.PUBLISHED) throw { status: 409, message: 'Published exam sessions cannot be changed' };

    let validatedItem: any = null;
    if (data.assessmentItemId) {
      validatedItem = await prisma.assessmentItem.findFirst({
        where: { id: data.assessmentItemId, category: { assessmentScheme: { institutionId } } },
        include: { category: { include: { assessmentScheme: true } } },
      });
      if (!validatedItem) throw { status: 404, message: 'Assessment component not found in this institution' };
      if (validatedItem.category.assessmentScheme.subjectId !== data.subjectId) {
        throw { status: 400, message: 'Assessment component must belong to the same subject as the exam schedule.' };
      }
      if (session.academicTermId && validatedItem.category.assessmentScheme.academicTermId !== session.academicTermId) {
        throw { status: 400, message: 'Assessment component must belong to the same academic term as the exam schedule.' };
      }
      if (validatedItem.examScheduleId) {
        throw { status: 409, message: 'This assessment component is already linked to another exam schedule.' };
      }
    }

    const schedule = await prisma.examSchedule.create({
      data: {
        examSessionId: data.examSessionId,
        subjectId: data.subjectId,
        examDate,
        startTime: data.startTime,
        endTime: data.endTime,
        maxMarks: data.maxMarks,
        passMarks: data.passMarks,
        roomNumber: data.roomNumber || null,
        pushStatus: 'NOT_PUSHED',
      },
      include: { subject: true, examSession: true, assessmentItems: true },
    });

    if (validatedItem) {
      await prisma.assessmentItem.update({
        where: { id: validatedItem.id },
        data: { examScheduleId: schedule.id },
      });
    }

    return schedule;
  }

  static async linkAssessmentComponent(
    institutionId: string,
    user: AuthenticatedUser,
    scheduleId: string,
    assessmentItemId: string | null
  ) {
    const schedule = await prisma.examSchedule.findFirst({
      where: { id: scheduleId, examSession: { institutionId } },
      include: {
        examSession: true,
        subject: true,
        assessmentItems: true,
      },
    });

    if (!schedule) throw { status: 404, message: 'Exam schedule not found' };

    if (user.role === UserRole.ROLE_SUBJECT_TEACHER || user.role === UserRole.ROLE_TEACHING_ASSISTANT) {
      const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId } });
      if (!teacher) throw { status: 403, message: 'Teacher profile is not assigned to this institution' };
      const assigned = await prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, subjectId: schedule.subjectId },
      });
      if (!assigned) throw { status: 403, message: 'You are not assigned to teach this subject' };
    }

    const termId = schedule.examSession.academicTermId;
    const lockedResults = await prisma.subjectResult.findMany({
      where: {
        institutionId,
        subjectId: schedule.subjectId,
        ...(termId ? { academicTermId: termId } : {}),
        status: { in: [SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT, SubjectResultStatus.UNDER_EXAM_REVIEW, SubjectResultStatus.APPROVED, SubjectResultStatus.OFFICIALLY_PUBLISHED] },
      },
    });
    if (lockedResults.length > 0) {
      throw {
        status: 403,
        message: 'Cannot link or unlink assessment components because subject results are formally locked.',
      };
    }

    if (assessmentItemId) {
      const item = await prisma.assessmentItem.findFirst({
        where: {
          id: assessmentItemId,
          category: {
            assessmentScheme: { institutionId },
          },
        },
        include: {
          category: {
            include: {
              assessmentScheme: true,
            },
          },
        },
      });

      if (!item) throw { status: 404, message: 'Assessment component not found in this institution' };

      if (item.category.assessmentScheme.subjectId !== schedule.subjectId) {
        throw {
          status: 400,
          message: 'Assessment component must belong to the same subject as the exam schedule.',
        };
      }

      if (
        schedule.examSession.academicTermId &&
        item.category.assessmentScheme.academicTermId !== schedule.examSession.academicTermId
      ) {
        throw {
          status: 400,
          message: 'Assessment component must belong to the same academic term as the exam schedule.',
        };
      }

      if (item.examScheduleId && item.examScheduleId !== scheduleId) {
        throw {
          status: 409,
          message: 'This assessment component is already linked to another exam schedule.',
        };
      }

      await prisma.assessmentItem.updateMany({
        where: { examScheduleId: scheduleId, id: { not: assessmentItemId } },
        data: { examScheduleId: null },
      });

      await prisma.assessmentItem.update({
        where: { id: assessmentItemId },
        data: { examScheduleId: scheduleId },
      });

      return {
        message: 'Assessment component linked to exam schedule successfully.',
        scheduleId,
        assessmentItemId,
        assessmentItemTitle: item.title,
      };
    } else {
      await prisma.assessmentItem.updateMany({
        where: { examScheduleId: scheduleId },
        data: { examScheduleId: null },
      });

      return {
        message: 'Assessment component unlinked from exam schedule.',
        scheduleId,
        assessmentItemId: null,
      };
    }
  }

  static async enterMarks(
    institutionId: string,
    user: AuthenticatedUser,
    data: {
      examScheduleId: string;
      allowUpdate?: boolean;
      pushImmediately?: boolean;
      marks: Array<{ studentId: string; marksObtained: number; isAbsent?: boolean; remarks?: string }>;
    }
  ) {
    const schedule = await prisma.examSchedule.findFirst({
      where: { id: data.examScheduleId, examSession: { institutionId } },
      include: {
        examSession: true,
        assessmentItems: {
          include: {
            category: {
              include: {
                assessmentScheme: true,
              },
            },
          },
        },
      },
    });

    if (!schedule) {
      throw { status: 404, message: 'Exam schedule not found' };
    }

    if (schedule.examSession.status === ExamSessionStatus.PUBLISHED) {
      throw { status: 409, message: 'Published exam sessions cannot accept mark changes' };
    }
    const studentIds = data.marks.map((item) => item.studentId);
    if (new Set(studentIds).size !== studentIds.length) throw { status: 400, message: 'A student may appear only once in a marks batch' };
    const students = await prisma.studentProfile.findMany({
      where: { id: { in: studentIds }, institutionId, status: 'ENROLLED' },
      select: { id: true, sectionId: true },
    });
    if (students.length !== studentIds.length) throw { status: 400, message: 'Every student must be actively enrolled in this institution' };
    if (data.marks.some((item) => item.isAbsent && item.marksObtained !== 0)) {
      throw { status: 400, message: 'Absent students must have zero marks' };
    }

    for (const item of data.marks) {
      if (item.marksObtained > schedule.maxMarks) {
        throw {
          status: 400,
          message: `Marks obtained (${item.marksObtained}) cannot exceed max marks (${schedule.maxMarks})`,
        };
      }
    }

    // Check if formal subject results are submitted or locked for these students
    const termId = schedule.examSession.academicTermId;
    const lockedResults = await prisma.subjectResult.findMany({
      where: {
        institutionId,
        subjectId: schedule.subjectId,
        studentId: { in: studentIds },
        ...(termId ? { academicTermId: termId } : {}),
        status: { in: [SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT, SubjectResultStatus.UNDER_EXAM_REVIEW, SubjectResultStatus.APPROVED, SubjectResultStatus.OFFICIALLY_PUBLISHED] },
      },
    });
    if (lockedResults.length > 0) {
      throw {
        status: 403,
        message: 'Exam marks cannot be edited because subject results have been formally submitted to the Examination Department. Please submit a formal marks correction request.',
      };
    }

    if (!data.allowUpdate) {
      const existingMarks = await prisma.examMark.findMany({
        where: { examScheduleId: schedule.id, studentId: { in: studentIds } },
        select: { studentId: true },
      });
      if (existingMarks.length > 0) throw { status: 409, message: 'Marks are already entered; use the grade correction workflow to change them' };
    }

    if (user.role === UserRole.ROLE_SUBJECT_TEACHER || user.role === UserRole.ROLE_TEACHING_ASSISTANT) {
      const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId } });
      if (!teacher) throw { status: 403, message: 'Teacher profile is not assigned to this institution' };
      const assigned = await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.id, subjectId: schedule.subjectId }, select: { sectionId: true } });
      const sectionIds = new Set(assigned.map((item) => item.sectionId));
      if (!students.every((student) => sectionIds.has(student.sectionId))) throw { status: 403, message: 'Marks may only be entered for students in your assigned subject sections' };
    }

    const res = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of data.marks) {
        if (item.marksObtained > schedule.maxMarks) {
          throw {
            status: 400,
            message: `Marks obtained (${item.marksObtained}) cannot exceed max marks (${schedule.maxMarks})`,
          };
        }

        const mark = await tx.examMark.upsert({
          where: {
            examScheduleId_studentId: {
              examScheduleId: data.examScheduleId,
              studentId: item.studentId,
            },
          },
          update: {
            marksObtained: item.marksObtained,
            isAbsent: item.isAbsent || false,
            enteredByUserId: user.id,
            remarks: item.remarks || null,
            updatedAt: new Date(),
          },
          create: {
            examScheduleId: data.examScheduleId,
            studentId: item.studentId,
            marksObtained: item.marksObtained,
            isAbsent: item.isAbsent || false,
            enteredByUserId: user.id,
            remarks: item.remarks || null,
          },
        });
        results.push(mark);
      }

      const newPushStatus = schedule.pushStatus === 'PUSHED' ? 'UPDATED_MARKS_AWAITING_REPUSH' : 'PUSH_PENDING';
      await tx.examSchedule.update({
        where: { id: schedule.id },
        data: { pushStatus: newPushStatus },
      });

      if (data.pushImmediately && schedule.assessmentItems.length > 0) {
        for (const cItem of schedule.assessmentItems) {
          for (const item of data.marks) {
            let scaledMarks = item.marksObtained;
            if (schedule.maxMarks > 0 && cItem.maxMarks > 0 && schedule.maxMarks !== cItem.maxMarks) {
              scaledMarks = Number(((item.marksObtained / schedule.maxMarks) * cItem.maxMarks).toFixed(2));
            }

            await tx.studentAssessmentMark.upsert({
              where: {
                assessmentItemId_studentId: {
                  assessmentItemId: cItem.id,
                  studentId: item.studentId,
                },
              },
              create: {
                assessmentItemId: cItem.id,
                studentId: item.studentId,
                marksObtained: item.isAbsent ? 0 : scaledMarks,
                isAbsent: item.isAbsent || false,
                isExcused: false,
                remarks: item.remarks || 'Auto-synced from Exam Marks',
                enteredByUserId: user.id,
                status: 'PUBLISHED',
              },
              update: {
                marksObtained: item.isAbsent ? 0 : scaledMarks,
                isAbsent: item.isAbsent || false,
                remarks: item.remarks || 'Auto-synced from Exam Marks',
                enteredByUserId: user.id,
                updatedAt: new Date(),
              },
            });
          }
        }
      }

      return { marks: results, pushStatus: newPushStatus };
    });

    if (data.pushImmediately && schedule.assessmentItems.length > 0) {
      for (const cItem of schedule.assessmentItems) {
        const scheme = cItem.category.assessmentScheme;
        for (const item of data.marks) {
          const student = students.find((s) => s.id === item.studentId);
          await AssessmentService.recalculateStudentSubjectResult(
            institutionId,
            item.studentId,
            schedule.subjectId,
            student?.sectionId || scheme.sectionId || '',
            scheme.academicTermId,
            scheme.id
          ).catch(() => {});
        }
      }
    }

    return res.marks;
  }

  static async pushMarksToAssessment(institutionId: string, user: AuthenticatedUser, scheduleId: string) {
    const schedule = await prisma.examSchedule.findFirst({
      where: { id: scheduleId, examSession: { institutionId } },
      include: {
        examSession: true,
        subject: true,
        marks: true,
        assessmentItems: {
          include: {
            category: {
              include: {
                assessmentScheme: true,
              },
            },
          },
        },
      },
    });

    if (!schedule) throw { status: 404, message: 'Exam schedule not found' };

    // Strict Teacher Authorization
    if (user.role === UserRole.ROLE_SUBJECT_TEACHER || user.role === UserRole.ROLE_TEACHING_ASSISTANT) {
      const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId } });
      if (!teacher) throw { status: 403, message: 'Teacher profile is not assigned to this institution' };
      const assigned = await prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, subjectId: schedule.subjectId },
      });
      if (!assigned) throw { status: 403, message: 'You are not assigned to teach this subject' };
    }

    const studentIds = schedule.marks.map((m) => m.studentId);
    // Check if formal subject results are submitted or locked
    const termId = schedule.examSession.academicTermId;
    const lockedResults = await prisma.subjectResult.findMany({
      where: {
        institutionId,
        subjectId: schedule.subjectId,
        studentId: { in: studentIds },
        ...(termId ? { academicTermId: termId } : {}),
        status: { in: [SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT, SubjectResultStatus.UNDER_EXAM_REVIEW, SubjectResultStatus.APPROVED, SubjectResultStatus.OFFICIALLY_PUBLISHED] },
      },
    });
    if (lockedResults.length > 0) {
      throw {
        status: 403,
        message: 'Exam marks cannot be pushed because subject results are formally locked after submission to the Examination Department. Please submit a formal marks correction request.',
      };
    }

    if (schedule.assessmentItems.length === 0) {
      throw {
        status: 400,
        message: 'No linked assessment component found for this exam schedule. Please link an assessment component first.',
      };
    }

    if (schedule.marks.length === 0) {
      throw {
        status: 400,
        message: 'No marks entered for this exam schedule. Enter student marks first before pushing.',
      };
    }

    const nextVersion = (schedule.pushVersion ?? 0) + 1;
    const syncedMarksData: Array<{ studentId: string; marksObtained: number; isAbsent: boolean }> = [];

    await prisma.$transaction(async (tx) => {
      for (const cItem of schedule.assessmentItems) {
        for (const mark of schedule.marks) {
          let scaledMarks = mark.marksObtained;
          if (schedule.maxMarks > 0 && cItem.maxMarks > 0 && schedule.maxMarks !== cItem.maxMarks) {
            scaledMarks = Number(((mark.marksObtained / schedule.maxMarks) * cItem.maxMarks).toFixed(2));
          }

          await tx.studentAssessmentMark.upsert({
            where: {
              assessmentItemId_studentId: {
                assessmentItemId: cItem.id,
                studentId: mark.studentId,
              },
            },
            create: {
              assessmentItemId: cItem.id,
              studentId: mark.studentId,
              marksObtained: mark.isAbsent ? 0 : scaledMarks,
              isAbsent: mark.isAbsent || false,
              isExcused: false,
              remarks: mark.remarks || `Pushed from Exam Schedule v${nextVersion}`,
              enteredByUserId: user.id,
              status: 'PUBLISHED',
            },
            update: {
              marksObtained: mark.isAbsent ? 0 : scaledMarks,
              isAbsent: mark.isAbsent || false,
              remarks: mark.remarks || `Pushed from Exam Schedule v${nextVersion}`,
              enteredByUserId: user.id,
              updatedAt: new Date(),
            },
          });

          syncedMarksData.push({
            studentId: mark.studentId,
            marksObtained: mark.isAbsent ? 0 : scaledMarks,
            isAbsent: mark.isAbsent,
          });
        }
      }

      await tx.examSchedule.update({
        where: { id: schedule.id },
        data: {
          pushStatus: 'PUSHED',
          pushedAt: new Date(),
          pushedByUserId: user.id,
          pushVersion: nextVersion,
        },
      });

      await tx.examPushRecord.create({
        data: {
          institutionId,
          examScheduleId: schedule.id,
          assessmentItemId: schedule.assessmentItems[0].id,
          pushedByUserId: user.id,
          pushVersion: nextVersion,
          studentCount: schedule.marks.length,
          syncedMarks: syncedMarksData,
        },
      });

      await tx.subjectResultAudit.create({
        data: {
          actorId: user.id,
          action: 'EXAM_MARKS_PUSHED',
          reason: `Pushed ${schedule.marks.length} marks from Exam Schedule v${nextVersion}`,
          newState: {
            examScheduleId: schedule.id,
            pushVersion: nextVersion,
            studentCount: schedule.marks.length,
            timestamp: new Date(),
          },
        },
      });
    });

    // Recalculate subject results for all affected students
    const students = await prisma.studentProfile.findMany({
      where: { id: { in: studentIds }, institutionId },
      select: { id: true, sectionId: true },
    });

    for (const cItem of schedule.assessmentItems) {
      const scheme = cItem.category.assessmentScheme;
      for (const student of students) {
        await AssessmentService.recalculateStudentSubjectResult(
          institutionId,
          student.id,
          schedule.subjectId,
          student.sectionId || scheme.sectionId || '',
          scheme.academicTermId,
          scheme.id
        ).catch(() => {});
      }
    }

    return {
      message: `Successfully pushed ${schedule.marks.length} marks to Assessment Schemes and Gradebook (version ${nextVersion}).`,
      pushStatus: 'PUSHED',
      pushedAt: new Date(),
      pushVersion: nextVersion,
      syncedCount: schedule.marks.length,
      linkedAssessmentTitle: schedule.assessmentItems[0]?.title,
    };
  }

  static async requestGradeChange(
    institutionId: string,
    user: AuthenticatedUser,
    data: { examMarkId: string; proposedMarks: number; reason: string }
  ) {
    const mark = await prisma.examMark.findFirst({
      where: { id: data.examMarkId, examSchedule: { examSession: { institutionId } } },
      include: { examSchedule: { include: { examSession: true } }, student: true },
    });

    if (!mark) {
      throw { status: 404, message: 'Exam mark record not found' };
    }

    if (data.proposedMarks > mark.examSchedule.maxMarks) {
      throw {
        status: 400,
        message: `Proposed marks cannot exceed max marks (${mark.examSchedule.maxMarks})`,
      };
    }

    if (mark.examSchedule.examSession.status === ExamSessionStatus.PUBLISHED) throw { status: 409, message: 'Published results cannot be changed' };
    if (user.role !== UserRole.ROLE_SUBJECT_TEACHER) throw { status: 403, message: 'Only the assigned subject teacher may request a grade change' };
    const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId } });
    const assignment = teacher && await prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, subjectId: mark.examSchedule.subjectId, sectionId: mark.student.sectionId },
    });
    if (!assignment) throw { status: 403, message: 'You are not assigned to this student and subject' };
    const pending = await prisma.gradeChangeRequest.findFirst({ where: { examMarkId: mark.id, status: CorrectionStatus.PENDING } });
    if (pending) throw { status: 409, message: 'A grade change request is already pending for this mark' };

    return prisma.gradeChangeRequest.create({
      data: {
        examMarkId: data.examMarkId,
        originalMarks: mark.marksObtained,
        proposedMarks: data.proposedMarks,
        reason: data.reason,
        requestedByUserId: user.id,
        status: CorrectionStatus.PENDING,
      },
    });
  }

  static async reviewGradeChange(
    institutionId: string,
    requestId: string,
    reviewerUserId: string,
    data: { status: 'APPROVED' | 'REJECTED' }
  ) {
    const changeReq = await prisma.gradeChangeRequest.findFirst({
      where: { id: requestId, examMark: { examSchedule: { examSession: { institutionId } } } },
      include: { examMark: { include: { examSchedule: { include: { examSession: true } } } } },
    });

    if (!changeReq) {
      throw { status: 404, message: 'Grade change request not found' };
    }

    if (changeReq.status !== CorrectionStatus.PENDING) {
      throw { status: 400, message: 'Request has already been reviewed' };
    }

    // Maker-Checker Rule: Requester cannot self-approve
    if (changeReq.requestedByUserId === reviewerUserId) {
      throw { status: 403, message: 'Maker-Checker violation: You cannot approve your own grade correction request' };
    }
    if (changeReq.examMark.examSchedule.examSession.status === ExamSessionStatus.PUBLISHED) throw { status: 409, message: 'Published results cannot be changed' };

    const updatedReq = await prisma.$transaction(async (tx) => {
      const claimed = await tx.gradeChangeRequest.updateMany({
        where: { id: requestId, status: CorrectionStatus.PENDING },
        data: {
          status: data.status as CorrectionStatus,
          approvedByUserId: reviewerUserId,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw { status: 409, message: 'Grade change request has already been reviewed' };
      const updatedReq = await tx.gradeChangeRequest.findUniqueOrThrow({ where: { id: requestId } });

      if (data.status === 'APPROVED') {
        const updatedMark = await tx.examMark.updateMany({
          where: { id: changeReq.examMarkId, marksObtained: changeReq.originalMarks },
          data: {
            marksObtained: changeReq.proposedMarks,
            remarks: `Moderated: ${changeReq.reason}`,
            updatedAt: new Date(),
          },
        });
        if (updatedMark.count !== 1) throw { status: 409, message: 'The mark changed after this request was submitted' };

        // Also sync to connected AssessmentItems
        const connectedItems = await tx.assessmentItem.findMany({
          where: { examScheduleId: changeReq.examMark.examScheduleId },
          include: { category: { include: { assessmentScheme: true } } },
        });

        for (const cItem of connectedItems) {
          const schedule = changeReq.examMark.examSchedule;
          let scaledMarks = changeReq.proposedMarks;
          if (schedule.maxMarks > 0 && cItem.maxMarks > 0 && schedule.maxMarks !== cItem.maxMarks) {
            scaledMarks = Number(((changeReq.proposedMarks / schedule.maxMarks) * cItem.maxMarks).toFixed(2));
          }

          await tx.studentAssessmentMark.upsert({
            where: {
              assessmentItemId_studentId: {
                assessmentItemId: cItem.id,
                studentId: changeReq.examMark.studentId,
              },
            },
            update: {
              marksObtained: scaledMarks,
              remarks: `Updated via Exam Grade Change: ${changeReq.reason}`,
              enteredByUserId: reviewerUserId,
              updatedAt: new Date(),
            },
            create: {
              assessmentItemId: cItem.id,
              studentId: changeReq.examMark.studentId,
              marksObtained: scaledMarks,
              remarks: `Updated via Exam Grade Change: ${changeReq.reason}`,
              enteredByUserId: reviewerUserId,
              status: 'PUBLISHED',
            },
          });
        }
      }

      return updatedReq;
    });

    if (data.status === 'APPROVED') {
      const connectedItems = await prisma.assessmentItem.findMany({
        where: { examScheduleId: changeReq.examMark.examScheduleId },
        include: { category: { include: { assessmentScheme: true } } },
      });
      for (const cItem of connectedItems) {
        const scheme = cItem.category.assessmentScheme;
        const student = await prisma.studentProfile.findUnique({
          where: { id: changeReq.examMark.studentId },
          select: { sectionId: true },
        });
        await AssessmentService.recalculateStudentSubjectResult(
          institutionId,
          changeReq.examMark.studentId,
          changeReq.examMark.examSchedule.subjectId,
          student?.sectionId || scheme.sectionId || '',
          scheme.academicTermId,
          scheme.id
        ).catch(() => {});
      }
    }

    return updatedReq;
  }

  static async publishResults(institutionId: string, examSessionId: string) {
    const session = await prisma.examSession.findFirst({
      where: { id: examSessionId, institutionId },
      include: {
        schedules: {
          include: {
            subject: true,
            marks: { include: { student: true } },
          },
        },
      },
    });

    if (!session) {
      throw { status: 404, message: 'Exam session not found' };
    }

    const savedGradeBands = await prisma.institutionGradeBand.findMany({ where: { institutionId }, select: { minimumPercentage: true, gradeLetter: true, gpa: true } });
    const gradeBands = savedGradeBands.length ? savedGradeBands : DEFAULT_GRADE_BANDS;

    if (session.schedules.length === 0) throw { status: 409, message: 'An exam session needs at least one schedule before results can be published' };
    const pendingChanges = await prisma.gradeChangeRequest.count({
      where: { status: CorrectionStatus.PENDING, examMark: { examSchedule: { examSessionId } } },
    });
    if (pendingChanges > 0) throw { status: 409, message: 'Resolve all pending grade change requests before publication' };

    const totalMarksCount = session.schedules.reduce((acc, s) => acc + s.marks.length, 0);
    if (totalMarksCount === 0) {
      throw { status: 400, message: 'Cannot publish results: No student marks have been entered for this exam session yet.' };
    }

    // Verify marks completeness for schedules that have been conducted and marked
    for (const schedule of session.schedules) {
      if (schedule.marks.length === 0) continue;
      const assignments = await prisma.teacherAssignment.findMany({
        where: { subjectId: schedule.subjectId },
        select: { sectionId: true },
      });
      const sectionIds = [...new Set(assignments.map((assignment) => assignment.sectionId))];
      if (sectionIds.length === 0) continue;
      const roster = await prisma.studentProfile.findMany({
        where: { institutionId, sectionId: { in: sectionIds }, status: 'ENROLLED' },
        select: { id: true },
      });
      const markedIds = new Set(schedule.marks.map((mark) => mark.studentId));
      if (roster.length > 0 && roster.some((student) => !markedIds.has(student.id))) {
        throw { status: 409, message: `Marks are incomplete for ${schedule.subject.name} (some enrolled students are missing scores)` };
      }
    }

    // Aggregate marks per student across all schedules in this session
    const studentAggregates: Record<
      string,
      { totalObtained: number; totalMax: number; count: number }
    > = {};

    for (const schedule of session.schedules) {
      for (const mark of schedule.marks) {
        if (!studentAggregates[mark.studentId]) {
          studentAggregates[mark.studentId] = { totalObtained: 0, totalMax: 0, count: 0 };
        }
        studentAggregates[mark.studentId].totalObtained += mark.isAbsent ? 0 : mark.marksObtained;
        studentAggregates[mark.studentId].totalMax += schedule.maxMarks;
        studentAggregates[mark.studentId].count += 1;
      }
    }

    return prisma.$transaction(async (tx) => {
      const reportCardIds: Array<{ id: string; studentId: string; percentage: number }> = [];
      for (const [studentId, agg] of Object.entries(studentAggregates)) {
        const percentage = agg.totalMax > 0 ? (agg.totalObtained / agg.totalMax) * 100 : 0;
        const { gpa, gradeLetter: letter } = calculateGrade(percentage, gradeBands);

        const card = await tx.studentReportCard.upsert({
          where: {
            studentId_examSessionId: {
              studentId,
              examSessionId,
            },
          },
          update: {
            totalMarks: agg.totalObtained,
            percentage,
            gpa,
            gradeLetter: letter,
            isPublished: true,
            publishedAt: new Date(),
          },
          create: {
            institutionId,
            studentId,
            examSessionId,
            totalMarks: agg.totalObtained,
            percentage,
            gpa,
            gradeLetter: letter,
            isPublished: true,
            publishedAt: new Date(),
          },
        });
        reportCardIds.push({ id: card.id, studentId, percentage });
      }

      const ranked = [...reportCardIds].sort((a, b) => b.percentage - a.percentage || a.studentId.localeCompare(b.studentId));
      for (let index = 0; index < ranked.length; index += 1) {
        const current = ranked[index];
        const rank = 1 + ranked.filter((item) => item.percentage > current.percentage).length;
        await tx.studentReportCard.update({ where: { id: current.id }, data: { rank } });
      }

      for (const card of await tx.studentReportCard.findMany({ where: { institutionId, examSessionId } })) {
        await tx.studentReportCard.update({ where: { id: card.id }, data: { verificationSignature: signReportCard(card, env.REPORT_CARD_SIGNING_SECRET ?? env.JWT_ACCESS_SECRET) } });
      }

      await tx.examSession.update({
        where: { id: examSessionId },
        data: { status: ExamSessionStatus.PUBLISHED },
      });

      return { message: 'Results published successfully', studentsProcessed: Object.keys(studentAggregates).length };
    });
  }

  static async getReportCards(institutionId: string, user: AuthenticatedUser, studentId?: string, examSessionId?: string, sectionId?: string) {
    let whereCondition: any = { institutionId };

    const studentProfile = await prisma.studentProfile.findFirst({
      where: { userId: user.id },
    });
    const isStudent = user.role === UserRole.ROLE_STUDENT || String(user.role).toUpperCase().includes('STUDENT');

    if (isStudent || studentProfile) {
      if (!studentProfile || studentProfile.institutionId !== institutionId) return [];

      // Security: Students can only view their own report cards
      if (studentId && studentId !== studentProfile.id) {
        throw { status: 403, message: 'Access denied: You may only view your own report cards' };
      }

      whereCondition = {
        institutionId,
        studentId: studentProfile.id,
        isPublished: true,
      };
    } else if (user.role === UserRole.ROLE_PARENT) {
      const parentProfile = await prisma.parentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!parentProfile) return [];
      const relations = await prisma.studentParentRelation.findMany({
        where: { parentId: parentProfile.id, student: { institutionId } },
      });
      const childIds = relations.map((r) => r.studentId);
      if (childIds.length === 0) return [];

      if (studentId) {
        if (!childIds.includes(studentId)) {
          throw { status: 403, message: 'Access denied: You can only view report cards for your linked children' };
        }
        whereCondition = {
          institutionId,
          studentId,
          isPublished: true,
        };
      } else {
        whereCondition = {
          institutionId,
          studentId: { in: childIds },
          isPublished: true,
        };
      }
    } else if (
      user.role === UserRole.ROLE_SUBJECT_TEACHER ||
      user.role === UserRole.ROLE_TEACHING_ASSISTANT ||
      user.role === UserRole.ROLE_CLASS_TEACHER
    ) {
      // Teachers only see report cards for students in their assigned sections
      const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId } });
      if (!teacher) return [];
      const assignments = await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.id } });
      const allowedSectionIds = [...new Set(assignments.map((a) => a.sectionId))];
      if (allowedSectionIds.length === 0) return [];

      const targetSectionIds = sectionId
        ? allowedSectionIds.filter((id) => id === sectionId)
        : allowedSectionIds;

      if (targetSectionIds.length === 0) return [];

      if (studentId) {
        const student = await prisma.studentProfile.findFirst({ where: { id: studentId, sectionId: { in: targetSectionIds } } });
        if (!student) throw { status: 403, message: 'Access denied: Student is not in your assigned section' };
        whereCondition = { institutionId, studentId, isPublished: true };
      } else {
        whereCondition = { institutionId, student: { sectionId: { in: targetSectionIds } }, isPublished: true };
      }
    } else {
      // Admin / Exam Controller / Academic Head
      if (studentId) {
        whereCondition.studentId = studentId;
      }
      if (sectionId) {
        whereCondition.student = { sectionId };
      }
    }

    if (examSessionId) {
      whereCondition.examSessionId = examSessionId;
    }

    const cards = await prisma.studentReportCard.findMany({
      where: whereCondition,
      include: {
        examSession: {
          include: {
            academicTerm: {
              include: { academicYear: true },
            },
          },
        },
        student: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
            section: {
              include: {
                classGrade: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enrichedCards = await Promise.all(
      cards.map(async (card) => {
        const marks = await prisma.examMark.findMany({
          where: {
            studentId: card.studentId,
            examSchedule: { examSessionId: card.examSessionId },
          },
          include: {
            examSchedule: {
              include: { subject: true },
            },
          },
          orderBy: { examSchedule: { examDate: 'asc' } },
        });

        const subjectMarks = marks.map((m) => {
          const max = m.examSchedule.maxMarks;
          const obtained = m.marksObtained;
          const pct = max > 0 ? (obtained / max) * 100 : 0;
          let grade = 'F';
          if (pct >= 90) grade = 'A+';
          else if (pct >= 80) grade = 'A';
          else if (pct >= 70) grade = 'B';
          else if (pct >= 60) grade = 'C';
          else if (pct >= 50) grade = 'D';

          return {
            id: m.id,
            subjectId: m.examSchedule.subjectId,
            subjectName: m.examSchedule.subject.name,
            subjectCode: m.examSchedule.subject.code,
            maxMarks: max,
            passMarks: m.examSchedule.passMarks,
            marksObtained: obtained,
            percentage: Number(pct.toFixed(1)),
            isAbsent: m.isAbsent,
            isPassed: !m.isAbsent && obtained >= m.examSchedule.passMarks,
            gradeLetter: m.isAbsent ? 'ABS' : grade,
            remarks: m.remarks,
          };
        });

        // Enrich with university-style assessment subject results for this student and academic term
        let assessmentSubjectResults: any[] = [];
        if (card.examSession.academicTermId) {
          const sResults = await prisma.subjectResult.findMany({
            where: {
              studentId: card.studentId,
              academicTermId: card.examSession.academicTermId,
              institutionId,
            },
            include: { subject: true },
          });

          assessmentSubjectResults = (sResults as any[])
            .filter((sr: any) => sr.status !== SubjectResultStatus.DRAFT)
            .map((sr: any) => {
              const isOfficial = sr.status === SubjectResultStatus.OFFICIALLY_PUBLISHED;
              return {
                id: sr.id,
                subjectId: sr.subjectId,
                subjectName: sr.subject.name,
                subjectCode: sr.subject.code,
                categoryBreakdown: sr.categoryBreakdown,
                totalPercentage: sr.totalPercentage,
                gradeLetter: isOfficial ? sr.gradeLetter : 'GRADE IN PROGRESS',
                gpa: isOfficial ? sr.gpa : null,
                status: sr.status,
                isOfficiallyPublished: isOfficial,
                gradeInProgress: !isOfficial,
              };
            });
        }

        return {
          ...card,
          subjectMarks,
          assessmentSubjectResults,
        };
      })
    );

    return enrichedCards;
  }

  static async verifyReportCard(institutionId: string, user: AuthenticatedUser, cardId: string, providedSignature: string) {
    const card = await prisma.studentReportCard.findFirst({
      where: { id: cardId, institutionId, isPublished: true },
      include: { student: { select: { userId: true } } },
    });
    if (!card) throw { status: 404, message: 'Published report card not found' };

    let mayView = user.role !== UserRole.ROLE_STUDENT && user.role !== UserRole.ROLE_PARENT;
    if (user.role === UserRole.ROLE_STUDENT) mayView = card.student.userId === user.id;
    if (user.role === UserRole.ROLE_PARENT) {
      const parent = await prisma.parentProfile.findFirst({ where: { userId: user.id, institutionId } });
      mayView = Boolean(parent && await prisma.studentParentRelation.findFirst({ where: { parentId: parent.id, studentId: card.studentId } }));
    }
    if (!mayView) throw { status: 403, message: 'You are not authorized to verify this report card' };

    const valid = Boolean(card.verificationSignature)
      && verifyReportCardSignature(card, card.verificationSignature!, env.REPORT_CARD_SIGNING_SECRET ?? env.JWT_ACCESS_SECRET)
      && verifyReportCardSignature(card, providedSignature, env.REPORT_CARD_SIGNING_SECRET ?? env.JWT_ACCESS_SECRET)
      && card.verificationSignature!.toLowerCase() === providedSignature.toLowerCase();
    return { valid, cardId: card.id, publishedAt: card.publishedAt };
  }
}
