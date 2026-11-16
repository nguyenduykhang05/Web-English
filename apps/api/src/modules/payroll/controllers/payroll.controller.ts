import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  GeneratePayrollSchema,
  UpdatePayrollAdjustmentSchema,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import {
  advancePayrollStatus,
  exportPayrollsCsv,
  generateMonthlyPayrolls,
  listPayrolls,
  updatePayrollAdjustment,
} from '../services/payroll.service.js';

const PayrollQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export async function listPayrollsController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const query = PayrollQuerySchema.parse(req.query);
    const data = await listPayrolls({ id: req.user.id, role: req.user.role }, query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function generatePayrollController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = GeneratePayrollSchema.parse(req.body);
    const data = await generateMonthlyPayrolls(body, { id: req.user.id, ip: req.ip });
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function adjustPayrollController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const body = UpdatePayrollAdjustmentSchema.parse(req.body);
    const data = await updatePayrollAdjustment(req.params.id, body, {
      id: req.user.id,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function approvePayrollController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await advancePayrollStatus(req.params.id, 'approved', {
      id: req.user.id,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function payPayrollController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const data = await advancePayrollStatus(req.params.id, 'paid', {
      id: req.user.id,
      ip: req.ip,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function exportPayrollsCsvController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const query = PayrollQuerySchema.parse(req.query);
    const csv = await exportPayrollsCsv(query.month, { id: req.user.id, role: req.user.role });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payrolls-${query.month ?? 'all'}.csv"`);
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}
