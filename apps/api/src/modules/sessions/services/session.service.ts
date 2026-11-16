import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import mongoose from 'mongoose';
import type {
  CancelSessionInput,
  CreateBookingInput,
  ListSessionsQuery,
  RescheduleSessionInput,
  SessionStatus,
  UserRole,
} from '@webenglish/shared';
import { withTransaction } from '../../../config/db.js';
import { AppError } from '../../../middleware/errorHandler.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { appendLedgerEntry, getEnrollmentBalance } from '../../ledger/services/ledger.service.js';
import { notifyUser } from '../../notifications/services/notification.service.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { getBookingPolicies } from '../../settings/services/policy.service.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { User } from '../../users/models/user.model.js';
import { getMeetingProvider } from '../meeting.provider.js';
import { Session, type ISession } from '../models/session.model.js';
import {
  intervalsOverlapWithBuffer,
  isIntervalWithinAvailability,
  validateBookingTiming,
} from './slot.service.js';

dayjs.extend(utc);
dayjs.extend(timezone);

function isDuplicateOrConflictError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: number }).code;
  return code === 11000 || code === 112;
}

export function assertSessionAccess(
  sessionDoc: Pick<ISession, 'studentId' | 'teacherId'>,
  actor: { id: string; role: UserRole },
): void {
  if (actor.role === 'admin') return;
  if (actor.role === 'student' && String(sessionDoc.studentId) === actor.id) return;
  if (actor.role === 'teacher' && String(sessionDoc.teacherId) === actor.id) return;
  throw new AppError(403, 'FORBIDDEN', 'Access denied to this session');
}

function formatSessionSummary(doc: ISession | (Record<string, unknown> & { _id: unknown })) {
  const s = doc as unknown as ISession & { createdAt?: Date; updatedAt?: Date };
  return {
    id: String(s._id),
    studentId: String(s.studentId),
    teacherId: String(s.teacherId),
    enrollmentId: s.enrollmentId ? String(s.enrollmentId) : undefined,
    courseId: s.courseId ? String(s.courseId) : undefined,
    isTrial: s.isTrial,
    title: s.title,
    startAt: s.startAt,
    endAt: s.endAt,
    durationMinutes: s.durationMinutes,
    status: s.status,
    isActive: s.isActive,
    rescheduleCount: s.rescheduleCount,
    seriesId: s.seriesId,
    meetingProvider: s.meetingProvider,
    roomCode: s.roomCode,
    joinUrl: s.joinUrl,
    teacherJoinedAt: s.teacherJoinedAt,
    studentJoinedAt: s.studentJoinedAt,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    cancelReason: s.cancelReason,
    sharedNotes: s.sharedNotes,
    quickNotes: s.quickNotes,
  };
}

export async function listSessionsForActor(
  actor: { id: string; role: UserRole },
  query: ListSessionsQuery,
) {
  const filter: Record<string, unknown> = {};
  if (actor.role === 'student') filter.studentId = actor.id;
  if (actor.role === 'teacher') filter.teacherId = actor.id;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    const startRange: Record<string, Date> = {};
    if (query.from) startRange.$gte = new Date(query.from);
    if (query.to) startRange.$lte = new Date(query.to);
    filter.startAt = startRange;
  }

  const page = Math.max(1, query.page);
  const limit = Math.min(100, Math.max(1, query.limit));

  const [items, total] = await Promise.all([
    Session.find(filter)
      .sort({ startAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Session.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => formatSessionSummary(item)),
    meta: { page, limit, total },
  };
}

export async function getSessionById(
  sessionId: string,
  actor: { id: string; role: UserRole },
) {
  const doc = await Session.findById(sessionId).lean();
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found');
  }
  assertSessionAccess(doc, actor);
  return {
    ...formatSessionSummary(doc),
    joinLogs: doc.joinLogs,
    chatMessages: doc.chatMessages,
  };
}

