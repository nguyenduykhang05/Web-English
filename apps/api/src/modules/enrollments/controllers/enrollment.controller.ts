import type { NextFunction, Request, Response } from 'express';
import {
  ConfirmManualPaymentSchema,
  CreateEnrollmentSchema,
  FreezeEnrollmentSchema,
  RefundInvoiceSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  confirmManualPayment,
  createEnrollmentWithInvoice,
  freezeEnrollment,
  handleVnpayIpn,
  listEnrollmentsForActor,
  listInvoicesAndPayments,
  refundInvoiceOrEnrollment,
  unfreezeEnrollment,
} from '../services/enrollment.service.js';
import { matchTeachersForStudent } from '../services/matching.service.js';

export async function listEnrollmentsController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await listEnrollmentsForActor({ id: req.user.id, role: req.user.role });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createEnrollmentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = CreateEnrollmentSchema.parse(req.body);
    const data = await createEnrollmentWithInvoice(body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function matchTeachersController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const targetStudentId =
      req.user.role === 'admin' && typeof req.query.studentId === 'string'
        ? req.query.studentId
        : req.user.id;
    const data = await matchTeachersForStudent(targetStudentId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listInvoicesController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await listInvoicesAndPayments({ id: req.user.id, role: req.user.role });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function confirmPaymentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = ConfirmManualPaymentSchema.parse(req.body);
    const data = await confirmManualPayment(req.params.id, body, {
      id: req.user.id,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function refundInvoiceController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = RefundInvoiceSchema.parse(req.body);
    const data = await refundInvoiceOrEnrollment(req.params.id, body, {
      id: req.user.id,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function vnpayIpnController(req: Request, res: Response, next: NextFunction) {
  try {
    const rawParams =
      req.method === 'POST' && req.body && Object.keys(req.body as object).length > 0
        ? (req.body as Record<string, unknown>)
        : (req.query as Record<string, unknown>);
    const result = await handleVnpayIpn(rawParams, req.ip);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function freezeEnrollmentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = FreezeEnrollmentSchema.parse(req.body);
    const data = await freezeEnrollment(req.params.id, body, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function unfreezeEnrollmentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await unfreezeEnrollment(req.params.id, {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
