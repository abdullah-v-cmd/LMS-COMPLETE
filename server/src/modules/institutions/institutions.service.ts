import { prisma } from '../../utils/prisma';
import { UserRole, InstitutionStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../types';

export class InstitutionsService {
  static async getAll(user: AuthenticatedUser) {
    if (user.role === UserRole.ROLE_SUPER_ADMIN) {
      return prisma.institution.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          campuses: true,
          _count: {
            select: { users: true, classGrades: true },
          },
        },
      });
    }

    if (!user.institutionId) {
      return [];
    }

    return prisma.institution.findMany({
      where: { id: user.institutionId },
      include: {
        campuses: true,
        _count: {
          select: { users: true, classGrades: true },
        },
      },
    });
  }

  static async getById(id: string, user: AuthenticatedUser) {
    if (user.role !== UserRole.ROLE_SUPER_ADMIN && user.institutionId !== id) {
      throw { status: 403, message: 'Access to this institution is forbidden' };
    }

    const institution = await prisma.institution.findUnique({
      where: { id },
      include: {
        campuses: true,
        academicYears: {
          include: { terms: true },
        },
        _count: {
          select: { users: true, courses: true },
        },
      },
    });

    if (!institution) {
      throw { status: 404, message: 'Institution not found' };
    }

    return institution;
  }

  static async create(data: any) {
    return prisma.institution.create({
      data,
    });
  }

  static async update(id: string, data: any, user: AuthenticatedUser) {
    if (user.role !== UserRole.ROLE_SUPER_ADMIN && user.institutionId !== id) {
      throw { status: 403, message: 'You are not authorized to update this institution' };
    }

    return prisma.institution.update({
      where: { id },
      data,
    });
  }

  static async updateStatus(id: string, status: InstitutionStatus, user: AuthenticatedUser) {
    if (user.role !== UserRole.ROLE_SUPER_ADMIN) {
      throw { status: 403, message: 'Only Super Admin can change institution lifecycle status' };
    }

    return prisma.institution.update({
      where: { id },
      data: { status },
    });
  }
}