export async function createBooking(
  input: CreateBookingInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role === 'teacher') {
    throw new AppError(403, 'FORBIDDEN', 'Teachers cannot book student sessions');
  }

  const studentId = actor.role === 'admin' && input.studentId ? input.studentId : actor.id;
  if (input.isTrial && input.recurringCount > 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Trial booking supports only 1 session');
  }
  if (!input.isTrial && !input.enrollmentId) {
    throw new AppError(400, 'ENROLLMENT_REQUIRED', 'enrollmentId is required for paid bookings');
  }

  const [studentUser, teacherUser, teacherProfile, policies] = await Promise.all([
    User.findOne({ _id: studentId, role: 'student', status: 'active' }).select('fullName').lean(),
    User.findOne({ _id: input.teacherId, role: 'teacher', status: 'active' })
      .select('fullName')
      .lean(),
    TeacherProfile.findOne({ userId: input.teacherId }).lean(),
    getBookingPolicies(),
  ]);

  if (!studentUser) {
    throw new AppError(404, 'NOT_FOUND', 'Student account not found or inactive');
  }
  if (!teacherUser || !teacherProfile) {
    throw new AppError(404, 'NOT_FOUND', 'Teacher profile not found or inactive');
  }

  const teacherTz = teacherProfile.timezone || 'Asia/Ho_Chi_Minh';
  const baseStartUtc = new Date(input.startAt);
  const now = new Date();
  const occurrences: { startAt: Date; endAt: Date }[] = [];

  for (let i = 0; i < input.recurringCount; i++) {
    const startAt =
      i === 0
        ? baseStartUtc
        : dayjs(baseStartUtc).tz(teacherTz).add(i, 'week').toDate();
    const endAt = new Date(startAt.getTime() + input.durationMinutes * 60_000);

    validateBookingTiming(startAt, input.durationMinutes, policies, now);
    if (!isIntervalWithinAvailability(teacherProfile, startAt, endAt)) {
      throw new AppError(
        400,
        'OUTSIDE_TEACHER_AVAILABILITY',
        `Requested slot ${startAt.toISOString()} is outside teacher availability`,
      );
    }
    occurrences.push({ startAt, endAt });
  }

  let courseId: mongoose.Types.ObjectId | undefined;
  if (!input.isTrial) {
    const enrollment = await Enrollment.findOne({
      _id: input.enrollmentId,
      studentId,
      status: 'active',
    }).lean();
    if (!enrollment) {
      throw new AppError(404, 'NOT_FOUND', 'Active enrollment not found for this student');
    }
    const lastEnd = occurrences[occurrences.length - 1].endAt;
    if (enrollment.expiresAt && enrollment.expiresAt < lastEnd) {
      throw new AppError(
        400,
        'ENROLLMENT_EXPIRED',
        'Enrollment expires before the scheduled session date',
      );
    }
    courseId = enrollment.courseId;
  }

  const seriesId = input.recurringCount > 1 ? `series-${randomUUID().slice(0, 8)}` : undefined;
  const provider = getMeetingProvider(input.meetingProvider);

  // Ensure student profile exists prior to transactional lock update
  await StudentProfile.updateOne(
    { userId: studentId },
    { $setOnInsert: { userId: studentId } },
    { upsert: true },
  ).catch((err: unknown) => {
    if ((err as { code?: number } | null)?.code !== 11000) throw err;
  });

  const createdSessions = await (async () => {
    try {
      return await withTransaction(async (dbSession) => {
        const txOpts = dbSession ? { session: dbSession } : undefined;

        // Force write-write conflict serialization across overlapping intervals and credit checks
        await Promise.all([
          TeacherProfile.findOneAndUpdate(
            { userId: input.teacherId },
            { $inc: { bookingLockSeq: 1 } },
            txOpts,
          ),
          StudentProfile.findOneAndUpdate(
            { userId: studentId },
            { $inc: { bookingLockSeq: 1 } },
            txOpts,
          ),
        ]);

        if (input.isTrial) {
          const existingTrial = await Session.exists({
            studentId,
            isTrial: true,
            status: { $in: ['scheduled', 'in_progress', 'completed', 'no_show_student'] },
          }).session(dbSession);
          if (existingTrial) {
            throw new AppError(
              409,
              'TRIAL_LIMIT_EXCEEDED',
              'Each student can book only one free trial session',
            );
          }
        } else if (input.enrollmentId) {
          const lockedEnrollment = await Enrollment.findOneAndUpdate(
            {
              _id: input.enrollmentId,
              studentId,
              status: 'active',
            },
            { $inc: { bookingLockSeq: 1 } },
            txOpts,
          );
          if (!lockedEnrollment) {
            throw new AppError(404, 'NOT_FOUND', 'Active enrollment not found for this student');
          }
          const balance = await getEnrollmentBalance(input.enrollmentId, dbSession);
          if (balance < input.recurringCount) {
            throw new AppError(
              409,
              'INSUFFICIENT_SESSIONS',
              `Remaining balance (${balance}) is lower than requested sessions (${input.recurringCount})`,
            );
          }
        }

        const bufferMs = policies.bufferMinutes * 60_000;
        const minRange = new Date(occurrences[0].startAt.getTime() - bufferMs);
        const maxRange = new Date(occurrences[occurrences.length - 1].endAt.getTime() + bufferMs);

        const activeSessions = await Session.find({
          isActive: true,
          $or: [{ teacherId: input.teacherId }, { studentId }],
          startAt: { $lt: maxRange },
          endAt: { $gt: minRange },
        })
          .select('teacherId studentId startAt endAt')
          .session(dbSession)
          .lean();

        for (const occ of occurrences) {
          const hasOverlap = activeSessions.some((existing) =>
            intervalsOverlapWithBuffer(
              occ.startAt,
              occ.endAt,
              existing.startAt,
              existing.endAt,
              policies.bufferMinutes,
            ),
          );
          if (hasOverlap) {
            throw new AppError(
              409,
              'SLOT_CONFLICT',
              'Selected time slot overlaps an existing active session',
            );
          }
        }

        const docsToInsert = await Promise.all(
          occurrences.map(async (occ, idx) => {
            const newId = new mongoose.Types.ObjectId();
            const title =
              input.title ??
              (input.isTrial
                ? `Trial 1-1: ${studentUser.fullName}`
                : input.recurringCount > 1
                  ? `1-1 Lesson #${idx + 1}: ${teacherUser.fullName}`
                  : `1-1 Lesson: ${teacherUser.fullName}`);
            const room = await provider.createRoom({
              sessionId: String(newId),
              title,
              manualJoinUrl: input.manualJoinUrl,
            });
            return {
              _id: newId,
              studentId,
              teacherId: input.teacherId,
              enrollmentId: input.isTrial ? undefined : input.enrollmentId,
              courseId,
              isTrial: input.isTrial,
              title,
              startAt: occ.startAt,
              endAt: occ.endAt,
              durationMinutes: input.durationMinutes,
              status: 'scheduled' as const,
              isActive: true,
              rescheduleCount: 0,
              seriesId,
              meetingProvider: room.provider,
              roomCode: room.roomCode,
              joinUrl: room.joinUrl,
            };
          }),
        );

        const inserted = [];
        for (const payload of docsToInsert) {
          const [createdDoc] = await Session.create(
            [payload],
            dbSession ? { session: dbSession } : undefined,
          );
          inserted.push(createdDoc);
        }

        if (!input.isTrial && input.enrollmentId) {
          for (const created of inserted) {
            await appendLedgerEntry(
              {
                studentId,
                enrollmentId: input.enrollmentId,
                type: 'booking_debit',
                delta: -1,
                reason: `Đặt lịch buổi học ${dayjs(created.startAt).utc().format('YYYY-MM-DD HH:mm')} UTC`,
                referenceType: 'Session',
                referenceId: String(created._id),
                actorId: actor.id,
              },
              dbSession,
            );
          }
        }

        await AuditLog.create(
          [
            {
              actorId: actor.id,
              action: 'session.booked',
              entity: 'Session',
              entityId: String(inserted[0]._id),
              after: {
                count: inserted.length,
                isTrial: input.isTrial,
                teacherId: input.teacherId,
                studentId,
              },
              ip: actor.ip,
            },
          ],
          dbSession ? { session: dbSession } : undefined,
        );

        return inserted;
      });
    } catch (err) {
      if (isDuplicateOrConflictError(err)) {
        throw new AppError(
          409,
          'SLOT_CONFLICT',
          'Selected time slot was simultaneously booked by another user',
        );
      }
      throw err;
    }
  })();

  const first = createdSessions[0];
  await Promise.allSettled([
    notifyUser({
      userId: studentId,
      type: 'booking_confirmed',
      title: 'Đặt lịch buổi học 1-1 thành công',
      body: `Đã xác nhận ${createdSessions.length} buổi học bắt đầu lúc ${first.startAt.toISOString()} với ${teacherUser.fullName}.`,
      dedupeKey: `booking:${String(first._id)}:${studentId}`,
      referenceType: 'Session',
      referenceId: String(first._id),
      sendEmail: true,
    }),
    notifyUser({
      userId: input.teacherId,
      type: 'booking_confirmed',
      title: 'Bạn có lịch dạy 1-1 mới',
      body: `Học viên ${studentUser.fullName} đã đặt ${createdSessions.length} buổi bắt đầu lúc ${first.startAt.toISOString()}.`,
      dedupeKey: `booking:${String(first._id)}:${input.teacherId}`,
      referenceType: 'Session',
      referenceId: String(first._id),
      sendEmail: true,
    }),
  ]);

  return {
    sessions: createdSessions.map((doc) => formatSessionSummary(doc)),
    seriesId,
  };
}

