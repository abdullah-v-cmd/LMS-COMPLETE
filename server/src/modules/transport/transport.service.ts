import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { AuthenticatedUser } from '../../types';

export class TransportService {
  static routes(institutionId: string, role: UserRole) {
    const includeSensitive = role === UserRole.ROLE_TRANSPORT_COORDINATOR || role === UserRole.ROLE_SUPER_ADMIN;
    return prisma.transportRoute.findMany({ where: { institutionId }, include: { stops: { orderBy: { sequence: 'asc' } }, vehicles: includeSensitive ? { include: { documents: true, driverAssignments: { orderBy: { effectiveFrom: 'desc' }, take: 5 } } } : { select: { id: true, vehicleNumber: true, driverName: true, capacity: true } }, _count: { select: { allocations: true } } }, orderBy: { name: 'asc' } });
  }

  static async allocations(institutionId: string, user: AuthenticatedUser) {
    let studentIds: string[] | undefined;
    if (user.role === UserRole.ROLE_STUDENT) {
      const profile = await prisma.studentProfile.findFirst({ where: { institutionId, userId: user.id }, select: { id: true } });
      studentIds = profile ? [profile.id] : [];
    } else if (user.role === UserRole.ROLE_PARENT) {
      const parent = await prisma.parentProfile.findFirst({ where: { institutionId, userId: user.id }, select: { id: true } });
      const links = parent ? await prisma.studentParentRelation.findMany({ where: { parentId: parent.id, student: { institutionId } }, select: { studentId: true } }) : [];
      studentIds = links.map((link) => link.studentId);
    }
    return prisma.studentTransportAllocation.findMany({ where: { route: { institutionId }, ...(studentIds !== undefined ? { studentId: { in: studentIds } } : {}) }, include: { route: { select: { id: true, name: true, startPoint: true, endPoint: true } }, stop: true, student: { select: { id: true, admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: { route: { name: 'asc' } } });
  }

  static createRoute(institutionId: string, data: { name: string; startPoint: string; endPoint: string; monthlyFee: number }) {
    return prisma.transportRoute.create({ data: { ...data, institutionId, monthlyFee: new Prisma.Decimal(data.monthlyFee.toFixed(2)) } });
  }

  static async createVehicle(institutionId: string, data: { routeId: string; vehicleNumber: string; driverName: string; driverPhone: string; capacity: number }) {
    const route = await prisma.transportRoute.findFirst({ where: { id: data.routeId, institutionId }, select: { id: true } });
    if (!route) throw { status: 404, message: 'Route not found in this institution' };
    return prisma.transportVehicle.create({ data });
  }

  static async createStop(institutionId: string, data: { routeId: string; name: string; address: string; sequence: number; pickupTime?: string; dropoffTime?: string }) {
    if (!await prisma.transportRoute.findFirst({ where: { id: data.routeId, institutionId }, select: { id: true } })) throw { status: 404, message: 'Route not found in this institution' };
    return prisma.transportStop.create({ data });
  }

  static async createVehicleDocument(institutionId: string, data: { vehicleId: string; documentType: string; documentNumber: string; expiresAt?: string }) {
    if (!await prisma.transportVehicle.findFirst({ where: { id: data.vehicleId, route: { institutionId } }, select: { id: true } })) throw { status: 404, message: 'Vehicle not found in this institution' };
    return prisma.transportVehicleDocument.create({ data: { ...data, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } });
  }

  static async assignDriver(institutionId: string, userId: string, data: { vehicleId: string; driverName: string; driverPhone: string; licenseNumber: string; effectiveFrom: string; effectiveTo?: string }) {
    return prisma.$transaction(async (tx) => {
      const vehicle = await tx.transportVehicle.findFirst({ where: { id: data.vehicleId, route: { institutionId } }, select: { id: true } });
      if (!vehicle) throw { status: 404, message: 'Vehicle not found in this institution' };
      const start = new Date(data.effectiveFrom);
      const end = data.effectiveTo ? new Date(data.effectiveTo) : new Date('9999-12-31T23:59:59.999Z');
      const otherAssignment = await tx.transportDriverAssignment.findFirst({ where: { licenseNumber: data.licenseNumber, vehicleId: { not: vehicle.id }, vehicle: { route: { institutionId } }, effectiveFrom: { lt: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }] }, select: { id: true } });
      if (otherAssignment) throw { status: 409, message: 'Driver license is assigned to another vehicle during this period' };
      const futureAssignment = await tx.transportDriverAssignment.findFirst({ where: { vehicleId: vehicle.id, effectiveTo: null, effectiveFrom: { gt: start } }, select: { id: true } });
      if (futureAssignment) throw { status: 409, message: 'End the future driver assignment before adding an earlier assignment' };
      await tx.transportDriverAssignment.updateMany({ where: { vehicleId: vehicle.id, effectiveTo: null, effectiveFrom: { lte: start } }, data: { effectiveTo: start } });
      const assignment = await tx.transportDriverAssignment.create({ data: { vehicleId: vehicle.id, driverName: data.driverName, driverPhone: data.driverPhone, licenseNumber: data.licenseNumber, effectiveFrom: start, effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null, assignedByUserId: userId } });
      await tx.transportVehicle.update({ where: { id: vehicle.id }, data: { driverName: data.driverName, driverPhone: data.driverPhone } });
      return assignment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async trackingLogs(institutionId: string, user: AuthenticatedUser) {
    const studentIds = await this.linkedStudentIds(institutionId, user);
    return prisma.transportVehicleTrackingLog.findMany({ where: { institutionId, ...(studentIds !== undefined ? { vehicle: { route: { allocations: { some: { studentId: { in: studentIds } } } } } : {}) }, include: { vehicle: { select: { id: true, vehicleNumber: true, route: { select: { name: true } } } } }, orderBy: { recordedAt: 'desc' }, take: 500 });
  }

  static async recordTrackingLog(institutionId: string, userId: string, data: { vehicleId: string; latitude: number; longitude: number; recordedAt: string; source: string }) {
    if (!await prisma.transportVehicle.findFirst({ where: { id: data.vehicleId, route: { institutionId } }, select: { id: true } })) throw { status: 404, message: 'Vehicle not found in this institution' };
    return prisma.transportVehicleTrackingLog.create({ data: { ...data, institutionId, recordedByUserId: userId, recordedAt: new Date(data.recordedAt) } });
  }

  static async incidents(institutionId: string, user: AuthenticatedUser) {
    const studentIds = await this.linkedStudentIds(institutionId, user);
    return prisma.transportIncident.findMany({ where: { institutionId, ...(studentIds !== undefined ? { studentId: { in: studentIds } } : {}) }, include: { route: { select: { name: true } }, vehicle: { select: { vehicleNumber: true } }, student: { select: { admissionNumber: true } } }, orderBy: { occurredAt: 'desc' } });
  }

  private static async linkedStudentIds(institutionId: string, user: AuthenticatedUser): Promise<string[] | undefined> {
    if (user.role === UserRole.ROLE_STUDENT) {
      const profile = await prisma.studentProfile.findFirst({ where: { institutionId, userId: user.id }, select: { id: true } });
      return profile ? [profile.id] : [];
    }
    if (user.role === UserRole.ROLE_PARENT) {
      const parent = await prisma.parentProfile.findFirst({ where: { institutionId, userId: user.id }, select: { id: true } });
      const relations = parent ? await prisma.studentParentRelation.findMany({ where: { parentId: parent.id, student: { institutionId } }, select: { studentId: true } }) : [];
      return relations.map((relation) => relation.studentId);
    }
    return undefined;
  }

  static async createIncident(institutionId: string, userId: string, data: { routeId: string; vehicleId?: string; studentId?: string; category: string; description: string; occurredAt: string }) {
    const [route, vehicle, student] = await Promise.all([
      prisma.transportRoute.findFirst({ where: { id: data.routeId, institutionId }, select: { id: true } }),
      data.vehicleId ? prisma.transportVehicle.findFirst({ where: { id: data.vehicleId, routeId: data.routeId, route: { institutionId } }, select: { id: true } }) : Promise.resolve(true),
      data.studentId ? prisma.studentProfile.findFirst({ where: { id: data.studentId, institutionId }, select: { id: true } }) : Promise.resolve(true),
    ]);
    if (!route || !vehicle || !student) throw { status: 404, message: 'Route, vehicle, or student not found in this institution' };
    return prisma.transportIncident.create({ data: { ...data, occurredAt: new Date(data.occurredAt), institutionId, recordedByUserId: userId } });
  }

  static async allocate(institutionId: string, data: { routeId: string; studentId: string; pickupStop?: string; pickupStopId?: string }) {
    return prisma.$transaction(async (tx) => {
      const [route, student, existing] = await Promise.all([
        tx.transportRoute.findFirst({ where: { id: data.routeId, institutionId }, select: { id: true } }),
        tx.studentProfile.findFirst({ where: { id: data.studentId, institutionId, status: 'ENROLLED' }, select: { id: true } }),
        tx.studentTransportAllocation.findUnique({ where: { studentId: data.studentId }, select: { id: true, routeId: true } }),
      ]);
      if (!route || !student) throw { status: 404, message: 'Route or enrolled student not found in this institution' };
      const stops = await tx.transportStop.count({ where: { routeId: route.id } });
      let selectedStop = null;
      if (data.pickupStopId) selectedStop = await tx.transportStop.findFirst({ where: { id: data.pickupStopId, routeId: route.id } });
      else if (data.pickupStop) selectedStop = await tx.transportStop.findFirst({ where: { routeId: route.id, name: data.pickupStop } });
      if (data.pickupStopId && !selectedStop) throw { status: 404, message: 'Stop not found on this route' };
      if (stops > 0 && !selectedStop) throw { status: 400, message: 'Select a configured stop on this route' };
      if (!existing || existing.routeId !== data.routeId) {
        const [vehicles, assigned] = await Promise.all([
          tx.transportVehicle.aggregate({ where: { routeId: data.routeId }, _sum: { capacity: true } }),
          tx.studentTransportAllocation.count({ where: { routeId: data.routeId } }),
        ]);
        const capacity = vehicles._sum.capacity ?? 0;
        if (capacity === 0) throw { status: 409, message: 'Add at least one vehicle before allocating students to this route' };
        if (assigned >= capacity) throw { status: 409, message: 'Route seat capacity is full' };
      }
      const pickupStop = selectedStop?.name ?? data.pickupStop!;
      return tx.studentTransportAllocation.upsert({ where: { studentId: student.id }, create: { studentId: student.id, routeId: route.id, pickupStop, pickupStopId: selectedStop?.id }, update: { routeId: route.id, pickupStop, pickupStopId: selectedStop?.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
