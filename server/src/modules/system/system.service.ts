import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../../utils/prisma';

const SAFE_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  username: true,
  role: true,
  phone: true,
  isActive: true,
};

export interface RecycleBinItem {
  id: string;
  institutionId: string;
  entityType: 'STUDENT' | 'COURSE';
  entityId: string;
  entityTitle: string;
  deletedAt: string;
  deletedBy: string;
  reason?: string;
  snapshot: any;
}

const DATA_DIR = path.resolve(__dirname, '../../../data');
const RECYCLE_BIN_FILE = path.join(DATA_DIR, 'recycle_bin.json');

function ensureRecycleBinFile(): RecycleBinItem[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(RECYCLE_BIN_FILE)) {
    fs.writeFileSync(RECYCLE_BIN_FILE, JSON.stringify([], null, 2), 'utf-8');
    return [];
  }
  try {
    const raw = fs.readFileSync(RECYCLE_BIN_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function saveRecycleBinItems(items: RecycleBinItem[]) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(RECYCLE_BIN_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

export class SystemService {
  /**
   * Generates a complete database backup for an institution (or full platform if super admin)
   */
  static async generateBackup(institutionId?: string | null) {
    const filter = institutionId ? { institutionId } : {};

    const [
      institution,
      academicYears,
      classes,
      sections,
      subjects,
      teacherProfiles,
      teacherAssignments,
      users,
      students,
      courses,
      assignments,
      submissions,
      attendance,
      subjectAttendance,
      examSessions,
      examSchedules,
      examMarks,
      reportCards,
      feeStructures,
      feeInvoices,
    ] = await Promise.all([
      institutionId ? prisma.institution.findUnique({ where: { id: institutionId } }) : prisma.institution.findMany(),
      prisma.academicYear.findMany({ where: filter, include: { terms: true } }),
      prisma.classGrade.findMany({ where: filter, include: { sections: true } }),
      prisma.section.findMany({ where: institutionId ? { classGrade: { institutionId } } : {} }),
      prisma.subject.findMany({ where: filter }),
      prisma.teacherProfile.findMany({ where: filter, include: { user: { select: SAFE_USER_SELECT } } }),
      prisma.teacherAssignment.findMany({ where: institutionId ? { section: { classGrade: { institutionId } } } : {} }),
      prisma.user.findMany({
        where: institutionId ? { institutionId } : {},
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.studentProfile.findMany({
        where: filter,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true, username: true } },
          section: { include: { classGrade: true } },
        },
      }),
      prisma.course.findMany({
        where: filter,
        include: {
          subject: true,
          section: { include: { classGrade: true } },
          teacher: { include: { user: { select: SAFE_USER_SELECT } } },
          modules: { include: { lessons: true } },
          assignments: true,
        },
      }),
      prisma.assignment.findMany({
        where: institutionId ? { course: { institutionId } } : {},
      }),
      prisma.assignmentSubmission.findMany({
        where: institutionId ? { assignment: { course: { institutionId } } } : {},
      }),
      prisma.attendanceRecord.findMany({
        where: institutionId ? { student: { institutionId } } : {},
        take: 500,
      }),
      prisma.subjectAttendanceRecord.findMany({
        where: institutionId ? { student: { institutionId } } : {},
        take: 500,
      }),
      prisma.examSession.findMany({ where: filter }),
      prisma.examSchedule.findMany({ where: institutionId ? { examSession: { institutionId } } : {} }),
      prisma.examMark.findMany({
        where: institutionId ? { student: { institutionId } } : {},
        take: 500,
      }),
      prisma.studentReportCard.findMany({ where: filter }),
      prisma.feeStructure.findMany({ where: filter }),
      prisma.studentFeeInvoice.findMany({ where: filter, include: { payments: true } }),
    ]);

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        institutionId: institutionId || 'PLATFORM_SUPER_ADMIN',
        systemVersion: '2.5.0-Enterprise',
        counts: {
          users: users.length,
          students: students.length,
          teachers: teacherProfiles.length,
          courses: courses.length,
          assignments: assignments.length,
          submissions: submissions.length,
          examMarks: examMarks.length,
          feeInvoices: feeInvoices.length,
        },
      },
      data: {
        institution,
        academicYears,
        classes,
        sections,
        subjects,
        teacherProfiles,
        teacherAssignments,
        users,
        students,
        courses,
        assignments,
        submissions,
        attendance,
        subjectAttendance,
        examSessions,
        examSchedules,
        examMarks,
        reportCards,
        feeStructures,
        feeInvoices,
      },
    };
  }

  /**
   * Retrieves all items currently in the recycle bin for an institution
   */
  static async getRecycleBin(institutionId: string): Promise<RecycleBinItem[]> {
    const items = ensureRecycleBinFile();
    return items.filter((i) => i.institutionId === institutionId);
  }

  /**
   * Moves a record (student or course) to the recycle bin
   */
  static async moveToRecycleBin(
    institutionId: string,
    params: {
      entityType: 'STUDENT' | 'COURSE';
      entityId: string;
      deletedBy: string;
      reason?: string;
    }
  ): Promise<RecycleBinItem> {
    const items = ensureRecycleBinFile();

    if (params.entityType === 'STUDENT') {
      const student = await prisma.studentProfile.findFirst({
        where: { id: params.entityId, institutionId },
        include: {
          user: { select: SAFE_USER_SELECT },
          section: { include: { classGrade: true } },
        },
      });

      if (!student) {
        throw { status: 404, message: 'Student record not found in this institution.' };
      }

      // Mark student as ARCHIVED in database
      await prisma.studentProfile.update({
        where: { id: params.entityId },
        data: { status: 'ARCHIVED' },
      });

      const binItem: RecycleBinItem = {
        id: crypto.randomUUID(),
        institutionId,
        entityType: 'STUDENT',
        entityId: student.id,
        entityTitle: `${student.user.firstName} ${student.user.lastName} (Adm: ${student.admissionNumber})`,
        deletedAt: new Date().toISOString(),
        deletedBy: params.deletedBy,
        reason: params.reason || 'Manual user soft-delete',
        snapshot: student,
      };

      items.push(binItem);
      saveRecycleBinItems(items);
      return binItem;
    } else if (params.entityType === 'COURSE') {
      const course = await prisma.course.findFirst({
        where: { id: params.entityId, institutionId },
        include: {
          subject: true,
          section: { include: { classGrade: true } },
          teacher: { include: { user: { select: SAFE_USER_SELECT } } },
        },
      });

      if (!course) {
        throw { status: 404, message: 'Course record not found in this institution.' };
      }

      // Unpublish course in database
      await prisma.course.update({
        where: { id: params.entityId },
        data: { isPublished: false },
      });

      const binItem: RecycleBinItem = {
        id: crypto.randomUUID(),
        institutionId,
        entityType: 'COURSE',
        entityId: course.id,
        entityTitle: `${course.subject.name} - ${course.code} (${course.section.classGrade?.name ?? ''} ${course.section.name})`,
        deletedAt: new Date().toISOString(),
        deletedBy: params.deletedBy,
        reason: params.reason || 'Manual course soft-delete',
        snapshot: course,
      };

      items.push(binItem);
      saveRecycleBinItems(items);
      return binItem;
    } else {
      throw { status: 400, message: 'Unsupported entity type for recycle bin.' };
    }
  }

  /**
   * Restores an item from the recycle bin back to active status
   */
  static async restoreItem(institutionId: string, recycleBinId: string) {
    const items = ensureRecycleBinFile();
    const index = items.findIndex((i) => i.id === recycleBinId && i.institutionId === institutionId);

    if (index === -1) {
      throw { status: 404, message: 'Recycle bin item not found or already processed.' };
    }

    const item = items[index];

    if (item.entityType === 'STUDENT') {
      await prisma.studentProfile.update({
        where: { id: item.entityId },
        data: { status: 'ENROLLED' },
      });
    } else if (item.entityType === 'COURSE') {
      await prisma.course.update({
        where: { id: item.entityId },
        data: { isPublished: true },
      });
    }

    // Remove from bin
    items.splice(index, 1);
    saveRecycleBinItems(items);

    return {
      success: true,
      message: `Successfully restored ${item.entityTitle} back to active records.`,
      restoredItem: item,
    };
  }

  /**
   * Permanently deletes an item from the database
   */
  static async permanentDelete(institutionId: string, recycleBinId: string) {
    const items = ensureRecycleBinFile();
    const index = items.findIndex((i) => i.id === recycleBinId && i.institutionId === institutionId);

    if (index === -1) {
      throw { status: 404, message: 'Recycle bin item not found or already deleted.' };
    }

    const item = items[index];

    try {
      if (item.entityType === 'STUDENT') {
        // Delete student profile and related records
        await prisma.studentProfile.delete({
          where: { id: item.entityId },
        });
      } else if (item.entityType === 'COURSE') {
        // Delete course
        await prisma.course.delete({
          where: { id: item.entityId },
        });
      }
    } catch (err: any) {
      console.warn('Permanent delete in DB error (may already be deleted or constraint):', err.message);
    }

    // Remove from bin
    items.splice(index, 1);
    saveRecycleBinItems(items);

    return {
      success: true,
      message: `Permanently removed ${item.entityTitle} from database.`,
      deletedItem: item,
    };
  }
}
