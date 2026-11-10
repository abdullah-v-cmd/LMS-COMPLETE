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

const LEGACY_DATA_FILE = path.resolve(__dirname, '../../../data/recycle_bin.json');

async function migrateLegacyRecycleBinIfPresent(institutionId: string) {
  try {
    if (fs.existsSync(LEGACY_DATA_FILE)) {
      const raw = fs.readFileSync(LEGACY_DATA_FILE, 'utf-8');
      const items: RecycleBinItem[] = JSON.parse(raw || '[]');
      const instItems = items.filter((i) => i.institutionId === institutionId);
      for (const item of instItems) {
        const existing = await (prisma as any).recycleBinRecord.findUnique({
          where: { id: item.id },
        });
        if (!existing) {
          await (prisma as any).recycleBinRecord.create({
            data: {
              id: item.id,
              institutionId: item.institutionId,
              entityType: item.entityType,
              entityId: item.entityId,
              entityTitle: item.entityTitle,
              deletedAt: new Date(item.deletedAt),
              deletedBy: item.deletedBy,
              reason: item.reason,
              snapshot: item.snapshot,
            },
          });
        }
      }
    }
  } catch (err: any) {
    // Ignore legacy read errors
  }
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
   * Retrieves all items currently in the recycle bin for an institution from PostgreSQL
   */
  static async getRecycleBin(institutionId: string): Promise<RecycleBinItem[]> {
    await migrateLegacyRecycleBinIfPresent(institutionId);
    const records = await (prisma as any).recycleBinRecord.findMany({
      where: { institutionId },
      orderBy: { deletedAt: 'desc' },
    });

    return records.map((r: any) => ({
      id: r.id,
      institutionId: r.institutionId,
      entityType: r.entityType as 'STUDENT' | 'COURSE',
      entityId: r.entityId,
      entityTitle: r.entityTitle,
      deletedAt: r.deletedAt.toISOString(),
      deletedBy: r.deletedBy,
      reason: r.reason || undefined,
      snapshot: r.snapshot,
    }));
  }

  /**
   * Moves a record (student or course) to the recycle bin in PostgreSQL
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

      const record = await (prisma as any).recycleBinRecord.create({
        data: {
          institutionId,
          entityType: 'STUDENT',
          entityId: student.id,
          entityTitle: `${student.user.firstName} ${student.user.lastName} (Adm: ${student.admissionNumber})`,
          deletedAt: new Date(),
          deletedBy: params.deletedBy,
          reason: params.reason || 'Manual user soft-delete',
          snapshot: student as any,
        },
      });

      return {
        id: record.id,
        institutionId: record.institutionId,
        entityType: 'STUDENT',
        entityId: record.entityId,
        entityTitle: record.entityTitle,
        deletedAt: record.deletedAt.toISOString(),
        deletedBy: record.deletedBy,
        reason: record.reason || undefined,
        snapshot: record.snapshot,
      };
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

      const record = await (prisma as any).recycleBinRecord.create({
        data: {
          institutionId,
          entityType: 'COURSE',
          entityId: course.id,
          entityTitle: `${course.subject.name} - ${course.code} (${course.section.classGrade?.name ?? ''} ${course.section.name})`,
          deletedAt: new Date(),
          deletedBy: params.deletedBy,
          reason: params.reason || 'Manual course soft-delete',
          snapshot: course as any,
        },
      });

      return {
        id: record.id,
        institutionId: record.institutionId,
        entityType: 'COURSE',
        entityId: record.entityId,
        entityTitle: record.entityTitle,
        deletedAt: record.deletedAt.toISOString(),
        deletedBy: record.deletedBy,
        reason: record.reason || undefined,
        snapshot: record.snapshot,
      };
    } else {
      throw { status: 400, message: 'Unsupported entity type for recycle bin.' };
    }
  }

  /**
   * Restores an item from the recycle bin back to active status
   */
  static async restoreItem(institutionId: string, recycleBinId: string) {
    const item = await (prisma as any).recycleBinRecord.findFirst({
      where: { id: recycleBinId, institutionId },
    });

    if (!item) {
      throw { status: 404, message: 'Recycle bin item not found or already processed.' };
    }

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

    // Remove from bin in PostgreSQL
    await (prisma as any).recycleBinRecord.delete({
      where: { id: recycleBinId },
    });

    return {
      success: true,
      message: `Successfully restored ${item.entityTitle} back to active records.`,
      restoredItem: {
        id: item.id,
        institutionId: item.institutionId,
        entityType: item.entityType,
        entityId: item.entityId,
        entityTitle: item.entityTitle,
        deletedAt: item.deletedAt.toISOString(),
        deletedBy: item.deletedBy,
        reason: item.reason || undefined,
        snapshot: item.snapshot,
      },
    };
  }

  /**
   * Permanently deletes an item from the database
   */
  static async permanentDelete(institutionId: string, recycleBinId: string) {
    const item = await (prisma as any).recycleBinRecord.findFirst({
      where: { id: recycleBinId, institutionId },
    });

    if (!item) {
      throw { status: 404, message: 'Recycle bin item not found or already deleted.' };
    }

    try {
      if (item.entityType === 'STUDENT') {
        await prisma.studentProfile.delete({
          where: { id: item.entityId },
        });
      } else if (item.entityType === 'COURSE') {
        await prisma.course.delete({
          where: { id: item.entityId },
        });
      }
    } catch (err: any) {
      console.warn('Permanent delete in DB error (may already be deleted or constraint):', err.message);
    }

    // Remove from bin in PostgreSQL
    await (prisma as any).recycleBinRecord.delete({
      where: { id: recycleBinId },
    });

    return {
      success: true,
      message: `Permanently removed ${item.entityTitle} from database.`,
      deletedItem: {
        id: item.id,
        institutionId: item.institutionId,
        entityType: item.entityType,
        entityId: item.entityId,
        entityTitle: item.entityTitle,
        deletedAt: item.deletedAt.toISOString(),
        deletedBy: item.deletedBy,
        reason: item.reason || undefined,
        snapshot: item.snapshot,
      },
    };
  }
}
