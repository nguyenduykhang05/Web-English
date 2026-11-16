import mongoose from 'mongoose';
import type { AdvanceAlertInput, AlertStatus } from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { SessionReport } from '../../reports/models/sessionReport.model.js';
import { Session } from '../../sessions/models/session.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { User } from '../../users/models/user.model.js';
import { QualityAlert, type QualityAlertType } from '../models/qualityAlert.model.js';

export interface CreateQualityAlertInput {
  type: QualityAlertType;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  teacherId?: string;
  studentId?: string;
  sessionId?: string;
  dedupeKey?: string;
}

export async function createQualityAlertIdempotent(
  input: CreateQualityAlertInput,
): Promise<{ created: boolean; id?: string }> {
  try {
    const doc = await QualityAlert.create({
      type: input.type,
      severity: input.severity,
      title: input.title,
      detail: input.detail,
      teacherId: input.teacherId,
      studentId: input.studentId,
      sessionId: input.sessionId,
      dedupeKey: input.dedupeKey,
      status: 'open',
    });
    return { created: true, id: String(doc._id) };
  } catch (err) {
    const code = typeof err === 'object' && err !== null ? (err as { code?: number }).code : undefined;
    if (code === 11000 && input.dedupeKey) {
      return { created: false };
    }
    throw err;
  }
}

export async function listQualityAlerts(query: {
  status?: AlertStatus;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 30)));
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;

  const [items, total, openCount] = await Promise.all([
    QualityAlert.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    QualityAlert.countDocuments(filter),
    QualityAlert.countDocuments({ status: { $ne: 'resolved' } }),
  ]);

  return {
    openCount,
    items: items.map((a) => ({
      id: String(a._id),
      type: a.type,
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      teacherId: a.teacherId ? String(a.teacherId) : undefined,
      studentId: a.studentId ? String(a.studentId) : undefined,
      sessionId: a.sessionId ? String(a.sessionId) : undefined,
      status: a.status,
      handledAt: a.handledAt,
      resolutionNote: a.resolutionNote,
    })),
    meta: { page, limit, total },
  };
}

export async function advanceQualityAlert(
  alertId: string,
  input: AdvanceAlertInput,
  actor: { id: string; ip?: string },
) {
  const doc = await QualityAlert.findById(alertId);
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', 'Quality alert not found');
  }

  if (doc.status === 'resolved') {
    throw new AppError(409, 'INVALID_STATE', 'Alert is already resolved');
  }
  if (doc.status === 'ack' && input.status === 'ack') {
    throw new AppError(409, 'INVALID_STATE', 'Alert is already acknowledged');
  }

  const previousStatus = doc.status;
  doc.status = input.status;
  doc.handledBy = actor.id as unknown as typeof doc.handledBy;
  doc.handledAt = new Date();
  if (input.resolutionNote) {
    doc.resolutionNote = input.resolutionNote;
  }
  await doc.save();

  await AuditLog.create({
    actorId: actor.id,
    action: 'quality_alert.updated',
    entity: 'QualityAlert',
    entityId: String(doc._id),
    before: { status: previousStatus },
    after: { status: doc.status, resolutionNote: doc.resolutionNote },
    ip: actor.ip,
  });

  return {
    id: String(doc._id),
    status: doc.status,
    handledAt: doc.handledAt,
    resolutionNote: doc.resolutionNote,
  };
}

export async function getTeacherQualityMetrics(teacherId: string) {
  const teacherObjectId = new mongoose.Types.ObjectId(teacherId);
  const [teacherUser, profile, sessionStats, reportsCount, onTimeReportsCount] = await Promise.all([
    User.findOne({ _id: teacherObjectId, role: 'teacher' }).select('fullName').lean(),
    TeacherProfile.findOne({ userId: teacherObjectId }).select('ratingAvg reviewsCount').lean(),
    Session.aggregate<{ _id: string; count: number }>([
      { $match: { teacherId: teacherObjectId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    SessionReport.countDocuments({ teacherId: teacherObjectId }),
    SessionReport.countDocuments({ teacherId: teacherObjectId, submittedOnTime: true }),
  ]);

  if (!teacherUser) {
    throw new AppError(404, 'NOT_FOUND', 'Teacher not found');
  }

  const byStatus = new Map(sessionStats.map((s) => [s._id, s.count]));
  const completedSessions = byStatus.get('completed') ?? 0;
  const noShowTeacherCount = byStatus.get('no_show_teacher') ?? 0;
  const noShowStudentCount = byStatus.get('no_show_student') ?? 0;
  const teacherCancelCount = byStatus.get('cancelled_by_teacher') ?? 0;
  const finishedOrFaulted =
    completedSessions + noShowTeacherCount + noShowStudentCount + teacherCancelCount;

  const onTimeReportRate =
    completedSessions > 0 ? Number(((onTimeReportsCount / completedSessions) * 100).toFixed(1)) : 100;
  const teacherReliabilityRate =
    finishedOrFaulted > 0
      ? Number((((finishedOrFaulted - noShowTeacherCount - teacherCancelCount) / finishedOrFaulted) * 100).toFixed(1))
      : 100;

  return {
    teacherId,
    teacherName: teacherUser.fullName,
    completedSessions,
    reportsSubmitted: reportsCount,
    onTimeReportsCount,
    onTimeReportRate,
    noShowTeacherCount,
    noShowStudentCount,
    teacherCancelCount,
    teacherReliabilityRate,
    ratingAvg: profile?.ratingAvg ?? 4.8,
    reviewsCount: profile?.reviewsCount ?? 0,
  };
}

export async function listAllTeachersQualityMetrics() {
  const teachers = await User.find({ role: 'teacher', status: 'active' }).select('_id').lean();
  return Promise.all(teachers.map((t) => getTeacherQualityMetrics(String(t._id))));
}
