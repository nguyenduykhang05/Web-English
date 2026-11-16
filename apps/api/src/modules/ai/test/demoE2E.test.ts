import { createServer } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../../app.js';
import { attachSocketServer } from '../../../realtime/socket.js';
import { DEFAULT_POLICY_SETTINGS } from '../../../seed/run.js';
import { User } from '../../users/models/user.model.js';
import { Setting } from '../../settings/models/setting.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { Course } from '../../courses/models/course.model.js';
import { CoursePackage } from '../../courses/models/coursePackage.model.js';
import { Coupon } from '../../courses/models/coupon.model.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { Invoice } from '../../payments/models/invoice.model.js';
import { Payment } from '../../payments/models/payment.model.js';
import { SessionLedger } from '../../ledger/models/sessionLedger.model.js';
import { getEnrollmentBalance } from '../../ledger/services/ledger.service.js';
import { Session } from '../../sessions/models/session.model.js';
import { Notification } from '../../notifications/models/notification.model.js';
import { SessionReport } from '../../reports/models/sessionReport.model.js';
import { SessionReview } from '../../reports/models/sessionReview.model.js';
import { ProgressSnapshot } from '../../reports/models/progressSnapshot.model.js';
import { QualityAlert } from '../../quality/models/qualityAlert.model.js';
import { TeacherPayroll } from '../../payroll/models/teacherPayroll.model.js';
import { PathTemplate } from '../../learningPaths/models/pathTemplate.model.js';
import { LearningPath } from '../../learningPaths/models/learningPath.model.js';
import { Assessment } from '../../learningPaths/models/assessment.model.js';
import { Lesson } from '../../curriculum/models/lesson.model.js';
import { Homework } from '../../curriculum/models/homework.model.js';
import { AILog } from '../models/aiLog.model.js';

dayjs.extend(utc);
dayjs.extend(timezone);

interface Actor {
  id: string;
  token: string;
}

