import { prisma } from '../../utils/prisma';
import { SubjectResultStatus, SubmissionStatus, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../types';
import { AssessmentService } from '../assessment/assessment.service';


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

  static async createAssignment(institutionId: string, data: any, user?: AuthenticatedUser) {
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

    // Automatically create or link authoritative AssessmentItem in AssessmentScheme
    let assessmentItemId: string | null = null;
    if (course.academicTermId && course.subjectId && course.sectionId) {
      let scheme = await prisma.assessmentScheme.findFirst({
        where: {
          institutionId,
          subjectId: course.subjectId,
          academicTermId: course.academicTermId,
          sectionId: course.sectionId,
        },
        include: { categories: true },
      });

      if (!scheme) {
        let creatorId = user?.id;
        if (!creatorId && course.teacherId) {
          const tp = await prisma.teacherProfile.findUnique({ where: { id: course.teacherId } });
          creatorId = tp?.userId;
        }
        if (!creatorId) {
          const adminUser = await prisma.user.findFirst({ where: { institutionId } });
          creatorId = adminUser?.id || 'system';
        }

        scheme = await prisma.assessmentScheme.create({
          data: {
            institutionId,
            academicTermId: course.academicTermId,
            subjectId: course.subjectId,
            sectionId: course.sectionId,
            title: `${course.title} Assessment Scheme`,
            status: 'DRAFT',
            createdById: creatorId,
            categories: {
              create: [
                {
                  name: data.title,
                  weightagePercentage: data.weightagePercent ?? 15,
                  description: `Component for ${data.title}`,
                  displayOrder: 0,
                },
              ],
            },
          },
          include: { categories: true },
        });
      }

      // Find or create appropriate category
      let category = scheme.categories.find(
        (c) => c.name.toLowerCase() === data.title.toLowerCase() || c.name.toLowerCase() === 'assignments'
      );

      if (!category) {
        category = await prisma.assessmentCategory.create({
          data: {
            assessmentSchemeId: scheme.id,
            name: data.title,
            weightagePercentage: data.weightagePercent ?? 15,
            description: `Assessment component for ${data.title}`,
            displayOrder: scheme.categories.length,
          },
        });
      }

      const item = await prisma.assessmentItem.create({
        data: {
          assessmentCategoryId: category.id,
          title: data.title,
          instructions: finalInstructions,
          maxMarks: data.maxPoints,
          weightagePercentage: data.weightagePercent ?? category.weightagePercentage,
          dueDate: new Date(data.dueDate),
          isPublished: true,
        },
      });
      assessmentItemId = item.id;
    }

    return prisma.assignment.create({
      data: {
        courseId: data.courseId,
        title: data.title,
        instructions: finalInstructions,
        maxPoints: data.maxPoints,
        weightagePercent: data.weightagePercent ?? null,
        assessmentItemId,
        dueDate: new Date(data.dueDate),
        allowLateSubmissions: data.allowLateSubmissions ?? true,
        latePenaltyPercent: data.latePenaltyPercent ?? 0,
      },
      include: {
        assessmentItem: true,
      },
    });
  }

  static async updateAssignment(
    assignmentId: string,
    institutionId: string,
    user: AuthenticatedUser,
    data: any
  ) {
    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, course: { institutionId } },
      include: {
        course: true,
        assessmentItem: {
          include: { category: true },
        },
      },
    });

    if (!assignment) {
      throw { status: 404, message: 'Assignment not found in this institution' };
    }

    const course = assignment.course;

    // Check teacher editing lock: if subject result is submitted to Exam Dept, block direct edits!
    if (course.academicTermId && course.subjectId && course.sectionId) {
      const activeLockedResults = await prisma.subjectResult.findFirst({
        where: {
          subjectId: course.subjectId,
          sectionId: course.sectionId,
          academicTermId: course.academicTermId,
          status: {
            in: [
              SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT,
              SubjectResultStatus.UNDER_EXAM_REVIEW,
              SubjectResultStatus.APPROVED,
              SubjectResultStatus.OFFICIALLY_PUBLISHED,
            ],
          },
        },
      });

      if (activeLockedResults) {
        throw {
          status: 403,
          message:
            'Direct assignment modifications are locked because subject results have been submitted to the Examination Department. Please submit a formal correction request.',
        };
      }
    }

    // If dueDate changed: record in AssessmentDeadlineHistory (even after original dueDate has passed)
    if (data.dueDate && assignment.assessmentItemId) {
      const newDueDate = new Date(data.dueDate);
      await prisma.assessmentDeadlineHistory.create({
        data: {
          assessmentItemId: assignment.assessmentItemId,
          previousDueDate: assignment.dueDate,
          newDueDate,
          reason: data.reason || 'Assignment deadline updated by teacher',
          changedByUserId: user.id,
        },
      });

      await prisma.assessmentItem.update({
        where: { id: assignment.assessmentItemId },
        data: {
          dueDate: newDueDate,
          title: data.title ?? undefined,
          maxMarks: data.maxPoints ?? undefined,
          weightagePercentage: data.weightagePercent ?? undefined,
        },
      });
    }

    let finalInstructions = data.instructions;
    if (data.instructions && (data.weightagePercent !== undefined || data.criteria)) {
      const metadataTags: string[] = [];
      if (data.weightagePercent !== undefined && data.weightagePercent !== null) {
        metadataTags.push(`[Weightage: ${data.weightagePercent}%]`);
      }
      if (data.criteria && data.criteria.trim()) {
        metadataTags.push(`[Criteria: ${data.criteria.trim()}]`);
      }
      if (metadataTags.length > 0) {
        finalInstructions = `${metadataTags.join(' ')}\n\n${data.instructions}`;
      }
    }

    const updated = await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        title: data.title ?? undefined,
        instructions: finalInstructions ?? undefined,
        maxPoints: data.maxPoints ?? undefined,
        weightagePercent: data.weightagePercent ?? undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        allowLateSubmissions: data.allowLateSubmissions !== undefined ? data.allowLateSubmissions : undefined,
        latePenaltyPercent: data.latePenaltyPercent !== undefined ? data.latePenaltyPercent : undefined,
      },
      include: {
        assessmentItem: { include: { deadlineHistories: true } },
        submissions: true,
      },
    });

    // If maxPoints or weightage changed, recalculate affected students
    if (
      (data.maxPoints !== undefined || data.weightagePercent !== undefined) &&
      assignment.assessmentItemId &&
      course.academicTermId &&
      course.subjectId &&
      course.sectionId
    ) {
      const scheme = await prisma.assessmentScheme.findFirst({
        where: {
          subjectId: course.subjectId,
          sectionId: course.sectionId,
          academicTermId: course.academicTermId,
        },
      });
      if (scheme) {
        const students = await prisma.studentProfile.findMany({
          where: { sectionId: course.sectionId, institutionId },
          select: { id: true },
        });
        for (const s of students) {
          await AssessmentService.recalculateStudentSubjectResult(
            institutionId,
            s.id,
            course.subjectId,
            course.sectionId,
            course.academicTermId,
            scheme.id
          );
        }
      }
    }

    return updated;
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

    const submission = await prisma.assignmentSubmission.upsert({
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

    // Synchronize to AssessmentSubmissionRecord if linked to AssessmentItem
    if (assignment.assessmentItemId) {
      await prisma.assessmentSubmissionRecord.upsert({
        where: {
          assessmentItemId_studentId: {
            assessmentItemId: assignment.assessmentItemId,
            studentId: studentProfile.id,
          },
        },
        update: {
          submittedAt: new Date(),
          contentText: data.contentText,
          attachmentUrl: data.attachmentUrl,
          status: isLate ? SubmissionStatus.LATE : SubmissionStatus.RESUBMITTED,
        },
        create: {
          assessmentItemId: assignment.assessmentItemId,
          studentId: studentProfile.id,
          submittedAt: new Date(),
          contentText: data.contentText,
          attachmentUrl: data.attachmentUrl,
          status: isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
        },
      });
    }

    return submission;
  }

  static async gradeSubmission(submissionId: string, graderUserId: string, data: any, institutionId: string) {
    const submission = await prisma.assignmentSubmission.findFirst({
      where: { id: submissionId, assignment: { course: { institutionId } } },
      include: {
        assignment: {
          include: {
            course: true,
            assessmentItem: {
              include: {
                category: { include: { assessmentScheme: true } },
              },
            },
          },
        },
        student: true,
      },
    });

    if (!submission) {
      throw { status: 404, message: 'Submission not found in this institution' };
    }

    // Verify marks obtained <= assignment maxPoints
    if (data.grade > submission.assignment.maxPoints) {
      throw {
        status: 400,
        message: `Grade (${data.grade}) cannot exceed assignment maximum marks (${submission.assignment.maxPoints})`,
      };
    }

    // Check teacher editing lock: if subject result is submitted to Exam Dept, block direct edits!
    const course = submission.assignment.course;
    if (course.academicTermId && course.subjectId && course.sectionId) {
      const existingResult = await prisma.subjectResult.findUnique({
        where: {
          subjectId_sectionId_studentId_academicTermId: {
            subjectId: course.subjectId,
            sectionId: course.sectionId,
            studentId: submission.studentId,
            academicTermId: course.academicTermId,
          },
        },
      });

      if (
        existingResult &&
        ([
          SubjectResultStatus.SUBMITTED_TO_EXAM_DEPARTMENT,
          SubjectResultStatus.UNDER_EXAM_REVIEW,
          SubjectResultStatus.APPROVED,
          SubjectResultStatus.OFFICIALLY_PUBLISHED,
        ] as SubjectResultStatus[]).includes(existingResult.status)
      ) {
        throw {
          status: 403,
          message:
            'Direct marks edits are locked because this subject result has been submitted to the Examination Department. Please submit a formal marks correction request.',
        };
      }
    }

    const updated = await prisma.assignmentSubmission.update({
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

    // Synchronize to authoritative assessment mark and recalculate!
    if (submission.assignment.assessmentItemId && course.academicTermId && course.subjectId && course.sectionId) {
      const assessmentItemId = submission.assignment.assessmentItemId;
      const schemeId = submission.assignment.assessmentItem?.category.assessmentSchemeId;

      await prisma.$transaction(async (tx) => {
        await tx.studentAssessmentMark.upsert({
          where: {
            assessmentItemId_studentId: {
              assessmentItemId,
              studentId: submission.studentId,
            },
          },
          update: {
            marksObtained: data.grade,
            isAbsent: false,
            isExcused: false,
            remarks: data.feedback,
            enteredByUserId: graderUserId,
            status: 'PUBLISHED',
          },
          create: {
            assessmentItemId,
            studentId: submission.studentId,
            marksObtained: data.grade,
            isAbsent: false,
            isExcused: false,
            remarks: data.feedback,
            enteredByUserId: graderUserId,
            status: 'PUBLISHED',
          },
        });

        await tx.assessmentSubmissionRecord.upsert({
          where: {
            assessmentItemId_studentId: {
              assessmentItemId,
              studentId: submission.studentId,
            },
          },
          update: {
            grade: data.grade,
            feedback: data.feedback,
            gradedByUserId: graderUserId,
            gradedAt: new Date(),
            status: SubmissionStatus.GRADED,
          },
          create: {
            assessmentItemId,
            studentId: submission.studentId,
            grade: data.grade,
            feedback: data.feedback,
            gradedByUserId: graderUserId,
            gradedAt: new Date(),
            status: SubmissionStatus.GRADED,
          },
        });
      });

      // Recalculate student's subject result immediately!
      if (schemeId) {
        await AssessmentService.recalculateStudentSubjectResult(
          institutionId,
          submission.studentId,
          course.subjectId,
          course.sectionId,
          course.academicTermId,
          schemeId
        );
      }
    }

    return updated;
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
