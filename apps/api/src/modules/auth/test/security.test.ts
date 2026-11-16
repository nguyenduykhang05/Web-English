import { createServer } from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { io as createClientSocket, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../../app.js';
import { attachSocketServer } from '../../../realtime/socket.js';
import { runSeed } from '../../../seed/run.js';
import { User } from '../../users/models/user.model.js';
import { RefreshToken } from '../models/refreshToken.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { TeacherProfile } from '../../teachers/models/teacherProfile.model.js';
import { Course } from '../../courses/models/course.model.js';
import { CoursePackage } from '../../courses/models/coursePackage.model.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { SessionLedger } from '../../ledger/models/sessionLedger.model.js';
import { appendLedgerEntry } from '../../ledger/services/ledger.service.js';
import { Session } from '../../sessions/models/session.model.js';
import { LearningPath } from '../../learningPaths/models/learningPath.model.js';
import { Assessment } from '../../learningPaths/models/assessment.model.js';
import { Homework } from '../../curriculum/models/homework.model.js';
import { Notification } from '../../notifications/models/notification.model.js';
import { AILog } from '../../ai/models/aiLog.model.js';

interface Actor {
  id: string;
  email: string;
  token: string;
  refreshCookie: string;
}

function extractRefreshCookie(header: string[] | string | undefined): string {
  const arr = Array.isArray(header) ? header : header ? [header] : [];
  const row = arr.find((c) => c.startsWith('refreshToken='));
  return row ? row.split(';')[0].replace('refreshToken=', '') : '';
}

describe('Phase 7 — Comprehensive Security Audit (IDOR, Socket.IO Auth/2-Person Room, Rate Limits, NoSQLi, Upload, Production Seed Guard)', () => {
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
      Notification.ensureIndexes(),
      AILog.ensureIndexes(),
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
      RefreshToken.deleteMany({}),
      StudentProfile.deleteMany({}),
      TeacherProfile.deleteMany({}),
      Course.deleteMany({}),
      CoursePackage.deleteMany({}),
      Enrollment.deleteMany({}),
      SessionLedger.deleteMany({}),
      Session.deleteMany({}),
      LearningPath.deleteMany({}),
      Assessment.deleteMany({}),
      Homework.deleteMany({}),
      Notification.deleteMany({}),
      AILog.deleteMany({}),
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
      email: params.email,
      token: loginRes.body.data.accessToken as string,
      refreshCookie: extractRefreshCookie(loginRes.headers['set-cookie']),
    };
  }

  it('blocks IDOR across student, outsider teacher, payroll, AI, homework, placement, notification and session endpoints', async () => {
    const admin = await seedActor({ email: 'adm.sec@test.local', fullName: 'Sec Admin', role: 'admin' });
    const teacherA = await seedActor({ email: 'ta.sec@test.local', fullName: 'Teacher A', role: 'teacher' });
    const teacherB = await seedActor({ email: 'tb.sec@test.local', fullName: 'Teacher B', role: 'teacher' });
    const studentA = await seedActor({ email: 'sa.sec@test.local', fullName: 'Student A', role: 'student' });
    const studentB = await seedActor({ email: 'sb.sec@test.local', fullName: 'Student B', role: 'student' });

    await TeacherProfile.create({ userId: teacherA.id, payPerSessionVnd: 420_000, specialties: ['ielts'] });
    await TeacherProfile.create({ userId: teacherB.id, payPerSessionVnd: 350_000, specialties: ['business'] });

    await StudentProfile.create({
      userId: studentA.id,
      currentCefr: 'B1',
      internalNotes: 'Sensitive internal note',
      consents: { dataPrivacyAccepted: true, aiProcessingAccepted: true },
    });
    await StudentProfile.create({
      userId: studentB.id,
      currentCefr: 'A2',
      consents: { dataPrivacyAccepted: true, aiProcessingAccepted: false },
    });

    const course = await Course.create({
      slug: 'sec-course',
      title: 'Sec Course',
      description: 'Sec',
      goalType: 'ielts',
      targetCefrRange: ['B1'],
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: 'SEC12',
      name: 'Sec 12',
      sessionsCount: 12,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 3_000_000,
    });
    const enrollmentA = await Enrollment.create({
      studentId: studentA.id,
      teacherId: teacherA.id,
      courseId: course._id,
      packageId: pkg._id,
      status: 'active',
      purchasedSessions: 12,
      durationMinutes: 45,
      validityDays: 90,
    });
    await appendLedgerEntry({
      studentId: studentA.id,
      enrollmentId: String(enrollmentA._id),
      type: 'purchase',
      delta: 12,
      reason: 'Seed A',
    });

    const sesA = await Session.create({
      studentId: studentA.id,
      teacherId: teacherA.id,
      enrollmentId: enrollmentA._id,
      courseId: course._id,
      isTrial: false,
      title: 'Session A',
      startAt: new Date(Date.now() - 3_600_000),
      endAt: new Date(Date.now() - 900_000),
      durationMinutes: 45,
      status: 'completed',
      isActive: false,
      meetingProvider: 'jitsi',
      roomCode: 'sec-room-a',
      joinUrl: 'https://meet.jit.si/sec-room-a',
    });

    const pathA = await LearningPath.create({
      studentId: studentA.id,
      title: 'Path A',
      goalType: 'ielts',
      targetCefr: 'B2',
      milestones: [
        {
          id: 'ms-sec-1',
          title: 'Prop MS',
          description: 'Desc',
          cefrTarget: 'B2',
          skillFocus: 'speaking',
          plannedSessions: 2,
          completedSessions: 0,
          status: 'proposed',
          source: 'rule_engine',
        },
      ],
    });

    const hwA = await Homework.create({
      studentId: studentA.id,
      teacherId: teacherA.id,
      title: 'HW A',
      homeworkType: 'multiple_choice',
      skillFocus: 'grammar',
      prompt: 'Prompt',
      questions: [],
      status: 'submitted',
      proposedStatus: 'approved',
    });

    const assessmentA = await Assessment.create({
      studentId: studentA.id,
      type: 'placement',
      status: 'in_progress',
      currentLevel: 'B1',
      maxQuestions: 6,
      askedQuestionIds: ['q-b1-1'],
      answers: [],
    });

    const notifA = await Notification.create({
      userId: studentA.id,
      type: 'system',
      title: 'Private A',
      body: 'Body A',
    });

    const aiLogA = await AILog.create({
      feature: 'weakness_analysis',
      provider: 'mock',
      aiModel: 'mock-v1',
      actorId: teacherA.id,
      studentId: studentA.id,
      promptHash: 'sec-hash-1',
      redactedInputPreview: 'LearnerRef=LEARNER-SEC1',
      latencyMs: 42,
      tokenEstimate: 160,
      consentVerified: true,
      piiRedacted: true,
      status: 'proposed',
      summary: 'AI summary',
      result: {},
    });

    // 1. Public & Student must NOT see teacher payPerSessionVnd
    const publicTeachers = await request(app).get('/api/v1/teachers');
    expect(publicTeachers.status).toBe(200);
    expect(publicTeachers.body.data.items[0].payPerSessionVnd).toBeUndefined();
    const stuViewTeacher = await request(app)
      .get(`/api/v1/teachers/${teacherA.id}`)
      .set('Authorization', `Bearer ${studentA.token}`);
    expect(stuViewTeacher.status).toBe(200);
    expect(stuViewTeacher.body.data.payPerSessionVnd).toBeUndefined();
    const admViewTeacher = await request(app)
      .get(`/api/v1/teachers/${teacherA.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(admViewTeacher.body.data.payPerSessionVnd).toBe(420_000);

    // 2. Student B accessing Student A resources -> 403 / 404
    const stuBChecks = await Promise.all([
      request(app).get(`/api/v1/users/${studentA.id}`).set('Authorization', `Bearer ${studentB.token}`),
      request(app).get(`/api/v1/students/${studentA.id}`).set('Authorization', `Bearer ${studentB.token}`),
      request(app).patch(`/api/v1/students/${studentA.id}`).set('Authorization', `Bearer ${studentB.token}`).send({ occupation: 'Hacked' }),
      request(app).get(`/api/v1/students/${studentA.id}/timeline`).set('Authorization', `Bearer ${studentB.token}`),
      request(app).get(`/api/v1/ledger/student/${studentA.id}`).set('Authorization', `Bearer ${studentB.token}`),
      request(app).get(`/api/v1/learning-paths/student/${studentA.id}`).set('Authorization', `Bearer ${studentB.token}`),
      request(app).get(`/api/v1/reports/students/${studentA.id}/progress`).set('Authorization', `Bearer ${studentB.token}`),
      request(app).get(`/api/v1/sessions/${sesA._id}`).set('Authorization', `Bearer ${studentB.token}`),
      request(app).get(`/api/v1/sessions/${sesA._id}/ics`).set('Authorization', `Bearer ${studentB.token}`),
      request(app).get(`/api/v1/reports/sessions/${sesA._id}`).set('Authorization', `Bearer ${studentB.token}`),
      request(app).post(`/api/v1/curriculum/homework/${hwA._id}/submit`).set('Authorization', `Bearer ${studentB.token}`).send({ answers: [] }),
      request(app).post(`/api/v1/ai/placement-explanation`).set('Authorization', `Bearer ${studentB.token}`).send({ assessmentId: String(assessmentA._id) }),
      request(app).post(`/api/v1/ai/session-summary`).set('Authorization', `Bearer ${studentB.token}`).send({ sessionId: String(sesA._id) }),
    ]);
    for (const r of stuBChecks) {
      expect(r.status).toBe(403);
    }

    // Student B cannot answer Student A placement or mark Student A notification read
    const placeIdor = await request(app)
      .post(`/api/v1/learning-paths/placement/${assessmentA._id}/answer`)
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ questionId: 'q-b1-1', selectedIndex: 1 });
    expect(placeIdor.status).toBe(404);

    const notifIdor = await request(app)
      .post(`/api/v1/notifications/${notifA._id}/read`)
      .set('Authorization', `Bearer ${studentB.token}`);
    expect(notifIdor.status).toBe(404);

    // 3. Unassigned Teacher B accessing Student A / Teacher A resources -> 403
    const teacherBChecks = await Promise.all([
      request(app).get(`/api/v1/students/${studentA.id}`).set('Authorization', `Bearer ${teacherB.token}`),
      request(app).get(`/api/v1/students/${studentA.id}/timeline`).set('Authorization', `Bearer ${teacherB.token}`),
      request(app).get(`/api/v1/ledger/student/${studentA.id}`).set('Authorization', `Bearer ${teacherB.token}`),
      request(app).get(`/api/v1/learning-paths/student/${studentA.id}`).set('Authorization', `Bearer ${teacherB.token}`),
      request(app).post(`/api/v1/learning-paths/${pathA._id}/milestones/ms-sec-1/decision`).set('Authorization', `Bearer ${teacherB.token}`).send({ decision: 'accepted' }),
      request(app).get(`/api/v1/reports/students/${studentA.id}/progress`).set('Authorization', `Bearer ${teacherB.token}`),
      request(app).put(`/api/v1/reports/sessions/${sesA._id}`).set('Authorization', `Bearer ${teacherB.token}`).send({ summary: 'Tampered report text' }),
      request(app).post(`/api/v1/curriculum/homework`).set('Authorization', `Bearer ${teacherB.token}`).send({
        studentId: studentA.id,
        title: 'Unauthorized HW',
        homeworkType: 'essay',
        skillFocus: 'writing',
        prompt: 'Write essay',
      }),
      request(app).post(`/api/v1/curriculum/homework/${hwA._id}/grade`).set('Authorization', `Bearer ${teacherB.token}`).send({ score: 50, teacherFeedback: 'Steal grade' }),
      request(app).post(`/api/v1/ai/logs/${aiLogA._id}/decision`).set('Authorization', `Bearer ${teacherB.token}`).send({ decision: 'approved' }),
      request(app).post(`/api/v1/ai/session-summary`).set('Authorization', `Bearer ${teacherB.token}`).send({ sessionId: String(sesA._id) }),
      request(app).get(`/api/v1/quality/teachers/${teacherA.id}`).set('Authorization', `Bearer ${teacherB.token}`),
      request(app).put(`/api/v1/teachers/${teacherA.id}`).set('Authorization', `Bearer ${teacherB.token}`).send({ bio: 'Hijacked' }),
    ]);
    for (const r of teacherBChecks) {
      expect(r.status).toBe(403);
    }

    // 4. Student attempting Teacher/Admin-only endpoints -> 403
    const stuPriv = await Promise.all([
      request(app).get('/api/v1/students').set('Authorization', `Bearer ${studentA.token}`),
      request(app).get('/api/v1/students/export/csv').set('Authorization', `Bearer ${studentA.token}`),
      request(app).get('/api/v1/settings').set('Authorization', `Bearer ${studentA.token}`),
      request(app).put('/api/v1/settings').set('Authorization', `Bearer ${studentA.token}`).send({ key: 'policies.cancelFreeHours', value: { hours: 1 } }),
      request(app).get('/api/v1/quality/alerts').set('Authorization', `Bearer ${studentA.token}`),
      request(app).post('/api/v1/payrolls/generate').set('Authorization', `Bearer ${studentA.token}`).send({ month: '2026-11' }),
      request(app).post(`/api/v1/ai/logs/${aiLogA._id}/decision`).set('Authorization', `Bearer ${studentA.token}`).send({ decision: 'approved' }),
    ]);
    for (const r of stuPriv) {
      expect(r.status).toBe(403);
    }
  });

  it('enforces JWT authentication at Socket.IO handshake and restricts classroom rooms strictly to the 2 participants', async () => {
    const admin = await seedActor({ email: 'adm.sock@test.local', fullName: 'Admin Sock', role: 'admin' });
    const teacherA = await seedActor({ email: 'ta.sock@test.local', fullName: 'Teacher A', role: 'teacher' });
    const studentA = await seedActor({ email: 'sa.sock@test.local', fullName: 'Student A', role: 'student' });
    const studentB = await seedActor({ email: 'sb.sock@test.local', fullName: 'Student B', role: 'student' });

    const ses = await Session.create({
      studentId: studentA.id,
      teacherId: teacherA.id,
      isTrial: true,
      title: 'Live Socket Security Room',
      startAt: new Date(Date.now() - 2 * 60_000),
      endAt: new Date(Date.now() + 43 * 60_000),
      durationMinutes: 45,
      status: 'scheduled',
      isActive: true,
      meetingProvider: 'jitsi',
      roomCode: 'sock-sec-1',
      joinUrl: 'https://meet.jit.si/sock-sec-1',
    });

    const httpServer = createServer(app);
    attachSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Handshake without token fails
    const noTokenErr = await new Promise<string>((resolve, reject) => {
      const s = createClientSocket(baseUrl, { transports: ['websocket'] });
      s.on('connect', () => {
        s.disconnect();
        reject(new Error('Unauthenticated socket connected'));
      });
      s.on('connect_error', (err) => {
        s.disconnect();
        resolve(err.message);
      });
    });
    expect(noTokenErr).toContain('UNAUTHORIZED');

    // 2. Handshake with tampered JWT fails
    const badJwtErr = await new Promise<string>((resolve, reject) => {
      const s = createClientSocket(baseUrl, {
        auth: { token: 'invalid.jwt.token' },
        transports: ['websocket'],
      });
      s.on('connect', () => {
        s.disconnect();
        reject(new Error('Tampered JWT connected'));
      });
      s.on('connect_error', (err) => {
        s.disconnect();
        resolve(err.message);
      });
    });
    expect(badJwtErr).toContain('UNAUTHORIZED');

    const connectAuthed = (token: string) =>
      new Promise<ClientSocket>((resolve, reject) => {
        const s = createClientSocket(baseUrl, { auth: { token }, transports: ['websocket'] });
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });

    const [tSock, sSock, outsiderSock, adminSock] = await Promise.all([
      connectAuthed(teacherA.token),
      connectAuthed(studentA.token),
      connectAuthed(studentB.token),
      connectAuthed(admin.token),
    ]);

    try {
      const emitJoin = (sock: ClientSocket) =>
        new Promise<{ ok: boolean; code?: string }>((resolve) => {
          sock.emit('classroom:join', { sessionId: String(ses._id) }, resolve);
        });

      const [tAck, sAck, outsiderAck, adminAck] = await Promise.all([
        emitJoin(tSock),
        emitJoin(sSock),
        emitJoin(outsiderSock),
        emitJoin(adminSock),
      ]);

      expect(tAck.ok).toBe(true);
      expect(sAck.ok).toBe(true);
      expect(outsiderAck.ok).toBe(false);
      expect(outsiderAck.code).toBe('FORBIDDEN');
      expect(adminAck.ok).toBe(false);
      expect(adminAck.code).toBe('FORBIDDEN');

      // Outsider trying direct note update without join fails cleanly
      const notesAck = await new Promise<{ ok: boolean }>((resolve) => {
        outsiderSock.emit(
          'classroom:notes:update',
          { sessionId: String(ses._id), content: 'Tamper' },
          resolve,
        );
      });
      expect(notesAck.ok).toBe(false);
    } finally {
      tSock.disconnect();
      sSock.disconnect();
      outsiderSock.disconnect();
      adminSock.disconnect();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  it('enforces NoSQL injection blocking ($ and .), upload MIME/size caps, refresh reuse detection & endpoint rate limits', async () => {
    const user = await seedActor({ email: 'u.hard@test.local', fullName: 'Hardened User', role: 'student' });

    // 1. NoSQL injection via $ and . keys in body & query
    const nosqli1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: { $ne: null }, password: 'x' });
    expect(nosqli1.status).toBe(400);
    expect(nosqli1.body.error.code).toBe('VALIDATION_ERROR');

    const nosqli2 = await request(app)
      .patch(`/api/v1/students/${user.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ 'goal.targetScore': '9.0' });
    expect(nosqli2.status).toBe(400);

    const nosqliQuery = await request(app)
      .get('/api/v1/courses?goalType[$gt]=a');
    expect(nosqliQuery.status).toBe(400);

    // 2. Upload validation: MIME allowlist, extension match, 5MB cap, valid upload/download & traversal protection
    const badMime = await request(app)
      .post('/api/v1/storage/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        folder: 'homework',
        fileName: 'xss.svg',
        mimeType: 'image/svg+xml',
        dataBase64: Buffer.from('<svg></svg>').toString('base64'),
      });
    expect(badMime.status).toBe(400);
    expect(badMime.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const mismatchedExt = await request(app)
      .post('/api/v1/storage/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        folder: 'homework',
        fileName: 'payload.exe',
        mimeType: 'image/png',
        dataBase64: Buffer.from('not-exe').toString('base64'),
      });
    expect(mismatchedExt.status).toBe(400);

    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 512, 65);
    const tooBig = await request(app)
      .post('/api/v1/storage/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        folder: 'homework',
        fileName: 'huge.png',
        mimeType: 'image/png',
        dataBase64: oversizedBuffer.toString('base64'),
      });
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    const validUpload = await request(app)
      .post('/api/v1/storage/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        folder: 'speaking',
        fileName: 'clip.webm',
        mimeType: 'audio/webm',
        dataBase64: Buffer.from('valid-audio-data').toString('base64'),
      });
    expect(validUpload.status).toBe(201);
    expect(validUpload.body.data.mimeType).toBe('audio/webm');

    // 3. Refresh token rotation + reuse detection
    const refresh1 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${user.refreshCookie}`]);
    expect(refresh1.status).toBe(200);

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${user.refreshCookie}`]);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSE_DETECTED');
    expect(await RefreshToken.countDocuments({ userId: user.id, revokedAt: { $exists: false } })).toBe(0);

    // 4. Rate limits on forgot-password (>5/min), refresh (>20/min), login (>20/min) on isolated app instance
    const rlApp = createApp();
    let forgotStatus = 200;
    for (let i = 0; i < 7; i++) {
      const r = await request(rlApp).post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.local' });
      forgotStatus = r.status;
    }
    expect(forgotStatus).toBe(429);

    let refreshRlStatus = 200;
    for (let i = 0; i < 22; i++) {
      const r = await request(rlApp).post('/api/v1/auth/refresh').send({});
      refreshRlStatus = r.status;
    }
    expect(refreshRlStatus).toBe(429);

    let loginRlStatus = 401;
    for (let i = 0; i < 22; i++) {
      const r = await request(rlApp)
        .post('/api/v1/auth/login')
        .send({ email: 'missing@test.local', password: 'WrongPassword123' });
      loginRlStatus = r.status;
    }
    expect(loginRlStatus).toBe(429);
  });

  it('refuses runSeed when NODE_ENV=production and confirms .env is listed in .gitignore', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(runSeed()).rejects.toThrow(/NODE_ENV=production/i);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }

    const gitignorePath = path.resolve(process.cwd(), '../../.gitignore');
    const gitignore = await readFile(gitignorePath, 'utf8');
    const lines = gitignore.split(/\r?\n/).map((l) => l.trim());
    expect(lines).toContain('.env');
  });
});
