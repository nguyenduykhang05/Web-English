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
import { runNoShowSweeperJob, runSessionRemindersJob } from '../../../jobs/sessionJobs.js';
import { mockMailProvider } from '../../mail/mail.provider.js';
import { User } from '../../users/models/user.model.js';
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

describe('Phase 2 — Scheduling, Anti-Double-Booking, Policies, Classroom Socket.IO & Idempotent Jobs', () => {
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
    await Promise.all([Session.ensureIndexes(), Notification.ensureIndexes()]);
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) {
      await replSet.stop();
    }
  }, 30_000);

  beforeEach(async () => {
    mockMailProvider.clearOutbox();
    await Promise.all([
      User.deleteMany({}),
      TeacherProfile.deleteMany({}),
      Course.deleteMany({}),
      CoursePackage.deleteMany({}),
      Enrollment.deleteMany({}),
      SessionLedger.deleteMany({}),
      Session.deleteMany({}),
      Notification.deleteMany({}),
      Setting.deleteMany({}),
      AuditLog.deleteMany({}),
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

  async function seedActiveEnrollment(studentId: string, teacherId: string, sessions = 10) {
    const course = await Course.create({
      slug: `ielts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'IELTS 1-1',
      description: 'Speaking 1-1',
      goalType: 'ielts',
      targetCefrRange: ['B1', 'B2'],
      isPublished: true,
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: `PKG-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      name: 'Gói 10 Buổi',
      sessionsCount: sessions,
      durationMinutes: 45,
      validityDays: 120,
      priceVnd: 4_000_000,
      isActive: true,
    });
    const enrollment = await Enrollment.create({
      studentId,
      teacherId,
      courseId: course._id,
      packageId: pkg._id,
      status: 'active',
      purchasedSessions: sessions,
      durationMinutes: 45,
      validityDays: 120,
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + 120 * 86_400_000),
    });
    await appendLedgerEntry({
      studentId,
      enrollmentId: enrollment._id,
      type: 'purchase',
      delta: sessions,
      reason: 'Seed purchase credit',
    });
    return { course, pkg, enrollment };
  }

  it('computes timezone-aware slots with off/extra exceptions & buffer conflicts', async () => {
    const teacher = await seedActor({
      email: 'teacher.tz@test.local',
      fullName: 'Teacher NY',
      role: 'teacher',
      tz: 'America/New_York',
    });
    const student = await seedActor({
      email: 'student.vn@test.local',
      fullName: 'Student VN',
      role: 'student',
      tz: 'Asia/Ho_Chi_Minh',
    });

    const targetNyDay = dayjs().tz('America/New_York').add(3, 'day').startOf('day');
    const targetDow = targetNyDay.day();
    const targetDateStr = targetNyDay.format('YYYY-MM-DD');

    await TeacherProfile.create({
      userId: teacher.id,
      timezone: 'America/New_York',
      weeklyAvailability: [{ dayOfWeek: targetDow, startTime: '08:00', endTime: '11:00' }],
      exceptions: [
        { date: targetDateStr, type: 'off', startTime: '09:00', endTime: '10:00', reason: 'Doctor' },
        { date: targetDateStr, type: 'extra', startTime: '14:00', endTime: '15:00', reason: 'Bonus' },
      ],
    });

    const fromIso = targetNyDay.toDate().toISOString();
    const slotsRes = await request(app)
      .get('/api/v1/sessions/available-slots')
      .set('Authorization', `Bearer ${student.token}`)
      .query({
        teacherId: teacher.id,
        from: fromIso,
        days: 2,
        durationMinutes: 45,
      });

    expect(slotsRes.status).toBe(200);
    const slots = slotsRes.body.data.slots as {
      startAt: string;
      teacherLocalLabel: string;
      studentLocalLabel: string;
    }[];

    // 08:00-09:00 NY allows 08:00 (45m), 10:00-11:00 NY allows 10:00 (45m), extra 14:00-15:00 NY allows 14:00
    const nyLabels = slots.map((s) => s.teacherLocalLabel);
    expect(nyLabels).toContain(`${targetDateStr} 08:00`);
    expect(nyLabels).toContain(`${targetDateStr} 10:00`);
    expect(nyLabels).toContain(`${targetDateStr} 14:00`);
    // 09:00 must be blocked by the off exception
    expect(nyLabels).not.toContain(`${targetDateStr} 09:00`);
    expect(nyLabels).not.toContain(`${targetDateStr} 09:30`);
  });

  it('prevents concurrent double-booking using transaction + unique partial index and enforces buffer overlap', async () => {
    const teacher = await seedActor({ email: 't.conc@test.local', fullName: 'Coach Conc', role: 'teacher' });
    const studentA = await seedActor({ email: 'sa@test.local', fullName: 'Student A', role: 'student' });
    const studentB = await seedActor({ email: 'sb@test.local', fullName: 'Student B', role: 'student' });

    const { enrollment: enrA } = await seedActiveEnrollment(studentA.id, teacher.id, 5);
    const { enrollment: enrB } = await seedActiveEnrollment(studentB.id, teacher.id, 5);

    const targetStartUtc = dayjs().tz('Asia/Ho_Chi_Minh').add(2, 'day').hour(19).minute(0).second(0).millisecond(0);
    await TeacherProfile.create({
      userId: teacher.id,
      timezone: 'Asia/Ho_Chi_Minh',
      weeklyAvailability: [{ dayOfWeek: targetStartUtc.day(), startTime: '18:00', endTime: '22:00' }],
    });

    const payloadA = {
      teacherId: teacher.id,
      enrollmentId: String(enrA._id),
      startAt: targetStartUtc.toDate().toISOString(),
      durationMinutes: 45,
    };
    const payloadB = {
      teacherId: teacher.id,
      enrollmentId: String(enrB._id),
      startAt: targetStartUtc.toDate().toISOString(),
      durationMinutes: 45,
    };

    const [resA, resB] = await Promise.all([
      request(app).post('/api/v1/sessions').set('Authorization', `Bearer ${studentA.token}`).send(payloadA),
      request(app).post('/api/v1/sessions').set('Authorization', `Bearer ${studentB.token}`).send(payloadB),
    ]);

    const statuses = [resA.status, resB.status].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 409]);

    const activeCount = await Session.countDocuments({ teacherId: teacher.id, isActive: true });
    expect(activeCount).toBe(1);

    const balA = await getEnrollmentBalance(String(enrA._id));
    const balB = await getEnrollmentBalance(String(enrB._id));
    expect(balA + balB).toBe(9); // Exactly one booking debited -1 from total 10

    // Overlapping 19:30 slot while 19:00-19:45 exists must also return 409
    const loserToken = resA.status === 409 ? studentA.token : studentB.token;
    const loserEnrId = resA.status === 409 ? String(enrA._id) : String(enrB._id);
    const overlapRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${loserToken}`)
      .send({
        teacherId: teacher.id,
        enrollmentId: loserEnrId,
        startAt: targetStartUtc.add(30, 'minute').toDate().toISOString(),
        durationMinutes: 45,
      });
    expect(overlapRes.status).toBe(409);

    // 20:00 (15m after 19:45 > 5m buffer) must succeed
    const okNextRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${loserToken}`)
      .send({
        teacherId: teacher.id,
        enrollmentId: loserEnrId,
        startAt: targetStartUtc.add(60, 'minute').toDate().toISOString(),
        durationMinutes: 45,
      });
    expect(okNextRes.status).toBe(201);
  });

  it('enforces single lifetime trial, recurring booking, reschedule limits, cancel refund vs forfeit, and ICS export', async () => {
    const teacher = await seedActor({ email: 't.pol@test.local', fullName: 'Coach Pol', role: 'teacher' });
    const student = await seedActor({ email: 's.pol@test.local', fullName: 'Student Pol', role: 'student' });
    const { enrollment } = await seedActiveEnrollment(student.id, teacher.id, 6);

    const dayFuture = dayjs().tz('Asia/Ho_Chi_Minh').add(4, 'day').hour(10).minute(0).second(0).millisecond(0);
    await TeacherProfile.create({
      userId: teacher.id,
      timezone: 'Asia/Ho_Chi_Minh',
      weeklyAvailability: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
        dayOfWeek: dow,
        startTime: '08:00',
        endTime: '22:00',
      })),
    });

    // Trial #1 succeeds without enrollmentId
    const trial1 = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        teacherId: teacher.id,
        startAt: dayFuture.toDate().toISOString(),
        durationMinutes: 25,
        isTrial: true,
      });
    expect(trial1.status).toBe(201);
    expect(await getEnrollmentBalance(String(enrollment._id))).toBe(6);

    // Trial #2 blocked
    const trial2 = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        teacherId: teacher.id,
        startAt: dayFuture.add(1, 'day').toDate().toISOString(),
        durationMinutes: 25,
        isTrial: true,
      });
    expect(trial2.status).toBe(409);

    // Recurring weekly booking (2 sessions) -> debits 2 from balance (6 -> 4)
    const recurStart = dayFuture.add(2, 'hour');
    const recurRes = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        teacherId: teacher.id,
        enrollmentId: String(enrollment._id),
        startAt: recurStart.toDate().toISOString(),
        durationMinutes: 45,
        recurringCount: 2,
      });
    expect(recurRes.status).toBe(201);
    expect(recurRes.body.data.sessions).toHaveLength(2);
    expect(recurRes.body.data.seriesId).toBeTruthy();
    expect(await getEnrollmentBalance(String(enrollment._id))).toBe(4);

    let sessionId = recurRes.body.data.sessions[0].id as string;

    // ICS export
    const icsRes = await request(app)
      .get(`/api/v1/sessions/${sessionId}/ics`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(icsRes.status).toBe(200);
    expect(icsRes.headers['content-type']).toContain('text/calendar');
    expect(icsRes.text).toContain('BEGIN:VCALENDAR');

    // Reschedule twice (max 2), third blocked
    const resched1 = await request(app)
      .post(`/api/v1/sessions/${sessionId}/reschedule`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ newStartAt: recurStart.add(1, 'hour').toDate().toISOString() });
    expect(resched1.status).toBe(200);
    sessionId = resched1.body.data.id as string;
    expect(await getEnrollmentBalance(String(enrollment._id))).toBe(4); // No extra charge

    const resched2 = await request(app)
      .post(`/api/v1/sessions/${sessionId}/reschedule`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ newStartAt: recurStart.add(2, 'hour').toDate().toISOString() });
    expect(resched2.status).toBe(200);
    sessionId = resched2.body.data.id as string;

    const resched3 = await request(app)
      .post(`/api/v1/sessions/${sessionId}/reschedule`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ newStartAt: recurStart.add(3, 'hour').toDate().toISOString() });
    expect(resched3.status).toBe(409);

    // Free cancel (>= 12h) refunds +1 -> balance 4 -> 5
    const freeCancel = await request(app)
      .post(`/api/v1/sessions/${sessionId}/cancel`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ reason: 'Lich ban ca nhan' });
    expect(freeCancel.status).toBe(200);
    expect(freeCancel.body.data.ledgerEffect).toBe('refunded');
    expect(await getEnrollmentBalance(String(enrollment._id))).toBe(5);

    // Late reschedule (< 12h) blocked; late cancel (< 12h) forfeits 1 session (no refund)
    const secondSessionId = recurRes.body.data.sessions[1].id as string;
    await Session.updateOne(
      { _id: secondSessionId },
      { $set: { startAt: new Date(Date.now() + 3 * 3_600_000), endAt: new Date(Date.now() + 3.75 * 3_600_000) } },
    );
    const lateResched = await request(app)
      .post(`/api/v1/sessions/${secondSessionId}/reschedule`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ newStartAt: dayFuture.add(7, 'hour').toDate().toISOString() });
    expect(lateResched.status).toBe(400);

    const lateCancel = await request(app)
      .post(`/api/v1/sessions/${secondSessionId}/cancel`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ reason: 'Huy sat gio' });
    expect(lateCancel.status).toBe(200);
    expect(lateCancel.body.data.ledgerEffect).toBe('forfeited_late_cancel');
    expect(await getEnrollmentBalance(String(enrollment._id))).toBe(5);

    // Teacher cancel grants +1 makeup_credit
    const thirdBook = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        teacherId: teacher.id,
        enrollmentId: String(enrollment._id),
        startAt: dayFuture.add(5, 'hour').toDate().toISOString(),
        durationMinutes: 45,
      });
    expect(thirdBook.status).toBe(201); // 5 -> 4
    const teacherCancelRes = await request(app)
      .post(`/api/v1/sessions/${thirdBook.body.data.sessions[0].id}/cancel`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ reason: 'Teacher emergency' });
    expect(teacherCancelRes.status).toBe(200);
    expect(teacherCancelRes.body.data.ledgerEffect).toBe('makeup_credited');
    expect(await getEnrollmentBalance(String(enrollment._id))).toBe(5);
  });

  it('guards classroom window & 2-person access, streams Socket.IO chat/notes, and runs idempotent jobs', async () => {
    const admin = await seedActor({ email: 'adm.cls@test.local', fullName: 'Admin', role: 'admin' });
    const teacher = await seedActor({ email: 'tch.cls@test.local', fullName: 'Teacher CLS', role: 'teacher' });
    const student = await seedActor({ email: 'stu.cls@test.local', fullName: 'Student CLS', role: 'student' });
    const outsider = await seedActor({ email: 'out.cls@test.local', fullName: 'Outsider', role: 'student' });

    const { enrollment } = await seedActiveEnrollment(student.id, teacher.id, 4);

    // 1. Future session outside open window must reject join with 403 CLASSROOM_CLOSED
    const closedSession = await Session.create({
      studentId: student.id,
      teacherId: teacher.id,
      enrollmentId: enrollment._id,
      isTrial: false,
      title: 'Closed Future Lesson',
      startAt: new Date(Date.now() + 48 * 3_600_000),
      endAt: new Date(Date.now() + 48.75 * 3_600_000),
      durationMinutes: 45,
      status: 'scheduled',
      isActive: true,
      meetingProvider: 'jitsi',
      roomCode: 'we-closed',
      joinUrl: 'https://meet.jit.si/we-closed',
    });
    const closedJoinRes = await request(app)
      .post(`/api/v1/sessions/${String(closedSession._id)}/join`)
      .set('Authorization', `Bearer ${student.token}`);
    expect(closedJoinRes.status).toBe(403);

    // 2. Open classroom session (T - 2m to T + 45m)
    const liveSession = await Session.create({
      studentId: student.id,
      teacherId: teacher.id,
      enrollmentId: enrollment._id,
      isTrial: false,
      title: 'Live Socket Lesson',
      startAt: new Date(Date.now() + 5 * 60_000),
      endAt: new Date(Date.now() + 50 * 60_000),
      durationMinutes: 45,
      status: 'scheduled',
      isActive: true,
      meetingProvider: 'jitsi',
      roomCode: 'we-live-1',
      joinUrl: 'https://meet.jit.si/we-live-1',
    });
    const liveId = String(liveSession._id);

    // Third user blocked from joining classroom
    const outsiderJoin = await request(app)
      .post(`/api/v1/sessions/${liveId}/join`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(outsiderJoin.status).toBe(403);

    // Start live HTTP + Socket.IO server on ephemeral port
    const httpServer = createServer(app);
    const ioServer = attachSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    let sClient: ClientSocket | undefined;
    let tClient: ClientSocket | undefined;
    try {
      sClient = createClientSocket(baseUrl, { auth: { token: student.token }, transports: ['websocket'] });
      tClient = createClientSocket(baseUrl, { auth: { token: teacher.token }, transports: ['websocket'] });

      await Promise.all([
        new Promise<void>((res) => sClient!.on('connect', res)),
        new Promise<void>((res) => tClient!.on('connect', res)),
      ]);

      const tJoinAck = await new Promise<Record<string, unknown>>((resolve) =>
        tClient!.emit('classroom:join', { sessionId: liveId }, resolve),
      );
      const sJoinAck = await new Promise<Record<string, unknown>>((resolve) =>
        sClient!.emit('classroom:join', { sessionId: liveId }, resolve),
      );
      expect(tJoinAck.ok).toBe(true);
      expect(sJoinAck.ok).toBe(true);

      // Verify realtime broadcast for shared notes, quick note & chat message
      const notePromise = new Promise<{ sharedNotes: string }>((resolve) =>
        sClient!.on('classroom:notes:updated', resolve),
      );
      tClient.emit('classroom:notes:update', {
        sessionId: liveId,
        content: 'Updated grammar focus: conditionals',
      });
      const noteEvent = await notePromise;
      expect(noteEvent.sharedNotes).toBe('Updated grammar focus: conditionals');

      const chatPromise = new Promise<{ message: { text: string } }>((resolve) =>
        tClient!.on('classroom:chat:message', resolve),
      );
      sClient.emit('classroom:chat:send', { sessionId: liveId, text: 'Ready for Part 3!' });
      const chatEvent = await chatPromise;
      expect(chatEvent.message.text).toBe('Ready for Part 3!');

      // Teacher ends session -> completed & isActive false
      const endRes = await request(app)
        .post(`/api/v1/sessions/${liveId}/end`)
        .set('Authorization', `Bearer ${teacher.token}`);
      expect(endRes.status).toBe(200);
      expect(endRes.body.data.status).toBe('completed');
    } finally {
      sClient?.disconnect();
      tClient?.disconnect();
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
      httpServer.close();
    }

    // 3. Reminder cron job idempotency (run 3 times -> still only 2 notifications total)
    const reminderTarget = await Session.create({
      studentId: student.id,
      teacherId: teacher.id,
      enrollmentId: enrollment._id,
      isTrial: false,
      title: '10m Reminder Target',
      startAt: new Date(Date.now() + 8 * 60_000),
      endAt: new Date(Date.now() + 53 * 60_000),
      durationMinutes: 45,
      status: 'scheduled',
      isActive: true,
      meetingProvider: 'jitsi',
      roomCode: 'we-rem-1',
      joinUrl: 'https://meet.jit.si/we-rem-1',
    });
    const now = new Date();
    const run1 = await runSessionRemindersJob(now);
    const run2 = await runSessionRemindersJob(now);
    const run3 = await runSessionRemindersJob(now);
    expect(run1.createdCount).toBe(2);
    expect(run2.createdCount).toBe(0);
    expect(run3.createdCount).toBe(0);
    expect(mockMailProvider.getOutbox()).toHaveLength(2);

    // Test notifications read-all API
    const myNotifs = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${student.token}`);
    expect(myNotifs.status).toBe(200);
    expect(myNotifs.body.data.unreadCount).toBeGreaterThanOrEqual(1);

    // 4. No-show sweeper: overdue session with missing teacher grants +1 makeup credit & alerts admin
    await appendLedgerEntry({
      studentId: student.id,
      enrollmentId: enrollment._id,
      type: 'booking_debit',
      delta: -1,
      reason: 'Seed overdue debit',
    });
    const balBeforeNoShow = await getEnrollmentBalance(String(enrollment._id));
    await Session.updateOne(
      { _id: reminderTarget._id },
      {
        $set: {
          startAt: new Date(Date.now() - 15 * 60_000),
          endAt: new Date(Date.now() + 30 * 60_000),
        },
      },
    );

    const sweep = await runNoShowSweeperJob(new Date());
    expect(sweep.processed).toBe(1);
    const sweptDoc = await Session.findById(reminderTarget._id).lean();
    expect(sweptDoc?.status).toBe('no_show_teacher');
    expect(sweptDoc?.isActive).toBe(false);
    expect(await getEnrollmentBalance(String(enrollment._id))).toBe(balBeforeNoShow + 1);

    const adminNotifs = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminNotifs.status).toBe(200);
    expect(
      (adminNotifs.body.data.items as { type: string }[]).some((n) => n.type === 'session_no_show'),
    ).toBe(true);
  });
});
