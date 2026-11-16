import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js';
import {
  createCouponController,
  createCourseController,
  createPackageController,
  listCoursesController,
  updateCourseController,
} from './controllers/course.controller.js';

const router = Router();

router.get('/', optionalAuth, listCoursesController);
router.post('/', requireAuth, requireRole('admin'), createCourseController);
router.patch('/:id', requireAuth, requireRole('admin'), updateCourseController);
router.post('/packages', requireAuth, requireRole('admin'), createPackageController);
router.post('/coupons', requireAuth, requireRole('admin'), createCouponController);

export default router;
