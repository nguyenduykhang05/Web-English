import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../middleware/errorHandler.js';
import { listStudentLedger } from '../services/ledger.service.js';

const LedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function getMyLedgerController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const query = LedgerQuerySchema.parse(req.query);
    const data = await listStudentLedger(req.user.id, { id: req.user.id, role: req.user.role }, query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getStudentLedgerController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const query = LedgerQuerySchema.parse(req.query);
    const data = await listStudentLedger(
      req.params.studentId,
      { id: req.user.id, role: req.user.role },
      query,
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
