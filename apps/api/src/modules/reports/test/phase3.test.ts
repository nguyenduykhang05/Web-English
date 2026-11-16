import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { createApp } from '../../../app.js';
import { runOverdueReportsSweeperJob } from '../../../jobs/sessionJobs.js';
import { User } from '../../users/models/user.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { Course } from '../../courses/models/course.model.js';
import { CoursePackage } from '../../courses/models/coursePackage.model.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { Invoice } from '../../payments/models/invoice.model.js';
import { Payment } from '../../payments/models/payment.model.js';
import { SessionLedger } from '../../ledger/models/sessionLedger.model.js';
import { appendLedgerEntry, getEnrollmentBalance } from '../../ledger/services/ledger.service.js';
import { Session } from '../../sessions/models/session.model.js';
import { SessionReport } from '../models/sessionReport.model.js';
import { SessionReview } from '../models/sessionReview.model.js';
import { ProgressSnapshot } from '../models/progressSnapshot.model.js';
import { QualityAlert } from '../../quality/models/qualityAlert.model.js';
import { TeacherPayroll } from '../../payroll/models/teacherPayroll.model.js';
import { Notification } from '../../notifications/models/notification.model.js';
import { Setting } from '../../settings/models/setting.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';

interface Actor {
  id: string;
  token: string;
}

