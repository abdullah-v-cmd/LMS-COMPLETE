import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../utils/prisma';

export class TransportService {
  static routes(institutionId: string) {
    return prisma.transportRoute.findMany({ where: { institutionId }, include: { vehicles: true, _count: { select: { allocations: true } } }, orderBy: { name: 'asc' } });
  }

  static allocations(institutionId: string) {
    return prisma.studentTransportAllocation.findMany({ where: { route: { institutionId } }, include: { route: { select: { id: true, name: true, startPoint: true, endPoint: true } }, student: { select: { admissionNumber: true, user: { select: { firstName: true, lastName: true } } } } }, orderBy: { route: { name: 'asc' } } });
  }

  static createRoute(institutionId: string, data: { name: string; startPoint: string; endPoint: string; monthlyFee: number }) {
    return prisma.transportRoute.create({ data: { ...data, institutionId, monthlyFee: new Prisma.Decimal(data.monthlyFee.toFixed(2)) } });
  }

  static async createVehicle(institutionId: string, data: { routeId: string; vehicleNumber: string; driverName: string; driverPhone: string; capacity: number }) {
    const route = await prisma.transportRoute.findFirst({ where: { id: data.routeId, institutionId }, select: { id: true } });
    if (!route) throw { status: 404, message: 'Route not found in this institution' };
    return prisma.transportVehicle.create({ data });
  }

  static async allocate(institutionId: string, data: { routeId: string; studentId: string; pickupStop: string }) {
    return prisma.$transaction(async (tx) => {
      const [route, student, existing] = await Promise.all([
        tx.transportRoute.findFirst({ where: { id: data.routeId, institutionId }, select: { id: true } }),
        tx.studentProfile.findFirst({ where: { id: data.studentId, institutionId, status: 'ENROLLED' }, select: { id: true } }),
        tx.studentTransportAllocation.findUnique({ where: { studentId: data.studentId }, select: { id: true, routeId: true } }),
      ]);
      if (!route || !student) throw { status: 404, message: 'Route or enrolled student not found in this institution' };
      if (!existing || existing.routeId !== data.routeId) {
        const [vehicles, assigned] = await Promise.all([
          tx.transportVehicle.aggregate({ where: { routeId: data.routeId }, _sum: { capacity: true } }),
          tx.studentTransportAllocation.count({ where: { routeId: data.routeId } }),
        ]);
        const capacity = vehicles._sum.capacity ?? 0;
        if (capacity === 0) throw { status: 409, message: 'Add at least one vehicle before allocating students to this route' };
        if (assigned >= capacity) throw { status: 409, message: 'Route seat capacity is full' };
      }
      return tx.studentTransportAllocation.upsert({ where: { studentId: student.id }, create: { studentId: student.id, routeId: route.id, pickupStop: data.pickupStop }, update: { routeId: route.id, pickupStop: data.pickupStop } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
