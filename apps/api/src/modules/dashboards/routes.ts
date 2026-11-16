import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  adminDashboardController,
  studentDashboardController,
  teacherDashboardController,
} from './controllers/dashboard.controller.js';

const router = Router();

router.get('/student', requireAuth, requireRole('student'), studentDashboardController);
router.get('/teacher', requireAuth, requireRole('teacher'), teacherDashboardController);
router.get('/admin', requireAuth, requireRole('admin'), adminDashboardController);

export default router;