describe('Phase 3 — Reports, Reviews, Progress EMA, Quality Alerts, Payroll & Refunds, Dashboards', () => {
  const app = createApp();
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    await mongoose.connect(replSet.getUri());
    await Promise.all([
      SessionReport.ensureIndexes(),
      SessionReview.ensureIndexes(),
      QualityAlert.ensureIndexes(),
      TeacherPayroll.ensureIndexes(),
      Notification.ensureIndexes(),
    ]);
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) {
      await replSet.stop();
    }
  }, 30_000);

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      StudentProfile.deleteMany({}),
      TeacherProfile.deleteMany({}),
      Course.deleteMany({}),
      CoursePackage.deleteMany({}),
      Enrollment.deleteMany({}),
      Invoice.deleteMany({}),
      Payment.deleteMany({}),
      SessionLedger.deleteMany({}),
      Session.deleteMany({}),
      SessionReport.deleteMany({}),
      SessionReview.deleteMany({}),
      ProgressSnapshot.deleteMany({}),
      QualityAlert.deleteMany({}),
      TeacherPayroll.deleteMany({}),
      Notification.deleteMany({}),
      Setting.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
  });

  async function seedActor(params: {
    email: string;
    fullName: string;
    role: 'admin' | 'teacher' | 'student';
  }): Promise<Actor> {
    const password = 'Password123!';
    const passwordHash = await bcrypt.hash(password, 8);
    const user = await User.create({
      email: params.email,
      passwordHash,
      fullName: params.fullName,
      role: params.role,
      status: 'active',
      locale: 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
      emailVerifiedAt: new Date(),
    });
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: params.email, password });
    expect(loginRes.status).toBe(200);
    return {
      id: String(user._id),
      token: loginRes.body.data.accessToken as string,
    };
  }

  it('handles session reports with quickNotes pull, EMA progress snapshots, 48h edit window & reviews', async () => {
    const teacher = await seedActor({ email: 't.rep@test.local', fullName: 'Coach Rep', role: 'teacher' });
    const otherTeacher = await seedActor({ email: 't2.rep@test.local', fullName: 'Other Coach', role: 'teacher' });
    const student = await seedActor({ email: 's.rep@test.local', fullName: 'Student Rep', role: 'student' });

    await TeacherProfile.create({ userId: teacher.id, ratingAvg: 4.5, reviewsCount: 0 });
    await StudentProfile.create({
      userId: student.id,
      currentCefr: 'B1',
      skillScores: {
        listening: 50,
        speaking: 40,
        reading: 50,
        writing: 45,
        vocabulary: 50,
        grammar: 50,
        pronunciation: 40,
      },
    });

    const completedAt = new Date(Date.now() - 2 * 3_600_000);
    const ses1 = await Session.create({
      studentId: student.id,
      teacherId: teacher.id,
      isTrial: true,
      title: 'IELTS Part 3 Practice',
      startAt: new Date(completedAt.getTime() - 45 * 60_000),
      endAt: completedAt,
      endedAt: completedAt,
      durationMinutes: 45,
      status: 'completed',
      isActive: false,
      meetingProvider: 'jitsi',
      roomCode: 'we-r1',
      joinUrl: 'https://meet.jit.si/we-r1',
      quickNotes: [
        {
          id: 'qn1',
          kind: 'vocab',
          term: 'big problem',
          correction: 'pressing challenge',
          contextNote: 'Use formal lexical resource',
          createdBy: teacher.id,
          createdAt: completedAt,
        },
      ],
    });
    const ses1Id = String(ses1._id);

    // Unassigned teacher or student cannot write report
    const forbiddenStu = await request(app)
      .put(`/api/v1/reports/sessions/${ses1Id}`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ summary: 'Fake student report attempt' });
    expect(forbiddenStu.status).toBe(403);

    const forbiddenOtherT = await request(app)
      .put(`/api/v1/reports/sessions/${ses1Id}`)
      .set('Authorization', `Bearer ${otherTeacher.token}`)
      .send({ summary: 'Other teacher attempt' });
    expect(forbiddenOtherT.status).toBe(403);

    // Teacher submits report -> pulls quickNotes + updates EMA skill scores + creates ProgressSnapshot
    const reportRes = await request(app)
      .put(`/api/v1/reports/sessions/${ses1Id}`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({
        summary: 'Học viên phản xạ tốt câu hỏi Part 3, cần cải thiện phát âm âm cuối.',
        strengths: ['Fluency', 'Idea extension'],
        weaknesses: ['Final /s/ omission'],
        nextFocus: 'Conditionals type 2 & 3',
        skillRatings: { speaking: 80, pronunciation: 70 },
      });
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.data.submittedOnTime).toBe(true);
    expect(reportRes.body.data.vocabItems).toHaveLength(1);
    expect(reportRes.body.data.vocabItems[0].correction).toBe('pressing challenge');
    // EMA check: 0.3 * 80 + 0.7 * 40 = 24 + 28 = 52
    expect(reportRes.body.data.progressUpdate.skillScores.speaking).toBe(52);
    expect(reportRes.body.data.progressUpdate.skillScores.pronunciation).toBe(49);

    // Edit within 48h succeeds, past 48h fails
    const editOk = await request(app)
      .put(`/api/v1/reports/sessions/${ses1Id}`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ summary: 'Updated summary within 48h edit window.' });
    expect(editOk.status).toBe(200);

    await SessionReport.updateOne(
      { sessionId: ses1Id },
      { $set: { submittedAt: new Date(Date.now() - 50 * 3_600_000) } },
    );
    const editLate = await request(app)
      .put(`/api/v1/reports/sessions/${ses1Id}`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ summary: 'Too late edit' });
    expect(editLate.status).toBe(403);

    // Student submits review (5 stars) -> recalculates TeacherProfile.ratingAvg
    const revOk = await request(app)
      .post(`/api/v1/reports/sessions/${ses1Id}/review`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ rating: 5, comment: 'Rất dễ hiểu!', tags: ['Tận tâm'] });
    expect(revOk.status).toBe(201);
    expect(revOk.body.data.teacherRatingAvg).toBe(5);
    expect(revOk.body.data.teacherReviewsCount).toBe(1);

    // Second review on same session blocked (409)
    const revDup = await request(app)
      .post(`/api/v1/reports/sessions/${ses1Id}/review`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ rating: 4 });
    expect(revDup.status).toBe(409);

    // Low rating (2 stars) on another session creates QualityAlert automatically
    const ses2 = await Session.create({
      studentId: student.id,
      teacherId: teacher.id,
      isTrial: false,
      title: 'Session 2',
      startAt: new Date(completedAt.getTime() - 200 * 60_000),
      endAt: new Date(completedAt.getTime() - 155 * 60_000),
      endedAt: new Date(completedAt.getTime() - 155 * 60_000),
      durationMinutes: 45,
      status: 'completed',
      isActive: false,
      meetingProvider: 'jitsi',
      roomCode: 'we-r2',
      joinUrl: 'https://meet.jit.si/we-r2',
    });
    const revLow = await request(app)
      .post(`/api/v1/reports/sessions/${String(ses2._id)}/review`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ rating: 2, comment: 'Kết nối hơi giật' });
    expect(revLow.status).toBe(201);
    expect(revLow.body.data.teacherRatingAvg).toBe(3.5);

    const lowAlert = await QualityAlert.findOne({ sessionId: ses2._id, type: 'low_rating' }).lean();
    expect(lowAlert?.status).toBe('open');

    // Progress API works cleanly for student & assigned teacher, blocks outsider
    const progressRes = await request(app)
      .get('/api/v1/reports/students/me/progress')
      .set('Authorization', `Bearer ${student.token}`);
    expect(progressRes.status).toBe(200);
    expect(progressRes.body.data.snapshots).toHaveLength(1);

    const outsiderProgress = await request(app)
      .get(`/api/v1/reports/students/${student.id}/progress`)
      .set('Authorization', `Bearer ${otherTeacher.token}`);
    expect(outsiderProgress.status).toBe(403);
  });

  it('tracks quality metrics, alert transitions (open -> ack -> resolved) and idempotent overdue report sweeper', async () => {
    const admin = await seedActor({ email: 'adm.q@test.local', fullName: 'Admin Q', role: 'admin' });
    const teacher = await seedActor({ email: 't.q@test.local', fullName: 'Coach Q', role: 'teacher' });
    const otherTeacher = await seedActor({ email: 't2.q@test.local', fullName: 'Coach Q2', role: 'teacher' });
    const student = await seedActor({ email: 's.q@test.local', fullName: 'Student Q', role: 'student' });

    await TeacherProfile.create({ userId: teacher.id, ratingAvg: 4.9, reviewsCount: 10 });

    const past30h = new Date(Date.now() - 30 * 3_600_000);
    await Session.create({
      studentId: student.id,
      teacherId: teacher.id,
      isTrial: false,
      title: 'Overdue Unreported Session',
      startAt: new Date(past30h.getTime() - 45 * 60_000),
      endAt: past30h,
      endedAt: past30h,
      durationMinutes: 45,
      status: 'completed',
      isActive: false,
      meetingProvider: 'jitsi',
      roomCode: 'we-q1',
      joinUrl: 'https://meet.jit.si/we-q1',
    });

    const job1 = await runOverdueReportsSweeperJob(new Date());
    const job2 = await runOverdueReportsSweeperJob(new Date());
    expect(job1.flaggedCount).toBe(1);
    expect(job2.flaggedCount).toBe(0);

    const alertsRes = await request(app)
      .get('/api/v1/quality/alerts')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(alertsRes.status).toBe(200);
    expect(alertsRes.body.data.openCount).toBe(1);
    const alertId = alertsRes.body.data.items[0].id as string;

    const ackRes = await request(app)
      .post(`/api/v1/quality/alerts/${alertId}/advance`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'ack' });
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.data.status).toBe('ack');

    const resolveRes = await request(app)
      .post(`/api/v1/quality/alerts/${alertId}/advance`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'resolved', resolutionNote: 'Đã nhắc giáo viên nộp báo cáo' });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe('resolved');

    const invalidRetry = await request(app)
      .post(`/api/v1/quality/alerts/${alertId}/advance`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'ack' });
    expect(invalidRetry.status).toBe(409);

    // IDOR check on teacher metrics
    const otherMetrics = await request(app)
      .get(`/api/v1/quality/teachers/${teacher.id}`)
      .set('Authorization', `Bearer ${otherTeacher.token}`);
    expect(otherMetrics.status).toBe(403);

    const selfMetrics = await request(app)
      .get('/api/v1/quality/teachers/me')
      .set('Authorization', `Bearer ${teacher.token}`);
    expect(selfMetrics.status).toBe(200);
    expect(selfMetrics.body.data.completedSessions).toBe(1);
    expect(selfMetrics.body.data.onTimeReportRate).toBe(0);
  });

  it('generates monthly payrolls, enforces workflow & CSV security, processes ACID invoice refunds & serves 3 dashboards', async () => {
    const admin = await seedActor({ email: 'adm.pay@test.local', fullName: 'Admin Pay', role: 'admin' });
    const teacher = await seedActor({ email: 't.pay@test.local', fullName: '=SUM(1,1)', role: 'teacher' });
    const student = await seedActor({ email: 's.pay@test.local', fullName: 'Student Pay', role: 'student' });

    await TeacherProfile.create({ userId: teacher.id, payPerSessionVnd: 300_000, ratingAvg: 4.9, reviewsCount: 5 });

    const monthStr = dayjs().format('YYYY-MM');
    const baseDate = dayjs().startOf('month').add(5, 'day').hour(10).toDate();

    await Session.create([
      {
        studentId: student.id,
        teacherId: teacher.id,
        isTrial: false,
        title: 'Completed Paid Lesson',
        startAt: baseDate,
        endAt: new Date(baseDate.getTime() + 45 * 60_000),
        durationMinutes: 45,
        status: 'completed',
        isActive: false,
        meetingProvider: 'jitsi',
        roomCode: 'p1',
        joinUrl: 'https://meet.jit.si/p1',
      },
      {
        studentId: student.id,
        teacherId: teacher.id,
        isTrial: false,
        title: 'No Show Student Lesson',
        startAt: new Date(baseDate.getTime() + 2 * 3_600_000),
        endAt: new Date(baseDate.getTime() + 2.75 * 3_600_000),
        durationMinutes: 45,
        status: 'no_show_student',
        isActive: false,
        meetingProvider: 'jitsi',
        roomCode: 'p2',
        joinUrl: 'https://meet.jit.si/p2',
      },
      {
        studentId: student.id,
        teacherId: teacher.id,
        isTrial: false,
        title: 'No Show Teacher Lesson',
        startAt: new Date(baseDate.getTime() + 4 * 3_600_000),
        endAt: new Date(baseDate.getTime() + 4.75 * 3_600_000),
        durationMinutes: 45,
        status: 'no_show_teacher',
        isActive: false,
        meetingProvider: 'jitsi',
        roomCode: 'p3',
        joinUrl: 'https://meet.jit.si/p3',
      },
    ]);

    const genRes = await request(app)
      .post('/api/v1/payrolls/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ month: monthStr, teacherId: teacher.id });
    expect(genRes.status).toBe(201);
    const payroll = genRes.body.data[0];
    expect(payroll.completedSessionsCount).toBe(1);
    expect(payroll.noShowStudentSessionsCount).toBe(1);
    expect(payroll.noShowTeacherSessionsCount).toBe(1);
    expect(payroll.grossVnd).toBe(600_000); // 300k + 300k + 0

    // Adjust bonus & deduction
    const adjRes = await request(app)
      .patch(`/api/v1/payrolls/${payroll.id}/adjustment`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ bonusVnd: 100_000, deductionVnd: 50_000, notes: 'Thưởng chuyên cần' });
    expect(adjRes.status).toBe(200);
    expect(adjRes.body.data.netVnd).toBe(650_000);

    // Cannot jump draft -> paid directly
    const invalidPay = await request(app)
      .post(`/api/v1/payrolls/${payroll.id}/pay`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(invalidPay.status).toBe(409);

    const approveRes = await request(app)
      .post(`/api/v1/payrolls/${payroll.id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');

    const payRes = await request(app)
      .post(`/api/v1/payrolls/${payroll.id}/pay`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(payRes.status).toBe(200);
    expect(payRes.body.data.status).toBe('paid');

    // Locked payroll cannot be regenerated
    const regenBlocked = await request(app)
      .post('/api/v1/payrolls/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ month: monthStr, teacherId: teacher.id });
    expect(regenBlocked.status).toBe(409);

    // Safe CSV export
    const csvRes = await request(app)
      .get(`/api/v1/payrolls/export/csv?month=${monthStr}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain(`"'=SUM(1,1)"`);

    const studentCsvForbidden = await request(app)
      .get('/api/v1/payrolls/export/csv')
      .set('Authorization', `Bearer ${student.token}`);
    expect(studentCsvForbidden.status).toBe(403);

    // Refund workflow inside ACID transaction
    const course = await Course.create({
      slug: 'refund-course',
      title: 'Course Refund',
      description: 'Test',
      goalType: 'ielts',
      targetCefrRange: ['B1'],
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: 'REF10',
      name: 'Gói 10',
      sessionsCount: 10,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 3_500_000,
    });
    const enrollment = await Enrollment.create({
      studentId: student.id,
      teacherId: teacher.id,
      courseId: course._id,
      packageId: pkg._id,
      status: 'active',
      purchasedSessions: 10,
      durationMinutes: 45,
      validityDays: 90,
      activatedAt: new Date(),
    });
    await appendLedgerEntry({
      studentId: student.id,
      enrollmentId: enrollment._id,
      type: 'purchase',
      delta: 10,
      reason: 'Paid 10 sessions',
    });
    const invoice = await Invoice.create({
      invoiceCode: 'WE-INV-REF-001',
      enrollmentId: enrollment._id,
      studentId: student.id,
      packageId: pkg._id,
      subtotalVnd: 3_500_000,
      discountVnd: 0,
      totalVnd: 3_500_000,
      status: 'paid',
      paidAt: new Date(),
    });
    await Payment.create({
      invoiceId: invoice._id,
      enrollmentId: enrollment._id,
      studentId: student.id,
      provider: 'mock',
      amountVnd: 3_500_000,
      status: 'confirmed',
      confirmedAt: new Date(),
    });

    const refundRes = await request(app)
      .post(`/api/v1/invoices/${String(invoice._id)}/refund`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'Học viên chuyển công tác nước ngoài' });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.data.invoiceStatus).toBe('refunded');
    expect(refundRes.body.data.enrollmentStatus).toBe('churned');
    expect(refundRes.body.data.deductedSessions).toBe(10);
    expect(refundRes.body.data.remainingSessions).toBe(0);
    expect(await getEnrollmentBalance(String(enrollment._id))).toBe(0);

    // Double refund blocked (409)
    const doubleRefund = await request(app)
      .post(`/api/v1/invoices/${String(invoice._id)}/refund`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'Duplicate refund' });
    expect(doubleRefund.status).toBe(409);

    // 3 role-based Dashboards
    const stuForbiddenAdm = await request(app)
      .get('/api/v1/dashboards/admin')
      .set('Authorization', `Bearer ${student.token}`);
    expect(stuForbiddenAdm.status).toBe(403);

    const [stuDash, tchDash, admDash] = await Promise.all([
      request(app).get('/api/v1/dashboards/student').set('Authorization', `Bearer ${student.token}`),
      request(app).get('/api/v1/dashboards/teacher').set('Authorization', `Bearer ${teacher.token}`),
      request(app).get('/api/v1/dashboards/admin').set('Authorization', `Bearer ${admin.token}`),
    ]);
    expect(stuDash.status).toBe(200);
    expect(stuDash.body.data.remainingSessions).toBe(0);
    expect(tchDash.status).toBe(200);
    expect(tchDash.body.data.currentMonthPayroll.netVnd).toBe(650_000);
    expect(admDash.status).toBe(200);
    expect(admDash.body.data.kpis.activeStudentsCount).toBe(1);
    expect(admDash.body.data.weeklyThroughput).toHaveLength(4);
  });
});
