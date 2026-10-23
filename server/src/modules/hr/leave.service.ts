import { LeaveStatus, UserRole } from '@prisma/client';
import { prisma } from '../../utils/prisma';

const approvers: UserRole[] = [UserRole.ROLE_SUPER_ADMIN, UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_ACADEMIC_HEAD];

export class LeaveService {
  static async list(institutionId: string, userId: string, role: UserRole) {
    if (approvers.includes(role)) {
      return prisma.staffLeaveRequest.findMany({
        where: { teacher: { institutionId } },
        include: { teacher: { select: { employeeCode: true, user: { select: { firstName: true, lastName: true } } } } },
        orderBy: { createdAt: 'desc' },
      });
    }
    const teacher = await prisma.teacherProfile.findFirst({ where: { userId, institutionId }, select: { id: true } });
    if (!teacher) return [];
    return prisma.staffLeaveRequest.findMany({ where: { teacherProfileId: teacher.id }, orderBy: { createdAt: 'desc' } });
  }

  static async request(institutionId: string, userId: string, data: { leaveType: string; startDate: string; endDate: string; reason: string }) {
    const teacher = await prisma.teacherProfile.findFirst({ where: { userId, institutionId }, select: { id: true } });
    if (!teacher) throw { status: 403, message: 'Only staff profiles can request leave' };
    return prisma.staffLeaveRequest.create({ data: {
      teacherProfileId: teacher.id,
      leaveType: data.leaveType,
      startDate: new Date(`${data.startDate}T00:00:00.000Z`),
      endDate: new Date(`${data.endDate}T00:00:00.000Z`),
      reason: data.reason,
    } });
  }

  static async review(institutionId: string, requestId: string, reviewerId: string, status: 'APPROVED' | 'REJECTED') {
    const reviewer = await prisma.user.findFirst({ where: { id: reviewerId, institutionId }, select: { role: true } });
    if (!reviewer || !approvers.includes(reviewer.role)) throw { status: 403, message: 'Only an authorized institution administrator may review leave' };
    const target = await prisma.staffLeaveRequest.findFirst({ where: { id: requestId, teacher: { institutionId } }, select: { id: true, teacher: { select: { userId: true } } } });
    if (!target) throw { status: 404, message: 'Leave request not found' };
    if (target.teacher.userId === reviewerId) throw { status: 403, message: 'You cannot approve your own leave request' };
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.staffLeaveRequest.updateMany({
        where: { id: requestId, teacher: { institutionId }, status: LeaveStatus.PENDING },
        data: { status: status as LeaveStatus, approvedByUserId: reviewerId, reviewedAt: new Date() },
      });
      if (claimed.count !== 1) throw { status: 409, message: 'Leave request is no longer pending' };
      await tx.notification.create({ data: {
        institutionId,
        userId: target.teacher.userId,
        title: `Leave request ${status.toLowerCase()}`,
        message: `Your leave request has been ${status.toLowerCase()}.`,
        type: status === 'APPROVED' ? 'SUCCESS' : 'INFO',
      } });
      return tx.staffLeaveRequest.findUniqueOrThrow({ where: { id: requestId } });
    });
  }
}
