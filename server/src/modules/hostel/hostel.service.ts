import { HostelGatePassStatus, HostelChargeStatus, Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { AuthenticatedUser } from '../../types';

export class HostelService {
  static blocks(institutionId: string) { return prisma.hostelBlock.findMany({ where: { institutionId }, include: { rooms: { include: { _count: { select: { allocations: true } } }, orderBy: { roomNumber: 'asc' } } }, orderBy: { name: 'asc' } }); }
  static async createBlock(institutionId: string, data: { name: string; type: string; totalRooms: number }) {
    const exists = await prisma.hostelBlock.findFirst({ where: { institutionId, name: data.name }, select: { id: true } });
    if (exists) throw { status: 409, message: 'A block with this name already exists' };
    return prisma.hostelBlock.create({ data: { ...data, institutionId } });
  }
  static async createRoom(institutionId: string, data: { blockId: string; roomNumber: string; capacity: number }) {
    return prisma.$transaction(async (tx) => {
      const block = await tx.hostelBlock.findFirst({ where: { id: data.blockId, institutionId }, include: { _count: { select: { rooms: true } } } });
      if (!block) throw { status: 404, message: 'Hostel block not found in this institution' };
      if (block._count.rooms >= block.totalRooms) throw { status: 409, message: 'The block has reached its configured room count' };
      return tx.hostelRoom.create({ data: { blockId: block.id, roomNumber: data.roomNumber, capacity: data.capacity } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  static allocations(institutionId: string) {
    return prisma.hostelBedAllocation.findMany({ where: { room: { block: { institutionId } } }, include: { room: { include: { block: { select: { id: true, name: true, type: true, institutionId: true } } } }, student: { select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: [{ room: { block: { name: 'asc' } } }, { room: { roomNumber: 'asc' } }] });
  }
  static async allocate(institutionId: string, data: { roomId: string; studentId: string; bedNumber: number }) {
    return prisma.$transaction(async (tx) => {
      const [room, student, existing] = await Promise.all([
        tx.hostelRoom.findFirst({ where: { id: data.roomId, block: { institutionId } }, include: { block: { select: { institutionId: true } } } }),
        tx.studentProfile.findFirst({ where: { id: data.studentId, institutionId, status: 'ENROLLED' }, select: { id: true } }),
        tx.hostelBedAllocation.findUnique({ where: { studentId: data.studentId }, select: { id: true, roomId: true, bedNumber: true } }),
      ]);
      if (!room || !student) throw { status: 404, message: 'Room or enrolled student not found in this institution' };
      if (existing && (existing.roomId !== room.id || existing.bedNumber !== data.bedNumber) && await tx.hostelStay.findFirst({ where: { studentId: student.id, institutionId, checkedOutAt: null }, select: { id: true } })) throw { status: 409, message: 'Check the resident out before changing their room assignment' };
      if (data.bedNumber > room.capacity) throw { status: 400, message: 'Bed number exceeds room capacity' };
      const occupied = await tx.hostelBedAllocation.count({ where: { roomId: room.id, studentId: { not: student.id } } });
      if (occupied >= room.capacity) throw { status: 409, message: 'Room capacity is full' };
      const bedTaken = await tx.hostelBedAllocation.findFirst({ where: { roomId: room.id, bedNumber: data.bedNumber, studentId: { not: student.id } }, select: { id: true } });
      if (bedTaken) throw { status: 409, message: 'This bed is already allocated' };
      if (existing?.roomId === room.id && existing.bedNumber === data.bedNumber) return existing;
      const allocation = await tx.hostelBedAllocation.upsert({ where: { studentId: student.id }, create: { studentId: student.id, roomId: room.id, bedNumber: data.bedNumber }, update: { roomId: room.id, bedNumber: data.bedNumber, assignedAt: new Date() } });
      if (!existing) await tx.hostelRoom.update({ where: { id: room.id }, data: { occupiedBeds: { increment: 1 } } });
      else if (existing.roomId !== room.id) {
        await tx.hostelRoom.update({ where: { id: existing.roomId }, data: { occupiedBeds: { decrement: 1 } } });
        await tx.hostelRoom.update({ where: { id: room.id }, data: { occupiedBeds: { increment: 1 } } });
      }
      return allocation;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  static stays(institutionId: string) { return prisma.hostelStay.findMany({ where: { institutionId }, include: { room: { include: { block: { select: { name: true } } } }, student: { select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: { checkedInAt: 'desc' } }); }
  static async checkIn(institutionId: string, userId: string, studentId: string) {
    return prisma.$transaction(async (tx) => {
      const allocation = await tx.hostelBedAllocation.findFirst({ where: { studentId, room: { block: { institutionId } }, student: { institutionId, status: 'ENROLLED' } }, include: { room: true } });
      if (!allocation) throw { status: 404, message: 'Current in-tenant bed allocation not found' };
      const active = await tx.hostelStay.findFirst({ where: { studentId, institutionId, checkedOutAt: null }, select: { id: true } });
      if (active) throw { status: 409, message: 'Student is already checked in' };
      return tx.hostelStay.create({ data: { institutionId, studentId, roomId: allocation.roomId, checkedInAt: new Date(), recordedByUserId: userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  static async checkOut(institutionId: string, stayId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const stay = await tx.hostelStay.findFirst({ where: { id: stayId, institutionId, checkedOutAt: null }, select: { id: true, studentId: true, roomId: true } });
      if (!stay) throw { status: 404, message: 'Active hostel stay not found' };
      const updated = await tx.hostelStay.updateMany({ where: { id: stay.id, institutionId, checkedOutAt: null }, data: { checkedOutAt: new Date(), recordedByUserId: userId } });
      if (updated.count !== 1) throw { status: 409, message: 'Stay was already checked out' };
      const allocation = await tx.hostelBedAllocation.findFirst({ where: { studentId: stay.studentId, roomId: stay.roomId } });
      if (allocation) { await tx.hostelBedAllocation.delete({ where: { id: allocation.id } }); await tx.hostelRoom.update({ where: { id: stay.roomId }, data: { occupiedBeds: { decrement: 1 } } }); }
      return tx.hostelStay.findFirstOrThrow({ where: { id: stay.id, institutionId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }  static async requestGatePass(user: AuthenticatedUser, institutionId: string, data: { reason: string; destination: string; expectedReturnAt: string }) {
    const student = await prisma.studentProfile.findFirst({ where: { userId: user.id, institutionId, status: 'ENROLLED', hostelAlloc: { isNot: null } }, select: { id: true } });
    if (!student) throw { status: 403, message: 'An enrolled student profile in this institution is required' };
    const expectedReturnAt = new Date(data.expectedReturnAt);
    if (expectedReturnAt <= new Date()) throw { status: 400, message: 'Expected return time must be in the future' };
    return prisma.hostelGatePass.create({ data: { ...data, expectedReturnAt, studentId: student.id, institutionId, requestedByUserId: user.id } });
  }
  static gatePasses(institutionId: string) { return prisma.hostelGatePass.findMany({ where: { institutionId }, include: { student: { select: { admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: { requestedAt: 'desc' } }); }
  static async myGatePasses(user: AuthenticatedUser, institutionId: string) {
    const student = await prisma.studentProfile.findFirst({ where: { userId: user.id, institutionId }, select: { id: true } });
    return student ? prisma.hostelGatePass.findMany({ where: { studentId: student.id, institutionId }, orderBy: { requestedAt: 'desc' } }) : [];
  }
  static async reviewGatePass(institutionId: string, id: string, reviewerId: string, status: 'APPROVED' | 'REJECTED') {
    const updated = await prisma.hostelGatePass.updateMany({ where: { id, institutionId, status: HostelGatePassStatus.PENDING }, data: { status, approvedByUserId: reviewerId } });
    if (!updated.count) throw { status: 404, message: 'Pending gate pass not found' };
    return prisma.hostelGatePass.findFirstOrThrow({ where: { id, institutionId } });
  }
  static async markGatePass(institutionId: string, id: string, action: 'depart' | 'return') {
    const expected = action === 'depart' ? HostelGatePassStatus.APPROVED : HostelGatePassStatus.DEPARTED;
    const status = action === 'depart' ? HostelGatePassStatus.DEPARTED : HostelGatePassStatus.RETURNED;
    const updated = await prisma.hostelGatePass.updateMany({ where: { id, institutionId, status: expected }, data: action === 'depart' ? { status, departedAt: new Date() } : { status, returnedAt: new Date() } });
    if (!updated.count) throw { status: 409, message: 'Gate pass is not in a state for this action' };
    return prisma.hostelGatePass.findFirstOrThrow({ where: { id, institutionId } });
  }
  static async visitors(institutionId: string) { return prisma.hostelVisitorLog.findMany({ where: { institutionId }, include: { student: { select: { admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: { enteredAt: 'desc' } }); }
  static async logVisitor(institutionId: string, userId: string, data: { studentId?: string; visitorName: string; purpose: string }) {
    if (data.studentId && !await prisma.studentProfile.findFirst({ where: { id: data.studentId, institutionId }, select: { id: true } })) throw { status: 404, message: 'Student not found in this institution' };
    return prisma.hostelVisitorLog.create({ data: { ...data, institutionId, loggedByUserId: userId } });
  }
  static async closeVisitor(institutionId: string, id: string) {
    const updated = await prisma.hostelVisitorLog.updateMany({ where: { id, institutionId, exitedAt: null }, data: { exitedAt: new Date() } });
    if (!updated.count) throw { status: 404, message: 'Active visitor log not found' };
    return prisma.hostelVisitorLog.findFirstOrThrow({ where: { id, institutionId } });
  }
  static async messCharges(institutionId: string) { return prisma.hostelMessCharge.findMany({ where: { institutionId }, include: { student: { select: { admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: [{ period: 'desc' }, { createdAt: 'desc' }] }); }
  static async createMessCharge(institutionId: string, userId: string, data: { studentId: string; period: string; amount: number }) {
    const [student, institution] = await Promise.all([prisma.studentProfile.findFirst({ where: { id: data.studentId, institutionId, hostelAlloc: { isNot: null } }, select: { id: true } }), prisma.institution.findFirst({ where: { id: institutionId }, select: { currency: true } })]);
    if (!student) throw { status: 404, message: 'Hostel resident not found in this institution' };
    return prisma.hostelMessCharge.create({ data: { ...data, institutionId, createdByUserId: userId, currencyCode: institution?.currency.slice(0, 3).toUpperCase() ?? 'USD', amount: new Prisma.Decimal(data.amount.toFixed(2)) } });
  }
  static incidents(institutionId: string) { return prisma.hostelIncident.findMany({ where: { institutionId }, include: { student: { select: { admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: { occurredAt: 'desc' } }); }
  static async createIncident(institutionId: string, userId: string, data: { studentId?: string; category: string; description: string; occurredAt: string }) {
    if (data.studentId && !await prisma.studentProfile.findFirst({ where: { id: data.studentId, institutionId }, select: { id: true } })) throw { status: 404, message: 'Student not found in this institution' };
    return prisma.hostelIncident.create({ data: { ...data, occurredAt: new Date(data.occurredAt), institutionId, recordedByUserId: userId } });
  }
  static async resolveIncident(institutionId: string, id: string) {
    const result = await prisma.hostelIncident.updateMany({ where: { id, institutionId, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
    if (!result.count) throw { status: 409, message: 'Open incident not found' };
    return prisma.hostelIncident.findFirstOrThrow({ where: { id, institutionId } });
  }  static async markMessChargePaid(institutionId: string, id: string) {
    const updated = await prisma.hostelMessCharge.updateMany({ where: { id, institutionId, status: HostelChargeStatus.UNPAID }, data: { status: HostelChargeStatus.PAID, paidAt: new Date() } });
    if (!updated.count) throw { status: 409, message: 'Unpaid mess charge not found' };
    return prisma.hostelMessCharge.findFirstOrThrow({ where: { id, institutionId } });
  }
}

// Incident records are tenant-scoped; resolution is a one-way state transition.
