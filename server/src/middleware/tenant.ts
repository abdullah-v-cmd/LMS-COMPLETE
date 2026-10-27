import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendError } from '../utils/response';
import { UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma';

export const requireTenant = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  // Super Admin can access all tenants or switch scope via header
  if (req.user.role === UserRole.ROLE_SUPER_ADMIN) {
    const headerTenantId = (req.headers['x-institution-id'] as string) || (req.query.institutionId as string);
    if (headerTenantId) {
      req.institutionId = headerTenantId;
      return next();
    }
    // Fallback to first available institution if no specific tenant header provided
    prisma.institution.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } })
      .then((inst: any) => {
        if (inst) req.institutionId = inst.id;
        next();
      })
      .catch(next);
    return;
  }

  // For all institutional users, institutionId must exist
  if (!req.user.institutionId) {
    return sendError(
      res,
      403,
      'NO_TENANT_ASSIGNED',
      'User is not associated with an active educational institution'
    );
  }

  req.institutionId = req.user.institutionId;

  // Cross-tenant protection: Check params or body for spoofed institutionId
  const requestedTenantId =
    req.params.institutionId || req.query.institutionId || req.body?.institutionId;

  if (requestedTenantId && requestedTenantId !== req.institutionId) {
    return sendError(
      res,
      403,
      'CROSS_TENANT_ACCESS_DENIED',
      'Access to resources of another institution is strictly forbidden'
    );
  }

  next();
};
