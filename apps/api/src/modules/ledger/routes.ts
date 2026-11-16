import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  getMyLedgerController,
  getStudentLedgerController,
} from './controllers/ledger.controller.js';

const router = Router();

router.get('/me', requireAuth, requireRole('student'), getMyLedgerController);
router.get('/student/:studentId', requireAuth, getStudentLedgerController);

export default router;
