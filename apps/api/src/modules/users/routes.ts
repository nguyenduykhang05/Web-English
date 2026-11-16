import { Router } from 'express';
import { requireAuth, requireRole, requireSelfOrAdmin } from '../../middleware/auth.js';
import {
  getUserController,
  inviteTeacherController,
  listUsersController,
  unlockUserController,
  updateUserController,
} from './controllers/user.controller.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), listUsersController);
router.post('/invite-teacher', requireAuth, requireRole('admin'), inviteTeacherController);
router.get('/:id', requireAuth, requireSelfOrAdmin('id'), getUserController);
router.patch('/:id', requireAuth, requireSelfOrAdmin('id'), updateUserController);
router.post('/:id/unlock', requireAuth, requireRole('admin'), unlockUserController);

export default router;
