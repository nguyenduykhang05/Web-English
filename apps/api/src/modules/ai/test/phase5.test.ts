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
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { Invoice } from '../../payments/models/invoice.model.js';
import { Payment } from '../../payments/models/payment.model.js';
import { SessionLedger } from '../../ledger/models/sessionLedger.model.js';
import { getEnrollmentBalance } from '../../ledger/services/ledger.service.js';
import { signVnpayParams } from '../../payments/payment.provider.js';
import { Session } from '../../sessions/models/session.model.js';
import { Assessment } from '../../learningPaths/models/assessment.model.js';
import { LearningPath } from '../../learningPaths/models/learningPath.model.js';
import { Homework } from '../../curriculum/models/homework.model.js';
import { Notification } from '../../notifications/models/notification.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { AILog } from '../models/aiLog.model.js';
import { MockStorageService } from '../../storage/storage.service.js';

interface Actor {
  id: string;
  token: string;
}

describe('Phase 5 — AI Provider (8 Features, Consent, PII Redaction, Proposed Gate) & VNPay Sandbox', () => {
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
      AILog.ensureIndexes(),
      Invoice.ensureIndexes(),
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
      Assessment.deleteMany({}),
      LearningPath.deleteMany({}),
      Homework.deleteMany({}),
      Notification.deleteMany({}),
      AuditLog.deleteMany({}),
      AILog.deleteMany({}),
    ]);
  });

  async function seedActor(params: {
    email: string;
    fullName: string;
    role: 'admin' | 'teacher' | 'student';
    phone?: string;
  }): Promise<Actor> {
    const password = 'Password123!';
    const passwordHash = await bcrypt.hash(password, 8);
    const user = await User.create({
      email: params.email,
      passwordHash,
      fullName: params.fullName,
      role: params.role,
      phone: params.phone,
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

  it('blocks AI calls without consent, redacts PII, executes all 8 AI features as proposed, and enforces teacher approval', async () => {
    const teacher = await seedActor({
      email: 't.ai@test.local',
      fullName: 'Coach AI',
      role: 'teacher',
    });
    const student = await seedActor({
      email: 'minh.secret@example.com',
      fullName: 'Nguyen Minh Anh',
      phone: '0912345678',
      role: 'student',
    });

    await TeacherProfile.create({
      userId: teacher.id,
      specialties: ['ielts'],
      cefrLevels: ['B1', 'B2'],
    });
    const profile = await StudentProfile.create({
      userId: student.id,
      currentCefr: 'B1',
      goal: { goalType: 'ielts', targetScore: '7.0' },
      skillScores: {
        listening: 58,
        speaking: 52,
        reading: 60,
        writing: 55,
        vocabulary: 57,
        grammar: 59,
        pronunciation: 42,
      },
      consents: {
        dataPrivacyAccepted: true,
        aiProcessingAccepted: false,
      },
    });

    const course = await Course.create({
      slug: 'ielts-ai-test',
      title: 'IELTS AI',
      description: 'Test',
      goalType: 'ielts',
      targetCefrRange: ['B1'],
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: 'AI12',
      name: 'AI 12',
      sessionsCount: 12,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 4_000_000,
    });
    await Enrollment.create({
      studentId: student.id,
      teacherId: teacher.id,
      courseId: course._id,
      packageId: pkg._id,
      status: 'active',
      purchasedSessions: 12,
      durationMinutes: 45,
      validityDays: 90,
    });

    // 1. Without AI consent -> 403 AI_CONSENT_REQUIRED
    const noConsentRes = await request(app)
      .post('/api/v1/ai/writing-assessment')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        promptText: 'Should cities invest more in public transit?',
        essayText:
          'Public transport reduces urban traffic congestion and lowers carbon emissions across metropolitan areas.',
      });
    expect(noConsentRes.status).toBe(403);
    expect(noConsentRes.body.error.code).toBe('AI_CONSENT_REQUIRED');

    // Grant AI consent
    await StudentProfile.updateOne(
      { _id: profile._id },
      { $set: { 'consents.aiProcessingAccepted': true } },
    );

    // 2. Writing assessment with PII inside text -> must redact all PII before prompt hashing/provider
    const writingRes = await request(app)
      .post('/api/v1/ai/writing-assessment')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        promptText: 'Urban transit essay',
        essayText:
          'My name is Nguyen Minh Anh (email: minh.secret@example.com, phone: 0912345678). Cities must expand metro lines urgently.',
        targetBand: '7.0',
      });
    expect(writingRes.status).toBe(201);
    expect(writingRes.body.data.status).toBe('proposed');
    expect(writingRes.body.data.piiRedacted).toBe(true);
    expect(writingRes.body.data.redactedInputPreview).not.toContain('Nguyen Minh Anh');
    expect(writingRes.body.data.redactedInputPreview).not.toContain('minh.secret@example.com');
    expect(writingRes.body.data.redactedInputPreview).not.toContain('0912345678');

    // 3. Speaking assessment
    const speakingRes = await request(app)
      .post('/api/v1/ai/speaking-assessment')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        promptText: 'Describe a city you enjoy visiting.',
        transcriptText: 'I love visiting Da Nang because the coastline is clean and calm.',
      });
    expect(speakingRes.status).toBe(201);
    expect(speakingRes.body.data.status).toBe('proposed');

    // 4. Placement explanation
    const assessment = await Assessment.create({
      studentId: student.id,
      type: 'placement',
      status: 'completed',
      currentLevel: 'B1',
      overallScore: 52,
      cefrResult: 'B1',
    });
    const placementExplain = await request(app)
      .post('/api/v1/ai/placement-explanation')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ assessmentId: String(assessment._id) });
    expect(placementExplain.status).toBe(201);
    expect(placementExplain.body.data.status).toBe('proposed');

    // 5. Learning path proposal -> attaches status='proposed', source='ai' milestone
    const path = await LearningPath.create({
      studentId: student.id,
      title: 'IELTS Track',
      goalType: 'ielts',
      targetCefr: 'B2',
      milestones: [],
    });
    const pathPropRes = await request(app)
      .post('/api/v1/ai/path-proposal')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ focusGoal: 'IELTS Speaking Part 3' });
    expect(pathPropRes.status).toBe(201);
    expect(pathPropRes.body.data.status).toBe('proposed');
    const pathLogId = pathPropRes.body.data.id as string;

    // 6. Exercise generation (teacher) -> creates Homework in proposedStatus='proposed' (hidden from student)
    const exGenRes = await request(app)
      .post('/api/v1/ai/exercise-generation')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({
        studentId: student.id,
        skillFocus: 'vocabulary',
        cefrLevel: 'B2',
        homeworkType: 'multiple_choice',
        topic: 'Urban Sustainability',
      });
    expect(exGenRes.status).toBe(201);
    expect(exGenRes.body.data.status).toBe('proposed');
    const exLogId = exGenRes.body.data.id as string;

    const hwBeforeApproval = await request(app)
      .get('/api/v1/curriculum/homework')
      .set('Authorization', `Bearer ${student.token}`);
    expect(hwBeforeApproval.status).toBe(200);
    expect(hwBeforeApproval.body.data).toHaveLength(0);

    // 7. Session summary & 8. Weakness analysis & 9. Matching explanation
    const ses = await Session.create({
      studentId: student.id,
      teacherId: teacher.id,
      isTrial: true,
      title: 'Speaking Coaching',
      startAt: new Date(Date.now() - 3_600_000),
      endAt: new Date(Date.now() - 900_000),
      durationMinutes: 45,
      status: 'completed',
      isActive: false,
      meetingProvider: 'jitsi',
      roomCode: 'we-ai-s1',
      joinUrl: 'https://meet.jit.si/we-ai-s1',
      sharedNotes: 'Practiced linking /s/ and urban idioms.',
    });
    const [sumRes, weakRes, matchExpRes] = await Promise.all([
      request(app)
        .post('/api/v1/ai/session-summary')
        .set('Authorization', `Bearer ${teacher.token}`)
        .send({ sessionId: String(ses._id) }),
      request(app)
        .post('/api/v1/ai/weakness-analysis')
        .set('Authorization', `Bearer ${student.token}`)
        .send({}),
      request(app)
        .post('/api/v1/ai/matching-explanation')
        .set('Authorization', `Bearer ${student.token}`)
        .send({ teacherId: teacher.id }),
    ]);
    expect(sumRes.status).toBe(201);
    expect(weakRes.status).toBe(201);
    expect(matchExpRes.status).toBe(201);
    expect(await AILog.countDocuments({ studentId: student.id })).toBe(8);

    // Student CANNOT self-approve AI proposal
    const stuApproveForbidden = await request(app)
      .post(`/api/v1/ai/logs/${exLogId}/decision`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ decision: 'approved' });
    expect(stuApproveForbidden.status).toBe(403);

    // Teacher approves generated exercise & AI path proposal
    const approveExRes = await request(app)
      .post(`/api/v1/ai/logs/${exLogId}/decision`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ decision: 'approved', reviewNote: 'Phù hợp trình độ B1-B2' });
    expect(approveExRes.status).toBe(200);
    expect(approveExRes.body.data.status).toBe('approved');

    const hwAfterApproval = await request(app)
      .get('/api/v1/curriculum/homework')
      .set('Authorization', `Bearer ${student.token}`);
    expect(hwAfterApproval.status).toBe(200);
    expect(hwAfterApproval.body.data).toHaveLength(1);

    const approvePathRes = await request(app)
      .post(`/api/v1/ai/logs/${pathLogId}/decision`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ decision: 'approved' });
    expect(approvePathRes.status).toBe(200);

    const updatedPath = await LearningPath.findById(path._id).lean();
    expect(updatedPath?.milestones[0].status).toBe('pending');
  });

  it('completes VNPay Sandbox checkout URL generation, HMAC-SHA512 IPN verification & idempotent ledger credit', async () => {
    const student = await seedActor({
      email: 's.vnp@test.local',
      fullName: 'Nguyen Van Pay',
      role: 'student',
    });

    const course = await Course.create({
      slug: 'vnpay-course',
      title: 'VNPay 1-1',
      description: 'Test',
      goalType: 'communication',
      targetCefrRange: ['A2', 'B1'],
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: 'VNP12',
      name: 'Gói 12 Buổi VNPay',
      sessionsCount: 12,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 3_600_000,
    });

    const enrollRes = await request(app)
      .post('/api/v1/enrollments')
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        packageId: String(pkg._id),
        paymentMethod: 'vnpay_sandbox',
      });
    expect(enrollRes.status).toBe(201);
    const { enrollment, invoice, payment } = enrollRes.body.data;
    expect(payment.provider).toBe('vnpay_sandbox');
    expect(payment.paymentMeta.checkoutUrl).toContain('vnp_SecureHash=');

    // 1. Tampered signature -> RspCode 97
    const invalidSigRes = await request(app)
      .get('/api/v1/payments/vnpay/ipn')
      .query({
        vnp_TxnRef: invoice.invoiceCode,
        vnp_Amount: String(invoice.totalVnd * 100),
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_SecureHash: 'tamperedhash123',
      });
    expect(invalidSigRes.status).toBe(200);
    expect(invalidSigRes.body.RspCode).toBe('97');
    expect(await getEnrollmentBalance(enrollment.id)).toBe(0);

    // 2. Valid HMAC-SHA512 signed IPN -> activates enrollment & credits SessionLedger (+12)
    const validParams: Record<string, string> = {
      vnp_TxnRef: invoice.invoiceCode,
      vnp_Amount: String(invoice.totalVnd * 100),
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: 'VNP-14889900',
    };
    const signature = signVnpayParams(validParams);

    const ipnOk = await request(app)
      .get('/api/v1/payments/vnpay/ipn')
      .query({ ...validParams, vnp_SecureHash: signature });
    expect(ipnOk.status).toBe(200);
    expect(ipnOk.body.RspCode).toBe('00');
    expect(await getEnrollmentBalance(enrollment.id)).toBe(12);

    // 3. Replaying same IPN must return 02 without double-crediting
    const ipnReplay = await request(app)
      .get('/api/v1/payments/vnpay/ipn')
      .query({ ...validParams, vnp_SecureHash: signature });
    expect(ipnReplay.status).toBe(200);
    expect(ipnReplay.body.RspCode).toBe('02');
    expect(await getEnrollmentBalance(enrollment.id)).toBe(12);

    // 4. Verify StorageService offline mock adapter
    const storage = new MockStorageService();
    const saved = await storage.putObject({
      folder: 'speaking',
      originalName: 'part2.webm',
      mimeType: 'audio/webm',
      buffer: Buffer.from('audio-mock-bytes'),
    });
    expect(saved.url).toContain('mock://storage/speaking/');
    const loaded = await storage.getObject(saved.key);
    expect(loaded.toString()).toBe('audio-mock-bytes');
  });
});
