import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { sendSuccess } from './utils/response';
import authRoutes from './modules/auth/auth.routes';
import institutionsRoutes from './modules/institutions/institutions.routes';
import academicRoutes from './modules/academic/academic.routes';
import studentsRoutes from './modules/students/students.routes';
import lmsRoutes from './modules/lms/lms.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import communicationRoutes from './modules/communication/communication.routes';
import leaveRoutes from './modules/hr/leave.routes';
import examsRoutes from './modules/exams/exams.routes';
import financeRoutes from './modules/finance/finance.routes';

export const createApp = () => {
  const app = express();

  // Security headers
  app.use(helmet());

  // Cross-Origin Resource Sharing
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-institution-id'],
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check endpoint
  app.get(`${env.API_PREFIX}/health`, (req: Request, res: Response) => {
    return sendSuccess(res, {
      status: 'UP',
      service: 'school-lms-api',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
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
  app.use(`${env.API_PREFIX}/finance`, financeRoutes);

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
