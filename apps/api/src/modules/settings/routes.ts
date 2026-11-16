import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  getAuditLogsController,
  getSettingsController,
  putSettingController,
} from './controllers/setting.controller.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), getSettingsController);
router.put('/', requireAuth, requireRole('admin'), putSettingController);
router.get('/audit-logs', requireAuth, requireRole('admin'), getAuditLogsController);

export default router;
