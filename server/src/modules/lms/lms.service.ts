import { prisma } from '../../utils/prisma';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../types';

const SAFE_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  username: true,
  role: true,
};

export class LmsService {
  static async getCourses(institutionId: string, user: AuthenticatedUser) {
    // If student, return courses for their enrolled section
    if (user.role === UserRole.ROLE_STUDENT) {
      const studentProfile = await prisma.studentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!studentProfile) return [];

      return prisma.course.findMany({
        where: {
          institutionId,
          sectionId: studentProfile.sectionId,
          isPublished: true,
        },
        include: {
          subject: true,
          section: { include: { classGrade: true } },
          teacher: { include: { user: { select: SAFE_USER_SELECT } } },
          _count: { select: { modules: true, assignments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // If teacher, return courses assigned to teacher
    if (user.role === UserRole.ROLE_SUBJECT_TEACHER || user.role === UserRole.ROLE_CLASS_TEACHER) {
      const teacherProfile = await prisma.teacherProfile.findUnique({
        where: { userId: user.id },
      });
      if (!teacherProfile) return [];

      return prisma.course.findMany({
        where: {
          institutionId,
          teacherId: teacherProfile.id,
        },
        include: {
          subject: true,
          section: { include: { classGrade: true } },
          teacher: { include: { user: { select: SAFE_USER_SELECT } } },
          _count: { select: { modules: true, assignments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // If parent, return courses only for their linked children's sections
    if (user.role === UserRole.ROLE_PARENT) {
      const parentProfile = await prisma.parentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!parentProfile) return [];

      const relations = await prisma.studentParentRelation.findMany({
        where: { parentId: parentProfile.id, student: { institutionId } },
        include: { student: { select: { sectionId: true } } },
      });

      const sectionIds = [...new Set(relations.map((r) => r.student.sectionId))];
      if (sectionIds.length === 0) return [];

      return prisma.course.findMany({
        where: {
          institutionId,
          sectionId: { in: sectionIds },
          isPublished: true,
        },
        include: {
          subject: true,
          section: { include: { classGrade: true } },
          teacher: { include: { user: { select: SAFE_USER_SELECT } } },
          _count: { select: { modules: true, assignments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Default (Admins, Academic Head, TA): All courses in institution
    return prisma.course.findMany({
      where: { institutionId },
      include: {
        subject: true,
        section: { include: { classGrade: true } },
        teacher: { include: { user: { select: SAFE_USER_SELECT } } },
        _count: { select: { modules: true, assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getCourseById(id: string, institutionId: string, user?: AuthenticatedUser) {
    let allowedStudentIds: string[] | null = null;

    if (user?.role === UserRole.ROLE_STUDENT) {
      const studentProfile = await prisma.studentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!studentProfile) throw { status: 403, message: 'Student profile not found' };
      allowedStudentIds = [studentProfile.id];
    } else if (user?.role === UserRole.ROLE_PARENT) {
      const parentProfile = await prisma.parentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!parentProfile) throw { status: 403, message: 'Parent profile not found' };
      const relations = await prisma.studentParentRelation.findMany({
        where: { parentId: parentProfile.id, student: { institutionId } },
        select: { studentId: true },
      });
      allowedStudentIds = relations.map((r) => r.studentId);
    }

    const course = await prisma.course.findFirst({
      where: { id, institutionId },
      include: {
        subject: true,
        section: true,
        teacher: { include: { user: { select: SAFE_USER_SELECT } } },
        modules: {
          include: {
            lessons: {
              include: { attachments: true },
              orderBy: { sequenceOrder: 'asc' },
            },
          },
          orderBy: { sequenceOrder: 'asc' },
        },
        assignments: {
          include: {
            submissions: {
              where: allowedStudentIds ? { studentId: { in: allowedStudentIds } } : undefined,
              include: {
                student: {
                  include: {
                    user: {
                      select: { id: true, firstName: true, lastName: true, email: true },
                    },
                    section: {
                      include: { classGrade: true },
                    },
                  },
                },
              },
              orderBy: { submittedAt: 'desc' },
            },
          },
          orderBy: { dueDate: 'asc' },
        },
        quizzes: {
          include: { questions: true },
        },
      },
    });

    if (!course) {
      throw { status: 404, message: 'Course not found in this institution' };
    }

    return course;
  }

  static async createCourse(institutionId: string, data: any, user?: AuthenticatedUser) {
    const isTeacher = user?.role === UserRole.ROLE_SUBJECT_TEACHER || user?.role === UserRole.ROLE_CLASS_TEACHER;
    const isAdmin = user?.role === UserRole.ROLE_SUPER_ADMIN || user?.role === UserRole.ROLE_INSTITUTION_ADMIN || user?.role === UserRole.ROLE_ACADEMIC_HEAD;

    let targetTeacherId = data.teacherId;

    // Strict RBAC: If user is a teacher, verify they are only creating a course for their officially assigned subject & section
    if (isTeacher && !isAdmin) {
      const teacherProfile = await prisma.teacherProfile.findFirst({
        where: { userId: user!.id, institutionId },
      });
      if (!teacherProfile) {
        throw { status: 403, message: 'Teacher profile not found for current user.' };
      }
      targetTeacherId = teacherProfile.id;

      const assignment = await prisma.teacherAssignment.findFirst({
        where: {
          teacherId: teacherProfile.id,
          subjectId: data.subjectId,
          sectionId: data.sectionId,
        },
      });

      if (!assignment) {
        throw {
          status: 403,
          message: 'Access Denied: You are not assigned to teach this subject in this class section. Teachers may only create courses for subjects and sections officially allocated to them by administration.',
        };
      }
    }

    const [subject, section, teacher, term] = await Promise.all([
      prisma.subject.findFirst({ where: { id: data.subjectId, institutionId } }),
      prisma.section.findFirst({ where: { id: data.sectionId, classGrade: { institutionId } } }),
      prisma.teacherProfile.findFirst({ where: { id: targetTeacherId, user: { institutionId } } }),
      prisma.academicTerm.findFirst({ where: { id: data.academicTermId, academicYear: { institutionId } } }),
    ]);

    if (!subject || !section || !teacher || !term) {
      throw { status: 404, message: 'Referenced academic entities not found in this institution' };
    }

    return prisma.course.create({
      data: {
        institutionId,
        subjectId: data.subjectId,
        sectionId: data.sectionId,
        teacherId: targetTeacherId,
        academicTermId: data.academicTermId,
        title: data.title,
        code: data.code,
        description: data.description,
        isPublished: data.isPublished !== undefined ? Boolean(data.isPublished) : false,
      },
      include: {
        subject: true,
        section: { include: { classGrade: true } },
        teacher: { include: { user: { select: SAFE_USER_SELECT } } },
        _count: { select: { modules: true, assignments: true } },
      },
    });
  }

  static async createModule(institutionId: string, data: any) {
    const course = await prisma.course.findFirst({
      where: { id: data.courseId, institutionId },
    });
    if (!course) {
      throw { status: 404, message: 'Course not found in this institution' };
    }

    return prisma.courseModule.create({
      data: {
        courseId: data.courseId,
        title: data.title,
        sequenceOrder: data.sequenceOrder,
        isPublished: true,
      },
    });
  }

  static async createLesson(institutionId: string, data: any) {
    const module = await prisma.courseModule.findFirst({
      where: { id: data.moduleId, course: { institutionId } },
    });
    if (!module) {
      throw { status: 404, message: 'Module not found in this institution' };
    }

    return prisma.lesson.create({
      data: {
        moduleId: data.moduleId,
        title: data.title,
        contentRichText: data.contentRichText,
        videoUrl: data.videoUrl,
        sequenceOrder: data.sequenceOrder,
        isPublished: true,
      },
    });
  }

  static async createAssignment(institutionId: string, data: any) {
    const course = await prisma.course.findFirst({
      where: { id: data.courseId, institutionId },
    });
    if (!course) {
      throw { status: 404, message: 'Course not found in this institution' };
    }

    let finalInstructions = data.instructions;
    const metadataTags: string[] = [];
    if (data.weightagePercent !== undefined && data.weightagePercent !== null) {
      metadataTags.push(`[Weightage: ${data.weightagePercent}%]`);
    }
    if (data.criteria && data.criteria.trim()) {
      metadataTags.push(`[Criteria: ${data.criteria.trim()}]`);
    }
    if (metadataTags.length > 0) {
      finalInstructions = `${metadataTags.join(' ')}\n\n${finalInstructions}`;
    }

    return prisma.assignment.create({
      data: {
        courseId: data.courseId,
        title: data.title,
        instructions: finalInstructions,
        maxPoints: data.maxPoints,
        dueDate: new Date(data.dueDate),
        allowLateSubmissions: data.allowLateSubmissions ?? true,
        latePenaltyPercent: data.latePenaltyPercent ?? 0,
      },
    });
  }

  static async getSubmissions(assignmentId: string, institutionId: string) {
    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, course: { institutionId } },
    });
    if (!assignment) {
      throw { status: 404, message: 'Assignment not found in this institution' };
    }

    return prisma.assignmentSubmission.findMany({
      where: { assignmentId },
      include: {
        student: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            section: {
              include: {
                classGrade: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  static async submitAssignment(assignmentId: string, user: AuthenticatedUser, data: any, institutionId: string) {
    const studentProfile = await prisma.studentProfile.findFirst({
      where: { userId: user.id, institutionId },
    });

    if (!studentProfile) {
      throw { status: 403, message: 'Only enrolled students of this institution can submit assignments' };
    }

    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, course: { institutionId } },
    });

    if (!assignment) {
      throw { status: 404, message: 'Assignment not found in this institution' };
    }

    const isLate = new Date() > assignment.dueDate;
    if (isLate && !assignment.allowLateSubmissions) {
      throw { status: 400, message: 'Late submissions are not accepted for this assignment' };
    }

    return prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId: studentProfile.id,
        },
      },
      update: {
        submittedAt: new Date(),
        contentText: data.contentText,
        attachmentUrl: data.attachmentUrl,
        status: isLate ? 'LATE' : 'RESUBMITTED',
      },
      create: {
        assignmentId,
        studentId: studentProfile.id,
        contentText: data.contentText,
        attachmentUrl: data.attachmentUrl,
        status: isLate ? 'LATE' : 'SUBMITTED',
      },
    });
  }

  static async gradeSubmission(submissionId: string, graderUserId: string, data: any, institutionId: string) {
    const submission = await prisma.assignmentSubmission.findFirst({
      where: { id: submissionId, assignment: { course: { institutionId } } },
    });

    if (!submission) {
      throw { status: 404, message: 'Submission not found in this institution' };
    }

    return prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        grade: data.grade,
        feedback: data.feedback,
        gradedByUserId: graderUserId,
        gradedAt: new Date(),
        status: 'GRADED',
      },
      include: {
        student: { include: { user: { select: SAFE_USER_SELECT } } },
        assignment: true,
      },
    });
  }

  static async getSubmissionAttachment(submissionId: string, user?: AuthenticatedUser) {
    const submission = await prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: {
            course: true,
          },
        },
        student: {
          include: {
            user: { select: SAFE_USER_SELECT },
          },
        },
      },
    });

    if (!submission) {
      throw { status: 404, message: 'Assignment submission not found' };
    }

    if (user) {
      if (user.role === UserRole.ROLE_STUDENT) {
        if (submission.student.userId !== user.id) {
          throw { status: 403, message: 'You can only view your own assignment submission.' };
        }
      } else if (user.role === UserRole.ROLE_PARENT) {
        const isLinked = await prisma.studentParentRelation.findFirst({
          where: {
            parent: { userId: user.id },
            studentId: submission.studentId,
          },
        });
        if (!isLinked) {
          throw { status: 403, message: 'You can only view submissions of your linked children.' };
        }
      }
    }

    return submission;
  }
}
