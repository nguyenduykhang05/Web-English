import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { createApp } from '../../../app.js';
import { runExpiredEnrollmentsJob } from '../../../jobs/sessionJobs.js';
import { User } from '../../users/models/user.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { Course } from '../../courses/models/course.model.js';
import { CoursePackage } from '../../courses/models/coursePackage.model.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { SessionLedger } from '../../ledger/models/sessionLedger.model.js';
import { appendLedgerEntry, getEnrollmentBalance } from '../../ledger/services/ledger.service.js';
import { Setting } from '../../settings/models/setting.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { Notification } from '../../notifications/models/notification.model.js';
import { Session } from '../models/session.model.js';

dayjs.extend(utc);
dayjs.extend(timezone);

interface Actor {
  id: string;
  token: string;
}

describe('Phase 7 — Concurrency, Write-Conflict Serialization, Freeze & Package Expiry', () => {
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
      TeacherProfile.ensureIndexes(),
      StudentProfile.ensureIndexes(),
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
      SessionLedger.deleteMany({}),
      Session.deleteMany({}),
      Setting.deleteMany({}),
      AuditLog.deleteMany({}),
      Notification.deleteMany({}),
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

  async function seedFullDayTeacher(teacherId: string) {
    return TeacherProfile.create({
      userId: teacherId,
      timezone: 'Asia/Ho_Chi_Minh',
      specialties: ['ielts'],
      weeklyAvailability: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: '08:00',
        endTime: '22:30',
      })),
    });
  }

  async function seedActiveEnrollment(studentId: string, teacherId: string, credits: number) {
    const course = await Course.create({
      slug: `conc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'Concurrency Course',
      description: 'Test',
      goalType: 'ielts',
      targetCefrRange: ['B1', 'B2'],
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: `C-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      name: `Pkg ${credits}`,
      sessionsCount: credits,
      durationMinutes: 60,
      validityDays: 90,
      priceVnd: 1_500_000,
    });
    const enrollment = await Enrollment.create({
      studentId,
      teacherId,
      courseId: course._id,
      packageId: pkg._id,
      status: 'active',
      purchasedSessions: credits,
      durationMinutes: 60,
      validityDays: 90,
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 86_400_000),
    });
    await appendLedgerEntry({
      studentId,
      enrollmentId: String(enrollment._id),
      type: 'purchase',
      delta: credits,
      reason: 'Seed concurrent credits',
    });
    return String(enrollment._id);
  }

  function futureVnIso(daysAhead: number, hhmm: string): string {
    const dateStr = dayjs().tz('Asia/Ho_Chi_Minh').add(daysAhead, 'day').format('YYYY-MM-DD');
    return dayjs.tz(`${dateStr} ${hhmm}`, 'YYYY-MM-DD HH:mm', 'Asia/Ho_Chi_Minh').toISOString();
  }

  it('2a: two parallel booking requests for the exact same (teacherId, startAt) allow strictly one', async () => {
    const teacher = await seedActor({ email: 't.2a@conc.local', fullName: 'Teacher 2A', role: 'teacher' });
    const s1 = await seedActor({ email: 's1.2a@conc.local', fullName: 'Student 1', role: 'student' });
    const s2 = await seedActor({ email: 's2.2a@conc.local', fullName: 'Student 2', role: 'student' });

    await seedFullDayTeacher(teacher.id);
    const e1 = await seedActiveEnrollment(s1.id, teacher.id, 3);
    const e2 = await seedActiveEnrollment(s2.id, teacher.id, 3);

    const slotIso = futureVnIso(3, '19:00');
    const [r1, r2] = await Promise.all([
      request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${s1.token}`)
        .send({ teacherId: teacher.id, enrollmentId: e1, startAt: slotIso, durationMinutes: 60 }),
      request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${s2.token}`)
        .send({ teacherId: teacher.id, enrollmentId: e2, startAt: slotIso, durationMinutes: 60 }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await Session.countDocuments({ teacherId: teacher.id, isActive: true })).toBe(1);

    const b1 = await getEnrollmentBalance(e1);
    const b2 = await getEnrollmentBalance(e2);
    expect([b1, b2].sort()).toEqual([2, 3]);
  });

  it('2b: two parallel overlapping bookings with DIFFERENT startAt (60m at 19:00 and 45m at 19:30) allow strictly one via snapshot write-conflict lock', async () => {
    const teacher = await seedActor({ email: 't.2b@conc.local', fullName: 'Teacher 2B', role: 'teacher' });
    const s1 = await seedActor({ email: 's1.2b@conc.local', fullName: 'Student B1', role: 'student' });
    const s2 = await seedActor({ email: 's2.2b@conc.local', fullName: 'Student B2', role: 'student' });

    await seedFullDayTeacher(teacher.id);
    const e1 = await seedActiveEnrollment(s1.id, teacher.id, 4);
    const e2 = await seedActiveEnrollment(s2.id, teacher.id, 4);

    const start1900 = futureVnIso(3, '19:00');
    const start1930 = futureVnIso(3, '19:30');

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${s1.token}`)
        .send({ teacherId: teacher.id, enrollmentId: e1, startAt: start1900, durationMinutes: 60 }),
      request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${s2.token}`)
        .send({ teacherId: teacher.id, enrollmentId: e2, startAt: start1930, durationMinutes: 45 }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const activeCount = await Session.countDocuments({ teacherId: teacher.id, isActive: true });
    expect(activeCount).toBe(1);

    // Same student concurrently booking two overlapping sessions across TWO DIFFERENT teachers must also allow strictly 1
    const teacher2 = await seedActor({ email: 't2.2b@conc.local', fullName: 'Teacher 2B-2', role: 'teacher' });
    await seedFullDayTeacher(teacher2.id);
    const s3 = await seedActor({ email: 's3.2b@conc.local', fullName: 'Student B3', role: 'student' });
    const e3 = await seedActiveEnrollment(s3.id, teacher.id, 4);

    const [stRes1, stRes2] = await Promise.all([
      request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${s3.token}`)
        .send({ teacherId: teacher.id, enrollmentId: e3, startAt: futureVnIso(4, '19:00'), durationMinutes: 60 }),
      request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${s3.token}`)
        .send({ teacherId: teacher2.id, enrollmentId: e3, startAt: futureVnIso(4, '19:30'), durationMinutes: 45 }),
    ]);

    expect([stRes1.status, stRes2.status].sort()).toEqual([201, 409]);
    expect(await Session.countDocuments({ studentId: s3.id, isActive: true })).toBe(1);
    expect(await getEnrollmentBalance(e3)).toBe(3);
  });

  it('2c: enrollment with 1 credit remaining handles two concurrent distinct slot bookings with strictly one success and non-negative ledger', async () => {
    const teacher = await seedActor({ email: 't.2c@conc.local', fullName: 'Teacher 2C', role: 'teacher' });
    const student = await seedActor({ email: 's.2c@conc.local', fullName: 'Student 2C', role: 'student' });

    await seedFullDayTeacher(teacher.id);
    const enrollmentId = await seedActiveEnrollment(student.id, teacher.id, 1);

    const slot1800 = futureVnIso(5, '18:00');
    const slot2000 = futureVnIso(5, '20:00');

    const [r1, r2] = await Promise.all([
      request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${student.token}`)
        .send({ teacherId: teacher.id, enrollmentId, startAt: slot1800, durationMinutes: 45 }),
      request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${student.token}`)
        .send({ teacherId: teacher.id, enrollmentId, startAt: slot2000, durationMinutes: 45 }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await getEnrollmentBalance(enrollmentId)).toBe(0);
    expect(await Session.countDocuments({ studentId: student.id, isActive: true })).toBe(1);
  });

  it('enforces freeze limit (max 30 days) and zeroes expired package balances via ledger expire job', async () => {
    const student = await seedActor({ email: 's.frz@conc.local', fullName: 'Freeze Student', role: 'student' });
    const teacher = await seedActor({ email: 't.frz@conc.local', fullName: 'Freeze Teacher', role: 'teacher' });
    const enrollmentId = await seedActiveEnrollment(student.id, teacher.id, 5);

    const overFreeze = await request(app)
      .post(`/api/v1/enrollments/${enrollmentId}/freeze`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ days: 31, reason: 'Long vacation' });
    expect(overFreeze.status).toBe(400);

    const validFreeze = await request(app)
      .post(`/api/v1/enrollments/${enrollmentId}/freeze`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ days: 14, reason: 'Business travel' });
    expect(validFreeze.status).toBe(200);
    expect(validFreeze.body.data.status).toBe('paused');
    expect(validFreeze.body.data.frozenDaysTotal).toBe(14);

    // Unfreeze then force expiration past now -> runExpiredEnrollmentsJob must append 'expire' (-5) -> balance = 0
    const unfreeze = await request(app)
      .post(`/api/v1/enrollments/${enrollmentId}/unfreeze`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({});
    expect(unfreeze.status).toBe(200);
    expect(unfreeze.body.data.status).toBe('active');

    await Enrollment.updateOne(
      { _id: enrollmentId },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );

    const expRun1 = await runExpiredEnrollmentsJob();
    expect(expRun1.expiredCount).toBe(1);
    expect(await getEnrollmentBalance(enrollmentId)).toBe(0);

    const expireEntry = await SessionLedger.findOne({ enrollmentId, type: 'expire' }).lean();
    expect(expireEntry?.delta).toBe(-5);

    // Idempotent second run does nothing
    const expRun2 = await runExpiredEnrollmentsJob();
    expect(expRun2.expiredCount).toBe(0);
    expect(await getEnrollmentBalance(enrollmentId)).toBe(0);
  });
});
