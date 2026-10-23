import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendError } from '../utils/response';
import { UserRole } from '@prisma/client';

export const requireRoles = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        403,
        'FORBIDDEN_ROLE',
        `Role '${req.user.role}' is not authorized to access this resource`
      );
    }

    next();
  };
};

export const requirePermission = (requiredPermission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    }

    // Super Admin has all capabilities
    if (req.user.role === UserRole.ROLE_SUPER_ADMIN) {
      return next();
    }

    const hasPerm = req.user.permissions.includes(requiredPermission);
    if (!hasPerm) {
      return sendError(
        res,
        403,
        'INSUFFICIENT_PERMISSION',
        `Missing required permission: ${requiredPermission}`
      );
    }

    next();
  };
};

export const requireAnyPermission = (...permissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    if (req.user.role === UserRole.ROLE_SUPER_ADMIN || permissions.some((permission) => req.user!.permissions.includes(permission))) return next();
    return sendError(res, 403, 'INSUFFICIENT_PERMISSION', `Requires one of: ${permissions.join(', ')}`);
  };
};
