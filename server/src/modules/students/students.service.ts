import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { hashPassword } from '../../utils/password';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../types';

const SAFE_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  username: true,
  phone: true,
  role: true,
  isActive: true,
};

export class StudentsService {
  static async getAll(institutionId: string, sectionId?: string, caller?: AuthenticatedUser) {
    const where: any = { institutionId, status: { not: 'ARCHIVED' } };

    // Strict Parent Data Isolation: A parent can only view their linked children
    if (caller?.role === UserRole.ROLE_PARENT) {
      const parentProfile = await prisma.parentProfile.findUnique({
        where: { userId: caller.id },
      });
      if (!parentProfile) return [];

      const relations = await prisma.studentParentRelation.findMany({
        where: { parentId: parentProfile.id, student: { institutionId } },
        select: { studentId: true },
      });

      const allowedStudentIds = relations.map((r) => r.studentId);
      if (allowedStudentIds.length === 0) return [];
      where.id = { in: allowedStudentIds };
    }

    // Strict Student Data Isolation: A student can only view their own profile
    if (caller?.role === UserRole.ROLE_STUDENT) {
      const studentProfile = await prisma.studentProfile.findUnique({
        where: { userId: caller.id },
      });
      if (!studentProfile) return [];
      where.id = studentProfile.id;
    }

    if (sectionId) {
      where.sectionId = sectionId;
    }

    return prisma.studentProfile.findMany({
      where,
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
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { rollNumber: 'asc' },
    });
  }

  static async getById(id: string, institutionId: string, caller?: AuthenticatedUser) {
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
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
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

    // Strict Parent Data Isolation: Validate that the parent is explicitly linked to this student
    if (caller?.role === UserRole.ROLE_PARENT) {
      const parentProfile = await prisma.parentProfile.findUnique({
        where: { userId: caller.id },
      });
      if (!parentProfile) {
        throw { status: 403, message: 'Access denied: Parent profile not found' };
      }

      const relation = await prisma.studentParentRelation.findUnique({
        where: {
          studentId_parentId: {
            studentId: id,
            parentId: parentProfile.id,
          },
        },
      });

      if (!relation) {
        throw { status: 403, message: 'Access denied: You are not authorized to view this student profile' };
      }
    }

    // Strict Student Data Isolation: Validate that student only accesses their own profile
    if (caller?.role === UserRole.ROLE_STUDENT) {
      if (student.userId !== caller.id) {
        throw { status: 403, message: 'Access denied: You can only view your own student profile' };
      }
    }

    return student;
  }

  static async create(institutionId: string, data: any, caller?: AuthenticatedUser) {
    const section = await prisma.section.findFirst({
      where: { id: data.sectionId, classGrade: { institutionId } },
    });
    if (!section) {
      throw { status: 404, message: 'Section not found in this institution' };
    }

    const passwordHash = await hashPassword(data.password);

    return prisma.$transaction(async (tx) => {
      // 1. Create Student User account
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
          user: { select: SAFE_USER_SELECT },
          section: { include: { classGrade: true } },
        },
      });

      // 3. Parent Handling: Automatically Create or Link Parent Account
      if (data.parent && data.parent.email) {
        const parentEmail = data.parent.email.toLowerCase().trim();

        // Check if parent user already exists
        let parentUser = await tx.user.findUnique({
          where: { email: parentEmail },
        });

        if (parentUser) {
          // If parent belongs to another institution, reject cross-tenant link
          if (parentUser.institutionId && parentUser.institutionId !== institutionId) {
            throw {
              status: 400,
              message: 'Parent account belongs to a different institution and cannot be linked',
            };
          }
        } else {
          // Create new parent account with secure cryptographic password
          const tempPassword = crypto.randomBytes(16).toString('hex') + 'P@1';
          const parentPasswordHash = await hashPassword(tempPassword);

          // Generate unique username based on email or name
          let baseUsername = parentEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'parent';
          let uniqueUsername = baseUsername;
          const existingUsername = await tx.user.findUnique({ where: { username: uniqueUsername } });
          if (existingUsername) {
            uniqueUsername = `${baseUsername}${crypto.randomBytes(3).toString('hex')}`;
          }

          parentUser = await tx.user.create({
            data: {
              institutionId,
              email: parentEmail,
              username: uniqueUsername,
              passwordHash: parentPasswordHash,
              firstName: data.parent.firstName,
              lastName: data.parent.lastName,
              phone: data.parent.phone || null,
              role: UserRole.ROLE_PARENT,
              isActive: true,
            },
          });
        }

        // Find or create ParentProfile
        let parentProfile = await tx.parentProfile.findUnique({
          where: { userId: parentUser.id },
        });

        if (!parentProfile) {
          parentProfile = await tx.parentProfile.create({
            data: {
              userId: parentUser.id,
              institutionId,
              occupation: data.parent.occupation || null,
              emergencyContact: data.parent.phone || null,
            },
          });
        }

        // Create explicit StudentParentRelation
        const existingRelation = await tx.studentParentRelation.findUnique({
          where: {
            studentId_parentId: {
              studentId: profile.id,
              parentId: parentProfile.id,
            },
          },
        });

        if (!existingRelation) {
          await tx.studentParentRelation.create({
            data: {
              studentId: profile.id,
              parentId: parentProfile.id,
              relationshipType: data.parent.relationshipType || 'GUARDIAN',
              isPrimaryContact: data.parent.isPrimaryContact ?? true,
            },
          });
        }

        // Audit the parent linking / creation
        if (caller) {
          await tx.auditEvent.create({
            data: {
              institutionId,
              userId: caller.id,
              action: 'PARENT_STUDENT_LINKED',
              entity: 'StudentParentRelation',
              entityId: `${profile.id}_${parentProfile.id}`,
              newValuesJson: JSON.stringify({
                studentId: profile.id,
                parentId: parentProfile.id,
                parentEmail: parentUser.email,
                relationshipType: data.parent.relationshipType || 'GUARDIAN',
              }),
            },
          });
        }
      }

