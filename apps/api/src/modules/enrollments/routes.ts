import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  confirmPaymentController,
  createEnrollmentController,
  freezeEnrollmentController,
  listEnrollmentsController,
  listInvoicesController,
  matchTeachersController,
  refundInvoiceController,
  unfreezeEnrollmentController,
  vnpayIpnController,
} from './controllers/enrollment.controller.js';

export const enrollmentRoutes = Router();
enrollmentRoutes.get('/', requireAuth, listEnrollmentsController);
enrollmentRoutes.post('/', requireAuth, requireRole('student', 'admin'), createEnrollmentController);
enrollmentRoutes.get('/match-teachers', requireAuth, requireRole('student', 'admin'), matchTeachersController);
enrollmentRoutes.post('/:id/freeze', requireAuth, requireRole('student', 'admin'), freezeEnrollmentController);
enrollmentRoutes.post('/:id/unfreeze', requireAuth, requireRole('student', 'admin'), unfreezeEnrollmentController);

export const invoiceRoutes = Router();
invoiceRoutes.get('/', requireAuth, requireRole('student', 'admin'), listInvoicesController);
invoiceRoutes.post('/:id/refund', requireAuth, requireRole('admin'), refundInvoiceController);

export const paymentRoutes = Router();
paymentRoutes.get('/vnpay/ipn', vnpayIpnController);
paymentRoutes.post('/vnpay/ipn', vnpayIpnController);
paymentRoutes.post('/:id/confirm', requireAuth, requireRole('admin'), confirmPaymentController);
