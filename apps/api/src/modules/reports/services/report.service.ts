import mongoose from 'mongoose';
import type {
  CreateSessionReportInput,
  CreateSessionReviewInput,
  UserRole,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { notifyUser } from '../../notifications/services/notification.service.js';
import { createQualityAlertIdempotent } from '../../quality/services/quality.service.js';
import { Session } from '../../sessions/models/session.model.js';
import { assertSessionAccess } from '../../sessions/services/session.service.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { getBookingPolicies } from '../../settings/services/policy.service.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { ProgressSnapshot } from '../models/progressSnapshot.model.js';
import { SessionReport } from '../models/sessionReport.model.js';
import { SessionReview } from '../models/sessionReview.model.js';
import { applyStudentSkillUpdate } from './skillMastery.helper.js';

export async function submitOrUpdateSessionReport(
  sessionId: string,
  input: CreateSessionReportInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  const session = await Session.findById(sessionId).lean();
  if (!session) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found');
  }
  if (actor.role === 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot write teacher session reports');
  }
  if (actor.role === 'teacher' && String(session.teacherId) !== actor.id) {
    throw new AppError(403, 'FORBIDDEN', 'You are not the assigned teacher for this session');
  }
  if (session.status !== 'completed') {
    throw new AppError(409, 'INVALID_STATE', 'Reports can only be submitted after session completion');
  }

  const policies = await getBookingPolicies();
  const now = new Date();
  const baseEndedAt = session.endedAt ?? session.endAt;
  const dueAt = new Date(baseEndedAt.getTime() + policies.reportDueHours * 3_600_000);

  const existing = await SessionReport.findOne({ sessionId });
  if (existing) {
    const hoursSinceSubmitted = (now.getTime() - existing.submittedAt.getTime()) / 3_600_000;
    if (actor.role !== 'admin' && hoursSinceSubmitted > policies.reportEditWindowHours) {
      throw new AppError(
        403,
        'REPORT_EDIT_EXPIRED',
        `Reports can only be edited within ${policies.reportEditWindowHours} hours after submission`,
      );
    }
  }

  const vocabItems =
    input.vocabItems && input.vocabItems.length > 0
      ? input.vocabItems
      : session.quickNotes.map((q) => ({
          term: q.term,
          correction: q.correction,
          contextNote: q.contextNote,
        }));

  let report;
  if (existing) {
    existing.summary = input.summary;
    existing.strengths = input.strengths;
    existing.weaknesses = input.weaknesses;
    existing.nextFocus = input.nextFocus;
    existing.homeworkSuggestion = input.homeworkSuggestion;
    if (input.skillRatings) existing.skillRatings = input.skillRatings;
    existing.vocabItems = vocabItems;
    existing.lastEditedAt = now;
    report = await existing.save();
  } else {
    report = await SessionReport.create({
      sessionId,
      teacherId: session.teacherId,
      studentId: session.studentId,
      summary: input.summary,
      strengths: input.strengths,
      weaknesses: input.weaknesses,
      nextFocus: input.nextFocus,
      homeworkSuggestion: input.homeworkSuggestion,
      skillRatings: input.skillRatings,
      vocabItems,
      submittedAt: now,
      dueAt,
      submittedOnTime: now <= dueAt,
    });
  }

  let progressUpdate: Awaited<ReturnType<typeof applyStudentSkillUpdate>> | undefined;
  if (input.skillRatings && Object.keys(input.skillRatings).length > 0) {
    progressUpdate = await applyStudentSkillUpdate({
      studentId: String(session.studentId),
      sessionId,
      ratings: input.skillRatings,
      alpha: policies.skillEmaAlpha,
      source: 'report',
      mode: 'ema',
    });
  }

  await AuditLog.create({
    actorId: actor.id,
    action: existing ? 'session_report.updated' : 'session_report.submitted',
    entity: 'SessionReport',
    entityId: String(report._id),
    after: {
      sessionId,
      submittedOnTime: report.submittedOnTime,
      vocabCount: vocabItems.length,
    },
    ip: actor.ip,
  });

  if (!existing) {
    await notifyUser({
      userId: String(session.studentId),
      type: 'system',
      title: 'Giáo viên đã gửi báo cáo buổi học',
      body: `Báo cáo chi tiết & ${vocabItems.length} ghi chú từ vựng đã sẵn sàng để bạn xem lại.`,
      dedupeKey: `report:${sessionId}`,
      referenceType: 'Session',
      referenceId: sessionId,
      sendEmail: true,
    });
  }

  return {
    id: String(report._id),
    sessionId: String(report.sessionId),
    summary: report.summary,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    nextFocus: report.nextFocus,
    homeworkSuggestion: report.homeworkSuggestion,
    skillRatings: report.skillRatings,
    vocabItems: report.vocabItems,
    submittedAt: report.submittedAt,
    dueAt: report.dueAt,
    submittedOnTime: report.submittedOnTime,
    progressUpdate,
  };
}

