import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js';
import {
  getTeacherController,
  listTeachersController,
  upsertTeacherController,
} from './controllers/teacher.controller.js';

const router = Router();

router.get('/', optionalAuth, listTeachersController);
router.get('/me', requireAuth, requireRole('teacher'), getTeacherController);
router.put('/me', requireAuth, requireRole('teacher'), upsertTeacherController);
router.get('/:id', optionalAuth, getTeacherController);
router.put('/:id', requireAuth, requireRole('admin', 'teacher'), upsertTeacherController);

export default router;
