import { prisma } from '../../utils/prisma';
import { AttendanceStatus, CorrectionStatus, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../types';

export class AttendanceService {
  static async getSections(institutionId: string, user: AuthenticatedUser) {
    const administrativeRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];
    let sectionFilter: { id?: { in: string[] } } = {};
    if (!administrativeRoles.includes(user.role)) {
      const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      if (!teacher) return [];
      const assignments = await prisma.teacherAssignment.findMany({
        where: { teacherId: teacher.id, section: { classGrade: { institutionId } } },
        select: { sectionId: true },
      });
      const sectionIds = [...new Set(assignments.map((assignment) => assignment.sectionId))];
      if (sectionIds.length === 0) return [];
      sectionFilter = { id: { in: sectionIds } };
    }
    return prisma.section.findMany({
      where: { ...sectionFilter, classGrade: { institutionId } },
      select: { id: true, name: true, classGrade: { select: { id: true, name: true } } },
      orderBy: [{ classGrade: { level: 'asc' } }, { name: 'asc' }],
    });
  }

  static async getSubjectAssignments(institutionId: string, user: AuthenticatedUser) {
    const adminRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];
    const teacher = adminRoles.includes(user.role) ? null : await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
    if (!adminRoles.includes(user.role) && !teacher) return [];
    return prisma.teacherAssignment.findMany({
      where: { teacherId: teacher?.id, section: { classGrade: { institutionId } }, subject: { institutionId } },
      select: { sectionId: true, subjectId: true, section: { select: { name: true, classGrade: { select: { name: true } } } }, subject: { select: { name: true, code: true } } },
      orderBy: [{ section: { classGrade: { level: 'asc' } } }, { subject: { name: 'asc' } }],
    });
  }

  static async getSubjectRoster(institutionId: string, user: AuthenticatedUser, sectionId: string, subjectId: string, date: string, periodNumber: number) {
    const section = await prisma.section.findFirst({ where: { id: sectionId, classGrade: { institutionId } }, select: { id: true } });
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, institutionId }, select: { id: true } });
    if (!section || !subject) throw { status: 404, message: 'Section or subject not found in this institution' };
    const adminRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];
    if (!adminRoles.includes(user.role)) {
      const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      const assignment = teacher && await prisma.teacherAssignment.findFirst({ where: { teacherId: teacher.id, sectionId, subjectId } });
      if (!assignment) throw { status: 403, message: 'You are not assigned to teach this section and subject' };
    }
    const day = new Date(`${date}T00:00:00.000Z`);
    const students = await prisma.studentProfile.findMany({ where: { institutionId, sectionId, status: 'ENROLLED' }, select: { id: true, rollNumber: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } }, orderBy: { rollNumber: 'asc' } });
    const records = await prisma.subjectAttendanceRecord.findMany({ where: { institutionId, sectionId, subjectId, date: day, periodNumber, studentId: { in: students.map((s) => s.id) } }, select: { id: true, studentId: true, status: true, remarks: true, lockedAt: true } });
    const byStudentId = new Map(records.map((record) => [record.studentId, record]));
    return students.map((student) => ({ ...student, attendance: byStudentId.get(student.id) ?? null }));
  }

  static async markSubjectAttendance(institutionId: string, markedByUserId: string, data: { sectionId: string; subjectId: string; date: string; periodNumber: number; records: Array<{ studentId: string; status: AttendanceStatus; remarks?: string }> }) {
    const day = new Date(`${data.date}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== data.date) throw { status: 400, message: 'Attendance date is invalid' };
    const section = await prisma.section.findFirst({ where: { id: data.sectionId, classGrade: { institutionId } }, select: { id: true, teacherAssignments: { select: { teacherId: true, subjectId: true, teacher: { select: { userId: true } } } } } });
    const subject = await prisma.subject.findFirst({ where: { id: data.subjectId, institutionId }, select: { id: true } });
    if (!section || !subject) throw { status: 404, message: 'Section or subject not found in this institution' };
    const actor = await prisma.user.findFirst({ where: { id: markedByUserId, institutionId }, select: { role: true } });
    if (!actor) throw { status: 403, message: 'Marker is not a member of this institution' };
    const adminRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];
    if (!adminRoles.includes(actor.role)) {
      const profile = await prisma.teacherProfile.findFirst({ where: { userId: markedByUserId, institutionId }, select: { id: true } });
      if (!profile || !section.teacherAssignments.some((assignment) => assignment.teacherId === profile.id && assignment.subjectId === data.subjectId)) throw { status: 403, message: 'You are not assigned to mark this subject and section' };
    }
    const studentIds = data.records.map((record) => record.studentId);
    const activeStudents = await prisma.studentProfile.findMany({ where: { id: { in: studentIds }, institutionId, sectionId: data.sectionId, status: 'ENROLLED' }, select: { id: true } });
    if (activeStudents.length !== studentIds.length) throw { status: 400, message: 'Every student must be actively enrolled in the selected section' };
    return prisma.$transaction(async (tx) => {
      const saved = [];
      for (const item of data.records) {
        const existing = await tx.subjectAttendanceRecord.findUnique({ where: { studentId_date_subjectId_periodNumber: { studentId: item.studentId, date: day, subjectId: data.subjectId, periodNumber: data.periodNumber } } });
        if (existing && (existing.institutionId !== institutionId || existing.sectionId !== data.sectionId)) throw { status: 409, message: 'Subject attendance record conflicts with another section' };
        if (existing?.lockedAt) throw { status: 409, message: 'Subject attendance is locked; request an approved correction' };
        const record = await tx.subjectAttendanceRecord.upsert({
          where: { studentId_date_subjectId_periodNumber: { studentId: item.studentId, date: day, subjectId: data.subjectId, periodNumber: data.periodNumber } },
          update: { status: item.status, remarks: item.remarks || null, markedByUserId, lockedAt: new Date(), updatedAt: new Date() },
          create: { institutionId, studentId: item.studentId, sectionId: data.sectionId, subjectId: data.subjectId, date: day, periodNumber: data.periodNumber, status: item.status, remarks: item.remarks || null, markedByUserId, lockedAt: new Date() },
        });
        saved.push(record);
        if (item.status === AttendanceStatus.ABSENT && existing?.status !== AttendanceStatus.ABSENT) {
          const links = await tx.studentParentRelation.findMany({ where: { studentId: item.studentId, parent: { institutionId } }, select: { parent: { select: { userId: true } } } });
          const recipientIds = [...new Set(links.map((link) => link.parent.userId))];
          if (recipientIds.length) await tx.notification.createMany({ data: recipientIds.map((userId) => ({ institutionId, userId, title: 'Subject absence alert', message: `Your child was marked absent for period ${data.periodNumber} on ${data.date}.`, type: 'ALERT' })) });
        }
      }
      return saved;
    });
  }

  static async getSectionRoster(institutionId: string, user: AuthenticatedUser, sectionId: string, date: string) {
    const administrativeRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];
    const section = await prisma.section.findFirst({
      where: { id: sectionId, classGrade: { institutionId } },
      select: { id: true },
    });
    if (!section) throw { status: 404, message: 'Section not found in this institution' };
    if (!administrativeRoles.includes(user.role)) {
      const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      const assignment = teacher && await prisma.teacherAssignment.findFirst({ where: { teacherId: teacher.id, sectionId } });
      if (!assignment) throw { status: 403, message: 'You are not assigned to this section' };
    }
    const day = new Date(`${date}T00:00:00.000Z`);
    const students = await prisma.studentProfile.findMany({
      where: { institutionId, sectionId, status: 'ENROLLED' },
      select: { id: true, rollNumber: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } },
      orderBy: { rollNumber: 'asc' },
    });
    const records = await prisma.attendanceRecord.findMany({
      where: { institutionId, sectionId, date: day, studentId: { in: students.map((student) => student.id) } },
      select: { id: true, studentId: true, status: true, remarks: true, lockedAt: true },
    });
    const byStudentId = new Map(records.map((record) => [record.studentId, record]));
    return students.map((student) => ({
      ...student,
      attendance: byStudentId.get(student.id) ?? null,
    }));
  }

  static async getCorrectionQueue(institutionId: string, user: AuthenticatedUser) {
    const adminRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];
    let assignedSectionIds: string[] | undefined;
    if (!adminRoles.includes(user.role)) {
      if (user.role !== UserRole.ROLE_CLASS_TEACHER) return [];
      const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      if (!teacher) return [];
      const assignments = await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.id, section: { classGrade: { institutionId } } }, select: { sectionId: true } });
      assignedSectionIds = [...new Set(assignments.map((assignment) => assignment.sectionId))];
      if (!assignedSectionIds.length) return [];
    }
    return prisma.attendanceCorrection.findMany({
      where: {
        status: CorrectionStatus.PENDING,
        OR: [
          { attendanceRecord: { institutionId, ...(assignedSectionIds ? { sectionId: { in: assignedSectionIds } } : {}) } },
          { subjectAttendanceRecord: { institutionId, ...(assignedSectionIds ? { sectionId: { in: assignedSectionIds } } : {}) } },
        ],
      },
      include: {
        attendanceRecord: {
          include: {
            student: { select: { admissionNumber: true, rollNumber: true, user: { select: { firstName: true, lastName: true } } } },
            section: { select: { name: true, classGrade: { select: { name: true } } } },
          },
        },
        subjectAttendanceRecord: {
          include: {
            student: { select: { admissionNumber: true, rollNumber: true, user: { select: { firstName: true, lastName: true } } } },
            section: { select: { name: true, classGrade: { select: { name: true } } } },
            subject: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  static async markAttendance(
    institutionId: string,
    markedByUserId: string,
    data: {
      sectionId: string;
      date: string;
      records: Array<{ studentId: string; status: AttendanceStatus; remarks?: string }>;
    }
  ) {
    const attendanceDate = new Date(`${data.date}T00:00:00.000Z`);
    if (Number.isNaN(attendanceDate.getTime()) || attendanceDate.toISOString().slice(0, 10) !== data.date) {
      throw { status: 400, message: 'Attendance date is invalid' };
    }

    const section = await prisma.section.findFirst({
      where: { id: data.sectionId, classGrade: { institutionId } },
      include: { teacherAssignments: { include: { teacher: true } } },
    });
    if (!section) throw { status: 404, message: 'Section not found in this institution' };

    const actor = await prisma.user.findUnique({ where: { id: markedByUserId }, select: { role: true } });
    if (!actor) throw { status: 401, message: 'Authenticated user not found' };
    const institutionRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];
    if (!institutionRoles.includes(actor.role)) {
      const teacher = await prisma.teacherProfile.findUnique({ where: { userId: markedByUserId } });
      if (!teacher || !section.teacherAssignments.some((assignment) => assignment.teacherId === teacher.id)) {
        throw { status: 403, message: 'You are not assigned to mark attendance for this section' };
      }
    }

    const studentIds = data.records.map((item) => item.studentId);
    if (new Set(studentIds).size !== studentIds.length) {
      throw { status: 400, message: 'A student may appear only once in an attendance batch' };
    }
    const students = await prisma.studentProfile.findMany({
      where: { id: { in: studentIds }, institutionId, sectionId: section.id, status: 'ENROLLED' },
      select: { id: true },
    });
    if (students.length !== studentIds.length) {
      throw { status: 400, message: 'Every student must be actively enrolled in the selected section' };
    }

    return prisma.$transaction(async (tx) => {
      const results = [];

      for (const item of data.records) {
        const existing = await tx.attendanceRecord.findUnique({
          where: { studentId_date: { studentId: item.studentId, date: attendanceDate } },
        });
        if (existing && (existing.institutionId !== institutionId || existing.sectionId !== section.id)) {
          throw { status: 409, message: 'Attendance already exists for this student on another section' };
        }
        if (existing?.lockedAt) throw { status: 409, message: 'Attendance is locked; submit a correction request' };
        const record = await tx.attendanceRecord.upsert({
          where: {
            studentId_date: {
              studentId: item.studentId,
              date: attendanceDate,
            },
          },
          update: {
            status: item.status,
            remarks: item.remarks || null,
            markedByUserId,
            lockedAt: new Date(),
            updatedAt: new Date(),
          },
          create: {
            institutionId,
            studentId: item.studentId,
            sectionId: data.sectionId,
            date: attendanceDate,
            status: item.status,
            remarks: item.remarks || null,
            markedByUserId,
            lockedAt: new Date(),
          },
        });
        results.push(record);

        // If ABSENT, notify parents automatically
        if (item.status === AttendanceStatus.ABSENT && existing?.status !== AttendanceStatus.ABSENT) {
          const parentRelations = await tx.studentParentRelation.findMany({
            where: { studentId: item.studentId, parent: { institutionId } },
            include: { parent: true },
          });

          for (const rel of parentRelations) {
            await tx.notification.create({
              data: {
                institutionId,
                userId: rel.parent.userId,
                title: 'Student Absence Alert',
                message: `Your child was marked absent on ${data.date}.`,
                type: 'ALERT',
              },
            });
          }
        }
      }

      return results;
    });
  }

  static async getAttendance(
    institutionId: string,
    user: AuthenticatedUser,
    params: { sectionId?: string; startDate?: string; endDate?: string; studentId?: string }
  ) {
    // 1. If Parent, enforce viewing only linked children
    if (user.role === UserRole.ROLE_PARENT) {
      const parentProfile = await prisma.parentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!parentProfile) return [];

      const relations = await prisma.studentParentRelation.findMany({
        where: { parentId: parentProfile.id },
        select: { studentId: true },
      });

      const allowedStudentIds = relations.map((r) => r.studentId);
      if (params.studentId && !allowedStudentIds.includes(params.studentId)) {
        throw { status: 403, message: 'You can only view attendance for your linked children' };
      }

      return prisma.attendanceRecord.findMany({
        where: {
          institutionId,
          studentId: params.studentId ? params.studentId : { in: allowedStudentIds },
          ...(params.startDate && { date: { gte: new Date(params.startDate) } }),
          ...(params.endDate && { date: { lte: new Date(params.endDate) } }),
        },
        include: {
          student: { select: { admissionNumber: true, rollNumber: true, user: { select: { id: true, firstName: true, lastName: true } } } },
          section: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
      });
    }

    // 2. If Student, enforce viewing only own attendance
    if (user.role === UserRole.ROLE_STUDENT) {
      const studentProfile = await prisma.studentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!studentProfile) return [];

      return prisma.attendanceRecord.findMany({
        where: {
          institutionId,
          studentId: studentProfile.id,
          ...(params.startDate && { date: { gte: new Date(params.startDate) } }),
          ...(params.endDate && { date: { lte: new Date(params.endDate) } }),
        },
        include: { section: true },
        orderBy: { date: 'desc' },
      });
    }

    // 3. Teaching staff can only query sections they are assigned to.
    const teachingRoles: UserRole[] = [UserRole.ROLE_CLASS_TEACHER, UserRole.ROLE_SUBJECT_TEACHER, UserRole.ROLE_TEACHING_ASSISTANT];
    let assignedSectionIds: string[] | undefined;
    if (teachingRoles.includes(user.role)) {
      const teacher = await prisma.teacherProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!teacher) return [];
      const assignments = await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.id }, select: { sectionId: true } });
      assignedSectionIds = [...new Set(assignments.map((assignment) => assignment.sectionId))];
      if (assignedSectionIds.length === 0) return [];
      if (params.sectionId && !assignedSectionIds.includes(params.sectionId)) {
        throw { status: 403, message: 'You are not assigned to view attendance for this section' };
      }
    }

    // 4. Institution administrators, auditors, and assigned teaching staff.
    return prisma.attendanceRecord.findMany({
      where: {
        institutionId,
        ...(assignedSectionIds && { sectionId: { in: assignedSectionIds } }),
        ...(params.sectionId && { sectionId: params.sectionId }),
        ...(params.studentId && { studentId: params.studentId }),
        ...(params.startDate && { date: { gte: new Date(params.startDate) } }),
        ...(params.endDate && { date: { lte: new Date(params.endDate) } }),
      },
      include: {
        student: { select: { admissionNumber: true, rollNumber: true, user: { select: { id: true, firstName: true, lastName: true } } } },
        section: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  static async getSubjectAttendance(institutionId: string, user: AuthenticatedUser, params: { sectionId?: string; startDate?: string; endDate?: string; studentId?: string; subjectId?: string }) {
    let studentIds: string[] | undefined;
    let sectionIds: string[] | undefined;
    if (user.role === UserRole.ROLE_PARENT) {
      const parent = await prisma.parentProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      const links = parent ? await prisma.studentParentRelation.findMany({ where: { parentId: parent.id, student: { institutionId } }, select: { studentId: true } }) : [];
      studentIds = links.map((link) => link.studentId);
    } else if (user.role === UserRole.ROLE_STUDENT) {
      const profile = await prisma.studentProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
      studentIds = profile ? [profile.id] : [];
    } else {
      const staffRoles: UserRole[] = [UserRole.ROLE_CLASS_TEACHER, UserRole.ROLE_SUBJECT_TEACHER, UserRole.ROLE_TEACHING_ASSISTANT];
      if (staffRoles.includes(user.role)) {
        const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
        const assignments = teacher ? await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.id, section: { classGrade: { institutionId } } }, select: { sectionId: true } }) : [];
        sectionIds = [...new Set(assignments.map((a) => a.sectionId))];
      }
    }
    if (studentIds && params.studentId && !studentIds.includes(params.studentId)) throw { status: 403, message: 'You can only view your own or linked student subject attendance' };
    if (sectionIds && params.sectionId && !sectionIds.includes(params.sectionId)) throw { status: 403, message: 'You are not assigned to view subject attendance for this section' };
    if (studentIds?.length === 0 || sectionIds?.length === 0) return [];
    return prisma.subjectAttendanceRecord.findMany({
      where: {
        institutionId,
        ...(studentIds ? { studentId: params.studentId ?? { in: studentIds } } : {}),
        ...(sectionIds ? { sectionId: { in: sectionIds } } : {}),
        ...(params.sectionId ? { sectionId: params.sectionId } : {}),
        ...(params.studentId && !studentIds ? { studentId: params.studentId } : {}),
        ...(params.subjectId ? { subjectId: params.subjectId } : {}),
        ...(params.startDate ? { date: { gte: new Date(`${params.startDate}T00:00:00.000Z`) } } : {}),
        ...(params.endDate ? { date: { lte: new Date(`${params.endDate}T23:59:59.999Z`) } } : {}),
      },
      select: { id: true, studentId: true, date: true, periodNumber: true, status: true, remarks: true, lockedAt: true, student: { select: { admissionNumber: true, rollNumber: true, user: { select: { id: true, firstName: true, lastName: true } } } }, section: { select: { id: true, name: true } }, subject: { select: { id: true, name: true, code: true } } },
      orderBy: [{ date: 'desc' }, { periodNumber: 'asc' }],
    });
  }

  static async getAttendanceSummary(institutionId: string, user: AuthenticatedUser, params: { sectionId?: string; studentId?: string; startDate?: string; endDate?: string; thresholdPercent: number; minimumSchoolDays: number }) {
    const records = await this.getAttendance(institutionId, user, params);
    const byStudent = new Map<string, { total: number; absent: number; excused: number }>();
    for (const record of records) {
      const aggregate = byStudent.get(record.studentId) ?? { total: 0, absent: 0, excused: 0 };
      if (record.status === AttendanceStatus.EXCUSED) aggregate.excused += 1;
      else {
        aggregate.total += 1;
        if (record.status === AttendanceStatus.ABSENT) aggregate.absent += 1;
      }
      byStudent.set(record.studentId, aggregate);
    }
    const studentIds = [...byStudent.keys()];
    const students = await prisma.studentProfile.findMany({ where: { id: { in: studentIds }, institutionId }, select: { id: true, admissionNumber: true, rollNumber: true, user: { select: { firstName: true, lastName: true } }, section: { select: { name: true, classGrade: { select: { name: true } } } } } });
    return students.map((student) => {
      const counts = byStudent.get(student.id)!;
      const absenceRatePercent = counts.total ? Number((counts.absent * 100 / counts.total).toFixed(1)) : 0;
      return { student, totalSchoolDays: counts.total, absentDays: counts.absent, excusedDays: counts.excused, absenceRatePercent, chronicAbsentee: counts.total >= params.minimumSchoolDays && absenceRatePercent >= params.thresholdPercent };
    }).sort((a, b) => b.absenceRatePercent - a.absenceRatePercent || a.student.admissionNumber.localeCompare(b.student.admissionNumber));
  }

  static async requestCorrection(institutionId: string, userId: string, data: { attendanceRecordId?: string; subjectAttendanceRecordId?: string; requestedStatus: AttendanceStatus; reason: string }) {
    const dailyRecord = data.attendanceRecordId ? await prisma.attendanceRecord.findFirst({ where: { id: data.attendanceRecordId, institutionId } }) : null;
    const subjectRecord = data.subjectAttendanceRecordId ? await prisma.subjectAttendanceRecord.findFirst({ where: { id: data.subjectAttendanceRecordId, institutionId } }) : null;
    const record = dailyRecord ?? subjectRecord;
    if (!record) throw { status: 404, message: 'Attendance record not found' };
    if (!record.lockedAt) throw { status: 409, message: 'Only locked attendance records can be corrected' };
    const pendingCorrection = await prisma.attendanceCorrection.findFirst({ where: { status: CorrectionStatus.PENDING, ...(data.attendanceRecordId ? { attendanceRecordId: data.attendanceRecordId } : { subjectAttendanceRecordId: data.subjectAttendanceRecordId }) }, select: { id: true } });
    if (pendingCorrection) throw { status: 409, message: 'A correction is already awaiting review for this attendance record' };
    const requester = await prisma.user.findFirst({ where: { id: userId, institutionId }, select: { role: true } });
    if (!requester) throw { status: 403, message: 'Requester is not a member of this institution' };
    const administratorRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];
    if (!administratorRoles.includes(requester.role)) {
      const teacher = await prisma.teacherProfile.findFirst({ where: { userId, institutionId }, select: { id: true } });
      const assigned = teacher && await prisma.teacherAssignment.findFirst({ where: { teacherId: teacher.id, sectionId: record.sectionId, ...(subjectRecord ? { subjectId: subjectRecord.subjectId } : {}) } });
      if (!assigned) throw { status: 403, message: 'You are not assigned to request a correction for this section' };
    }
    return prisma.attendanceCorrection.create({
      data: {
        ...(data.attendanceRecordId ? { attendanceRecordId: data.attendanceRecordId } : { subjectAttendanceRecordId: data.subjectAttendanceRecordId }),
        requestedStatus: data.requestedStatus,
        reason: data.reason,
        requestedByUserId: userId,
        status: CorrectionStatus.PENDING,
      },
    });
  }

  static async requestAbsenceJustification(institutionId: string, parentUserId: string, data: { attendanceRecordId: string; reason: string }) {
    const [parent, record] = await Promise.all([
      prisma.parentProfile.findFirst({ where: { userId: parentUserId, institutionId }, select: { id: true } }),
      prisma.attendanceRecord.findFirst({ where: { id: data.attendanceRecordId, institutionId } }),
    ]);
    if (!parent || !record) throw { status: 404, message: 'Linked absence record not found' };
    if (record.status !== AttendanceStatus.ABSENT || !record.lockedAt) throw { status: 409, message: 'Only a locked absence can receive a guardian explanation' };
    const relation = await prisma.studentParentRelation.findFirst({ where: { parentId: parent.id, studentId: record.studentId, student: { institutionId } } });
    if (!relation) throw { status: 403, message: 'You can only explain absences for your linked children' };
    const pending = await prisma.attendanceCorrection.findFirst({ where: { attendanceRecordId: record.id, status: CorrectionStatus.PENDING } });
    if (pending) throw { status: 409, message: 'A correction or explanation is already awaiting review' };
    const reviewers = await prisma.teacherAssignment.findMany({
      where: { sectionId: record.sectionId, teacher: { institutionId } },
      select: { teacher: { select: { userId: true } } },
    });
    return prisma.$transaction(async (tx) => {
      const justification = await tx.attendanceCorrection.create({
        data: {
          attendanceRecordId: record.id,
          requestedStatus: AttendanceStatus.EXCUSED,
          reason: data.reason,
          requestedByUserId: parentUserId,
          status: CorrectionStatus.PENDING,
        },
      });
      const recipientIds = [...new Set(reviewers.map(({ teacher }) => teacher.userId))].filter((id) => id !== parentUserId);
      if (recipientIds.length) {
        await tx.notification.createMany({
          data: recipientIds.map((userId) => ({
            institutionId,
            userId,
            title: 'Guardian absence explanation needs review',
            message: `A guardian submitted an explanation for an absence on ${record.date.toISOString().slice(0, 10)}.`,
            type: 'INFO',
          })),
        });
      }
      return justification;
    });
  }

  static async reviewCorrection(
    institutionId: string,
    correctionId: string,
    reviewerUserId: string,
    data: { status: 'APPROVED' | 'REJECTED' }
  ) {
    const correction = await prisma.attendanceCorrection.findFirst({
      where: { id: correctionId, OR: [{ attendanceRecord: { institutionId } }, { subjectAttendanceRecord: { institutionId } }] },
      include: { attendanceRecord: true, subjectAttendanceRecord: true },
    });

    if (!correction) {
      throw { status: 404, message: 'Correction request not found' };
    }

    if (correction.status !== CorrectionStatus.PENDING) {
      throw { status: 400, message: 'This correction request has already been reviewed' };
    }

    // Maker cannot be Checker (self-approval prohibited)
    if (correction.requestedByUserId === reviewerUserId) {
      throw { status: 403, message: 'Maker-Checker violation: You cannot review your own correction request' };
    }

    const reviewer = await prisma.user.findUnique({ where: { id: reviewerUserId }, select: { role: true, institutionId: true } });
    if (!reviewer || (reviewer.role !== UserRole.ROLE_SUPER_ADMIN && reviewer.institutionId !== institutionId)) throw { status: 403, message: 'Reviewer is not a member of this institution' };
    const administratorRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];
    if (!administratorRoles.includes(reviewer.role)) {
      const teacher = reviewer.role === UserRole.ROLE_CLASS_TEACHER
        ? await prisma.teacherProfile.findFirst({ where: { userId: reviewerUserId, institutionId }, select: { id: true } })
        : null;
      const targetSectionId = correction.attendanceRecord?.sectionId ?? correction.subjectAttendanceRecord?.sectionId;
      const assigned = teacher && targetSectionId && await prisma.teacherAssignment.findFirst({ where: { teacherId: teacher.id, sectionId: targetSectionId } });
      if (!assigned) throw { status: 403, message: 'Only an assigned class teacher or authorized administrator may review attendance corrections' };
    }

    return prisma.$transaction(async (tx) => {
      const claimed = await tx.attendanceCorrection.updateMany({
        where: { id: correctionId, status: CorrectionStatus.PENDING },
        data: {
          status: data.status as CorrectionStatus,
          approvedByUserId: reviewerUserId,
          reviewedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw { status: 409, message: 'This correction request has already been reviewed' };
      const updatedCorrection = await tx.attendanceCorrection.findUniqueOrThrow({ where: { id: correctionId } });

      if (data.status === 'APPROVED') {
        const updateData = { status: correction.requestedStatus, remarks: `Corrected: ${correction.reason}`, lockedAt: new Date() };
        if (correction.attendanceRecordId) await tx.attendanceRecord.update({ where: { id: correction.attendanceRecordId }, data: updateData });
        else if (correction.subjectAttendanceRecordId) await tx.subjectAttendanceRecord.update({ where: { id: correction.subjectAttendanceRecordId }, data: updateData });
      }

      return updatedCorrection;
    });
  }
}
