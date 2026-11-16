import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  adjustPayrollController,
  approvePayrollController,
  exportPayrollsCsvController,
  generatePayrollController,
  listPayrollsController,
  payPayrollController,
} from './controllers/payroll.controller.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin', 'teacher'), listPayrollsController);
router.get('/export/csv', requireAuth, requireRole('admin'), exportPayrollsCsvController);
router.post('/generate', requireAuth, requireRole('admin'), generatePayrollController);
router.patch('/:id/adjustment', requireAuth, requireRole('admin'), adjustPayrollController);
router.post('/:id/approve', requireAuth, requireRole('admin'), approvePayrollController);
router.post('/:id/pay', requireAuth, requireRole('admin'), payPayrollController);

export default router;
