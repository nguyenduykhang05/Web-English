import cron, { type ScheduledTask } from 'node-cron';
import { withTransaction } from '../config/db.js';
import { Enrollment } from '../modules/enrollments/models/enrollment.model.js';
import { appendLedgerEntry, getEnrollmentBalance } from '../modules/ledger/services/ledger.service.js';
import { type NotificationType } from '../modules/notifications/models/notification.model.js';
import { notifyUser } from '../modules/notifications/services/notification.service.js';
import { createQualityAlertIdempotent } from '../modules/quality/services/quality.service.js';
import { SessionReport } from '../modules/reports/models/sessionReport.model.js';
import { Session } from '../modules/sessions/models/session.model.js';
import { AuditLog } from '../modules/settings/models/auditLog.model.js';
import { getBookingPolicies } from '../modules/settings/services/policy.service.js';
import { User } from '../modules/users/models/user.model.js';

function reminderTypeForOffset(offsetMinutes: number): NotificationType {
  if (offsetMinutes >= 720) return 'session_reminder_24h';
  if (offsetMinutes >= 60) return 'session_reminder_2h';
  return 'session_reminder_10m';
}

function reminderLabel(offsetMinutes: number): string {
  if (offsetMinutes >= 60) {
    const hrs = Math.round(offsetMinutes / 60);
    return `${hrs} giờ`;
  }
  return `${offsetMinutes} phút`;
}

/**
 * Sends idempotent session reminders (default 24h, 2h, 10m from Settings).
 * Guaranteed no duplicate alerts/emails via Notification.dedupeKey unique index.
 */
export async function runSessionRemindersJob(now = new Date()): Promise<{
  checked: number;
  createdCount: number;
}> {
  const policies = await getBookingPolicies();
  let checked = 0;
  let createdCount = 0;

  for (const offsetMin of policies.reminderOffsetsMinutes) {
    const windowLowMin =
      offsetMin <= 15 ? 0 : Math.max(0, offsetMin - Math.max(15, Math.round(offsetMin * 0.25)));
    const fromAt = new Date(now.getTime() + windowLowMin * 60_000);
    const toAt = new Date(now.getTime() + offsetMin * 60_000);

    const upcoming = await Session.find({
      status: 'scheduled',
      isActive: true,
      startAt: { $gt: fromAt, $lte: toAt },
    })
      .select('studentId teacherId startAt title')
      .lean();

    checked += upcoming.length;
    const type = reminderTypeForOffset(offsetMin);
    const label = reminderLabel(offsetMin);

    for (const ses of upcoming) {
      const recipients = [String(ses.studentId), String(ses.teacherId)];
      for (const userId of recipients) {
        const res = await notifyUser({
          userId,
          type,
          title: `Nhắc lịch học 1-1 trước ${label}`,
          body: `Buổi học "${ses.title}" sẽ bắt đầu lúc ${ses.startAt.toISOString()}.`,
          dedupeKey: `reminder:${String(ses._id)}:${offsetMin}:${userId}`,
          referenceType: 'Session',
          referenceId: String(ses._id),
          sendEmail: true,
        });
        if (res.created) createdCount += 1;
      }
    }
  }

  return { checked, createdCount };
}

/**
 * Automatically transitions overdue scheduled sessions past policies.noShowMinutes:
 * - If teacher joined & student absent -> no_show_student (booked debit remains forfeited)
 * - If teacher absent -> no_show_teacher (+1 makeup_credit refunded if paid enrollment + alert admin)
 */