export async function rescheduleSession(
  sessionId: string,
  input: RescheduleSessionInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  const existingPre = await Session.findById(sessionId).lean();
  if (!existingPre) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found');
  }
  assertSessionAccess(existingPre, actor);

  const policies = await getBookingPolicies();
  const now = new Date();
  const hoursUntilStart = (existingPre.startAt.getTime() - now.getTime()) / 3_600_000;

  if (existingPre.status !== 'scheduled' || !existingPre.isActive) {
    throw new AppError(409, 'INVALID_STATE', 'Only scheduled sessions can be rescheduled');
  }
  if (actor.role !== 'admin' && existingPre.rescheduleCount >= policies.rescheduleMaxCount) {
    throw new AppError(
      409,
      'RESCHEDULE_LIMIT_EXCEEDED',
      `Maximum reschedule limit (${policies.rescheduleMaxCount}) reached`,
    );
  }
  if (actor.role !== 'admin' && hoursUntilStart < policies.rescheduleFreeHours) {
    throw new AppError(
      400,
      'RESCHEDULE_TOO_LATE',
      `Sessions can only be rescheduled at least ${policies.rescheduleFreeHours} hours before start`,
    );
  }

  const newStartAt = new Date(input.newStartAt);
  const newEndAt = new Date(newStartAt.getTime() + existingPre.durationMinutes * 60_000);
  validateBookingTiming(newStartAt, existingPre.durationMinutes, policies, now);

  const teacherProfile = await TeacherProfile.findOne({ userId: existingPre.teacherId }).lean();
  if (!teacherProfile) {
    throw new AppError(404, 'NOT_FOUND', 'Teacher profile not found');
  }
  if (!isIntervalWithinAvailability(teacherProfile, newStartAt, newEndAt)) {
    throw new AppError(
      400,
      'OUTSIDE_TEACHER_AVAILABILITY',
      'New time slot is outside teacher weekly availability',
    );
  }

  await StudentProfile.updateOne(
    { userId: existingPre.studentId },
    { $setOnInsert: { userId: existingPre.studentId } },
    { upsert: true },
  ).catch((err: unknown) => {
    if ((err as { code?: number } | null)?.code !== 11000) throw err;
  });

  const replacement = await (async () => {
    try {
      return await withTransaction(async (dbSession) => {
        const txOpts = dbSession ? { session: dbSession } : undefined;
        await Promise.all([
          TeacherProfile.findOneAndUpdate(
            { userId: existingPre.teacherId },
            { $inc: { bookingLockSeq: 1 } },
            txOpts,
          ),
          StudentProfile.findOneAndUpdate(
            { userId: existingPre.studentId },
            { $inc: { bookingLockSeq: 1 } },
            txOpts,
          ),
        ]);

        const current = await Session.findById(sessionId).session(dbSession);
        if (!current || current.status !== 'scheduled' || !current.isActive) {
          throw new AppError(409, 'INVALID_STATE', 'Session state changed concurrently');
        }

        const bufferMs = policies.bufferMinutes * 60_000;
        const activeConflicts = await Session.find({
          _id: { $ne: current._id },
          isActive: true,
          $or: [{ teacherId: current.teacherId }, { studentId: current.studentId }],
          startAt: { $lt: new Date(newEndAt.getTime() + bufferMs) },
          endAt: { $gt: new Date(newStartAt.getTime() - bufferMs) },
        })
          .select('startAt endAt')
          .session(dbSession)
          .lean();

        const hasOverlap = activeConflicts.some((other) =>
          intervalsOverlapWithBuffer(
            newStartAt,
            newEndAt,
            other.startAt,
            other.endAt,
            policies.bufferMinutes,
          ),
        );
        if (hasOverlap) {
          throw new AppError(409, 'SLOT_CONFLICT', 'New time slot conflicts with an active session');
        }

        const newId = new mongoose.Types.ObjectId();
        const provider = getMeetingProvider(current.meetingProvider);
        const room = await provider.createRoom({
          sessionId: String(newId),
          title: current.title,
          manualJoinUrl: current.meetingProvider === 'manual_link' ? current.joinUrl : undefined,
        });

        current.status = 'rescheduled';
        current.isActive = false;
        current.rescheduledToSessionId = newId;
        await current.save({ session: dbSession ?? undefined });

        const [created] = await Session.create(
          [
            {
              _id: newId,
              studentId: current.studentId,
              teacherId: current.teacherId,
              enrollmentId: current.enrollmentId,
              courseId: current.courseId,
              isTrial: current.isTrial,
              title: current.title,
              startAt: newStartAt,
              endAt: newEndAt,
              durationMinutes: current.durationMinutes,
              status: 'scheduled',
              isActive: true,
              rescheduleCount: current.rescheduleCount + 1,
              rescheduledFromSessionId: current._id,
              seriesId: current.seriesId,
              meetingProvider: room.provider,
              roomCode: room.roomCode,
              joinUrl: room.joinUrl,
            },
          ],
          dbSession ? { session: dbSession } : undefined,
        );

        await AuditLog.create(
          [
            {
              actorId: actor.id,
              action: 'session.rescheduled',
              entity: 'Session',
              entityId: String(created._id),
              before: { sessionId: String(current._id), startAt: current.startAt },
              after: { startAt: newStartAt, reason: input.reason },
              ip: actor.ip,
            },
          ],
          dbSession ? { session: dbSession } : undefined,
        );

        return created;
      });
    } catch (err) {
      if (isDuplicateOrConflictError(err)) {
        throw new AppError(409, 'SLOT_CONFLICT', 'Target reschedule slot is already occupied');
      }
      throw err;
    }
  })();

  await Promise.allSettled([
    notifyUser({
      userId: String(replacement.studentId),
      type: 'session_rescheduled',
      title: 'Lịch buổi học đã được dời',
      body: `Buổi học được chuyển sang ${replacement.startAt.toISOString()}.`,
      dedupeKey: `reschedule:${String(replacement._id)}:student`,
      referenceType: 'Session',
      referenceId: String(replacement._id),
      sendEmail: true,
    }),
    notifyUser({
      userId: String(replacement.teacherId),
      type: 'session_rescheduled',
      title: 'Buổi dạy 1-1 đã đổi giờ',
      body: `Buổi học được dời sang ${replacement.startAt.toISOString()}.`,
      dedupeKey: `reschedule:${String(replacement._id)}:teacher`,
      referenceType: 'Session',
      referenceId: String(replacement._id),
      sendEmail: true,
    }),
  ]);

  return formatSessionSummary(replacement);
}

