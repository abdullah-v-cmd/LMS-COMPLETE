import { prisma } from '../../utils/prisma';

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
    return prisma.classGrade.create({
      data: {
        institutionId,
        programId: data.programId,
        name: data.name,
        level: data.level,
      },
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
        roomNumber: data.roomNumber,
        maxCapacity: data.maxCapacity,
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

    return prisma.teacherAssignment.create({
      data: {
        teacherId: data.teacherId,
        subjectId: data.subjectId,
        sectionId: data.sectionId,
        academicTermId: data.academicTermId,
        isPrimaryTeacher: data.isPrimaryTeacher,
      },
      include: {
        teacher: { include: { user: true } },
        subject: true,
        section: true,
      },
    });
  }
}