export async function runNoShowSweeperJob(now = new Date()): Promise<{
  processed: number;
}> {
  const policies = await getBookingPolicies();
  const cutoff = new Date(now.getTime() - policies.noShowMinutes * 60_000);

  const overdueSessions = await Session.find({
    status: 'scheduled',
    isActive: true,
    startAt: { $lte: cutoff },
  })
    .select('_id')
    .lean();

  let processed = 0;

  for (const stub of overdueSessions) {
    const outcome = await withTransaction(async (dbSession) => {
      const doc = await Session.findById(stub._id).session(dbSession);
      if (!doc || doc.status !== 'scheduled' || !doc.isActive) {
        return null;
      }

      if (doc.teacherJoinedAt && doc.studentJoinedAt) {
        doc.status = 'in_progress';
        doc.startedAt = doc.startedAt ?? now;
        await doc.save({ session: dbSession ?? undefined });
        return { kind: 'in_progress' as const, doc };
      }

      if (doc.teacherJoinedAt && !doc.studentJoinedAt) {
        doc.status = 'no_show_student';
        doc.isActive = false;
        doc.endedAt = now;
        await doc.save({ session: dbSession ?? undefined });

        await AuditLog.create(
          [
            {
              action: 'session.no_show_student',
              entity: 'Session',
              entityId: String(doc._id),
              after: { cutoff, studentId: String(doc.studentId) },
            },
          ],
          dbSession ? { session: dbSession } : undefined,
        );
        return { kind: 'no_show_student' as const, doc };
      }

      // Teacher absent past no-show threshold -> protect student with makeup credit
      doc.status = 'no_show_teacher';
      doc.isActive = false;
      doc.endedAt = now;
      await doc.save({ session: dbSession ?? undefined });

      if (!doc.isTrial && doc.enrollmentId) {
        await appendLedgerEntry(
          {
            studentId: doc.studentId,
            enrollmentId: doc.enrollmentId,
            type: 'makeup_credit',
            delta: 1,
            reason: `Hoàn +1 buổi học bù do giáo viên vắng quá ${policies.noShowMinutes} phút`,
            referenceType: 'Session',
            referenceId: String(doc._id),
          },
          dbSession,
        );
      }

      await AuditLog.create(
        [
          {
            action: 'session.no_show_teacher',
            entity: 'Session',
            entityId: String(doc._id),
            after: { cutoff, teacherId: String(doc.teacherId) },
          },
        ],
        dbSession ? { session: dbSession } : undefined,
      );

      return { kind: 'no_show_teacher' as const, doc };
    });

    if (!outcome) continue;
    processed += 1;

    if (outcome.kind === 'no_show_student') {
      await notifyUser({
        userId: String(outcome.doc.studentId),
        type: 'session_no_show',
        title: 'Ghi nhận vắng mặt buổi học (no_show_student)',
        body: `Bạn đã không tham gia buổi học quá ${policies.noShowMinutes} phút theo quy định.`,
        dedupeKey: `noshow:${String(outcome.doc._id)}:student`,
        referenceType: 'Session',
        referenceId: String(outcome.doc._id),
        sendEmail: true,
      });
    } else if (outcome.kind === 'no_show_teacher') {
      const admins = await User.find({ role: 'admin', status: 'active' }).select('_id').lean();
      await Promise.allSettled([
        notifyUser({
          userId: String(outcome.doc.studentId),
          type: 'session_no_show',
          title: 'Đã hoàn +1 buổi học bù (giáo viên vắng)',
          body: 'Giáo viên không vào lớp đúng giờ. Hệ thống đã tự động cộng +1 buổi học bù vào sổ cái của bạn.',
          dedupeKey: `noshow:${String(outcome.doc._id)}:student`,
          referenceType: 'Session',
          referenceId: String(outcome.doc._id),
          sendEmail: true,
        }),
        notifyUser({
          userId: String(outcome.doc.teacherId),
          type: 'session_no_show',
          title: 'Cảnh báo vắng mặt lớp dạy 1-1',
          body: `Hệ thống ghi nhận bạn vắng mặt buổi học ${String(outcome.doc._id)} quá ${policies.noShowMinutes} phút.`,
          dedupeKey: `noshow:${String(outcome.doc._id)}:teacher`,
          referenceType: 'Session',
          referenceId: String(outcome.doc._id),
          sendEmail: true,
        }),
        ...admins.map((adm) =>
          notifyUser({
            userId: String(adm._id),
            type: 'session_no_show',
            title: 'Báo động: Giáo viên no-show lớp 1-1',
            body: `Buổi học ${String(outcome.doc._id)} bị đánh dấu no_show_teacher và đã hoàn buổi cho học viên.`,
            dedupeKey: `noshow:${String(outcome.doc._id)}:admin:${String(adm._id)}`,
            referenceType: 'Session',
            referenceId: String(outcome.doc._id),
          }),
        ),
        createQualityAlertIdempotent({
          type: 'no_show_teacher',
          severity: 'high',
          title: 'Giáo viên vắng lớp (No-show)',
          detail: `Buổi học ${String(outcome.doc._id)} quá ${policies.noShowMinutes} phút mà giáo viên chưa vào phòng.`,
          teacherId: String(outcome.doc.teacherId),
          studentId: String(outcome.doc.studentId),
          sessionId: String(outcome.doc._id),
          dedupeKey: `alert:no_show_teacher:${String(outcome.doc._id)}`,
        }),
      ]);
    }
  }

  return { processed };
}

