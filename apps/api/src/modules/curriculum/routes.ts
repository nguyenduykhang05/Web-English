import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js';
import {
  createHomeworkController,
  createLessonController,
  gradeHomeworkController,
  listHomeworkController,
  listLessonsController,
  submitHomeworkController,
} from './controllers/curriculum.controller.js';

const router = Router();

router.get('/lessons', optionalAuth, listLessonsController);
router.post('/lessons', requireAuth, requireRole('admin', 'teacher'), createLessonController);
router.get('/homework', requireAuth, listHomeworkController);
router.post('/homework', requireAuth, requireRole('teacher', 'admin'), createHomeworkController);
router.post('/homework/:id/submit', requireAuth, requireRole('student'), submitHomeworkController);
router.post('/homework/:id/grade', requireAuth, gradeHomeworkController);

export default router;
