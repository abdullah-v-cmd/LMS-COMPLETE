import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { sendSuccess } from './utils/response';
import { sendError } from './utils/response';
import { prisma } from './utils/prisma';
import authRoutes from './modules/auth/auth.routes';
import institutionsRoutes from './modules/institutions/institutions.routes';
import academicRoutes from './modules/academic/academic.routes';
import studentsRoutes from './modules/students/students.routes';
import lmsRoutes from './modules/lms/lms.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import communicationRoutes from './modules/communication/communication.routes';
import leaveRoutes from './modules/hr/leave.routes';
import examsRoutes from './modules/exams/exams.routes';
import assessmentRoutes from './modules/assessment/assessment.routes';
import financeRoutes from './modules/finance/finance.routes';
import libraryRoutes from './modules/library/library.routes';
import transportRoutes from './modules/transport/transport.routes';
import payrollRoutes from './modules/payroll/payroll.routes';
import hostelRoutes from './modules/hostel/hostel.routes';
import counselingRoutes from './modules/counseling/counseling.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import usersRoutes from './modules/users/users.routes';
import { systemRoutes } from './modules/system/system.routes';
import { AcademicController } from './modules/academic/academic.controller';
import { requireAuth } from './middleware/auth';
import { requireTenant } from './middleware/tenant';

import { apiRateLimiter } from './middleware/rateLimit';

export const createApp = () => {
  const app = express();

  // Security headers
  app.use(helmet());

  // Cross-Origin Resource Sharing (Supports production domain, Vercel preview branches, and local dev)
  const allowedOrigins = (env.CLIENT_URL || '').split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          allowedOrigins.includes('*') ||
          origin.endsWith('.vercel.app') ||
          process.env.NODE_ENV !== 'production'
        ) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-institution-id'],
    })
  );

  // Vercel Serverless request path normalization
  app.use((req, res, next) => {
    // 1. Check if the original requested URI is in forwarded headers or originalUrl
    const forwardedUri =
      (req.headers['x-forwarded-uri'] as string | undefined) ||
      (req.headers['x-original-uri'] as string | undefined);

    let effectiveUrl = req.url;

    if (forwardedUri && forwardedUri.startsWith('/api/v1')) {
      effectiveUrl = forwardedUri;
    } else if (req.originalUrl && req.originalUrl.startsWith('/api/v1')) {
      effectiveUrl = req.originalUrl;
    } else {
      // Clean up /api/index prefix if injected by Vercel serverless execution
      effectiveUrl = effectiveUrl.replace(/^\/api\/index(?:\.ts|\.js)?/, '');

      if (!effectiveUrl.startsWith('/api/v1')) {
        if (effectiveUrl.startsWith('/v1/')) {
          effectiveUrl = `/api${effectiveUrl}`;
        } else if (effectiveUrl.startsWith('/api/')) {
          effectiveUrl = effectiveUrl.replace(/^\/api\//, '/api/v1/');
        } else if (effectiveUrl === '/api' || effectiveUrl.startsWith('/api?')) {
          effectiveUrl = effectiveUrl.replace(/^\/api/, '/api/v1');
        } else if (effectiveUrl === '/health' || effectiveUrl.startsWith('/health?')) {
          effectiveUrl = `${env.API_PREFIX}${effectiveUrl}`;
        } else {
          effectiveUrl = `/api/v1${effectiveUrl.startsWith('/') ? effectiveUrl : `/${effectiveUrl}`}`;
        }
      }
    }

    req.url = effectiveUrl;
    next();
  });

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // General rate limiting across all API endpoints
  app.use(env.API_PREFIX, apiRateLimiter);

  // Health check endpoint
  app.get(['/health', `${env.API_PREFIX}/health`], (req: Request, res: Response) => {
    return sendSuccess(res, {
      status: 'UP',
      service: 'school-lms-api',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // Readiness check includes PostgreSQL and Redis; never return connection details.
  app.get(`${env.API_PREFIX}/health/ready`, async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const { redis } = await import('./utils/redis');
      const redisHealthy = await redis.isHealthy();
      return sendSuccess(res, {
        status: 'READY',
        service: 'school-lms-api',
        database: 'reachable',
        redis: redisHealthy ? 'connected' : 'fallback-active',
        timestamp: new Date().toISOString(),
      });
    } catch {
      return sendError(res, 503, 'NOT_READY', 'A required service is unavailable');
    }
  });

  // Domain API Routes
  app.use(`${env.API_PREFIX}/auth`, authRoutes);
  app.use(`${env.API_PREFIX}/institutions`, institutionsRoutes);
  app.use(`${env.API_PREFIX}/academic`, academicRoutes);
  app.use(`${env.API_PREFIX}/students`, studentsRoutes);
  app.use(`${env.API_PREFIX}/lms`, lmsRoutes);
  app.use(`${env.API_PREFIX}/attendance`, attendanceRoutes);
  app.use(`${env.API_PREFIX}/communication`, communicationRoutes);
  app.use(`${env.API_PREFIX}/hr`, leaveRoutes);
  app.use(`${env.API_PREFIX}/exams`, examsRoutes);
  app.use(`${env.API_PREFIX}/assessments`, assessmentRoutes);
  app.use(`${env.API_PREFIX}/finance`, financeRoutes);
  app.use(`${env.API_PREFIX}/library`, libraryRoutes);
  app.use(`${env.API_PREFIX}/transport`, transportRoutes);
  app.use(`${env.API_PREFIX}/payroll`, payrollRoutes);
  app.use(`${env.API_PREFIX}/hostel`, hostelRoutes);
  app.use(`${env.API_PREFIX}/counseling`, counselingRoutes);
  app.use(`${env.API_PREFIX}/analytics`, analyticsRoutes);
  app.use(`${env.API_PREFIX}/users`, usersRoutes);
  app.use(`${env.API_PREFIX}/system`, systemRoutes);
  app.get(`${env.API_PREFIX}/staff/teachers`, requireAuth, requireTenant, AcademicController.getTeachers);

  // 404 Fallback
  app.use((req: Request, res: Response) => {
    return res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} does not exist`,
      },
    });
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
};

export const app = createApp();
export default app;
