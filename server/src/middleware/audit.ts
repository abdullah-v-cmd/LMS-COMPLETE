import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

export const logAuditEvent = (action: string, entity: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Intercept finish event on response to log if successful mutation
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          await prisma.auditEvent.create({
            data: {
              institutionId: req.institutionId || null,
              userId: req.user?.id || null,
              action,
              entity,
              entityId: req.params.id || null,
              newValuesJson: req.body ? JSON.stringify(req.body) : null,
              ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null,
              userAgent: req.headers['user-agent'] || null,
            },
          });
        } catch (error) {
          logger.error('Failed to persist audit log event:', error);
        }
      }
    });

    next();
  };
};
