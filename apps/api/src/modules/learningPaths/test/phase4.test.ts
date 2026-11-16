import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app.js';
import { User } from '../../users/models/user.model.js';
import { StudentProfile } from '../../students/models/studentProfile.model.js';
import { Course } from '../../courses/models/course.model.js';
import { CoursePackage } from '../../courses/models/coursePackage.model.js';
import { Enrollment } from '../../enrollments/models/enrollment.model.js';
import { ProgressSnapshot } from '../../reports/models/progressSnapshot.model.js';
import { Lesson } from '../../curriculum/models/lesson.model.js';
import { Homework } from '../../curriculum/models/homework.model.js';
import { PathTemplate } from '../models/pathTemplate.model.js';
import { LearningPath } from '../models/learningPath.model.js';
import { Assessment } from '../models/assessment.model.js';
import { Notification } from '../../notifications/models/notification.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';

interface Actor {
  id: string;
  token: string;
}

describe('Phase 4 — Adaptive Placement, Personalized Paths, Rule Engine Proposed & Curriculum/Homework', () => {
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
      Lesson.ensureIndexes(),
      PathTemplate.ensureIndexes(),
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
      Course.deleteMany({}),
      CoursePackage.deleteMany({}),
      Enrollment.deleteMany({}),
      ProgressSnapshot.deleteMany({}),
      Lesson.deleteMany({}),
      Homework.deleteMany({}),
      PathTemplate.deleteMany({}),
      LearningPath.deleteMany({}),
      Assessment.deleteMany({}),
      Notification.deleteMany({}),
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

  it('runs adaptive CEFR placement test (B1 start -> adapt level -> update profile & snapshot)', async () => {
    const student = await seedActor({ email: 's.place@test.local', fullName: 'Minh Place', role: 'student' });

    const startRes = await request(app)
      .post('/api/v1/learning-paths/placement/start')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ targetGoal: 'ielts' });
    expect(startRes.status).toBe(201);
    const assessmentId = startRes.body.data.assessmentId as string;
    let currentQ = startRes.body.data.question as { id: string; level: string };
    expect(currentQ.level).toBe('B1');
    expect((currentQ as Record<string, unknown>).correctIndex).toBeUndefined();

    // Known answers by question id to verify upward & downward branching
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

    // Answer step 1 (B1) correctly -> should adapt UP to B2
    const step1 = await request(app)
      .post(`/api/v1/learning-paths/placement/${assessmentId}/answer`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ questionId: currentQ.id, selectedIndex: correctMap[currentQ.id] });
    expect(step1.status).toBe(200);
    expect(step1.body.data.lastAnswerCorrect).toBe(true);
    expect(step1.body.data.currentLevel).toBe('B2');
    currentQ = step1.body.data.question;
    expect(currentQ.level).toBe('B2');

    // Answer step 2 (B2) wrongly -> should adapt DOWN back to B1
    const wrongIdx = (correctMap[currentQ.id] + 1) % 4;
    const step2 = await request(app)
      .post(`/api/v1/learning-paths/placement/${assessmentId}/answer`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ questionId: currentQ.id, selectedIndex: wrongIdx });
    expect(step2.status).toBe(200);
    expect(step2.body.data.lastAnswerCorrect).toBe(false);
    expect(step2.body.data.currentLevel).toBe('B1');
    currentQ = step2.body.data.question;

    // Complete remaining 4 steps
    let completedPayload: Record<string, unknown> = {};
    for (let i = 3; i <= 6; i++) {
      const res = await request(app)
        .post(`/api/v1/learning-paths/placement/${assessmentId}/answer`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({ questionId: currentQ.id, selectedIndex: correctMap[currentQ.id] });
      expect(res.status).toBe(200);
      if (i < 6) {
        expect(res.body.data.completed).toBe(false);
        currentQ = res.body.data.question;
      } else {
        completedPayload = res.body.data;
      }
    }

    expect(completedPayload.completed).toBe(true);
    expect(completedPayload.cefrResult).toBeTruthy();

    const profile = await StudentProfile.findOne({ userId: student.id }).lean();
    expect(profile?.currentCefr).toBe(completedPayload.cefrResult);

    const snaps = await ProgressSnapshot.find({ studentId: student.id, source: 'assessment' }).lean();
    expect(snaps).toHaveLength(1);

    // Answering after completion fails cleanly
    const extraRes = await request(app)
      .post(`/api/v1/learning-paths/placement/${assessmentId}/answer`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ questionId: 'q-c2-2', selectedIndex: 1 });
    expect(extraRes.status).toBe(409);
  });

  it('generates personalized learning paths with rule-engine proposed milestones & enforces teacher-only approval', async () => {
    const admin = await seedActor({ email: 'adm.lp@test.local', fullName: 'Admin LP', role: 'admin' });
    const assignedTeacher = await seedActor({ email: 't1.lp@test.local', fullName: 'Coach 1', role: 'teacher' });
    const outsiderTeacher = await seedActor({ email: 't2.lp@test.local', fullName: 'Coach 2', role: 'teacher' });
    const student = await seedActor({ email: 's.lp@test.local', fullName: 'Minh LP', role: 'student' });

    const course = await Course.create({
      slug: 'ielts-course-lp',
      title: 'IELTS Course',
      description: 'Test',
      goalType: 'ielts',
      targetCefrRange: ['B1', 'B2'],
    });
    const pkg = await CoursePackage.create({
      courseId: course._id,
      code: 'IELTS12-LP',
      name: 'Gói 12',
      sessionsCount: 12,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 4_000_000,
    });
    await Enrollment.create({
      studentId: student.id,
      teacherId: assignedTeacher.id,
      courseId: course._id,
      packageId: pkg._id,
      status: 'active',
      purchasedSessions: 12,
      durationMinutes: 45,
      validityDays: 90,
    });

    await StudentProfile.create({
      userId: student.id,
      currentCefr: 'B1',
      goal: { goalType: 'ielts', targetScore: '7.0' },
      skillScores: {
        listening: 62,
        speaking: 58,
        reading: 65,
        writing: 55,
        vocabulary: 60,
        grammar: 62,
        pronunciation: 38,
      },
    });

    const tplRes = await request(app)
      .post('/api/v1/learning-paths/templates')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        code: 'IELTS-CORE',
        title: 'IELTS Speaking Mastery Track',
        goalType: 'ielts',
        targetCefr: 'B2',
        milestones: [
          {
            title: 'Part 2 Cue Card Coherence',
            description: 'Structure 2-minute talks',
            cefrTarget: 'B1',
            skillFocus: 'speaking',
            plannedSessions: 4,
          },
          {
            title: 'Part 3 Abstract Argument',
            description: 'Contrast & speculate',
            cefrTarget: 'B2',
            skillFocus: 'vocabulary',
            plannedSessions: 6,
          },
        ],
      });
    expect(tplRes.status).toBe(201);

    const genRes = await request(app)
      .post('/api/v1/learning-paths/generate')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ templateCode: 'IELTS-CORE' });
    expect(genRes.status).toBe(201);
    const pathId = String(genRes.body.data._id);
    const milestones = genRes.body.data.milestones as {
      id: string;
      status: string;
      source: string;
      skillFocus: string;
    }[];

    // Weak pronunciation (38 < 55) must yield a rule-engine PROPOSED milestone
    const proposed = milestones.find((m) => m.status === 'proposed');
    expect(proposed).toBeTruthy();
    expect(proposed?.source).toBe('rule_engine');
    expect(proposed?.skillFocus).toBe('pronunciation');

    // Student CANNOT approve adaptive proposal
    const stuApproveRes = await request(app)
      .post(`/api/v1/learning-paths/${pathId}/milestones/${proposed!.id}/decision`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ decision: 'accepted' });
    expect(stuApproveRes.status).toBe(403);

    // Unassigned teacher CANNOT approve
    const outsiderApproveRes = await request(app)
      .post(`/api/v1/learning-paths/${pathId}/milestones/${proposed!.id}/decision`)
      .set('Authorization', `Bearer ${outsiderTeacher.token}`)
      .send({ decision: 'accepted' });
    expect(outsiderApproveRes.status).toBe(403);

    // Assigned teacher approves proposal with custom edit
    const teacherApproveRes = await request(app)
      .post(`/api/v1/learning-paths/${pathId}/milestones/${proposed!.id}/decision`)
      .set('Authorization', `Bearer ${assignedTeacher.token}`)
      .send({
        decision: 'accepted',
        editedTitle: 'IPA Phonetics Bootcamp (Approved)',
        editedPlannedSessions: 3,
      });
    expect(teacherApproveRes.status).toBe(200);
    const updatedMs = (teacherApproveRes.body.data.milestones as { id: string; status: string; title: string; plannedSessions: number }[]).find(
      (m) => m.id === proposed!.id,
    );
    expect(updatedMs?.status).toBe('pending');
    expect(updatedMs?.title).toBe('IPA Phonetics Bootcamp (Approved)');
    expect(updatedMs?.plannedSessions).toBe(3);

    const getPathRes = await request(app)
      .get('/api/v1/learning-paths/me')
      .set('Authorization', `Bearer ${student.token}`);
    expect(getPathRes.status).toBe(200);
    expect(['on_track', 'at_risk', 'off_track']).toContain(getPathRes.body.data.paceStatus);
  });

  it('manages curated lessons, 5-type homework lifecycle, answer hiding, EMA grading & low-score adaptive trigger', async () => {
    const teacher = await seedActor({ email: 't.hw@test.local', fullName: 'Coach HW', role: 'teacher' });
    const student = await seedActor({ email: 's.hw@test.local', fullName: 'Student HW', role: 'student' });

    await StudentProfile.create({
      userId: student.id,
      currentCefr: 'B1',
      skillScores: {
        listening: 60,
        speaking: 60,
        reading: 60,
        writing: 60,
        vocabulary: 60,
        grammar: 60,
        pronunciation: 60,
      },
    });
    const hwCourse = await Course.create({
      slug: 'hw-course',
      title: 'Homework Course',
      description: 'Course link',
      goalType: 'ielts',
      targetCefrRange: ['B1'],
    });
    const hwPkg = await CoursePackage.create({
      courseId: hwCourse._id,
      code: 'HW-12',
      name: 'HW 12',
      sessionsCount: 12,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 3_000_000,
    });
    await Enrollment.create({
      studentId: student.id,
      teacherId: teacher.id,
      courseId: hwCourse._id,
      packageId: hwPkg._id,
      status: 'active',
      purchasedSessions: 12,
      durationMinutes: 45,
      validityDays: 90,
    });
    const path = await LearningPath.create({
      studentId: student.id,
      title: 'Track',
      goalType: 'ielts',
      targetCefr: 'B2',
      milestones: [
        {
          id: 'm1',
          title: 'Grammar Focus',
          description: 'Core conditionals',
          cefrTarget: 'B1',
          skillFocus: 'grammar',
          plannedSessions: 4,
          completedSessions: 0,
          status: 'in_progress',
          source: 'template',
        },
      ],
    });

    const lessonRes = await request(app)
      .post('/api/v1/curriculum/lessons')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({
        slug: 'conditionals-b1',
        title: 'Second & Third Conditionals',
        description: 'Hypothetical fluency',
        goalType: 'ielts',
        cefrLevel: 'B1',
        skillFocus: 'grammar',
        contentMarkdown: '### Pattern\nIf + Past Simple, would + V',
        sourceName: 'BBC Learning English',
        sourceUrl: 'https://www.bbc.co.uk/learningenglish/',
      });
    expect(lessonRes.status).toBe(201);

    const lessonsList = await request(app).get('/api/v1/curriculum/lessons?cefrLevel=B1');
    expect(lessonsList.status).toBe(200);
    expect(lessonsList.body.data).toHaveLength(1);

    const hwRes = await request(app)
      .post('/api/v1/curriculum/homework')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({
        studentId: student.id,
        lessonId: lessonRes.body.data.id,
        title: 'Conditional Quiz & Rewrite',
        homeworkType: 'multiple_choice',
        skillFocus: 'grammar',
        prompt: 'Complete all 2 questions below.',
        maxScore: 100,
        questions: [
          {
            id: 'hq1',
            type: 'multiple_choice',
            prompt: 'If I ___ rich, I would travel.',
            options: ['am', 'were', 'will be', 'be'],
            correctAnswer: 'were',
            maxPoints: 50,
          },
          {
            id: 'hq2',
            type: 'fill_blank',
            prompt: 'Had she known, she ___ have joined.',
            correctAnswer: 'would',
            maxPoints: 50,
          },
        ],
      });
    expect(hwRes.status).toBe(201);
    const hwId = hwRes.body.data.id as string;

    // Student listing must hide correctAnswer before grading
    const stuList = await request(app)
      .get('/api/v1/curriculum/homework')
      .set('Authorization', `Bearer ${student.token}`);
    expect(stuList.status).toBe(200);
    expect(stuList.body.data[0].questions[0].correctAnswer).toBeUndefined();

    // Student answers 1 right, 1 wrong -> autoSuggestedScore = 50
    const submitRes = await request(app)
      .post(`/api/v1/curriculum/homework/${hwId}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({
        note: 'Submitted before evening session',
        answers: [
          { questionId: 'hq1', answer: 'were' },
          { questionId: 'hq2', answer: 'will' },
        ],
      });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('submitted');
    expect(submitRes.body.data.autoSuggestedScore).toBe(50);

    // Student CANNOT self-grade
    const stuGradeForbidden = await request(app)
      .post(`/api/v1/curriculum/homework/${hwId}/grade`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ score: 100, teacherFeedback: 'Self 100' });
    expect(stuGradeForbidden.status).toBe(403);

    // Teacher grades 45/100 (< 55) -> EMA updates grammar + auto-proposes reinforcement milestone
    const gradeRes = await request(app)
      .post(`/api/v1/curriculum/homework/${hwId}/grade`)
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ score: 45, teacherFeedback: 'Review type 3 conditional inversion before next class.' });
    expect(gradeRes.status).toBe(200);
    expect(gradeRes.body.data.homework.status).toBe('graded');
    // Grammar EMA: 0.3 * 45 + 0.7 * 60 = 13.5 + 42 = 55.5
    expect(gradeRes.body.data.progressUpdate.skillScores.grammar).toBe(55.5);
    expect(gradeRes.body.data.proposedNewMilestone).toBe(true);

    const updatedPath = await LearningPath.findById(path._id).lean();
    const proposedReinforce = updatedPath?.milestones.find(
      (m) => m.status === 'proposed' && m.adjustmentType === 'reinforce',
    );
    expect(proposedReinforce).toBeTruthy();
  });
});
