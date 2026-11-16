import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  advanceAlertController,
  getTeacherMetricsController,
  listAlertsController,
  listTeacherMetricsController,
} from './controllers/quality.controller.js';

const router = Router();

router.get('/alerts', requireAuth, requireRole('admin'), listAlertsController);
router.post('/alerts/:id/advance', requireAuth, requireRole('admin'), advanceAlertController);
router.get('/teachers', requireAuth, requireRole('admin'), listTeacherMetricsController);
router.get('/teachers/:teacherId', requireAuth, requireRole('admin', 'teacher'), getTeacherMetricsController);

export default router;
