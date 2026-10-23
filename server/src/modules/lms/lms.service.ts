import { prisma } from '../../utils/prisma';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../types';

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
          section: true,
          teacher: { include: { user: true } },
          _count: { select: { modules: true, assignments: true } },
        },
      });
    }

    // If teacher, return courses assigned to teacher
    if (user.role === UserRole.ROLE_SUBJECT_TEACHER) {
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
          section: true,
          _count: { select: { modules: true, assignments: true } },
        },
      });
    }

    // Default (Admins, Academic Head, TA): All courses in institution
    return prisma.course.findMany({
      where: { institutionId },
      include: {
        subject: true,
        section: true,
        teacher: { include: { user: true } },
        _count: { select: { modules: true, assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getCourseById(id: string, institutionId: string) {
    const course = await prisma.course.findFirst({
      where: { id, institutionId },
      include: {
        subject: true,
        section: true,
        teacher: { include: { user: true } },
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

  static async createCourse(institutionId: string, data: any) {
    return prisma.course.create({
      data: {
        institutionId,
        subjectId: data.subjectId,
        sectionId: data.sectionId,
        teacherId: data.teacherId,
        academicTermId: data.academicTermId,
        title: data.title,
        code: data.code,
        description: data.description,
        isPublished: data.isPublished || false,
      },
    });
  }

  static async createModule(data: any) {
    return prisma.courseModule.create({
      data: {
        courseId: data.courseId,
        title: data.title,
        sequenceOrder: data.sequenceOrder,
        isPublished: true,
      },
    });
  }

  static async createLesson(data: any) {
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

  static async createAssignment(data: any) {
    return prisma.assignment.create({
      data: {
        courseId: data.courseId,
        title: data.title,
        instructions: data.instructions,
        maxPoints: data.maxPoints,
        dueDate: new Date(data.dueDate),
        allowLateSubmissions: data.allowLateSubmissions,
        latePenaltyPercent: data.latePenaltyPercent,
      },
    });
  }

  static async submitAssignment(assignmentId: string, user: AuthenticatedUser, data: any) {
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });

    if (!studentProfile) {
      throw { status: 403, message: 'Only enrolled students can submit assignments' };
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw { status: 404, message: 'Assignment not found' };
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

  static async gradeSubmission(submissionId: string, graderUserId: string, data: any) {
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
        student: { include: { user: true } },
        assignment: true,
      },
    });
  }
}
