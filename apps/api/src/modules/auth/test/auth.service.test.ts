import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app.js';
import { User } from '../../users/models/user.model.js';
import { RefreshToken } from '../models/refreshToken.model.js';
import { AuthActionToken } from '../models/authActionToken.model.js';
import { Setting } from '../../settings/models/setting.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { mockMailProvider } from '../../mail/mail.provider.js';

function extractCookieToken(setCookieHeader: string[] | string | undefined): string {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const row = list.find((item) => item.startsWith('refreshToken='));
  if (!row) return '';
  return row.split(';')[0].replace('refreshToken=', '');
}

function extractQueryToken(emailText: string): string {
  const match = emailText.match(/token=([a-f0-9]+)/i);
  return match ? match[1] : '';
}

describe('Phase 0 — M1 Auth, RBAC, IDOR, Mailer, Settings & AuditLog', () => {
  const app = createApp();

  beforeAll(async () => {
    const uri = process.env.MONGODB_URI_TEST ?? 'mongodb://localhost:27017/webenglish_test';
    await mongoose.connect(uri);
  });

  beforeEach(async () => {
    mockMailProvider.clearOutbox();
    await Promise.all([
      User.deleteMany({}),
      RefreshToken.deleteMany({}),
      AuthActionToken.deleteMany({}),
      Setting.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    const adminHash = await bcrypt.hash('Admin@123456', 10);
    await User.create({
      email: 'admin@example.com',
      passwordHash: adminHash,
      fullName: 'Demo Admin',
      role: 'admin',
      status: 'active',
      locale: 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
      emailVerifiedAt: new Date(),
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('forces self-registration to student role and supports email verification', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'learner@example.com',
        password: 'Password@123',
        fullName: 'Nguyễn Minh Anh',
        role: 'admin',
      });

    expect(reg.status).toBe(201);
    expect(reg.body.data.role).toBe('student');
    expect(reg.body.data.emailVerified).toBe(false);

    const outbox = mockMailProvider.getOutbox();
    expect(outbox.length).toBe(1);
    const verifyToken = extractQueryToken(outbox[0].text);
    expect(verifyToken).toBeTruthy();

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: verifyToken });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verified).toBe(true);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'learner@example.com', password: 'Password@123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.emailVerified).toBe(true);

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('learner@example.com');
  });

  it('locks account temporarily after 5 failed attempts and allows admin unlock', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'lockme@example.com',
      password: 'Correct@123',
      fullName: 'Lock Test',
    });

    for (let i = 0; i < 5; i++) {
      const fail = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'lockme@example.com', password: 'WrongPassword' });
      expect(fail.status).toBe(401);
    }

    const lockedAttempt = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockme@example.com', password: 'Correct@123' });
    expect(lockedAttempt.status).toBe(423);
    expect(lockedAttempt.body.error.code).toBe('ACCOUNT_LOCKED');

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin@123456' });
    const adminToken = adminLogin.body.data.accessToken as string;

    const target = await User.findOne({ email: 'lockme@example.com' }).lean();
    const unlockRes = await request(app)
      .post(`/api/v1/users/${String(target?._id)}/unlock`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(unlockRes.status).toBe(200);

    const loginAfterUnlock = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockme@example.com', password: 'Correct@123' });
    expect(loginAfterUnlock.status).toBe(200);
  });

  it('hashes refresh tokens, rotates them, and revokes all sessions on reuse', async () => {
    const login1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin@123456' });
    expect(login1.status).toBe(200);
    const cookie1 = extractCookieToken(login1.headers['set-cookie']);
    expect(cookie1).toBeTruthy();

    // Ensure DB does NOT store raw JWT
    const rawInDb = await RefreshToken.findOne({ tokenHash: cookie1 });
    expect(rawInDb).toBeNull();

    // Another active login session for same user
    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin@123456' });
    const cookie2 = extractCookieToken(login2.headers['set-cookie']);

    // Rotate session 1
    const refresh1 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${cookie1}`]);
    expect(refresh1.status).toBe(200);
    expect(refresh1.body.data.accessToken).toBeTruthy();

    // Replay old cookie1 -> triggers reuse detection across ALL user sessions
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${cookie1}`]);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // Session 2 must also be revoked now!
    const session2Refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${cookie2}`]);
    expect(session2Refresh.status).toBe(401);
  });

  it('completes forgot-password -> reset-password and revokes old sessions', async () => {
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin@123456' });
    const oldCookie = extractCookieToken(adminLogin.headers['set-cookie']);

    mockMailProvider.clearOutbox();
    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'admin@example.com' });
    expect(forgotRes.status).toBe(200);

    const outbox = mockMailProvider.getOutbox();
    expect(outbox.length).toBe(1);
    const resetToken = extractQueryToken(outbox[0].text);
    expect(resetToken).toBeTruthy();

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, password: 'NewAdmin@123456' });
    expect(resetRes.status).toBe(200);

    const oldRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refreshToken=${oldCookie}`]);
    expect(oldRefresh.status).toBe(401);

    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'NewAdmin@123456' });
    expect(loginNew.status).toBe(200);
  });

  it('supports admin teacher invite (72h), strict IDOR protection, and settings + audit logs', async () => {
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin@123456' });
    const adminToken = adminLogin.body.data.accessToken as string;

    // Invite teacher
    mockMailProvider.clearOutbox();
    const inviteRes = await request(app)
      .post('/api/v1/users/invite-teacher')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'sarah.teacher@example.com',
        fullName: 'Ms. Sarah Jenkins',
        timezone: 'America/New_York',
      });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.data.status).toBe('pending');
    expect(inviteRes.body.data.inviteExpiresInHours).toBe(72);

    const inviteToken = extractQueryToken(mockMailProvider.getOutbox()[0].text);
    const acceptRes = await request(app)
      .post('/api/v1/auth/accept-invite')
      .send({ token: inviteToken, password: 'Teacher@123456' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.status).toBe('active');
    expect(acceptRes.body.data.role).toBe('teacher');

    // Register two students and test IDOR protection
    await request(app).post('/api/v1/auth/register').send({
      email: 'stu1@example.com',
      password: 'Password@123',
      fullName: 'Student One',
    });
    await request(app).post('/api/v1/auth/register').send({
      email: 'stu2@example.com',
      password: 'Password@123',
      fullName: 'Student Two',
    });

    const stu1Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'stu1@example.com', password: 'Password@123' });
    const stu1Token = stu1Login.body.data.accessToken as string;
    const stu1Id = stu1Login.body.data.user.id as string;

    const stu2Login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'stu2@example.com', password: 'Password@123' });
    const stu2Id = stu2Login.body.data.user.id as string;

    // Student 1 cannot list all users or read/update Student 2
    expect(
      (await request(app).get('/api/v1/users').set('Authorization', `Bearer ${stu1Token}`)).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/users/${stu2Id}`).set('Authorization', `Bearer ${stu1Token}`))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${stu2Id}`)
          .set('Authorization', `Bearer ${stu1Token}`)
          .send({ fullName: 'Hacked Name' })
      ).status,
    ).toBe(403);

    // Student 1 CAN read and update own profile (but cannot mutate own status)
    const ownPatch = await request(app)
      .patch(`/api/v1/users/${stu1Id}`)
      .set('Authorization', `Bearer ${stu1Token}`)
      .send({ fullName: 'Student One Updated', locale: 'en' });
    expect(ownPatch.status).toBe(200);
    expect(ownPatch.body.data.fullName).toBe('Student One Updated');

    const selfLockAttempt = await request(app)
      .patch(`/api/v1/users/${stu1Id}`)
      .set('Authorization', `Bearer ${stu1Token}`)
      .send({ status: 'locked' });
    expect(selfLockAttempt.status).toBe(403);

    // Admin settings upsert + audit log query; Student forbidden
    expect(
      (await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${stu1Token}`)).status,
    ).toBe(403);

    const putSetting = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'policies.cancelFreeHours', value: { hours: 12 } });
    expect(putSetting.status).toBe(200);

    const auditRes = await request(app)
      .get('/api/v1/settings/audit-logs?action=setting.updated')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.body.data.items[0].entityId).toBe('policies.cancelFreeHours');

    // Validation error returns 400
    const badReg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: '123', fullName: '' });
    expect(badReg.status).toBe(400);
    expect(badReg.body.error.code).toBe('VALIDATION_ERROR');
  });
});
