import { prisma } from '../../utils/prisma';
import { AuthenticatedUser } from '../../types';
import { UserRole } from '@prisma/client';

export class CommunicationService {
  static async getRecipients(institutionId: string, user: AuthenticatedUser) {
    const adminRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN];
    if (adminRoles.includes(user.role)) {
      return prisma.user.findMany({
        where: { institutionId, isActive: true, id: { not: user.id } },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    }

    let sectionIds: string[] = [];
    const teacher = await prisma.teacherProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
    if (teacher) {
      const assignments = await prisma.teacherAssignment.findMany({ where: { teacherId: teacher.id, section: { classGrade: { institutionId } } }, select: { sectionId: true } });
      sectionIds = assignments.map((assignment) => assignment.sectionId);
      const students = await prisma.studentProfile.findMany({ where: { institutionId, sectionId: { in: sectionIds }, status: 'ENROLLED' }, select: { id: true, user: { select: { id: true, firstName: true, lastName: true, role: true } } } });
      const relations = await prisma.studentParentRelation.findMany({ where: { studentId: { in: students.map((student) => student.id) }, parent: { institutionId } }, select: { parent: { select: { user: { select: { id: true, firstName: true, lastName: true, role: true } } } } } });
      return [...students.map((student) => student.user), ...relations.map((relation) => relation.parent.user)]
        .filter((recipient) => recipient.id !== user.id);
    }

    const student = await prisma.studentProfile.findFirst({ where: { userId: user.id, institutionId }, select: { sectionId: true } });
    const parent = await prisma.parentProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
    let studentIds: string[] = [];
    if (student) studentIds = [student.sectionId];
    if (parent) {
      const children = await prisma.studentParentRelation.findMany({ where: { parentId: parent.id, student: { institutionId } }, select: { student: { select: { sectionId: true } } } });
      studentIds = [...new Set(children.map((child) => child.student.sectionId))];
    }
    if (studentIds.length === 0) return [];
    const assignments = await prisma.teacherAssignment.findMany({ where: { sectionId: { in: studentIds }, teacher: { institutionId } }, select: { teacher: { select: { user: { select: { id: true, firstName: true, lastName: true, role: true } } } } } });
    const unique = new Map(assignments.map((assignment) => [assignment.teacher.user.id, assignment.teacher.user]));
    unique.delete(user.id);
    return [...unique.values()];
  }

  static async getAnnouncements(institutionId: string, user: AuthenticatedUser) {
    return prisma.announcement.findMany({
      where: {
        institutionId,
        OR: [{ targetRole: null }, { targetRole: user.role }],
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static async createAnnouncement(institutionId: string, authorUserId: string, data: { title: string; content: string; targetRole?: string; isPinned?: boolean }) {
    return prisma.announcement.create({
      data: {
        institutionId,
        authorUserId,
        title: data.title,
        content: data.content,
        targetRole: data.targetRole || null,
        isPinned: data.isPinned || false,
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  static async sendMessage(institutionId: string, senderId: string, data: { receiverId: string; subject?: string; body: string }) {
    const [sender, receiver] = await Promise.all([
      prisma.user.findFirst({ where: { id: senderId, institutionId }, select: { id: true, role: true } }),
      prisma.user.findFirst({ where: { id: data.receiverId, institutionId }, select: { id: true, role: true } }),
    ]);
    if (!sender) throw { status: 403, message: 'Sender is not a member of this institution' };
    if (!receiver || receiver.id === senderId) {
      throw { status: 404, message: 'Recipient not found in your institution' };
    }

    const administratorRoles: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN];
    let related = administratorRoles.includes(sender.role);
    if (!related) {
      const [senderStudent, receiverStudent, senderParent, receiverParent, senderTeacher, receiverTeacher] = await Promise.all([
        prisma.studentProfile.findFirst({ where: { userId: senderId, institutionId }, select: { id: true, sectionId: true } }),
        prisma.studentProfile.findFirst({ where: { userId: receiver.id, institutionId }, select: { id: true, sectionId: true } }),
        prisma.parentProfile.findFirst({ where: { userId: senderId, institutionId }, select: { id: true } }),
        prisma.parentProfile.findFirst({ where: { userId: receiver.id, institutionId }, select: { id: true } }),
        prisma.teacherProfile.findFirst({ where: { userId: senderId, institutionId }, select: { id: true } }),
        prisma.teacherProfile.findFirst({ where: { userId: receiver.id, institutionId }, select: { id: true } }),
      ]);
      const student = senderStudent || receiverStudent;
      const parent = senderParent || receiverParent;
      const teacher = senderTeacher || receiverTeacher;
      if (student && teacher) {
        related = Boolean(await prisma.teacherAssignment.findFirst({ where: { teacherId: teacher.id, sectionId: student.sectionId } }));
      } else if (parent && teacher) {
        const relations = await prisma.studentParentRelation.findMany({
          where: { parentId: parent.id, student: { institutionId } },
          select: { student: { select: { sectionId: true } } },
        });
        const sectionIds = relations.map((relation) => relation.student.sectionId);
        related = sectionIds.length > 0 && Boolean(await prisma.teacherAssignment.findFirst({ where: { teacherId: teacher.id, sectionId: { in: sectionIds } } }));
      }
    }
    if (!related) throw { status: 403, message: 'Messaging is limited to institution administrators and assigned teacher-family relationships' };

    return prisma.$transaction(async (tx) => {
      const message = await tx.directMessage.create({
        data: {
          senderId,
          receiverId: data.receiverId,
          subject: data.subject || null,
          body: data.body,
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, role: true } },
          receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      // Trigger Notification for receiver
      await tx.notification.create({
        data: {
          institutionId,
          userId: data.receiverId,
          title: `New Message from ${message.sender.firstName} ${message.sender.lastName}`,
          message: data.subject ? `Subject: ${data.subject}` : data.body.substring(0, 80),
          type: 'INFO',
        },
      });

      return message;
    });
  }

  static async getMyMessages(institutionId: string, userId: string) {
    return prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId, sender: { institutionId } },
          { receiverId: userId, receiver: { institutionId } },
        ],
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getMyNotifications(institutionId: string, userId: string) {
    return prisma.notification.findMany({
      where: {
        institutionId,
        userId,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  static async markNotificationRead(id: string, institutionId: string, userId: string) {
    const result = await prisma.notification.updateMany({
      where: { id, institutionId, userId },
      data: { isRead: true },
    });
    if (result.count === 0) throw { status: 404, message: 'Notification not found' };
    return result;
  }
}
