import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js';
import {
  addQuickNoteController,
  cancelSessionController,
  createBookingController,
  downloadSessionIcsController,
  endSessionController,
  getAvailableSlotsController,
  getSessionController,
  joinClassroomController,
  listSessionsController,
  rescheduleSessionController,
  startSessionController,
  updateSharedNotesController,
} from './controllers/session.controller.js';

const router = Router();

router.get('/available-slots', optionalAuth, getAvailableSlotsController);
router.get('/', requireAuth, listSessionsController);
router.post('/', requireAuth, requireRole('student', 'admin'), createBookingController);
router.get('/:id', requireAuth, getSessionController);
router.get('/:id/ics', requireAuth, downloadSessionIcsController);
router.post('/:id/reschedule', requireAuth, rescheduleSessionController);
router.post('/:id/cancel', requireAuth, cancelSessionController);
router.post('/:id/join', requireAuth, requireRole('student', 'teacher'), joinClassroomController);
router.post('/:id/start', requireAuth, requireRole('teacher', 'admin'), startSessionController);
router.post('/:id/end', requireAuth, requireRole('teacher', 'admin'), endSessionController);
router.put('/:id/notes', requireAuth, requireRole('student', 'teacher'), updateSharedNotesController);
router.post('/:id/quick-notes', requireAuth, requireRole('student', 'teacher'), addQuickNoteController);

export default router;