/**
 * Flags completed sessions missing teacher report past policies.reportDueHours (idempotent).
 */
export async function runOverdueReportsSweeperJob(now = new Date()): Promise<{
  flaggedCount: number;
}> {
  const policies = await getBookingPolicies();
  const cutoff = new Date(now.getTime() - policies.reportDueHours * 3_600_000);

  const overdueSessions = await Session.find({
    status: 'completed',
    $or: [
      { endedAt: { $lte: cutoff } },
      { endedAt: { $exists: false }, endAt: { $lte: cutoff } },
    ],
  })
    .select('_id teacherId studentId title')
    .lean();

  if (overdueSessions.length === 0) return { flaggedCount: 0 };

  const sessionIds = overdueSessions.map((s) => s._id);
  const submitted = await SessionReport.find({ sessionId: { $in: sessionIds } })
    .select('sessionId')
    .lean();
  const submittedSet = new Set(submitted.map((r) => String(r.sessionId)));

  let flaggedCount = 0;
  for (const s of overdueSessions) {
    const sid = String(s._id);
    if (submittedSet.has(sid)) continue;
    const res = await createQualityAlertIdempotent({
      type: 'report_overdue',
      severity: 'medium',
      title: `Quá hạn báo cáo ${policies.reportDueHours}h`,
      detail: `Buổi học "${s.title}" (${sid}) đã hoàn tất quá ${policies.reportDueHours} giờ nhưng chưa nộp báo cáo.`,
      teacherId: String(s.teacherId),
      studentId: String(s.studentId),
      sessionId: sid,
      dedupeKey: `alert:report_overdue:${sid}`,
    });
    if (res.created) flaggedCount += 1;
  }

  return { flaggedCount };
}

/**
 * Expires overdue active enrollments (appending idempotent 'expire' ledger entry to zero balance)
 * and automatically unfreezes paused enrollments whose freezeUntil timestamp has elapsed.
 */
export async function runExpiredEnrollmentsJob(now = new Date()): Promise<{
  expiredCount: number;
  unfrozenCount: number;
}> {
  const unfreezeResult = await Enrollment.updateMany(
    {
      status: 'paused',
      freezeUntil: { $lte: now },
    },
    {
      $set: { status: 'active' },
      $unset: { freezeUntil: '' },
    },
  );

  const expiredEnrollments = await Enrollment.find({
    status: 'active',
    expiresAt: { $lte: now },
  })
    .select('_id')
    .lean();

  let expiredCount = 0;

  for (const stub of expiredEnrollments) {
    const didExpire = await withTransaction(async (dbSession) => {
      const enr = await Enrollment.findById(stub._id).session(dbSession);
      if (!enr || enr.status !== 'active' || !enr.expiresAt || enr.expiresAt > now) {
        return false;
      }
      const remaining = await getEnrollmentBalance(String(enr._id), dbSession);
      if (remaining > 0) {
        await appendLedgerEntry(
          {
            studentId: enr.studentId,
            enrollmentId: enr._id,
            type: 'expire',
            delta: -remaining,
            reason: `Hết hạn gói học vào ${now.toISOString().slice(0, 10)} (đưa số dư về 0)`,
            referenceType: 'Enrollment',
            referenceId: String(enr._id),
          },
          dbSession,
        );
      }
      enr.status = 'completed';
      await enr.save({ session: dbSession ?? undefined });
      await AuditLog.create(
        [
          {
            action: 'enrollment.expired',
            entity: 'Enrollment',
            entityId: String(enr._id),
            after: { expiredRemainingSessions: remaining },
          },
        ],
        dbSession ? { session: dbSession } : undefined,
      );
      return true;
    });
    if (didExpire) expiredCount += 1;
  }

  return {
    expiredCount,
    unfrozenCount: unfreezeResult.modifiedCount ?? 0,
  };
}

export function startBackgroundJobs(): ScheduledTask {
  return cron.schedule('* * * * *', async () => {
    try {
      await runSessionRemindersJob();
      await runNoShowSweeperJob();
      await runOverdueReportsSweeperJob();
      await runExpiredEnrollmentsJob();
    } catch (err) {
      console.error('Background session job failed:', err);
    }
  });
}