      // Re-fetch complete profile with relations
      const completeProfile = await tx.studentProfile.findUnique({
        where: { id: profile.id },
        include: {
          user: { select: SAFE_USER_SELECT },
          section: { include: { classGrade: true } },
          parentRelations: {
            include: {
              parent: {
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      firstName: true,
                      lastName: true,
                      phone: true,
                      role: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return completeProfile;
    });
  }

  static async linkParent(studentId: string, data: any, institutionId: string) {
    const student = await prisma.studentProfile.findFirst({
      where: { id: studentId, institutionId },
    });

    if (!student) {
      throw { status: 404, message: 'Student record not found in this institution' };
    }

    let parentProfileId = data.parentId;

    if (!parentProfileId && data.parentEmail) {
      const parentUser = await prisma.user.findFirst({
        where: { email: data.parentEmail.toLowerCase(), institutionId, role: UserRole.ROLE_PARENT },
        include: { parentProfile: true },
      });
      if (!parentUser || !parentUser.parentProfile) {
        throw { status: 404, message: 'Parent user not found in this institution' };
      }
      parentProfileId = parentUser.parentProfile.id;
    }

    const parent = await prisma.parentProfile.findFirst({
      where: { id: parentProfileId, user: { institutionId } },
    });

    if (!parent) {
      throw { status: 404, message: 'Parent record not found in this institution' };
    }

    // Check if relationship already exists
    const existing = await prisma.studentParentRelation.findUnique({
      where: {
        studentId_parentId: {
          studentId,
          parentId: parent.id,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return prisma.studentParentRelation.create({
      data: {
        studentId,
        parentId: parent.id,
        relationshipType: data.relationshipType || 'GUARDIAN',
        isPrimaryContact: data.isPrimaryContact || false,
      },
      include: {
        parent: { include: { user: { select: SAFE_USER_SELECT } } },
      },
    });
  }

  static async unlinkParent(studentId: string, parentId: string, institutionId: string) {
    const student = await prisma.studentProfile.findFirst({
      where: { id: studentId, institutionId },
    });
    if (!student) {
      throw { status: 404, message: 'Student record not found in this institution' };
    }

    const relation = await prisma.studentParentRelation.findUnique({
      where: {
        studentId_parentId: {
          studentId,
          parentId,
        },
      },
    });

    if (!relation) {
      throw { status: 404, message: 'Parent-student relationship not found' };
    }

    await prisma.studentParentRelation.delete({
      where: {
        studentId_parentId: {
          studentId,
          parentId,
        },
      },
    });

    return { message: 'Parent-student relationship removed successfully' };
  }

  static async changeSection(institutionId: string, studentId: string, newSectionId: string, caller: AuthenticatedUser) {
    const student = await prisma.studentProfile.findFirst({
      where: { id: studentId, institutionId },
      include: {
        user: { select: SAFE_USER_SELECT },
        section: { include: { classGrade: true } },
      },
    });

    if (!student) {
      throw { status: 404, message: 'Student profile not found in this institution.' };
    }

    if (student.sectionId === newSectionId) {
      throw { status: 400, message: 'Student is already enrolled in this section.' };
    }

    const targetSection = await prisma.section.findFirst({
      where: { id: newSectionId, classGrade: { institutionId } },
      include: {
        classGrade: true,
        _count: { select: { students: true } },
      },
    });

    if (!targetSection) {
      throw { status: 404, message: 'Target section was not found in this institution.' };
    }

    if (targetSection._count.students >= targetSection.maxCapacity) {
      throw {
        status: 400,
        message: `Section "${targetSection.name}" has reached its maximum capacity (${targetSection.maxCapacity} students).`,
      };
    }

    const updated = await prisma.studentProfile.update({
      where: { id: studentId },
      data: { sectionId: newSectionId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        section: {
          include: { classGrade: true },
        },
      },
    });

    return updated;
  }
}
