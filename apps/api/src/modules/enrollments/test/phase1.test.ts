import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app.js';
import { User } from '../../users/models/user.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { Course } from '../../courses/models/course.model.js';
import { CoursePackage } from '../../courses/models/coursePackage.model.js';
import { Coupon } from '../../courses/models/coupon.model.js';
import { Enrollment } from '../models/enrollment.model.js';
import { Invoice } from '../../payments/models/invoice.model.js';
import { Payment } from '../../payments/models/payment.model.js';
import { SessionLedger } from '../../ledger/models/sessionLedger.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { ManualBankTransferProvider } from '../../payments/payment.provider.js';

interface TestActor {
  id: string;
  token: string;
}

describe('Phase 1 — Catalog, Profiles, Matching, Enrollment, VietQR & SessionLedger ACID', () => {
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
      Coupon.deleteMany({}),
      Enrollment.deleteMany({}),
      Invoice.deleteMany({}),
      Payment.deleteMany({}),
      SessionLedger.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
  });

  async function seedActor(params: {
    email: string;
    fullName: string;
    role: 'admin' | 'teacher' | 'student';
  }): Promise<TestActor> {
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

  it('enforces admin-only catalog writes and supports Course + Package + Coupon CRUD', async () => {
    const admin = await seedActor({ email: 'admin@test.local', fullName: 'Admin', role: 'admin' });
    const student = await seedActor({ email: 'student@test.local', fullName: 'Student A', role: 'student' });
    const teacher = await seedActor({ email: 'teacher@test.local', fullName: 'Teacher 1', role: 'teacher' });

    const studentCreateRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        slug: 'blocked-course',
        title: 'Blocked',
        description: 'Should be forbidden',
        goalType: 'ielts',
        targetCefrRange: ['B1'],
      });
    expect(studentCreateRes.status).toBe(403);

    const courseRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: 'ielts-speaking-mastery',
        title: 'IELTS Speaking Mastery 1-1',
        description: 'Intensive speaking coaching',
        goalType: 'ielts',
        targetCefrRange: ['B1', 'B2'],
        syllabusOutline: ['Fluency', 'Lexical Resource'],
        isPublished: true,
      });
    expect(courseRes.status).toBe(201);
    const courseId = String(courseRes.body.data._id ?? courseRes.body.data.id);

    const hiddenCourseRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: 'internal-draft-course',
        title: 'Internal Draft',
        description: 'Hidden from public',
        goalType: 'business',
        targetCefrRange: ['B2'],
        isPublished: false,
      });
    expect(hiddenCourseRes.status).toBe(201);

    const teacherPkgRes = await request(app)
      .post('/api/v1/courses/packages')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({
        courseId,
        code: 'NOPE12',
        name: 'No Access',
        sessionsCount: 12,
        priceVnd: 1000000,
      });
    expect(teacherPkgRes.status).toBe(403);

    const pkgRes = await request(app)
      .post('/api/v1/courses/packages')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        courseId,
        code: 'IELTS12',
        name: 'Gói 12 Buổi IELTS',
        sessionsCount: 12,
        durationMinutes: 45,
        validityDays: 90,
        priceVnd: 4_000_000,
        features: ['12 buổi 1-1'],
      });
    expect(pkgRes.status).toBe(201);

    const couponRes = await request(app)
      .post('/api/v1/courses/coupons')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        code: 'SAVE20',
        discountType: 'percent',
        discountValue: 20,
        maxUses: 10,
      });
    expect(couponRes.status).toBe(201);

    const patchRes = await request(app)
      .patch(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'IELTS Speaking Mastery Pro' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.title).toBe('IELTS Speaking Mastery Pro');

    const publicList = await request(app).get('/api/v1/courses');
    expect(publicList.status).toBe(200);
    expect(publicList.body.data).toHaveLength(1);
    expect(publicList.body.data[0].packages).toHaveLength(1);

    const adminListAll = await request(app)
      .get('/api/v1/courses?includeUnpublished=true')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminListAll.status).toBe(200);
    expect(adminListAll.body.data).toHaveLength(2);
  });

  it('protects teacher pay rate from teacher/public reads & writes and ranks matches accurately', async () => {
    const admin = await seedActor({ email: 'admin@test.local', fullName: 'Admin', role: 'admin' });
    const tBest = await seedActor({ email: 'tbest@test.local', fullName: 'Coach IELTS Best', role: 'teacher' });
    const tOther = await seedActor({ email: 'tother@test.local', fullName: 'Coach General', role: 'teacher' });
    const student = await seedActor({ email: 's@test.local', fullName: 'Minh Student', role: 'student' });

    const forbiddenPayUpdate = await request(app)
      .put('/api/v1/teachers/me')
      .set('Authorization', `Bearer ${tBest.token}`)
      .send({ payPerSessionVnd: 999_000 });
    expect(forbiddenPayUpdate.status).toBe(403);

    const teacherUpsert = await request(app)
      .put('/api/v1/teachers/me')
      .set('Authorization', `Bearer ${tBest.token}`)
      .send({
        bio: 'IELTS 8.5 specialist',
        specialties: ['ielts', 'communication'],
        cefrLevels: ['B1', 'B2', 'C1'],
        weeklyAvailability: [{ dayOfWeek: 1, startTime: '19:00', endTime: '21:00' }],
      });
    expect(teacherUpsert.status).toBe(200);
    expect(teacherUpsert.body.data.payPerSessionVnd).toBe(260_000);

    const adminPayUpdate = await request(app)
      .put(`/api/v1/teachers/${tBest.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ payPerSessionVnd: 320_000, maxStudents: 15 });
    expect(adminPayUpdate.status).toBe(200);
    expect(adminPayUpdate.body.data.payPerSessionVnd).toBe(320_000);

    await request(app)
      .put(`/api/v1/teachers/${tOther.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        specialties: ['kids'],
        cefrLevels: ['A1'],
        weeklyAvailability: [{ dayOfWeek: 0, startTime: '08:00', endTime: '10:00' }],
      });

    const publicTeachers = await request(app).get('/api/v1/teachers');
    expect(publicTeachers.status).toBe(200);
    expect(publicTeachers.body.data.items[0].payPerSessionVnd).toBeUndefined();

    await request(app)
      .patch('/api/v1/students/me')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        currentCefr: 'B1',
        goal: { goalType: 'ielts', targetScore: '7.0' },
        preferredSlots: [{ dayOfWeek: 1, startTime: '19:30', endTime: '20:30' }],
      });

    const matchRes = await request(app)
      .get('/api/v1/enrollments/match-teachers')
      .set('Authorization', `Bearer ${student.token}`);
    expect(matchRes.status).toBe(200);
    expect(matchRes.body.data.length).toBeGreaterThanOrEqual(2);
    expect(matchRes.body.data[0].teacherUserId).toBe(tBest.id);
    expect(matchRes.body.data[0].score).toBeGreaterThan(matchRes.body.data[1].score);
    expect(matchRes.body.data[0].reasons.length).toBeGreaterThan(0);
  });

  it('credits SessionLedger atomically inside MongoDB transaction upon VietQR confirmation and rejects double confirm', async () => {
    const admin = await seedActor({ email: 'admin@test.local', fullName: 'Admin', role: 'admin' });
    const teacher = await seedActor({ email: 'teacher@test.local', fullName: 'Teacher', role: 'teacher' });
    const student = await seedActor({ email: 'student@test.local', fullName: 'Minh Anh', role: 'student' });

    const course = await Course.create({
      slug: 'comm-1on1',
      title: 'Communication 1-1',
      description: 'Speak daily',
      goalType: 'communication',
      targetCefrRange: ['A2', 'B1'],
      isPublished: true,
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: 'COMM16',
      name: 'Gói 16 Buổi',
      sessionsCount: 16,
      durationMinutes: 45,
      validityDays: 120,
      priceVnd: 5_000_000,
      isActive: true,
    });
    await Coupon.create({
      code: 'WELCOME10',
      discountType: 'percent',
      discountValue: 10,
      maxUses: 5,
      usedCount: 0,
      isActive: true,
    });

    const enrollRes = await request(app)
      .post('/api/v1/enrollments')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        packageId: String(pkg._id),
        teacherId: teacher.id,
        couponCode: 'WELCOME10',
      });

    expect(enrollRes.status).toBe(201);
    const { enrollment, invoice, payment } = enrollRes.body.data;
    expect(enrollment.status).toBe('pending_payment');
    expect(enrollment.remainingSessions).toBe(0);
    expect(invoice.subtotalVnd).toBe(5_000_000);
    expect(invoice.discountVnd).toBe(500_000);
    expect(invoice.totalVnd).toBe(4_500_000);
    expect(invoice.status).toBe('unpaid');
    expect(payment.status).toBe('pending');
    expect(payment.paymentMeta.vietQrImageUrl).toBe(
      `mock://vietqr/${invoice.invoiceCode}?amount=4500000`,
    );

    const bankQr = await new ManualBankTransferProvider().initiatePayment({
      invoiceCode: invoice.invoiceCode,
      amountVnd: 4_500_000,
      studentName: 'Minh Anh',
    });
    expect(bankQr.vietQrImageUrl).toContain('img.vietqr.io');

    // Before confirmation, student balance from SessionLedger is 0
    const beforeLedgerRes = await request(app)
      .get('/api/v1/ledger/me')
      .set('Authorization', `Bearer ${student.token}`);
    expect(beforeLedgerRes.status).toBe(200);
    expect(beforeLedgerRes.body.data.balance).toBe(0);
    expect(beforeLedgerRes.body.data.items).toHaveLength(0);

    // Non-admin cannot confirm payment
    const studentConfirmRes = await request(app)
      .post(`/api/v1/payments/${payment.id}/confirm`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ transactionRef: 'FAKE-TX' });
    expect(studentConfirmRes.status).toBe(403);

    // Admin confirms VietQR transfer inside replica-set transaction
    const confirmRes = await request(app)
      .post(`/api/v1/payments/${payment.id}/confirm`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ transactionRef: 'VCB-20261116-8888', paidAmountVnd: 4_500_000 });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.paymentStatus).toBe('confirmed');
    expect(confirmRes.body.data.invoiceStatus).toBe('paid');
    expect(confirmRes.body.data.enrollmentStatus).toBe('active');
    expect(confirmRes.body.data.remainingSessions).toBe(16);

    // Double confirm must fail cleanly with 409 without crediting extra sessions
    const secondConfirmRes = await request(app)
      .post(`/api/v1/payments/${payment.id}/confirm`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ transactionRef: 'VCB-DUPLICATE' });
    expect(secondConfirmRes.status).toBe(409);

    const afterLedgerRes = await request(app)
      .get('/api/v1/ledger/me')
      .set('Authorization', `Bearer ${student.token}`);
    expect(afterLedgerRes.status).toBe(200);
    expect(afterLedgerRes.body.data.balance).toBe(16);
    expect(afterLedgerRes.body.data.items).toHaveLength(1);
    expect(afterLedgerRes.body.data.items[0].type).toBe('purchase');
    expect(afterLedgerRes.body.data.items[0].delta).toBe(16);

    const updatedCoupon = await Coupon.findOne({ code: 'WELCOME10' }).lean();
    expect(updatedCoupon?.usedCount).toBe(1);

    const profileRes = await request(app)
      .get('/api/v1/students/me')
      .set('Authorization', `Bearer ${student.token}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.lifecycleStatus).toBe('active');
    expect(profileRes.body.data.remainingSessions).toBe(16);
  });

  it('enforces strict IDOR checks across student profiles, ledgers, internalNotes, and safe CSV export', async () => {
    const admin = await seedActor({ email: 'admin@test.local', fullName: 'Admin', role: 'admin' });
    const assignedTeacher = await seedActor({
      email: 'assigned@test.local',
      fullName: 'Assigned Coach',
      role: 'teacher',
    });
    const outsiderTeacher = await seedActor({
      email: 'outsider@test.local',
      fullName: 'Outsider Coach',
      role: 'teacher',
    });
    const studentA = await seedActor({
      email: 'studenta@test.local',
      fullName: '=CMD("calc")',
      role: 'student',
    });
    const studentB = await seedActor({
      email: 'studentb@test.local',
      fullName: 'Student B',
      role: 'student',
    });

    const course = await Course.create({
      slug: 'biz-1on1',
      title: 'Business 1-1',
      description: 'Executive English',
      goalType: 'business',
      targetCefrRange: ['B2'],
      isPublished: true,
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: 'BIZ8',
      name: 'Gói 8 Buổi',
      sessionsCount: 8,
      durationMinutes: 60,
      validityDays: 90,
      priceVnd: 3_200_000,
      isActive: true,
    });

    await Enrollment.create({
      studentId: studentA.id,
      teacherId: assignedTeacher.id,
      courseId: course._id,
      packageId: pkg._id,
      status: 'active',
      purchasedSessions: 8,
      durationMinutes: 60,
      validityDays: 90,
    });

    await request(app)
      .patch(`/api/v1/students/${studentA.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ internalNotes: 'VIP corporate learner - sensitive note', currentCefr: 'B2' });

    // Student B cannot view Student A profile or ledger
    const bReadsAProfile = await request(app)
      .get(`/api/v1/students/${studentA.id}`)
      .set('Authorization', `Bearer ${studentB.token}`);
    expect(bReadsAProfile.status).toBe(403);

    const bReadsALedger = await request(app)
      .get(`/api/v1/ledger/student/${studentA.id}`)
      .set('Authorization', `Bearer ${studentB.token}`);
    expect(bReadsALedger.status).toBe(403);

    // Unassigned teacher cannot view Student A profile or ledger
    const outsiderReadsA = await request(app)
      .get(`/api/v1/students/${studentA.id}`)
      .set('Authorization', `Bearer ${outsiderTeacher.token}`);
    expect(outsiderReadsA.status).toBe(403);

    const outsiderReadsALedger = await request(app)
      .get(`/api/v1/ledger/student/${studentA.id}`)
      .set('Authorization', `Bearer ${outsiderTeacher.token}`);
    expect(outsiderReadsALedger.status).toBe(403);

    // Assigned teacher CAN view Student A profile & ledger (and sees internalNotes)
    const assignedReadsA = await request(app)
      .get(`/api/v1/students/${studentA.id}`)
      .set('Authorization', `Bearer ${assignedTeacher.token}`);
    expect(assignedReadsA.status).toBe(200);
    expect(assignedReadsA.body.data.internalNotes).toBe('VIP corporate learner - sensitive note');

    const assignedReadsALedger = await request(app)
      .get(`/api/v1/ledger/student/${studentA.id}`)
      .set('Authorization', `Bearer ${assignedTeacher.token}`);
    expect(assignedReadsALedger.status).toBe(200);

    // Student A reading /me must NOT receive internalNotes
    const studentAReadsSelf = await request(app)
      .get('/api/v1/students/me')
      .set('Authorization', `Bearer ${studentA.token}`);
    expect(studentAReadsSelf.status).toBe(200);
    expect(studentAReadsSelf.body.data.internalNotes).toBeUndefined();

    // CSV export forbidden to student, safe against formula injection for admin
    const studentCsvRes = await request(app)
      .get('/api/v1/students/export/csv')
      .set('Authorization', `Bearer ${studentA.token}`);
    expect(studentCsvRes.status).toBe(403);

    const adminCsvRes = await request(app)
      .get('/api/v1/students/export/csv')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminCsvRes.status).toBe(200);
    expect(adminCsvRes.headers['content-type']).toContain('text/csv');
    expect(adminCsvRes.text).toContain(`"'=CMD(""calc"")"`);
  });
});
