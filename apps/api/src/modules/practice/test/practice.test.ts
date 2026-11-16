import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app.js';
import { User } from '../../users/models/user.model.js';
import { Session } from '../../sessions/models/session.model.js';
import { SessionReport } from '../../reports/models/sessionReport.model.js';
import { Course } from '../../courses/models/course.model.js';
import { CoursePackage } from '../../courses/models/coursePackage.model.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { VocabDeck } from '../models/vocabDeck.model.js';
import { VocabCard } from '../models/vocabCard.model.js';
import { UserVocabProgress } from '../models/userVocabProgress.model.js';
import { IpaSymbol } from '../models/ipaSymbol.model.js';
import { PracticeMediaLesson } from '../models/practiceMediaLesson.model.js';
import { PracticeAttempt } from '../models/practiceAttempt.model.js';
import { computeNextSrsState } from '../services/srs.helper.js';
import { evaluateWordSequence } from '../services/speechDiff.helper.js';

describe('Practice module — SRS Flashcards, Session Vocab Sync, Dictation/Shadowing & IPA', () => {
  const app = createApp();
  let replSet: MongoMemoryReplSet;

  let studentToken = '';
  let studentId = '';
  let otherStudentToken = '';
  let teacherToken = '';
  let teacherId = '';

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    await mongoose.connect(replSet.getUri());
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Course.deleteMany({}),
      CoursePackage.deleteMany({}),
      Enrollment.deleteMany({}),
      Session.deleteMany({}),
      SessionReport.deleteMany({}),
      VocabDeck.deleteMany({}),
      VocabCard.deleteMany({}),
      UserVocabProgress.deleteMany({}),
      IpaSymbol.deleteMany({}),
      PracticeMediaLesson.deleteMany({}),
      PracticeAttempt.deleteMany({}),
    ]);

    const passHash = await bcrypt.hash('Pass@123456', 10);
    const [teacher, student] = await User.create([
      {
        email: 'teacher-prac@example.com',
        passwordHash: passHash,
        fullName: 'Teacher Practice',
        role: 'teacher',
        status: 'active',
        locale: 'vi',
        timezone: 'Asia/Ho_Chi_Minh',
      },
      {
        email: 'student-prac@example.com',
        passwordHash: passHash,
        fullName: 'Student Practice',
        role: 'student',
        status: 'active',
        locale: 'vi',
        timezone: 'Asia/Ho_Chi_Minh',
      },
      {
        email: 'other-student@example.com',
        passwordHash: passHash,
        fullName: 'Other Student',
        role: 'student',
        status: 'active',
        locale: 'vi',
        timezone: 'Asia/Ho_Chi_Minh',
      },
    ]);

    teacherId = String(teacher._id);
    studentId = String(student._id);

    const loginTeacher = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'teacher-prac@example.com', password: 'Pass@123456' });
    teacherToken = loginTeacher.body.data.accessToken;

    const loginStudent = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'student-prac@example.com', password: 'Pass@123456' });
    studentToken = loginStudent.body.data.accessToken;

    const loginOther = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'other-student@example.com', password: 'Pass@123456' });
    otherStudentToken = loginOther.body.data.accessToken;
  });

  it('computes SM-2 intervals accurately across ratings', () => {
    const now = new Date('2026-11-16T00:00:00Z');
    const firstGood = computeNextSrsState(
      { repetitions: 0, intervalDays: 0, easeFactor: 2.5, lapses: 0 },
      'good',
      now,
    );
    expect(firstGood.repetitions).toBe(1);
    expect(firstGood.intervalDays).toBe(1);

    const secondGood = computeNextSrsState(firstGood, 'good', now);
    expect(secondGood.repetitions).toBe(2);
    expect(secondGood.intervalDays).toBe(6);

    const thirdEasy = computeNextSrsState(secondGood, 'easy', now);
    expect(thirdEasy.repetitions).toBe(3);
    expect(thirdEasy.intervalDays).toBeGreaterThan(10);

    const lapse = computeNextSrsState(thirdEasy, 'again', now);
    expect(lapse.repetitions).toBe(0);
    expect(lapse.intervalDays).toBe(0);
    expect(lapse.lapses).toBe(1);
  });

  it('evaluates dictation & shadowing word diffs deterministically', () => {
    const res = evaluateWordSequence(
      'First, I would turn off my alarm.',
      'First I would turn my alarn',
      3.0,
    );
    expect(res.accuracyPct).toBeLessThan(100);
    expect(res.wordDiffs.some((w) => w.expected.startsWith('off') || w.status !== 'exact')).toBe(true);
    expect(res.fluencyPct).toBeDefined();
  });

  it('syncs 1-on-1 SessionReport vocabItems & quickNotes into student personal SRS deck and enforces IDOR', async () => {
    const course = await Course.create({
      slug: 'test-ielts',
      title: 'Test IELTS',
      goalType: 'ielts',
      isPublished: true,
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: 'TST-10',
      name: 'Test 10',
      sessionsCount: 10,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 1_000_000,
    });
    const enrollment = await Enrollment.create({
      studentId,
      teacherId,
      courseId: course._id,
      packageId: pkg._id,
      status: 'active',
      purchasedSessions: 10,
      durationMinutes: 45,
      validityDays: 90,
    });
    const startAt = new Date('2026-11-15T12:00:00Z');
    const endAt = new Date('2026-11-15T12:45:00Z');
    const session = await Session.create({
      studentId,
      teacherId,
      enrollmentId: enrollment._id,
      courseId: course._id,
      title: 'Session 1',
      startAt,
      endAt,
      durationMinutes: 45,
      status: 'completed',
      isActive: false,
      roomCode: 'TEST-ROOM-1',
      joinUrl: 'https://meet.jit.si/TEST-ROOM-1',
      quickNotes: [
        {
          id: 'qn-1',
          kind: 'vocab',
          term: 'urban sprawl',
          correction: 'sự mở rộng đô thị thiếu kiểm soát',
          contextNote: 'IELTS Part 3',
          createdBy: teacherId,
          createdAt: startAt,
        },
      ],
    });
    await SessionReport.create({
      sessionId: session._id,
      teacherId,
      studentId,
      summary: 'Good progress',
      vocabItems: [
        {
          term: 'mitigate congestion',
          correction: 'giảm thiểu ùn tắc giao thông',
          contextNote: 'Band 7.5+ collocation',
        },
      ],
      submittedAt: endAt,
      dueAt: new Date(endAt.getTime() + 86_400_000),
      submittedOnTime: true,
    });

    const syncRes = await request(app)
      .post('/api/v1/practice/sync-session-vocab')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.data.syncedCount).toBe(2);

    const deckId = syncRes.body.data.deckId as string;

    // Another student must be blocked from reading this personal deck (IDOR check)
    const idorRes = await request(app)
      .get(`/api/v1/practice/decks/${deckId}`)
      .set('Authorization', `Bearer ${otherStudentToken}`);
    expect(idorRes.status).toBe(403);

    // Owner fetches deck & reviews a card with SM-2
    const deckRes = await request(app)
      .get(`/api/v1/practice/decks/${deckId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(deckRes.status).toBe(200);
    expect(deckRes.body.data.cards.length).toBe(2);

    const cardId = deckRes.body.data.cards[0].id as string;
    const reviewRes = await request(app)
      .post('/api/v1/practice/srs/review')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ cardId, rating: 'good' });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.intervalDays).toBe(1);
  });

  it('keeps shadowing attempts in proposed status until teacher approves (blocks student self-approval)', async () => {
    const course = await Course.create({
      slug: 'test-biz',
      title: 'Test Business',
      goalType: 'business',
      isPublished: true,
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: 'BIZ-10',
      name: 'Biz 10',
      sessionsCount: 10,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 1_000_000,
    });
    const enrollment = await Enrollment.create({
      studentId,
      teacherId,
      courseId: course._id,
      packageId: pkg._id,
      status: 'active',
      purchasedSessions: 10,
      durationMinutes: 45,
      validityDays: 90,
    });
    await Session.create({
      studentId,
      teacherId,
      enrollmentId: enrollment._id,
      courseId: course._id,
      title: 'Assigned Session',
      startAt: new Date('2026-11-15T14:00:00Z'),
      endAt: new Date('2026-11-15T14:45:00Z'),
      durationMinutes: 45,
      status: 'completed',
      isActive: false,
      roomCode: 'TEST-ROOM-2',
      joinUrl: 'https://meet.jit.si/TEST-ROOM-2',
    });

    const media = await PracticeMediaLesson.create({
      slug: 'test-media-shadow',
      title: 'Test Media',
      titleVi: 'Bài mẫu',
      topic: 'Business',
      cefrLevel: 'B1',
      goalType: 'business',
      durationSec: 20,
      mediaType: 'speech',
      sourceName: 'VOA Learning English',
      sourceUrl: 'https://learningenglish.voanews.com/',
      segments: [
        {
          index: 0,
          speaker: 'Anna',
          startSec: 0,
          endSec: 5,
          textEn: 'We should not gossip because rumors start fast.',
          textVi: 'Chúng ta không nên bàn tán vì tin đồn lan nhanh.',
        },
      ],
      isPublished: true,
    });

    const dictRes = await request(app)
      .post('/api/v1/practice/dictation')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        lessonId: String(media._id),
        segmentIndex: 0,
        typedText: 'We should not gossip because rumors start fast.',
      });
    expect(dictRes.status).toBe(201);
    expect(dictRes.body.data.accuracyPct).toBe(100);

    const shadowRes = await request(app)
      .post('/api/v1/practice/shadowing')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        lessonId: String(media._id),
        segmentIndex: 0,
        spokenTranscript: 'We should not gossip because rumor start fast',
        durationSec: 3.5,
      });
    expect(shadowRes.status).toBe(201);
    expect(shadowRes.body.data.proposedStatus).toBe('proposed');

    const attemptId = shadowRes.body.data.id as string;

    // Student cannot self-approve
    const selfApprove = await request(app)
      .post(`/api/v1/practice/attempts/${attemptId}/review`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ decision: 'approved', verifiedScore: 95 });
    expect(selfApprove.status).toBe(403);

    // Teacher approves
    const teacherApprove = await request(app)
      .post(`/api/v1/practice/attempts/${attemptId}/review`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        decision: 'approved',
        verifiedScore: 88,
        teacherFeedback: 'Rõ phụ âm cuối ở rumors.',
      });
    expect(teacherApprove.status).toBe(200);
    expect(teacherApprove.body.data.proposedStatus).toBe('approved');
    expect(teacherApprove.body.data.verifiedScore).toBe(88);
  });
});
