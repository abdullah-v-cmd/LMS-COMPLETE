import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuthenticatedUser } from '../../types';

export class UsersService {
  static async listUsers(
    institutionId: string,
    caller: AuthenticatedUser,
    query: { search?: string; role?: string }
  ) {
    const isSuperAdmin = caller.role === UserRole.ROLE_SUPER_ADMIN;

    const where: any = {};
    if (!isSuperAdmin || caller.institutionId) {
      where.institutionId = caller.institutionId || institutionId;
    }

    if (query.role && query.role !== 'ALL') {
      where.role = query.role;
    }

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { username: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        phone: true,
        institutionId: true,
        createdAt: true,
        updatedAt: true,
        institution: {
          select: { id: true, name: true },
        },
        teacherProfile: {
          select: { id: true, employeeCode: true, department: true },
        },
        parentProfile: {
          select: { id: true, occupation: true },
        },
        studentProfile: {
          select: { id: true, admissionNumber: true },
        },
      },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });
  }

  static async createUser(institutionId: string, caller: AuthenticatedUser, data: any) {
    const isSuperAdmin = caller.role === UserRole.ROLE_SUPER_ADMIN;
    const isInstitutionAdmin = caller.role === UserRole.ROLE_INSTITUTION_ADMIN;

    if (!isSuperAdmin && !isInstitutionAdmin) {
      throw { status: 403, message: 'Only Administrators have the authority to provision user accounts' };
    }

    // Role Hierarchy enforcement:
    // Institution Admin cannot provision a Super Admin
    if (data.role === UserRole.ROLE_SUPER_ADMIN && !isSuperAdmin) {
      throw { status: 403, message: 'Institution Administrators cannot provision Super Administrator accounts' };
    }

    // Tenant boundary:
    let targetInstitutionId: string | null = null;
    if (isSuperAdmin) {
      targetInstitutionId = data.institutionId || institutionId || null;
    } else {
      // Force institution admin's own institution
      targetInstitutionId = caller.institutionId || institutionId;
    }

    // Non-super-admin users must belong to an institution
    if (data.role !== UserRole.ROLE_SUPER_ADMIN && !targetInstitutionId) {
      throw { status: 400, message: 'An institution is required for non-super-admin user accounts' };
    }

    const email = data.email.toLowerCase().trim();
    const username = data.username.trim();

    // Check unique constraints
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw { status: 409, message: 'A user with this email address already exists' };
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw { status: 409, message: 'A user with this username already exists' };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    return prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: {
          institutionId: targetInstitutionId,
          email,
          username,
          passwordHash,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          phone: data.phone?.trim() || null,
          role: data.role,
          isActive: true,
        },
      });

      // 2. Role-specific profile creation
      const teachingRoles: UserRole[] = [
        UserRole.ROLE_CLASS_TEACHER,
        UserRole.ROLE_SUBJECT_TEACHER,
        UserRole.ROLE_TEACHING_ASSISTANT,
        UserRole.ROLE_ACADEMIC_HEAD,
      ];

      if (teachingRoles.includes(data.role) && targetInstitutionId) {
        const employeeCode =
          data.employeeCode ||
          `EMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        await tx.teacherProfile.create({
          data: {
            userId: user.id,
            institutionId: targetInstitutionId,
            employeeCode,
            department: data.department?.trim() || null,
            qualification: data.qualification?.trim() || null,
          },
        });
      } else if (data.role === UserRole.ROLE_PARENT && targetInstitutionId) {
        await tx.parentProfile.create({
          data: {
            userId: user.id,
            institutionId: targetInstitutionId,
            occupation: data.occupation?.trim() || null,
            emergencyContact: data.emergencyContact?.trim() || data.phone?.trim() || null,
          },
        });
      }

      // 3. Audit log
      await tx.auditEvent.create({
        data: {
          institutionId: targetInstitutionId || null,
          userId: caller.id,
          action: 'USER_PROVISIONED',
          entity: 'User',
          entityId: user.id,
          newValuesJson: JSON.stringify({
            targetUserId: user.id,
            email: user.email,
            role: user.role,
            institutionId: targetInstitutionId,
          }),
        },
      });

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        institutionId: user.institutionId,
        createdAt: user.createdAt,
      };
    });
  }

  static async updateUserRole(
    targetUserId: string,
    caller: AuthenticatedUser,
    data: { role?: UserRole; isActive?: boolean; institutionId?: string }
  ) {
    const isSuperAdmin = caller.role === UserRole.ROLE_SUPER_ADMIN;
    const isInstitutionAdmin = caller.role === UserRole.ROLE_INSTITUTION_ADMIN;

    if (!isSuperAdmin && !isInstitutionAdmin) {
      throw { status: 403, message: 'Only Administrators have the authority to modify user roles and statuses' };
    }

    // Prevent self-role escalation
    if (targetUserId === caller.id && data.role && data.role !== caller.role) {
      throw { status: 403, message: 'Self-privilege escalation is strictly forbidden' };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { teacherProfile: true, parentProfile: true },
    });

    if (!targetUser) {
      throw { status: 404, message: 'Target user not found' };
    }

    // Tenant check: Institution Admin can only manage users within their institution
    if (!isSuperAdmin && targetUser.institutionId !== caller.institutionId) {
      throw { status: 403, message: 'You can only modify users within your own institution' };
    }

    // Hierarchy check: Institution Admin cannot touch or create Super Admin
    if (targetUser.role === UserRole.ROLE_SUPER_ADMIN && !isSuperAdmin) {
      throw { status: 403, message: 'Cannot modify a Super Administrator' };
    }
    if (data.role === UserRole.ROLE_SUPER_ADMIN && !isSuperAdmin) {
      throw { status: 403, message: 'Institution Administrators cannot promote a user to Super Administrator' };
    }

    // Safeguard: Prevent removing the last active Super Admin
    if (targetUser.role === UserRole.ROLE_SUPER_ADMIN) {
      const willDemote = data.role && data.role !== UserRole.ROLE_SUPER_ADMIN;
      const willDeactivate = data.isActive === false;
      if (willDemote || willDeactivate) {
        const activeSuperAdminCount = await prisma.user.count({
          where: { role: UserRole.ROLE_SUPER_ADMIN, isActive: true },
        });
        if (activeSuperAdminCount <= 1) {
          throw { status: 400, message: 'Cannot demote or deactivate the last remaining Super Administrator' };
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          ...(data.role && { role: data.role }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.institutionId && isSuperAdmin && { institutionId: data.institutionId }),
          updatedAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          institutionId: true,
          updatedAt: true,
        },
      });

      // If transitioning to teacher role and no profile exists
      const teachingRoles: UserRole[] = [
        UserRole.ROLE_CLASS_TEACHER,
        UserRole.ROLE_SUBJECT_TEACHER,
        UserRole.ROLE_TEACHING_ASSISTANT,
        UserRole.ROLE_ACADEMIC_HEAD,
      ];
      if (data.role && teachingRoles.includes(data.role) && !targetUser.teacherProfile && updated.institutionId) {
        await tx.teacherProfile.create({
          data: {
            userId: updated.id,
            institutionId: updated.institutionId,
            employeeCode: `EMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          },
        });
      }

      // If transitioning to parent role and no profile exists
      if (data.role === UserRole.ROLE_PARENT && !targetUser.parentProfile && updated.institutionId) {
        await tx.parentProfile.create({
          data: {
            userId: updated.id,
            institutionId: updated.institutionId,
          },
        });
      }

      // Invalidate active refresh tokens for the target user to enforce session security on role change
      await tx.refreshToken.deleteMany({
        where: { userId: targetUserId },
      });

      // Audit log
      await tx.auditEvent.create({
        data: {
          institutionId: updated.institutionId || null,
          userId: caller.id,
          action: 'USER_ROLE_UPDATED',
          entity: 'User',
          entityId: targetUserId,
          newValuesJson: JSON.stringify({
            targetUserId,
            previousRole: targetUser.role,
            newRole: data.role || targetUser.role,
            previousActive: targetUser.isActive,
            newActive: data.isActive !== undefined ? data.isActive : targetUser.isActive,
          }),
        },
      });

      return updated;
    });
  }

  static async resetUserPassword(
    targetUserId: string,
    caller: AuthenticatedUser,
    newPassword: string
  ) {
    const isSuperAdmin = caller.role === UserRole.ROLE_SUPER_ADMIN;
    const isInstitutionAdmin = caller.role === UserRole.ROLE_INSTITUTION_ADMIN;

    if (!isSuperAdmin && !isInstitutionAdmin) {
      throw { status: 403, message: 'Only Administrators have the authority to change user passwords' };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw { status: 404, message: 'Target user not found' };
    }

    // Tenant check: Institution Admin can only change passwords of users in their own institution
    if (!isSuperAdmin && targetUser.institutionId !== caller.institutionId) {
      throw { status: 403, message: 'You can only change passwords of users within your own institution' };
    }

    // Institution Admin cannot reset password of a Super Admin
    if (targetUser.role === UserRole.ROLE_SUPER_ADMIN && !isSuperAdmin) {
      throw { status: 403, message: 'Cannot reset the password of a Super Administrator' };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        passwordHash,
        updatedAt: new Date(),
      },
    });

    // Invalidate sessions on password change
    await prisma.refreshToken.deleteMany({
      where: { userId: targetUserId },
    });

    return {
      message: `Password for ${targetUser.firstName} ${targetUser.lastName} (${targetUser.email}) successfully reset.`,
      userId: targetUser.id,
      email: targetUser.email,
    };
  }
}
