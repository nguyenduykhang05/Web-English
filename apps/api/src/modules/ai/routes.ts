import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  decideAiProposalController,
  exerciseGenController,
  listAiLogsController,
  matchingExplainController,
  pathProposalController,
  placementExplanationController,
  sessionSummaryController,
  speakingAssessmentController,
  weaknessAnalysisController,
  writingAssessmentController,
} from './controllers/ai.controller.js';

const router = Router();

const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many AI requests, please slow down' },
  },
});

router.use(aiLimiter);

router.get('/logs', requireAuth, listAiLogsController);
router.post('/logs/:id/decision', requireAuth, decideAiProposalController);
router.post('/writing-assessment', requireAuth, writingAssessmentController);
router.post('/speaking-assessment', requireAuth, speakingAssessmentController);
router.post('/placement-explanation', requireAuth, placementExplanationController);
router.post('/path-proposal', requireAuth, pathProposalController);
router.post('/exercise-generation', requireAuth, requireRole('teacher', 'admin'), exerciseGenController);
router.post('/session-summary', requireAuth, sessionSummaryController);
router.post('/weakness-analysis', requireAuth, weaknessAnalysisController);
router.post('/matching-explanation', requireAuth, matchingExplainController);

export default router;