export async function cancelSession(
  sessionId: string,
  input: CancelSessionInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  const existingPre = await Session.findById(sessionId).lean();
  if (!existingPre) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found');
  }
  assertSessionAccess(existingPre, actor);

  if (existingPre.status !== 'scheduled' || !existingPre.isActive) {
    throw new AppError(409, 'INVALID_STATE', 'Only scheduled sessions can be cancelled');
  }

  const policies = await getBookingPolicies();
  const now = new Date();
  const hoursBefore = (existingPre.startAt.getTime() - now.getTime()) / 3_600_000;

  const cancelledStatus: SessionStatus =
    actor.role === 'teacher'
      ? 'cancelled_by_teacher'
      : actor.role === 'admin'
        ? 'cancelled_by_admin'
        : 'cancelled_by_student';

  const result = await withTransaction(async (dbSession) => {
    const doc = await Session.findById(sessionId).session(dbSession);
    if (!doc || doc.status !== 'scheduled' || !doc.isActive) {
      throw new AppError(409, 'INVALID_STATE', 'Session is no longer scheduled');
    }

    doc.status = cancelledStatus;
    doc.isActive = false;
    doc.cancelReason = input.reason;
    doc.cancelledBy = actor.id as unknown as typeof doc.cancelledBy;
    doc.cancelledAt = now;
    await doc.save({ session: dbSession ?? undefined });

    let ledgerEffect: 'refunded' | 'forfeited_late_cancel' | 'makeup_credited' | 'trial_no_charge' =
      'trial_no_charge';

    if (!doc.isTrial && doc.enrollmentId) {
      if (cancelledStatus === 'cancelled_by_student') {
        if (hoursBefore >= policies.cancelFreeHours) {
          await appendLedgerEntry(
            {
              studentId: doc.studentId,
              enrollmentId: doc.enrollmentId,
              type: 'cancel_refund',
              delta: 1,
              reason: `Hoàn buổi huỷ đúng hạn (>= ${policies.cancelFreeHours}h)`,
              referenceType: 'Session',
              referenceId: String(doc._id),
              actorId: actor.id,
            },
            dbSession,
          );
          ledgerEffect = 'refunded';
        } else {
          // Debit (-1) happened at booking time; late cancel retains that debit cleanly.
          ledgerEffect = 'forfeited_late_cancel';
        }
      } else {
        await appendLedgerEntry(
          {
            studentId: doc.studentId,
            enrollmentId: doc.enrollmentId,
            type: 'makeup_credit',
            delta: 1,
            reason:
              cancelledStatus === 'cancelled_by_teacher'
                ? 'Hoàn +1 buổi học bù do giáo viên huỷ lịch'
                : 'Hoàn +1 buổi do quản trị viên huỷ lịch',
            referenceType: 'Session',
            referenceId: String(doc._id),
            actorId: actor.id,
          },
          dbSession,
        );
        ledgerEffect = 'makeup_credited';
      }
    }

    await AuditLog.create(
      [
        {
          actorId: actor.id,
          action: 'session.cancelled',
          entity: 'Session',
          entityId: String(doc._id),
          after: {
            status: cancelledStatus,
            hoursBefore: Number(hoursBefore.toFixed(2)),
            ledgerEffect,
            reason: input.reason,
          },
          ip: actor.ip,
        },
      ],
      dbSession ? { session: dbSession } : undefined,
    );

    const remainingSessions = doc.enrollmentId
      ? await getEnrollmentBalance(String(doc.enrollmentId), dbSession)
      : 0;

    return {
      session: formatSessionSummary(doc),
      ledgerEffect,
      remainingSessions,
    };
  });

  const peerUserId =
    actor.role === 'teacher' ? String(existingPre.studentId) : String(existingPre.teacherId);

  await Promise.allSettled([
    notifyUser({
      userId: String(existingPre.studentId),
      type: 'session_cancelled',
      title: 'Thông báo huỷ buổi học',
      body: `Buổi học lúc ${existingPre.startAt.toISOString()} đã chuyển sang ${cancelledStatus}.`,
      dedupeKey: `cancel:${sessionId}:student`,
      referenceType: 'Session',
      referenceId: sessionId,
      sendEmail: true,
    }),
    notifyUser({
      userId: peerUserId,
      type: 'session_cancelled',
      title: 'Cập nhật huỷ lịch buổi học',
      body: `Buổi học lúc ${existingPre.startAt.toISOString()} đã được huỷ (${cancelledStatus}).`,
      dedupeKey: `cancel:${sessionId}:peer:${peerUserId}`,
      referenceType: 'Session',
      referenceId: sessionId,
      sendEmail: true,
    }),
  ]);

  return result;
}

export async function generateSessionIcs(
  sessionId: string,
  actor: { id: string; role: UserRole },
): Promise<{ filename: string; content: string }> {
  const doc = await Session.findById(sessionId).lean();
  if (!doc) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found');
  }
  assertSessionAccess(doc, actor);

  const fmtUtc = (d: Date) => dayjs(d).utc().format('YYYYMMDD[T]HHmmss[Z]');
  const cleanTitle = doc.title.replace(/[\r\n,;]/g, ' ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WebEnglish 1-1//Session Calendar//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${String(doc._id)}@webenglish.local`,
    `DTSTAMP:${fmtUtc(new Date())}`,
    `DTSTART:${fmtUtc(doc.startAt)}`,
    `DTEND:${fmtUtc(doc.endAt)}`,
    `SUMMARY:${cleanTitle}`,
    `DESCRIPTION:Lop hoc tieng Anh 1-1 (${doc.durationMinutes}m). Link tham gia: ${doc.joinUrl}`,
    `URL:${doc.joinUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return {
    filename: `session-${String(doc._id)}.ics`,
    content: `${lines.join('\r\n')}\r\n`,
  };
}
