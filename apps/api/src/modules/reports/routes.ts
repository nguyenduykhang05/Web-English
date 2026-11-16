import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  getSessionReportController,
  getStudentProgressController,
  submitReportController,
  submitReviewController,
} from './controllers/report.controller.js';

const router = Router();

router.put(
  '/sessions/:sessionId',
  requireAuth,
  requireRole('teacher', 'admin'),
  submitReportController,
);
router.get('/sessions/:sessionId', requireAuth, getSessionReportController);
router.post(
  '/sessions/:sessionId/review',
  requireAuth,
  requireRole('student'),
  submitReviewController,
);
router.get('/students/:studentId/progress', requireAuth, getStudentProgressController);

export default router;
