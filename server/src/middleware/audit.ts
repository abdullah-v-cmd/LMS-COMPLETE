import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

export const redactAuditPayload = (value: unknown, additionalFields: string[] = []): unknown => {
  const redact = new Set(['password', 'passwordhash', 'token', 'secret', 'notes', 'encryptednotes', 'actionplan', ...additionalFields].map((field) => field.toLowerCase()));
  if (Array.isArray(value)) return value.map((entry) => redactAuditPayload(entry, additionalFields));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact.has(key.toLowerCase()) ? '[REDACTED]' : redactAuditPayload(entry, additionalFields)]));
  return value;
};

export const logAuditEvent = (action: string, entity: string, options: { redactFields?: string[] } = {}) => {
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
              newValuesJson: req.body ? JSON.stringify(redactAuditPayload(req.body, options.redactFields)) : null,
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
