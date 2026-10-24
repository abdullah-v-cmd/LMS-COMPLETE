import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuthenticatedUser } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { sendError } from '../utils/response';
import { prisma } from '../utils/prisma';
import { redis } from '../utils/redis';

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Access token required');
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    return sendError(res, 401, 'INVALID_TOKEN', 'Access token is invalid or expired');
  }

  if (await redis.isTokenBlacklisted(token)) {
    return sendError(res, 401, 'TOKEN_REVOKED', 'Access token has been revoked');
  }

  // Verify user still exists and is active in database
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      institutionId: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return sendError(res, 401, 'USER_INACTIVE', 'User account is deactivated or no longer exists');
  }

  req.user = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    institutionId: user.institutionId,
    permissions: payload.permissions || [],
  };

  req.institutionId = user.institutionId || undefined;

  next();
};
