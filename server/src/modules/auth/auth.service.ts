import { prisma } from '../../utils/prisma';
import { verifyPassword, hashPassword } from '../../utils/password';
import { signAccessToken, generateRefreshToken, hashToken } from '../../utils/jwt';
import { DEFAULT_ROLE_PERMISSIONS } from '../../constants/permissions';
import { AuthenticatedUser } from '../../types';
import { UserRole } from '@prisma/client';

export class AuthService {
  static async login(usernameOrEmail: string, passwordPlain: string, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: usernameOrEmail.toLowerCase() },
          { username: usernameOrEmail },
        ],
      },
      include: {
        institution: true,
      },
    });

    if (!user) {
      await prisma.auditEvent.create({
        data: {
          action: 'AUTH_LOGIN_FAILED',
          entity: 'User',
          newValuesJson: JSON.stringify({ identifier: usernameOrEmail, reason: 'User not found' }),
          ipAddress,
          userAgent,
        },
      });
      throw { status: 401, message: 'Invalid credentials' };
    }

    if (!user.isActive) {
      throw { status: 403, message: 'Your account has been deactivated. Please contact your administrator.' };
    }

    if (user.institution && user.institution.status !== 'ACTIVE' && user.role !== UserRole.ROLE_SUPER_ADMIN) {
      throw { status: 403, message: `Institution is currently ${user.institution.status.toLowerCase()}. Access restricted.` };
    }

    const isMatch = await verifyPassword(passwordPlain, user.passwordHash);
    if (!isMatch) {
      await prisma.auditEvent.create({
        data: {
          institutionId: user.institutionId,
          userId: user.id,
          action: 'AUTH_LOGIN_FAILED',
          entity: 'User',
          newValuesJson: JSON.stringify({ reason: 'Incorrect password' }),
          ipAddress,
          userAgent,
        },
      });
      throw { status: 401, message: 'Invalid credentials' };
    }

    // Resolve permissions: Default role permissions + any tenant specific overrides
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[user.role] || [];
    const customPerms = await prisma.rolePermission.findMany({
      where: {
        role: user.role,
        OR: [{ institutionId: user.institutionId }, { institutionId: null }],
      },
      select: { permission: true },
    });

    const permissions = Array.from(new Set([...defaultPerms, ...customPerms.map((p) => p.permission)]));

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      institutionId: user.institutionId,
      permissions,
    };

    const accessToken = signAccessToken(authUser);
    const { token: rawRefreshToken, hash: refreshTokenHash } = generateRefreshToken();

    // Store refresh token (7 days expiry)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt,
      },
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Record Audit Event
    await prisma.auditEvent.create({
      data: {
        institutionId: user.institutionId,
        userId: user.id,
        action: 'AUTH_LOGIN_SUCCESS',
        entity: 'User',
        entityId: user.id,
        ipAddress,
        userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        institutionId: user.institutionId,
        institutionName: user.institution?.name || null,
        institutionSlug: user.institution?.slug || null,
        permissions,
      },
    };
  }

  static async refresh(rawRefreshToken: string) {
    const hashed = hashToken(rawRefreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashed },
      include: {
        user: {
          include: { institution: true },
        },
      },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw { status: 401, message: 'Refresh token is expired, invalid, or revoked' };
    }

    const user = storedToken.user;
    if (!user.isActive) {
      throw { status: 403, message: 'User account is deactivated' };
    }

    // Rotate refresh token: revoke current and issue new
    const { token: newRawRefreshToken, hash: newHash } = generateRefreshToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          revokedAt: new Date(),
          replacedByToken: newHash,
        },
      }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: newHash,
          expiresAt,
        },
      }),
    ]);

    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[user.role] || [];
    const customPerms = await prisma.rolePermission.findMany({
      where: {
        role: user.role,
        OR: [{ institutionId: user.institutionId }, { institutionId: null }],
      },
      select: { permission: true },
    });
    const permissions = Array.from(new Set([...defaultPerms, ...customPerms.map((p) => p.permission)]));

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      institutionId: user.institutionId,
      permissions,
    };

    const accessToken = signAccessToken(authUser);

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        institutionId: user.institutionId,
        institutionName: user.institution?.name || null,
        permissions,
      },
    };
  }

  static async logout(rawRefreshToken?: string, userId?: string, accessToken?: string) {
    if (accessToken) {
      const { redis } = await import('../../utils/redis');
      await redis.blacklistToken(accessToken, 900);
    }

    if (rawRefreshToken) {
      const hashed = hashToken(rawRefreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashed },
        data: { revokedAt: new Date() },
      });
    }

    if (userId) {
      await prisma.auditEvent.create({
        data: {
          userId,
          action: 'AUTH_LOGOUT',
          entity: 'User',
          entityId: userId,
        },
      });
    }

    return true;
  }
}