describe('Phase 6 — Full 8-Step End-to-End Platform Demo Flow', () => {
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
      Session.ensureIndexes(),
      Invoice.ensureIndexes(),
      Notification.ensureIndexes(),
      AILog.ensureIndexes(),
      TeacherPayroll.ensureIndexes(),
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
      Setting.deleteMany({}),
      AuditLog.deleteMany({}),
      StudentProfile.deleteMany({}),
      TeacherProfile.deleteMany({}),
      Course.deleteMany({}),
      CoursePackage.deleteMany({}),
      Coupon.deleteMany({}),
      Enrollment.deleteMany({}),
      Invoice.deleteMany({}),
      Payment.deleteMany({}),
      SessionLedger.deleteMany({}),
      Session.deleteMany({}),
      Notification.deleteMany({}),
      SessionReport.deleteMany({}),
      SessionReview.deleteMany({}),
      ProgressSnapshot.deleteMany({}),
      QualityAlert.deleteMany({}),
      TeacherPayroll.deleteMany({}),
      PathTemplate.deleteMany({}),
      LearningPath.deleteMany({}),
      Assessment.deleteMany({}),
      Lesson.deleteMany({}),
      Homework.deleteMany({}),
      AILog.deleteMany({}),
    ]);
  });

  async function seedActor(params: {
    email: string;
    fullName: string;
    role: 'admin' | 'teacher' | 'student';
    tz?: string;
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
      timezone: params.tz ?? 'Asia/Ho_Chi_Minh',
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

  it('executes complete 1-1 teaching lifecycle from catalog & matching through classroom, payroll, AI approval & dashboards', async () => {
    // 1. Admin setup & policy settings
    await Setting.insertMany(DEFAULT_POLICY_SETTINGS);
    const admin = await seedActor({ email: 'e2e.adm@test.local', fullName: 'Admin Demo', role: 'admin' });
    const teacher = await seedActor({
      email: 'e2e.t@test.local',
      fullName: 'Coach Claire NY',
      role: 'teacher',
      tz: 'America/New_York',
    });
    const student = await seedActor({
      email: 'e2e.s@test.local',
      fullName: 'Minh Anh VN',
      role: 'student',
      tz: 'Asia/Ho_Chi_Minh',
    });

    await TeacherProfile.create({
      userId: teacher.id,
      bio: 'IELTS 8.5 Executive Coach',
      certifications: ['CELTA'],
      specialties: ['ielts', 'business'],
      cefrLevels: ['B1', 'B2', 'C1'],
      languages: ['English', 'Vietnamese'],
      payPerSessionVnd: 300_000,
      maxStudents: 25,
      timezone: 'America/New_York',
      weeklyAvailability: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
        dayOfWeek: dow,
        startTime: '06:00',
        endTime: '12:00',
      })),
      ratingAvg: 4.9,
      reviewsCount: 10,
      qualityScore: 97,
    });

    const courseRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: 'e2e-ielts-1on1',
        title: 'IELTS Speaking 1-1 E2E',
        description: 'End-to-end verified track',
        goalType: 'ielts',
        targetCefrRange: ['B1', 'B2'],
        syllabusOutline: ['Part 1 Fluency', 'Part 3 Contrast'],
        isPublished: true,
      });
    expect(courseRes.status).toBe(201);
    const courseId = String(courseRes.body.data._id ?? courseRes.body.data.id);

    const pkgRes = await request(app)
      .post('/api/v1/courses/packages')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        courseId,
        code: 'E2E-IELTS-12',
        name: 'Gói E2E 12 Buổi',
        sessionsCount: 12,
        durationMinutes: 45,
        validityDays: 90,
        priceVnd: 4_000_000,
        isActive: true,
      });
    expect(pkgRes.status).toBe(201);
    const packageId = String(pkgRes.body.data._id ?? pkgRes.body.data.id);

    await Coupon.create({
      code: 'E2ESAVE10',
      discountType: 'percent',
      discountValue: 10,
      maxUses: 20,
      usedCount: 0,
      isActive: true,
    });

    await PathTemplate.create({
      code: 'E2E-IELTS-B2',
      title: 'IELTS B1 -> B2 Demo Track',
      goalType: 'ielts',
      targetCefr: 'B2',
      isActive: true,
      milestones: [
        {
          title: 'Milestone 1: Ending Consonants',
          description: 'Phonetics core',
          cefrTarget: 'B1',
          skillFocus: 'pronunciation',
          plannedSessions: 4,
        },
        {
          title: 'Milestone 2: Part 3 Argumentation',
          description: 'Academic fluency',
          cefrTarget: 'B2',
          skillFocus: 'speaking',
          plannedSessions: 6,
        },
      ],
    });

    // 2. Student onboarding, adaptive placement & teacher matching
    await request(app)
      .patch('/api/v1/students/me')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        currentCefr: 'B1',
        goal: { goalType: 'ielts', targetScore: '7.0' },
        consents: { dataPrivacyAccepted: true, aiProcessingAccepted: true },
      });

    const placeStart = await request(app)
      .post('/api/v1/learning-paths/placement/start')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ targetGoal: 'ielts' });
    expect(placeStart.status).toBe(201);
    const assessmentId = placeStart.body.data.assessmentId as string;
    let q = placeStart.body.data.question as { id: string };
    const correctMap: Record<string, number> = {
      'q-a1-1': 1,
      'q-a1-2': 0,
      'q-a2-1': 2,
      'q-a2-2': 2,
      'q-b1-1': 1,
      'q-b1-2': 0,
      'q-b2-1': 0,
      'q-b2-2': 1,
      'q-c1-1': 0,
      'q-c1-2': 0,
      'q-c2-1': 0,
      'q-c2-2': 1,
    };
    for (let step = 1; step <= 6; step++) {
      const ansRes = await request(app)
        .post(`/api/v1/learning-paths/placement/${assessmentId}/answer`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({ questionId: q.id, selectedIndex: correctMap[q.id] });
      expect(ansRes.status).toBe(200);
      if (step < 6) {
        q = ansRes.body.data.question;
      } else {
        expect(ansRes.body.data.completed).toBe(true);
      }
    }

    const matchRes = await request(app)
      .get('/api/v1/enrollments/match-teachers')
      .set('Authorization', `Bearer ${student.token}`);
    expect(matchRes.status).toBe(200);
    expect(matchRes.body.data[0].teacherUserId).toBe(teacher.id);

    // 3. Enrollment with discount coupon + Admin VietQR confirmation -> ACID SessionLedger +12
    const enrollRes = await request(app)
      .post('/api/v1/enrollments')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        packageId,
        teacherId: teacher.id,
        couponCode: 'E2ESAVE10',
      });
    expect(enrollRes.status).toBe(201);
    const { enrollment, invoice, payment } = enrollRes.body.data;
    expect(invoice.totalVnd).toBe(3_600_000);

    const confirmRes = await request(app)
      .post(`/api/v1/payments/${payment.id}/confirm`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ transactionRef: 'FT-E2E-001', paidAmountVnd: 3_600_000 });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.remainingSessions).toBe(12);
    expect(await getEnrollmentBalance(enrollment.id)).toBe(12);

    // 4. Timezone slot calculation, session booking (-1 -> 11), ICS export, live Socket.IO classroom & end
    const fromNy = dayjs().tz('America/New_York').add(2, 'day').startOf('day').toDate().toISOString();
    const slotsRes = await request(app)
      .get('/api/v1/sessions/available-slots')
      .set('Authorization', `Bearer ${student.token}`)
      .query({ teacherId: teacher.id, from: fromNy, days: 2, durationMinutes: 45 });
    expect(slotsRes.status).toBe(200);
    const firstSlot = slotsRes.body.data.slots[0] as { startAt: string };
    expect(firstSlot).toBeTruthy();

    const bookRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        teacherId: teacher.id,
        enrollmentId: enrollment.id,
        startAt: firstSlot.startAt,
        durationMinutes: 45,
      });
    expect(bookRes.status).toBe(201);
    const sessionId = bookRes.body.data.sessions[0].id as string;
    expect(await getEnrollmentBalance(enrollment.id)).toBe(11);

    const icsRes = await request(app)
      .get(`/api/v1/sessions/${sessionId}/ics`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(icsRes.status).toBe(200);
    expect(icsRes.text).toContain('BEGIN:VCALENDAR');

    // Shift session window into live open range for classroom Socket.IO test
    await Session.updateOne(
      { _id: sessionId },
      {
        $set: {
          startAt: new Date(Date.now() + 2 * 60_000),
          endAt: new Date(Date.now() + 47 * 60_000),
        },
      },
    );

    const httpServer = createServer(app);
    const ioServer = attachSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    let sClient: ClientSocket | undefined;
    let tClient: ClientSocket | undefined;
    try {
      const joinStudent = await request(app)
        .post(`/api/v1/sessions/${sessionId}/join`)
        .set('Authorization', `Bearer ${student.token}`);
      expect(joinStudent.status).toBe(200);

      sClient = createClientSocket(baseUrl, { auth: { token: student.token }, transports: ['websocket'] });
      tClient = createClientSocket(baseUrl, { auth: { token: teacher.token }, transports: ['websocket'] });
      await Promise.all([
        new Promise<void>((res) => sClient!.on('connect', res)),
        new Promise<void>((res) => tClient!.on('connect', res)),
      ]);

      await Promise.all([
        new Promise<void>((res) => tClient!.emit('classroom:join', { sessionId }, () => res())),
        new Promise<void>((res) => sClient!.emit('classroom:join', { sessionId }, () => res())),
      ]);

      const notePromise = new Promise<{ sharedNotes: string }>((resolve) =>
        sClient!.on('classroom:notes:updated', resolve),
      );
      tClient.emit('classroom:notes:update', {
        sessionId,
        content: 'E2E Class Note: Final /s/ and Part 3 Contrast',
      });
      expect((await notePromise).sharedNotes).toContain('Part 3 Contrast');

      const endRes = await request(app)
        .post(`/api/v1/sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${teacher.token}`);
      expect(endRes.status).toBe(200);
      expect(endRes.body.data.status).toBe('completed');
    } finally {
      sClient?.disconnect();
      tClient?.disconnect();
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
      httpServer.close();
    }

    // 5. Teacher submits report -> EMA & ProgressSnapshot update; student submits 5-star review
    const reportRes = await request(app)
      .put(`/api/v1/reports/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({
        summary: 'Buổi học E2E diễn ra suôn sẻ, phản xạ rõ ràng.',
        strengths: ['Cấu trúc ý mạch lạc'],
        weaknesses: ['Âm cuối /s/ chưa đều'],
        nextFocus: 'Part 2 Cue Card timing',
        skillRatings: { speaking: 82, pronunciation: 74 },
      });
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.data.submittedOnTime).toBe(true);

    const reviewRes = await request(app)
      .post(`/api/v1/reports/sessions/${sessionId}/review`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ rating: 5, comment: 'Giáo viên sửa lỗi rất chi tiết!' });
    expect(reviewRes.status).toBe(201);

    // 6. Personalized path + AI exercise generation (proposed -> teacher approval -> student submit -> teacher grade)
    const lpGen = await request(app)
      .post('/api/v1/learning-paths/generate')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ templateCode: 'E2E-IELTS-B2' });
    expect(lpGen.status).toBe(201);

    const aiExRes = await request(app)
      .post('/api/v1/ai/exercise-generation')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({
        studentId: student.id,
        skillFocus: 'vocabulary',
        cefrLevel: 'B2',
        homeworkType: 'multiple_choice',
        topic: 'Sustainable Urban Mobility',
      });
    expect(aiExRes.status).toBe(201);
    expect(aiExRes.body.data.status).toBe('proposed');
    const aiLogId = aiExRes.body.data.id as string;

    // Hidden before teacher approves
    const hwBefore = await request(app)
      .get('/api/v1/curriculum/homework')
      .set('Authorization', `Bearer ${student.token}`);
    expect(hwBefore.body.data).toHaveLength(0);

    const approveAiRes = await request(app)
      .post(`/api/v1/ai/logs/${aiLogId}/decision`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ decision: 'approved', reviewNote: 'Đã rà soát nội dung phù hợp B2' });
    expect(approveAiRes.status).toBe(200);

    const hwAfter = await request(app)
      .get('/api/v1/curriculum/homework')
      .set('Authorization', `Bearer ${student.token}`);
    expect(hwAfter.body.data).toHaveLength(1);
    const hwId = hwAfter.body.data[0].id as string;
    const hwQuestions = hwAfter.body.data[0].questions as { id: string; options?: string[] }[];

    const submitHw = await request(app)
      .post(`/api/v1/curriculum/homework/${hwId}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        note: 'Hoàn thành bài tập AI đã duyệt',
        answers: hwQuestions.map((qq) => ({
          questionId: qq.id,
          answer: qq.options?.[0] ?? 'sustainable infrastructure',
        })),
      });
    expect(submitHw.status).toBe(200);

    const gradeHw = await request(app)
      .post(`/api/v1/curriculum/homework/${hwId}/grade`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ score: 88, teacherFeedback: 'Xuất sắc, áp dụng collocations tự nhiên.' });
    expect(gradeHw.status).toBe(200);
    expect(gradeHw.body.data.homework.status).toBe('graded');

    // 7. Monthly payroll generation -> approve -> pay
    const monthStr = dayjs().format('YYYY-MM');
    const genPay = await request(app)
      .post('/api/v1/payrolls/generate')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ month: monthStr, teacherId: teacher.id });
    expect(genPay.status).toBe(201);
    const payrollId = genPay.body.data[0].id as string;
    expect(genPay.body.data[0].grossVnd).toBe(300_000);

    await request(app)
      .post(`/api/v1/payrolls/${payrollId}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    const payDone = await request(app)
      .post(`/api/v1/payrolls/${payrollId}/pay`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(payDone.status).toBe(200);
    expect(payDone.body.data.status).toBe('paid');

    // 8. Verify all 3 role Dashboards reflect consistent E2E state
    const [stuDash, tchDash, admDash] = await Promise.all([
      request(app).get('/api/v1/dashboards/student').set('Authorization', `Bearer ${student.token}`),
      request(app).get('/api/v1/dashboards/teacher').set('Authorization', `Bearer ${teacher.token}`),
      request(app).get('/api/v1/dashboards/admin').set('Authorization', `Bearer ${admin.token}`),
    ]);

    expect(stuDash.status).toBe(200);
    expect(stuDash.body.data.remainingSessions).toBe(11);
    expect(tchDash.status).toBe(200);
    expect(tchDash.body.data.currentMonthPayroll.status).toBe('paid');
    expect(tchDash.body.data.currentMonthPayroll.netVnd).toBe(300_000);
    expect(admDash.status).toBe(200);
    expect(admDash.body.data.kpis.activeStudentsCount).toBe(1);
    expect(admDash.body.data.kpis.completedSessions30d).toBe(1);
    expect(admDash.body.data.kpis.monthlyRevenueVnd).toBe(3_600_000);
  });
});
