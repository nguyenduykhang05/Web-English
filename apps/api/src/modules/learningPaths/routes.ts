import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  answerPlacementController,
  createTemplateController,
  decideMilestoneController,
  generatePathController,
  getLearningPathController,
  listTemplatesController,
  startPlacementController,
  updateMilestoneProgressController,
} from './controllers/learningPath.controller.js';

const router = Router();

router.get('/templates', requireAuth, listTemplatesController);
router.post('/templates', requireAuth, requireRole('admin'), createTemplateController);
router.post('/placement/start', requireAuth, requireRole('student'), startPlacementController);
router.post(
  '/placement/:assessmentId/answer',
  requireAuth,
  requireRole('student'),
  answerPlacementController,
);
router.get('/me', requireAuth, requireRole('student'), getLearningPathController);
router.get('/student/:studentId', requireAuth, getLearningPathController);
router.post('/generate', requireAuth, generatePathController);
router.post(
  '/:pathId/milestones/:milestoneId/decision',
  requireAuth,
  decideMilestoneController,
);
router.patch(
  '/:pathId/milestones/:milestoneId/progress',
  requireAuth,
  requireRole('teacher', 'admin'),
  updateMilestoneProgressController,
);

export default router;
