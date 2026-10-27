import { prisma } from '../../utils/prisma';

const SAFE_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  username: true,
  role: true,
};

export class AcademicService {
  static async getAcademicYears(institutionId: string) {
    return prisma.academicYear.findMany({
      where: { institutionId },
      include: { terms: true },
      orderBy: { startDate: 'desc' },
    });
  }

  static async createAcademicYear(institutionId: string, data: any) {
    return prisma.academicYear.create({
      data: {
        institutionId,
        name: data.name,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isCurrent: data.isCurrent || false,
      },
    });
  }

  static async getClassGrades(institutionId: string) {
    return prisma.classGrade.findMany({
      where: { institutionId },
      include: {
        program: true,
        sections: {
          include: {
            _count: { select: { students: true } },
          },
        },
      },
      orderBy: { level: 'asc' },
    });
  }

  static async createClassGrade(institutionId: string, data: any) {
    let programId = data.programId;
    if (!programId) {
      let program = await prisma.program.findFirst({ where: { institutionId } });
      if (!program) {
        program = await prisma.program.create({
          data: {
            institutionId,
            name: 'General Academic Curriculum',
            code: 'GEN-ACAD',
          },
        });
      }
      programId = program.id;
    }

    return prisma.classGrade.create({
      data: {
        institutionId,
        programId,
        name: data.name,
        level: Number(data.level),
      },
      include: {
        program: true,
        sections: {
          include: {
            _count: { select: { students: true } },
          },
        },
      },
    });
  }

  static async getSections(institutionId: string, classGradeId?: string) {
    return prisma.section.findMany({
      where: {
        classGrade: { institutionId },
        ...(classGradeId ? { classGradeId } : {}),
      },
      include: {
        classGrade: true,
        _count: { select: { students: true } },
      },
      orderBy: [{ classGrade: { level: 'asc' } }, { name: 'asc' }],
    });
  }

  static async createSection(institutionId: string, data: any) {
    const classGrade = await prisma.classGrade.findFirst({
      where: { id: data.classGradeId, institutionId },
    });
    if (!classGrade) {
      throw { status: 404, message: 'Class grade not found in this institution' };
    }

    return prisma.section.create({
      data: {
        classGradeId: data.classGradeId,
        name: data.name,
        roomNumber: data.roomNumber || null,
        maxCapacity: Number(data.maxCapacity) || 40,
      },
      include: {
        classGrade: true,
        _count: { select: { students: true } },
      },
    });
  }

  static async getSubjects(institutionId: string) {
    return prisma.subject.findMany({
      where: { institutionId },
      orderBy: { name: 'asc' },
    });
  }

  static async createSubject(institutionId: string, data: any) {
    return prisma.subject.create({
      data: {
        institutionId,
        name: data.name,
        code: data.code,
        creditUnits: data.creditUnits,
      },
    });
  }

  static async getTeachers(institutionId: string) {
    return prisma.teacherProfile.findMany({
      where: { institutionId, user: { isActive: true } },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
  }

  static async getTeacherAssignments(institutionId: string, filter?: { teacherId?: string; userId?: string }) {
    const where: any = {
      section: {
        classGrade: {
          institutionId,
        },
      },
    };
    if (filter?.teacherId) {
      where.teacherId = filter.teacherId;
    }
    if (filter?.userId) {
      where.teacher = { userId: filter.userId };
    }

    return prisma.teacherAssignment.findMany({
      where,
      include: {
        teacher: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        subject: true,
        section: {
          include: {
            classGrade: true,
          },
        },
        academicTerm: {
          include: {
            academicYear: true,
          },
        },
      },
      orderBy: [
        { section: { classGrade: { level: 'asc' } } },
        { section: { name: 'asc' } },
        { subject: { name: 'asc' } },
      ],
    });
  }

  static async assignTeacher(institutionId: string, data: any) {
    const [teacher, subject, section, term] = await Promise.all([
      prisma.teacherProfile.findFirst({ where: { id: data.teacherId, user: { institutionId } } }),
      prisma.subject.findFirst({ where: { id: data.subjectId, institutionId } }),
      prisma.section.findFirst({ where: { id: data.sectionId, classGrade: { institutionId } } }),
      prisma.academicTerm.findFirst({ where: { id: data.academicTermId, academicYear: { institutionId } } }),
    ]);

    if (!teacher || !subject || !section || !term) {
      throw { status: 404, message: 'One or more assigned academic entities not found in this institution' };
    }

    return prisma.teacherAssignment.upsert({
      where: {
        teacherId_subjectId_sectionId_academicTermId: {
          teacherId: data.teacherId,
          subjectId: data.subjectId,
          sectionId: data.sectionId,
          academicTermId: data.academicTermId,
        },
      },
      update: {
        isPrimaryTeacher: data.isPrimaryTeacher ?? true,
      },
      create: {
        teacherId: data.teacherId,
        subjectId: data.subjectId,
        sectionId: data.sectionId,
        academicTermId: data.academicTermId,
        isPrimaryTeacher: data.isPrimaryTeacher ?? true,
      },
      include: {
        teacher: { include: { user: { select: SAFE_USER_SELECT } } },
        subject: true,
        section: { include: { classGrade: true } },
        academicTerm: { include: { academicYear: true } },
      },
    });
  }

  static async unassignTeacher(institutionId: string, assignmentId: string) {
    const assignment = await prisma.teacherAssignment.findFirst({
      where: {
        id: assignmentId,
        section: { classGrade: { institutionId } },
      },
    });

    if (!assignment) {
      throw { status: 404, message: 'Teacher assignment not found in this institution' };
    }

    return prisma.teacherAssignment.delete({
      where: { id: assignmentId },
    });
  }
}
