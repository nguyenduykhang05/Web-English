import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  exportStudentsCsvController,
  getStudentController,
  getStudentTimelineController,
  listStudentsController,
  updateStudentController,
} from './controllers/student.controller.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin', 'teacher'), listStudentsController);
router.get('/export/csv', requireAuth, requireRole('admin'), exportStudentsCsvController);
router.get('/me', requireAuth, requireRole('student'), getStudentController);
router.patch('/me', requireAuth, requireRole('student'), updateStudentController);
router.get('/:id', requireAuth, getStudentController);
router.patch('/:id', requireAuth, updateStudentController);
router.get('/:id/timeline', requireAuth, getStudentTimelineController);

export default router;
