import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  listNotificationsController,
  markAllReadController,
  markReadController,
} from './controllers/notification.controller.js';

const router = Router();

router.get('/', requireAuth, listNotificationsController);
router.post('/read-all', requireAuth, markAllReadController);
router.post('/:id/read', requireAuth, markReadController);

export default router;