export async function getSessionReport(
  sessionId: string,
  actor: { id: string; role: UserRole },
) {
  const session = await Session.findById(sessionId).select('studentId teacherId').lean();
  if (!session) throw new AppError(404, 'NOT_FOUND', 'Session not found');
  assertSessionAccess(session, actor);

  const [report, review] = await Promise.all([
    SessionReport.findOne({ sessionId }).lean(),
    SessionReview.findOne({ sessionId }).lean(),
  ]);

  return { report, review };
}

export async function submitSessionReview(
  sessionId: string,
  input: CreateSessionReviewInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role !== 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Only the student of the session can submit a review');
  }

  const session = await Session.findById(sessionId).lean();
  if (!session) throw new AppError(404, 'NOT_FOUND', 'Session not found');
  if (String(session.studentId) !== actor.id) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied to review another student session');
  }
  if (session.status !== 'completed') {
    throw new AppError(409, 'INVALID_STATE', 'Reviews are accepted only for completed sessions');
  }

  const existing = await SessionReview.exists({ sessionId });
  if (existing) {
    throw new AppError(409, 'ALREADY_REVIEWED', 'You have already reviewed this session');
  }

  const policies = await getBookingPolicies();
  const now = new Date();
  const endedAt = session.endedAt ?? session.endAt;
  const daysElapsed = (now.getTime() - endedAt.getTime()) / 86_400_000;
  if (daysElapsed > policies.reviewWindowDays) {
    throw new AppError(
      400,
      'REVIEW_WINDOW_EXPIRED',
      `Session reviews must be submitted within ${policies.reviewWindowDays} days`,
    );
  }

  const review = await SessionReview.create({
    sessionId,
    studentId: session.studentId,
    teacherId: session.teacherId,
    rating: input.rating,
    comment: input.comment,
    tags: input.tags,
    submittedAt: now,
  });

  // Recompute teacher aggregate rating directly from reviews collection
  const agg = await SessionReview.aggregate<{ avg: number; count: number }>([
    { $match: { teacherId: new mongoose.Types.ObjectId(String(session.teacherId)) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const ratingAvg = agg[0] ? Number(agg[0].avg.toFixed(2)) : input.rating;
  const reviewsCount = agg[0]?.count ?? 1;

  await TeacherProfile.updateOne(
    { userId: session.teacherId },
    { $set: { ratingAvg, reviewsCount } },
  );

  if (input.rating <= policies.lowRatingAlertThreshold) {
    await createQualityAlertIdempotent({
      type: 'low_rating',
      severity: 'high',
      title: `Đánh giá thấp (${input.rating}/5 sao)`,
      detail: `Học viên đánh giá ${input.rating}/5 cho buổi học ${sessionId}. Ghi chú: ${input.comment ?? 'Không có'}`,
      teacherId: String(session.teacherId),
      studentId: String(session.studentId),
      sessionId,
      dedupeKey: `alert:low_rating:${sessionId}`,
    });
  }

  await AuditLog.create({
    actorId: actor.id,
    action: 'session_review.submitted',
    entity: 'SessionReview',
    entityId: String(review._id),
    after: { sessionId, rating: input.rating, teacherRatingAvg: ratingAvg },
    ip: actor.ip,
  });

  return {
    id: String(review._id),
    rating: review.rating,
    comment: review.comment,
    tags: review.tags,
    teacherRatingAvg: ratingAvg,
    teacherReviewsCount: reviewsCount,
  };
}

export async function listStudentProgress(
  studentId: string,
  actor: { id: string; role: UserRole },
) {
  if (actor.role === 'student' && actor.id !== studentId) {
    throw new AppError(403, 'FORBIDDEN', 'Access denied to another student progress');
  }
  if (actor.role === 'teacher') {
    const [hasEnrollment, hasSession] = await Promise.all([
      Enrollment.exists({ studentId, teacherId: actor.id }),
      Session.exists({ studentId, teacherId: actor.id }),
    ]);
    if (!hasEnrollment && !hasSession) {
      throw new AppError(403, 'FORBIDDEN', 'Teacher is not assigned to this student');
    }
  }

  const [profile, snapshots, recentReports] = await Promise.all([
    StudentProfile.findOne({ userId: studentId }).select('currentCefr skillScores weaknesses').lean(),
    ProgressSnapshot.find({ studentId }).sort({ capturedAt: 1 }).limit(30).lean(),
    SessionReport.find({ studentId }).sort({ submittedAt: -1 }).limit(10).lean(),
  ]);

  return {
    studentId,
    currentCefr: profile?.currentCefr ?? 'B1',
    skillScores: profile?.skillScores ?? {
      listening: 50,
      speaking: 45,
      reading: 50,
      writing: 45,
      vocabulary: 50,
      grammar: 50,
      pronunciation: 45,
    },
    weaknesses: profile?.weaknesses ?? [],
    snapshots: snapshots.map((s) => ({
      id: String(s._id),
      source: s.source,
      cefrLevel: s.cefrLevel,
      overallScore: s.overallScore,
      skillScores: s.skillScores,
      capturedAt: s.capturedAt,
    })),
    recentReports: recentReports.map((r) => ({
      id: String(r._id),
      sessionId: String(r.sessionId),
      summary: r.summary,
      vocabItems: r.vocabItems,
      submittedAt: r.submittedAt,
    })),
  };
}
