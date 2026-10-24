import { prisma } from '../../utils/prisma';
import { hashPassword } from '../../utils/password';
import { UserRole } from '@prisma/client';

export class StudentsService {
  static async getAll(institutionId: string, sectionId?: string) {
    return prisma.studentProfile.findMany({
      where: {
        institutionId,
        ...(sectionId && { sectionId }),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            firstName: true,
            lastName: true,
            phone: true,
            isActive: true,
          },
        },
        section: {
          include: { classGrade: true },
        },
      },
      orderBy: { rollNumber: 'asc' },
    });
  }

  static async getById(id: string, institutionId: string) {
    const student = await prisma.studentProfile.findFirst({
      where: {
        id,
        institutionId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            firstName: true,
            lastName: true,
            phone: true,
            isActive: true,
          },
        },
        section: {
          include: { classGrade: true },
        },
        parentRelations: {
          include: {
            parent: {
              include: { user: true },
            },
          },
        },
        feeInvoices: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!student) {
      throw { status: 404, message: 'Student record not found in this institution' };
    }

    return student;
  }

  static async create(institutionId: string, data: any) {
    const section = await prisma.section.findFirst({
      where: { id: data.sectionId, classGrade: { institutionId } },
    });
    if (!section) {
      throw { status: 404, message: 'Section not found in this institution' };
    }

    const passwordHash = await hashPassword(data.password);

    return prisma.$transaction(async (tx) => {
      // 1. Create User account
      const user = await tx.user.create({
        data: {
          institutionId,
          email: data.email.toLowerCase(),
          username: data.username,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: UserRole.ROLE_STUDENT,
        },
      });

      // 2. Create Student Profile
      const profile = await tx.studentProfile.create({
        data: {
          userId: user.id,
          institutionId,
          admissionNumber: data.admissionNumber,
          rollNumber: data.rollNumber || null,
          sectionId: data.sectionId,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender,
          bloodGroup: data.bloodGroup || null,
          medicalNotes: data.medicalNotes || null,
          emergencyContact: data.emergencyContact || null,
        },
        include: {
          user: true,
          section: { include: { classGrade: true } },
        },
      });

      return profile;
    });
  }

  static async linkParent(studentId: string, data: any, institutionId: string) {
    // Validate student belongs to institution
    const student = await prisma.studentProfile.findFirst({
      where: { id: studentId, institutionId },
    });

    if (!student) {
      throw { status: 404, message: 'Student record not found in this institution' };
    }

    const parent = await prisma.parentProfile.findFirst({
      where: { id: data.parentId, user: { institutionId } },
    });

    if (!parent) {
      throw { status: 404, message: 'Parent record not found in this institution' };
    }

    return prisma.studentParentRelation.create({
      data: {
        studentId,
        parentId: data.parentId,
        relationshipType: data.relationshipType,
        isPrimaryContact: data.isPrimaryContact || false,
      },
      include: {
        parent: { include: { user: true } },
      },
    });
  }
}
