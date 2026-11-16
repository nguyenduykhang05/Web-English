import dayjs from 'dayjs';
import mongoose from 'mongoose';
import { getStudentBalance } from '../../ledger/services/ledger.service.js';
import { Invoice } from '../../payments/models/invoice.model.js';
import { listPayrolls } from '../../payroll/services/payroll.service.js';
import {
  getTeacherQualityMetrics,
  listQualityAlerts,
} from '../../quality/services/quality.service.js';
import { ProgressSnapshot } from '../../reports/models/progressSnapshot.model.js';
import { SessionReport } from '../../reports/models/sessionReport.model.js';
import { SessionReview } from '../../reports/models/sessionReview.model.js';
import { Session } from '../../sessions/models/session.model.js';
import { getBookingPolicies } from '../../settings/services/policy.service.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { User } from '../../users/models/user.model.js';

export async function getStudentDashboard(studentId: string) {
  const [remainingSessions, upcoming, completedSessions, profile, snapshots, reports] =
    await Promise.all([
      getStudentBalance(studentId),
      Session.find({ studentId, status: 'scheduled', isActive: true })
        .sort({ startAt: 1 })
        .limit(5)
        .lean(),
      Session.find({ studentId, status: 'completed' })
        .sort({ endedAt: -1 })
        .limit(10)
        .select('_id title startAt endedAt endAt teacherId')
        .lean(),
      StudentProfile.findOne({ userId: studentId }).select('currentCefr skillScores goal').lean(),
      ProgressSnapshot.find({ studentId }).sort({ capturedAt: 1 }).limit(12).lean(),
      SessionReport.find({ studentId }).sort({ submittedAt: -1 }).limit(5).lean(),
    ]);

  const completedIds = completedSessions.map((s) => s._id);
  const existingReviews = await SessionReview.find({ sessionId: { $in: completedIds } })
    .select('sessionId')
    .lean();
  const reviewedSet = new Set(existingReviews.map((r) => String(r.sessionId)));
  const policies = await getBookingPolicies();
  const reviewCutoff = Date.now() - policies.reviewWindowDays * 86_400_000;

  const pendingReviewSessions = completedSessions.filter((s) => {
    const ended = (s.endedAt ?? s.endAt).getTime();
    return !reviewedSet.has(String(s._id)) && ended >= reviewCutoff;
  });

  return {
    remainingSessions,
    currentCefr: profile?.currentCefr ?? 'B1',
    goal: profile?.goal,
    skillScores: profile?.skillScores,
    upcomingSessions: upcoming.map((s) => ({
      id: String(s._id),
      title: s.title,
      startAt: s.startAt,
      endAt: s.endAt,
      durationMinutes: s.durationMinutes,
      roomCode: s.roomCode,
    })),
    pendingReviewSessions: pendingReviewSessions.map((s) => ({
      id: String(s._id),
      title: s.title,
      startAt: s.startAt,
    })),
    recentReports: reports.map((r) => ({
      id: String(r._id),
      sessionId: String(r.sessionId),
      summary: r.summary,
      submittedAt: r.submittedAt,
    })),
    progressSnapshots: snapshots.map((sp) => ({
      id: String(sp._id),
      overallScore: sp.overallScore,
      cefrLevel: sp.cefrLevel,
      capturedAt: sp.capturedAt,
    })),
  };
}

export async function getTeacherDashboard(teacherId: string) {
  const teacherObjectId = new mongoose.Types.ObjectId(teacherId);
  const currentMonth = dayjs().format('YYYY-MM');

  const [upcoming, completed, metrics, payrolls] = await Promise.all([
    Session.find({ teacherId: teacherObjectId, status: 'scheduled', isActive: true })
      .sort({ startAt: 1 })
      .limit(10)
      .lean(),
    Session.find({ teacherId: teacherObjectId, status: 'completed' })
      .sort({ endedAt: -1 })
      .limit(30)
      .select('_id title studentId startAt endAt endedAt')
      .lean(),
    getTeacherQualityMetrics(teacherId),
    listPayrolls({ id: teacherId, role: 'teacher' }, { month: currentMonth }),
  ]);

  const completedIds = completed.map((s) => s._id);
  const submittedReports = await SessionReport.find({ sessionId: { $in: completedIds } })
    .select('sessionId')
    .lean();
  const submittedSet = new Set(submittedReports.map((r) => String(r.sessionId)));

  const policies = await getBookingPolicies();
  const pendingReports = completed
    .filter((s) => !submittedSet.has(String(s._id)))
    .map((s) => {
      const base = s.endedAt ?? s.endAt;
      const dueAt = new Date(base.getTime() + policies.reportDueHours * 3_600_000);
      return {
        sessionId: String(s._id),
        title: s.title,
        startAt: s.startAt,
        dueAt,
        overdue: Date.now() > dueAt.getTime(),
      };
    });

  return {
    metrics,
    upcomingSessions: upcoming.map((s) => ({
      id: String(s._id),
      title: s.title,
      studentId: String(s.studentId),
      startAt: s.startAt,
      endAt: s.endAt,
      roomCode: s.roomCode,
    })),
    pendingReports,
    currentMonthPayroll: payrolls[0] ?? null,
  };
}

export async function getAdminDashboard() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const monthStart = dayjs(now).startOf('month').toDate();

  const [
    activeStudentsCount,
    activeTeachersCount,
    completed30d,
    paidInvoicesMonth,
    unpaidInvoicesCount,
    alertsSummary,
    recentCompletedSessions,
  ] = await Promise.all([
    User.countDocuments({ role: 'student', status: 'active' }),
    User.countDocuments({ role: 'teacher', status: 'active' }),
    Session.countDocuments({ status: 'completed', startAt: { $gte: thirtyDaysAgo } }),
    Invoice.aggregate<{ total: number }>([
      { $match: { status: 'paid', paidAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$totalVnd' } } },
    ]),
    Invoice.countDocuments({ status: 'unpaid' }),
    listQualityAlerts({ limit: 10 }),
    Session.find({ status: 'completed', startAt: { $gte: thirtyDaysAgo } })
      .select('startAt')
      .lean(),
  ]);

  // Bucket 30d completed sessions into 4 weekly bins
  const weekBuckets = [0, 0, 0, 0];
  for (const s of recentCompletedSessions) {
    const daysAgo = Math.floor((now.getTime() - s.startAt.getTime()) / 86_400_000);
    const idx = Math.min(3, Math.max(0, 3 - Math.floor(daysAgo / 7)));
    weekBuckets[idx] += 1;
  }

  return {
    kpis: {
      activeStudentsCount,
      activeTeachersCount,
      completedSessions30d: completed30d,
      monthlyRevenueVnd: paidInvoicesMonth[0]?.total ?? 0,
      pendingInvoicesCount: unpaidInvoicesCount,
      openAlertsCount: alertsSummary.openCount,
    },
    weeklyThroughput: weekBuckets.map((count, i) => ({
      week: `Tuần ${i + 1}`,
      sessions: count,
    })),
    alerts: alertsSummary.items,
  };
}
