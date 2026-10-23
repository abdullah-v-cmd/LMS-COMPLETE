import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { AuthenticatedUser } from '../../types';

const PRIVILEGED_ROLES: UserRole[] = [UserRole.ROLE_INSTITUTION_ADMIN, UserRole.ROLE_FINANCE_HEAD];
function assertPayrollRole(user: AuthenticatedUser) {
  if (!PRIVILEGED_ROLES.includes(user.role)) throw { status: 403, message: 'Payroll data is restricted to the institution principal and finance head' };
}

export class PayrollService {
  static async staff(user: AuthenticatedUser, institutionId: string) {
    assertPayrollRole(user);
    const staff = await prisma.teacherProfile.findMany({
      where: { institutionId, user: { isActive: true } },
      include: { user: { select: { firstName: true, lastName: true, isActive: true } }, compensations: { orderBy: { effectiveFrom: 'desc' }, take: 1 } },
      orderBy: { employeeCode: 'asc' },
    });
    return staff.map(({ id, employeeCode, department, user: profileUser, compensations }) => ({
      teacherProfileId: id, employeeCode, department, firstName: profileUser.firstName, lastName: profileUser.lastName,
      currentCompensation: compensations[0] ?? null,
    }));
  }

  static async saveCompensation(user: AuthenticatedUser, institutionId: string, data: { teacherProfileId: string; monthlySalary: number; effectiveFrom: string }) {
    assertPayrollRole(user);
    const profile = await prisma.teacherProfile.findFirst({ where: { id: data.teacherProfileId, institutionId, user: { isActive: true } }, select: { id: true } });
    if (!profile) throw { status: 404, message: 'Active staff profile not found in this institution' };
    const effectiveFrom = new Date(`${data.effectiveFrom}T00:00:00.000Z`);
    if (Number.isNaN(effectiveFrom.getTime())) throw { status: 400, message: 'Invalid effective date' };
    const duplicate = await prisma.staffCompensation.findFirst({ where: { institutionId, teacherProfileId: profile.id, effectiveFrom } });
    if (duplicate) throw { status: 409, message: 'A salary structure already exists for this staff member and effective date' };
    return prisma.staffCompensation.create({ data: { institutionId, teacherProfileId: profile.id, monthlySalary: new Prisma.Decimal(data.monthlySalary), effectiveFrom, updatedByUserId: user.id } });
  }

  static async runs(user: AuthenticatedUser, institutionId: string) {
    assertPayrollRole(user);
    return prisma.payrollRun.findMany({ where: { institutionId }, include: { entries: { orderBy: { employeeCode: 'asc' } } }, orderBy: { period: 'desc' } });
  }

  static async generate(user: AuthenticatedUser, institutionId: string, period: string) {
    assertPayrollRole(user);
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const now = new Date();
    if (periodStart > new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) throw { status: 400, message: 'Payroll can only be generated for the current or a past month' };
    const existing = await prisma.payrollRun.findFirst({ where: { institutionId, period }, select: { id: true } });
    if (existing) throw { status: 409, message: 'A payroll summary already exists for this month' };
    const institution = await prisma.institution.findFirst({ where: { id: institutionId }, select: { currency: true } });
    if (!institution) throw { status: 404, message: 'Institution not found' };
    const staff = await prisma.teacherProfile.findMany({
      where: { institutionId, user: { isActive: true }, compensations: { some: { institutionId, effectiveFrom: { lte: periodStart } } } },
      include: { user: { select: { firstName: true, lastName: true } }, compensations: { where: { institutionId, effectiveFrom: { lte: periodStart } }, orderBy: { effectiveFrom: 'desc' }, take: 1 } },
    });
    if (!staff.length) throw { status: 409, message: 'No active staff members have a salary effective for this payroll period' };
    const totalGross = staff.reduce((total, member) => total.plus(member.compensations[0].monthlySalary), new Prisma.Decimal(0));
    return prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({ data: { institutionId, period, currencyCode: institution.currency.slice(0, 3).toUpperCase(), totalGross, generatedByUserId: user.id } });
      await tx.payrollEntry.createMany({ data: staff.map((member) => ({
        payrollRunId: run.id, teacherProfileId: member.id, employeeCode: member.employeeCode,
        staffName: `${member.user.firstName} ${member.user.lastName}`, monthlySalary: member.compensations[0].monthlySalary,
      })) });
      return tx.payrollRun.findUniqueOrThrow({ where: { id: run.id }, include: { entries: { orderBy: { employeeCode: 'asc' } } } });
    }, { isolationLevel: 'Serializable' });
  }
}
