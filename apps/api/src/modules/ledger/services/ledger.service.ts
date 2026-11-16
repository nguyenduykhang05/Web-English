import mongoose, { type ClientSession } from 'mongoose';
import type { LedgerEntryType, UserRole } from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { SessionLedger } from '../models/sessionLedger.model.js';

export async function getStudentBalance(
  studentId: string,
  session?: ClientSession | null,
): Promise<number> {
  const pipeline = [
    { $match: { studentId: new mongoose.Types.ObjectId(studentId) } },
    { $group: { _id: null, total: { $sum: '$delta' } } },
  ];
  const agg = session
    ? await SessionLedger.aggregate<{ total: number }>(pipeline).session(session)
    : await SessionLedger.aggregate<{ total: number }>(pipeline);
  return agg[0]?.total ?? 0;
}

export async function getEnrollmentBalance(
  enrollmentId: string,
  session?: ClientSession | null,
): Promise<number> {
  const pipeline = [
    { $match: { enrollmentId: new mongoose.Types.ObjectId(enrollmentId) } },
    { $group: { _id: null, total: { $sum: '$delta' } } },
  ];
  const agg = session
    ? await SessionLedger.aggregate<{ total: number }>(pipeline).session(session)
    : await SessionLedger.aggregate<{ total: number }>(pipeline);
  return agg[0]?.total ?? 0;
}

export async function appendLedgerEntry(
  input: {
    studentId: string | mongoose.Types.ObjectId;
    enrollmentId: string | mongoose.Types.ObjectId;
    type: LedgerEntryType;
    delta: number;
    reason: string;
    referenceType?: string;
    referenceId?: string;
    actorId?: string | mongoose.Types.ObjectId;
  },
  session?: ClientSession | null,
) {
  const [entry] = await SessionLedger.create([input], session ? { session } : undefined);
  return entry;
}

async function assertCanViewStudentLedger(
  studentId: string,
  actor: { id: string; role: UserRole },
) {
  if (actor.role === 'admin') return;
  if (actor.role === 'student' && actor.id === studentId) return;
  if (actor.role === 'teacher') {
    const assigned = await Enrollment.exists({
      studentId,
      teacherId: actor.id,
      status: { $in: ['active', 'paused', 'completed'] },
    });
    if (assigned) return;
  }
  throw new AppError(403, 'FORBIDDEN', 'Access denied to student session ledger');
}

export async function listStudentLedger(
  studentId: string,
  actor: { id: string; role: UserRole },
  query: { page?: number; limit?: number },
) {
  await assertCanViewStudentLedger(studentId, actor);

  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 30)));

  const [entries, total, balance] = await Promise.all([
    SessionLedger.find({ studentId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SessionLedger.countDocuments({ studentId }),
    getStudentBalance(studentId),
  ]);

  return {
    balance,
    items: entries.map((e) => ({
      id: String(e._id),
      studentId: String(e.studentId),
      enrollmentId: String(e.enrollmentId),
      type: e.type,
      delta: e.delta,
      reason: e.reason,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
    })),
    meta: { page, limit, total },
  };
}
