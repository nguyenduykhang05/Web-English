import { randomUUID } from 'crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { sanitizeNoSqlInput } from './middleware/sanitize.js';
import { registerSwagger } from './middleware/swagger.js';
import { createAuthRoutes } from './modules/auth/routes.js';
import usersRoutes from './modules/users/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import studentRoutes from './modules/students/routes.js';
import teacherRoutes from './modules/teachers/routes.js';
import courseRoutes from './modules/courses/routes.js';
import ledgerRoutes from './modules/ledger/routes.js';
import sessionRoutes from './modules/sessions/routes.js';
import notificationRoutes from './modules/notifications/routes.js';
import reportRoutes from './modules/reports/routes.js';
import qualityRoutes from './modules/quality/routes.js';
import payrollRoutes from './modules/payroll/routes.js';
import dashboardRoutes from './modules/dashboards/routes.js';
import learningPathRoutes from './modules/learningPaths/routes.js';
import curriculumRoutes from './modules/curriculum/routes.js';
import aiRoutes from './modules/ai/routes.js';
import storageRoutes from './modules/storage/routes.js';
import practiceRoutes from './modules/practice/routes.js';
import {
  enrollmentRoutes,
  invoiceRoutes,
  paymentRoutes,
} from './modules/enrollments/routes.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { getAuditLogsController } from './modules/settings/controllers/setting.controller.js';

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

export function createApp() {
  const app = express();

  app.use((req, _res, next) => {
    const requestId = randomUUID();
    req.requestId = requestId;
    req.log = logger.child({ requestId });
    next();
  });

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(cookieParser());

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.API_RATE_LIMIT_MAX ?? 600),
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // Storage handles its own 5MB raw / 8MB base64 body caps before global 1MB JSON limit
  app.use('/api/v1/storage', storageRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(sanitizeNoSqlInput);

  registerSwagger(app);

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/v1/auth', createAuthRoutes());
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/students', studentRoutes);
  app.use('/api/v1/teachers', teacherRoutes);
  app.use('/api/v1/courses', courseRoutes);
  app.use('/api/v1/ledger', ledgerRoutes);
  app.use('/api/v1/enrollments', enrollmentRoutes);
  app.use('/api/v1/invoices', invoiceRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/sessions', sessionRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/reports', reportRoutes);
  app.use('/api/v1/quality', qualityRoutes);
  app.use('/api/v1/payrolls', payrollRoutes);
  app.use('/api/v1/dashboards', dashboardRoutes);
  app.use('/api/v1/learning-paths', learningPathRoutes);
  app.use('/api/v1/curriculum', curriculumRoutes);
  app.use('/api/v1/ai', aiRoutes);
  app.use('/api/v1/practice', practiceRoutes);
  app.get('/api/v1/audit-logs', requireAuth, requireRole('admin'), getAuditLogsController);

  app.use('/api/v1', notFoundHandler);
  app.use(errorHandler);

  return app;
}
