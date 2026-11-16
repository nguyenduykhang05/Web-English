import fs from 'node:fs';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../modules/users/models/user.model.js';
import { Setting } from '../modules/settings/models/setting.model.js';
import { StudentProfile } from '../modules/students/models/studentProfile.model.js';
import { TeacherProfile } from '../modules/teachers/models/teacherProfile.model.js';
import { Course } from '../modules/courses/models/course.model.js';
import { CoursePackage } from '../modules/courses/models/coursePackage.model.js';
import { Coupon } from '../modules/courses/models/coupon.model.js';
import { Lesson } from '../modules/curriculum/models/lesson.model.js';
import { Homework } from '../modules/curriculum/models/homework.model.js';
import { PathTemplate } from '../modules/learningPaths/models/pathTemplate.model.js';
import { LearningPath } from '../modules/learningPaths/models/learningPath.model.js';
import { Enrollment } from '../modules/enrollments/models/enrollment.model.js';
import { Invoice } from '../modules/payments/models/invoice.model.js';
import { Payment } from '../modules/payments/models/payment.model.js';
import { SessionLedger } from '../modules/ledger/models/sessionLedger.model.js';
import { Session } from '../modules/sessions/models/session.model.js';
import { SessionReport } from '../modules/reports/models/sessionReport.model.js';
import { ProgressSnapshot } from '../modules/reports/models/progressSnapshot.model.js';
import { AILog } from '../modules/ai/models/aiLog.model.js';
import { QualityAlert } from '../modules/quality/models/qualityAlert.model.js';
import { VocabDeck } from '../modules/practice/models/vocabDeck.model.js';
import { VocabCard } from '../modules/practice/models/vocabCard.model.js';
import { IpaSymbol } from '../modules/practice/models/ipaSymbol.model.js';
import { PracticeMediaLesson } from '../modules/practice/models/practiceMediaLesson.model.js';
import { syncSessionVocabForStudent } from '../modules/practice/services/practice.service.js';

export const DEFAULT_POLICY_SETTINGS: { key: string; value: Record<string, unknown> }[] = [
  { key: 'policies.cancelFreeHours', value: { hours: 12 } },
  { key: 'policies.rescheduleFreeHours', value: { hours: 12 } },
  { key: 'policies.rescheduleMaxCount', value: { count: 2 } },
  { key: 'policies.minBookingNoticeHours', value: { hours: 6 } },
  { key: 'policies.maxBookingAdvanceDays', value: { days: 30 } },
  { key: 'policies.noShowMinutes', value: { minutes: 10 } },
  { key: 'policies.slotStepMinutes', value: { minutes: 30 } },
  { key: 'policies.bufferMinutes', value: { minutes: 5 } },
  { key: 'policies.roomOpenBeforeMinutes', value: { minutes: 10 } },
  { key: 'policies.roomCloseAfterMinutes', value: { minutes: 15 } },
  { key: 'policies.reminderOffsetsMinutes', value: { offsets: [1440, 120, 10] } },
  { key: 'policies.reportDueHours', value: { hours: 24 } },
  { key: 'policies.reportEditWindowHours', value: { hours: 48 } },
  { key: 'policies.reviewWindowDays', value: { days: 7 } },
  { key: 'policies.studentNoShowTeacherPayPercent', value: { percent: 100 } },
  { key: 'policies.skillEmaAlpha', value: { alpha: 0.3 } },
  { key: 'policies.lowRatingAlertThreshold', value: { rating: 2 } },
  { key: 'policies.sessionDurationMin', value: { options: [25, 45, 60] } },
  { key: 'policies.defaultTimezone', value: { timezone: 'Asia/Ho_Chi_Minh' } },
];

async function ensureSeedUser(params: {
  email: string;
  password: string;
  fullName: string;
  role: 'admin' | 'teacher' | 'student';
  phone?: string;
  timezone?: string;
}) {
  const existing = await User.findOne({ email: params.email });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(params.password, 12);
  const created = await User.create({
    email: params.email,
    passwordHash,
    fullName: params.fullName,
    role: params.role,
    status: 'active',
    phone: params.phone,
    locale: 'vi',
    timezone: params.timezone ?? 'Asia/Ho_Chi_Minh',
    emailVerifiedAt: new Date(),
  });
  console.log(`Seeded ${params.email} / ${params.password}`);
  return created;
}

export async function runSeed(uri = env.MONGODB_URI) {
  if (process.env.NODE_ENV === 'production' || env.NODE_ENV === 'production') {
    throw new Error('Refusing to run demo seed script when NODE_ENV=production');
  }

  await mongoose.connect(uri);

  const adminUser = await ensureSeedUser({
    email: 'admin@example.com',
    password: 'Admin@123456',
    fullName: 'Demo Admin',
    role: 'admin',
  });

  const teacherUser = await ensureSeedUser({
    email: 'teacher@example.com',
    password: 'Teacher@123456',
    fullName: 'Coach Claire Nguyen',
    role: 'teacher',
    phone: '+84901234567',
  });

  await TeacherProfile.findOneAndUpdate(
    { userId: teacherUser._id },
    {
      $setOnInsert: {
        userId: teacherUser._id,
        bio: 'IELTS 8.5 & CELTA certified 1-on-1 coach specializing in pronunciation & fluency.',
        certifications: ['CELTA Cambridge', 'IELTS 8.5 Overall'],
        specialties: ['ielts', 'communication', 'business'],
        cefrLevels: ['A2', 'B1', 'B2', 'C1'],
        languages: ['English', 'Vietnamese'],
        payPerSessionVnd: 280000,
        maxStudents: 25,
        timezone: 'Asia/Ho_Chi_Minh',
        weeklyAvailability: [
          { dayOfWeek: 1, startTime: '18:00', endTime: '21:30' },
          { dayOfWeek: 3, startTime: '18:00', endTime: '21:30' },
          { dayOfWeek: 5, startTime: '18:00', endTime: '21:30' },
          { dayOfWeek: 6, startTime: '09:00', endTime: '17:00' },
        ],
        ratingAvg: 4.95,
        reviewsCount: 48,
        qualityScore: 98,
      },
    },
    { new: true, upsert: true },
  );

  const studentUser = await ensureSeedUser({
    email: 'student@example.com',
    password: 'Student@123456',
    fullName: 'Minh Anh Tran',
    role: 'student',
    phone: '+84912345678',
  });

  await StudentProfile.findOneAndUpdate(
    { userId: studentUser._id },
    {
      $setOnInsert: {
        userId: studentUser._id,
        occupation: 'Product Designer',
        isMinor: false,
        goal: {
          goalType: 'ielts',
          targetScore: '7.0',
          description: 'Need IELTS Speaking 7.0+ within 4 months for postgraduate scholarship.',
        },
        currentCefr: 'B1',
        preferredSlots: [
          { dayOfWeek: 1, startTime: '19:30', endTime: '21:00' },
          { dayOfWeek: 3, startTime: '19:30', endTime: '21:00' },
        ],
        favoriteTopics: ['Product Design', 'Tech Startups', 'Travel'],
        weaknesses: ['Linking sounds', 'Part 3 abstract fluency'],
        lifecycleStatus: 'trial',
        leadSource: 'organic_web',
        consents: {
          dataPrivacyAccepted: true,
          aiProcessingAccepted: true,
          acceptedAt: new Date(),
        },
      },
    },
    { new: true, upsert: true },
  );

  for (const s of DEFAULT_POLICY_SETTINGS) {
    await Setting.findOneAndUpdate(
      { key: s.key },
      { value: s.value },
      { new: true, upsert: true },
    );
  }
  console.log('Default settings seeded:', DEFAULT_POLICY_SETTINGS.length);

  const ieltsCourse = await Course.findOneAndUpdate(
    { slug: 'ielts-speaking-intensive' },
    {
      slug: 'ielts-speaking-intensive',
      title: 'IELTS Speaking Intensive 1-1',
      description: 'Lộ trình luyện phản xạ Speaking Part 1-2-3 cùng giáo viên chấm chi tiết theo 4 tiêu chí.',
      goalType: 'ielts',
      targetCefrRange: ['B1', 'B2', 'C1'],
      syllabusOutline: [
        'Part 1 Fluency & Natural Idioms',
        'Part 2 Long Turn Cue Card Structuring',
        'Part 3 Abstract Argumentation & Mock Exam',
      ],
      isPublished: true,
    },
    { new: true, upsert: true },
  );

  const businessCourse = await Course.findOneAndUpdate(
    { slug: 'business-english-executive' },
    {
      slug: 'business-english-executive',
      title: 'Business English & Executive Communication',
      description: 'Tiếng Anh công sở thực chiến: họp quốc tế, thuyết trình, đàm phán và phỏng vấn.',
      goalType: 'business',
      targetCefrRange: ['B1', 'B2', 'C1'],
      syllabusOutline: [
        'Weekly Standups & Stakeholder Alignment',
        'Executive Presentations & Q&A Handling',
        'Negotiation & Difficult Conversations',
      ],
      isPublished: true,
    },
    { new: true, upsert: true },
  );

  const commCourse = await Course.findOneAndUpdate(
    { slug: 'everyday-communication-1on1' },
    {
      slug: 'everyday-communication-1on1',
      title: 'Everyday Communication 1-1',
      description: 'Giao tiếp tự nhiên đời sống & du lịch, chuẩn hóa phát âm IPA và phản xạ nghe nói.',
      goalType: 'communication',
      targetCefrRange: ['A1', 'A2', 'B1', 'B2'],
      syllabusOutline: [
        'Core IPA Pronunciation & Intonation',
        'Real-life Scenarios & Storytelling',
        'Confident Listening & Conversational Turns',
      ],
      isPublished: true,
    },
    { new: true, upsert: true },
  );

  const packagesSeed = [
    {
      courseId: ieltsCourse._id,
      code: 'IELTS-12',
      name: 'Gói Tăng Tốc 12 Buổi',
      subtitle: 'Phù hợp ôn cấp tốc Speaking trong 6 tuần',
      sessionsCount: 12,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 4_560_000,
      originalPriceVnd: 5_100_000,
      features: ['12 buổi 1-1 (45 phút)', 'Mock Test Part 1-3 có ghi âm', 'Báo cáo sau mỗi buổi'],
      isActive: true,
    },
    {
      courseId: ieltsCourse._id,
      code: 'IELTS-24',
      name: 'Gói Chuyên Sâu 24 Buổi',
      subtitle: 'Tăng 1.0 - 1.5 Band trong 12 tuần',
      sessionsCount: 24,
      durationMinutes: 45,
      validityDays: 150,
      priceVnd: 8_400_000,
      originalPriceVnd: 9_600_000,
      features: ['24 buổi 1-1 (45 phút)', 'Ưu tiên giữ lịch cố định', '4 bài chấm phát âm AI chi tiết'],
      isActive: true,
    },
    {
      courseId: businessCourse._id,
      code: 'BIZ-24',
      name: 'Gói Công Sở Thực Chiến 24 Buổi',
      subtitle: 'Luyện meeting, pitch deck & đàm phán',
      sessionsCount: 24,
      durationMinutes: 60,
      validityDays: 180,
      priceVnd: 9_600_000,
      originalPriceVnd: 10_800_000,
      features: ['24 buổi 1-1 (60 phút)', 'Roleplay theo tài liệu thật', 'Review email công việc'],
      isActive: true,
    },
    {
      courseId: commCourse._id,
      code: 'COMM-12',
      name: 'Gói Giao Tiếp Nền Tảng 12 Buổi',
      subtitle: 'Khởi động phản xạ nói tự tin',
      sessionsCount: 12,
      durationMinutes: 45,
      validityDays: 90,
      priceVnd: 3_960_000,
      originalPriceVnd: 4_440_000,
      features: ['12 buổi 1-1 (45 phút)', 'Chỉnh phát âm IPA', 'Linh hoạt đổi lịch trước 12h'],
      isActive: true,
    },
  ];

  for (const pkg of packagesSeed) {
    await CoursePackage.findOneAndUpdate(
      { code: pkg.code },
      pkg,
      { new: true, upsert: true },
    );
  }

  await Coupon.findOneAndUpdate(
    { code: 'WEBENGLISH10' },
    {
      $setOnInsert: {
        code: 'WEBENGLISH10',
        discountType: 'percent',
        discountValue: 10,
        maxUses: 500,
        usedCount: 0,
        isActive: true,
      },
    },
    { new: true, upsert: true },
  );

  console.log('Phase 1 seed data synced (teacher, student, 3 courses, 4 packages, WEBENGLISH10).');

  await PathTemplate.findOneAndUpdate(
    { code: 'IELTS-B2-CORE' },
    {
      code: 'IELTS-B2-CORE',
      title: 'Lộ trình IELTS Speaking & Fluency (B1 → B2+)',
      goalType: 'ielts',
      targetCefr: 'B2',
      isActive: true,
      milestones: [
        {
          title: 'Chặng 1: Phát âm âm cuối & Ngữ điệu tự nhiên',
          description: 'Khắc phục lỗi thiếu âm cuối /s/, /z/, /t/, /d/ và nối âm tự nhiên.',
          cefrTarget: 'B1',
          skillFocus: 'pronunciation',
          plannedSessions: 4,
        },
        {
          title: 'Chặng 2: IELTS Speaking Part 2 & Part 3 Contrast Reasoning',
          description: 'Mở rộng câu trả lời theo cấu trúc Point → Contrast → Real Example.',
          cefrTarget: 'B2',
          skillFocus: 'speaking',
          plannedSessions: 6,
        },
        {
          title: 'Chặng 3: Nâng cấp Collocations & Mock Exam 1-1',
          description: 'Luyện phản biện đề thi thật theo 4 tiêu chí IELTS.',
          cefrTarget: 'B2',
          skillFocus: 'vocabulary',
          plannedSessions: 4,
        },
      ],
    },
    { new: true, upsert: true },
  );

  const lessonsSeed = [
    {
      slug: 'ielts-part3-contrast',
      title: 'IELTS Speaking Part 3: Contrast & Urban Trade-offs',
      description: 'Cấu trúc đối chiếu hai mặt vấn đề đô thị bền vững.',
      goalType: 'ielts',
      cefrLevel: 'B2',
      skillFocus: 'speaking',
      durationMinutes: 45,
      contentMarkdown: '### Warm-up\nDiscuss green mobility vs car dependency.\n\n### Target Lexis\n- mitigate congestion\n- urban sprawl\n- sustainable infrastructure',
      sourceName: 'British Council LearnEnglish',
      sourceUrl: 'https://learnenglish.britishcouncil.org/',
      isPublished: true,
    },
    {
      slug: 'ipa-ending-sounds',
      title: 'IPA Pronunciation Lab: Final Consonants /s/ /z/ /t/ /d/',
      description: 'Thực hành phát âm rõ âm cuối trong câu nói tốc độ tự nhiên.',
      goalType: 'communication',
      cefrLevel: 'B1',
      skillFocus: 'pronunciation',
      durationMinutes: 45,
      contentMarkdown: '### Minimal Pairs\n- rice vs rise\n- walked vs wanted\n- projects / metrics',
      sourceName: 'BBC Learning English',
      sourceUrl: 'https://www.bbc.co.uk/learningenglish/',
      isPublished: true,
    },
    {
      slug: 'business-executive-brief',
      title: 'Executive Briefing & Stakeholder Alignment 1-1',
      description: 'Cách trình bày ngắn gọn luận điểm và trả lời câu hỏi khó.',
      goalType: 'business',
      cefrLevel: 'B2',
      skillFocus: 'vocabulary',
      durationMinutes: 60,
      contentMarkdown: '### Framework\n1. Headline summary first\n2. Key metric trade-off\n3. Clear ask & next step',
      sourceName: 'Harvard Business English Curated',
      sourceUrl: 'https://learnenglish.britishcouncil.org/business-english',
      isPublished: true,
    },
  ];

  for (const lesson of lessonsSeed) {
    await Lesson.findOneAndUpdate({ slug: lesson.slug }, lesson, { new: true, upsert: true });
  }

  console.log('Phase 4 seed data synced (PathTemplate IELTS-B2-CORE + 3 curated lessons).');

  // Phase 6: Multi-timezone second teacher + 10-minute idempotent demo dataset
  const teacher2User = await ensureSeedUser({
    email: 'teacher2@example.com',
    password: 'Teacher@123456',
    fullName: 'Coach Daniel Miller',
    role: 'teacher',
    phone: '+12125550199',
    timezone: 'America/New_York',
  });

  await TeacherProfile.findOneAndUpdate(
    { userId: teacher2User._id },
    {
      $setOnInsert: {
        userId: teacher2User._id,
        bio: 'New York based Executive & Interview 1-1 Coach (TESOL, Ex-Management Consultant).',
        certifications: ['TESOL Advanced', 'Executive Presence Coach'],
        specialties: ['business', 'interview', 'ielts'],
        cefrLevels: ['B1', 'B2', 'C1', 'C2'],
        languages: ['English'],
        payPerSessionVnd: 350000,
        maxStudents: 20,
        timezone: 'America/New_York',
        weeklyAvailability: [
          { dayOfWeek: 1, startTime: '07:00', endTime: '11:00' },
          { dayOfWeek: 2, startTime: '07:00', endTime: '11:00' },
          { dayOfWeek: 4, startTime: '07:00', endTime: '11:00' },
          { dayOfWeek: 6, startTime: '08:00', endTime: '12:00' },
        ],
        ratingAvg: 4.9,
        reviewsCount: 32,
        qualityScore: 96,
      },
    },
    { new: true, upsert: true },
  );

  const ielts12Pkg = await CoursePackage.findOne({ code: 'IELTS-12' });
  const existingDemoInvoice = await Invoice.findOne({ invoiceCode: 'INV-DEMO-IELTS12' });

  let demoEnrollmentId: mongoose.Types.ObjectId | undefined;
  let completedDemoSessionId: mongoose.Types.ObjectId | undefined;

  if (!existingDemoInvoice && ielts12Pkg) {
    const now = new Date();
    const demoEnrollment = await Enrollment.create({
      studentId: studentUser._id,
      teacherId: teacherUser._id,
      courseId: ieltsCourse._id,
      packageId: ielts12Pkg._id,
      status: 'active',
      purchasedSessions: ielts12Pkg.sessionsCount,
      durationMinutes: ielts12Pkg.durationMinutes,
      validityDays: ielts12Pkg.validityDays,
      activatedAt: now,
      expiresAt: new Date(now.getTime() + ielts12Pkg.validityDays * 86_400_000),
      notes: 'Seeded demo active enrollment (IELTS-12)',
    });
    demoEnrollmentId = demoEnrollment._id as mongoose.Types.ObjectId;

    await StudentProfile.updateOne(
      { userId: studentUser._id },
      {
        $set: {
          lifecycleStatus: 'active',
          skillScores: {
            listening: 62,
            speaking: 56,
            reading: 64,
            writing: 55,
            vocabulary: 60,
            grammar: 58,
            pronunciation: 52,
          },
        },
      },
    );

    const demoInvoice = await Invoice.create({
      invoiceCode: 'INV-DEMO-IELTS12',
      enrollmentId: demoEnrollment._id,
      studentId: studentUser._id,
      packageId: ielts12Pkg._id,
      subtotalVnd: ielts12Pkg.priceVnd,
      discountVnd: 0,
      totalVnd: ielts12Pkg.priceVnd,
      status: 'paid',
      paidAt: now,
    });

    await Payment.create({
      invoiceId: demoInvoice._id,
      enrollmentId: demoEnrollment._id,
      studentId: studentUser._id,
      provider: 'manual_bank_transfer',
      amountVnd: demoInvoice.totalVnd,
      status: 'confirmed',
      transactionRef: 'FT-DEMO-20260001',
      paymentMeta: {
        bankName: 'Vietcombank',
        accountNumber: '0011001932418',
        accountHolder: 'CONG TY WEBENGLISH 1-1',
        transferNote: 'INV-DEMO-IELTS12',
      },
      confirmedBy: adminUser._id,
      confirmedAt: now,
    });

    const pastStart = new Date(Date.now() - 2 * 86_400_000);
    pastStart.setUTCHours(12, 30, 0, 0);
    const pastEnd = new Date(pastStart.getTime() + 45 * 60_000);

    const completedDemoSession = await Session.create({
      studentId: studentUser._id,
      teacherId: teacherUser._id,
      enrollmentId: demoEnrollment._id,
      courseId: ieltsCourse._id,
      isTrial: false,
      title: 'IELTS Part 3: Contrast & Ending Consonants',
      startAt: pastStart,
      endAt: pastEnd,
      durationMinutes: 45,
      status: 'completed',
      isActive: false,
      meetingProvider: 'jitsi',
      roomCode: 'WEBENG-DEMO-DONE-1',
      joinUrl: 'https://meet.jit.si/WEBENG-DEMO-DONE-1',
      teacherJoinedAt: pastStart,
      studentJoinedAt: new Date(pastStart.getTime() + 60_000),
      startedAt: pastStart,
      endedAt: pastEnd,
      sharedNotes: 'Key target: maintain /s/ and /z/ endings in plural nouns (projects, metrics).',
      quickNotes: [
        {
          id: 'qn-demo-1',
          kind: 'pronunciation',
          term: 'projects / metrics',
          correction: 'Pronounce crisp final /ts/ and /ks/ clusters',
          contextNote: 'IELTS Part 3 Urban Planning',
          createdBy: teacherUser._id,
          createdAt: pastStart,
        },
        {
          id: 'qn-demo-2',
          kind: 'vocab',
          term: 'solve traffic jam',
          correction: 'mitigate urban congestion',
          contextNote: 'Band 7.5+ lexical upgrade',
          createdBy: teacherUser._id,
          createdAt: pastStart,
        },
      ],
      chatMessages: [
        {
          id: 'chat-demo-1',
          senderId: teacherUser._id,
          senderName: teacherUser.fullName,
          senderRole: 'teacher',
          text: 'Welcome Minh Anh! Today we practice contrast framing for Part 3.',
          sentAt: pastStart,
        },
      ],
    });
    completedDemoSessionId = completedDemoSession._id as mongoose.Types.ObjectId;

    // Pick next Mon/Wed/Fri >= 3 days out at 12:30 UTC (19:30 Asia/Ho_Chi_Minh)
    const futureStart = new Date(Date.now() + 3 * 86_400_000);
    futureStart.setUTCHours(12, 30, 0, 0);
    while (![1, 3, 5].includes(futureStart.getUTCDay())) {
      futureStart.setUTCDate(futureStart.getUTCDate() + 1);
    }
    const futureEnd = new Date(futureStart.getTime() + 45 * 60_000);

    const upcomingDemoSession = await Session.create({
      studentId: studentUser._id,
      teacherId: teacherUser._id,
      enrollmentId: demoEnrollment._id,
      courseId: ieltsCourse._id,
      isTrial: false,
      title: 'IELTS Cue Card Long Turn & Follow-up Practice',
      startAt: futureStart,
      endAt: futureEnd,
      durationMinutes: 45,
      status: 'scheduled',
      isActive: true,
      meetingProvider: 'jitsi',
      roomCode: 'WEBENG-DEMO-NEXT-1',
      joinUrl: 'https://meet.jit.si/WEBENG-DEMO-NEXT-1',
    });

    await SessionLedger.create(
      [
        {
          studentId: studentUser._id,
          enrollmentId: demoEnrollment._id,
          type: 'purchase',
          delta: ielts12Pkg.sessionsCount,
          reason: 'Kích hoạt gói demo IELTS-12 (INV-DEMO-IELTS12)',
          referenceType: 'Invoice',
          referenceId: String(demoInvoice._id),
          actorId: adminUser._id,
        },
        {
          studentId: studentUser._id,
          enrollmentId: demoEnrollment._id,
          type: 'booking_debit',
          delta: -1,
          reason: 'Đặt buổi học mẫu đã hoàn thành (WEBENG-DEMO-DONE-1)',
          referenceType: 'Session',
          referenceId: String(completedDemoSession._id),
          actorId: studentUser._id,
        },
        {
          studentId: studentUser._id,
          enrollmentId: demoEnrollment._id,
          type: 'booking_debit',
          delta: -1,
          reason: 'Đặt buổi học mẫu sắp tới (WEBENG-DEMO-NEXT-1)',
          referenceType: 'Session',
          referenceId: String(upcomingDemoSession._id),
          actorId: studentUser._id,
        },
      ],
      { ordered: true },
    );

    await SessionReport.create({
      sessionId: completedDemoSession._id,
      teacherId: teacherUser._id,
      studentId: studentUser._id,
      summary: 'Học viên phản xạ tốt với cấu trúc Point → Contrast → Example, cần chú ý âm cuối /s/ /z/.',
      strengths: ['Ý tưởng rõ ràng khi so sánh phương tiện công cộng và xe cá nhân'],
      weaknesses: ['Quên phát âm cuối danh từ số nhiều', 'Dùng lặp từ important'],
      nextFocus: 'Cue card Part 2 (2 phút liên tục) + Collocation Band 7.5',
      homeworkSuggestion: 'Hoàn thành quiz đối chiếu Part 3 và ghi âm 60s sửa âm cuối.',
      skillRatings: {
        speaking: 60,
        pronunciation: 55,
        vocabulary: 64,
        grammar: 61,
      },
      vocabItems: [
        {
          term: 'solve traffic jam',
          correction: 'mitigate urban congestion',
          contextNote: 'Formal speaking register',
        },
      ],
      submittedAt: pastEnd,
      dueAt: new Date(pastEnd.getTime() + 24 * 3_600_000),
      submittedOnTime: true,
    });

    await ProgressSnapshot.create(
      [
        {
          studentId: studentUser._id,
          source: 'assessment',
          cefrLevel: 'B1',
          overallScore: 53,
          skillScores: {
            listening: 58,
            speaking: 50,
            reading: 60,
            writing: 52,
            vocabulary: 54,
            grammar: 53,
            pronunciation: 46,
          },
          capturedAt: new Date(pastStart.getTime() - 5 * 86_400_000),
        },
        {
          studentId: studentUser._id,
          sessionId: completedDemoSession._id,
          source: 'report',
          cefrLevel: 'B1',
          overallScore: 60,
          skillScores: {
            listening: 62,
            speaking: 56,
            reading: 64,
            writing: 55,
            vocabulary: 60,
            grammar: 58,
            pronunciation: 52,
          },
          capturedAt: pastEnd,
        },
      ],
      { ordered: true },
    );
  } else if (existingDemoInvoice) {
    demoEnrollmentId = existingDemoInvoice.enrollmentId;
  }

  const existingLiveSession = await Session.findOne({ roomCode: 'WEBENG-DEMO-LIVE-1' });
  if (demoEnrollmentId && ieltsCourse) {
    const liveNow = new Date();
    const liveStart = new Date(liveNow.getTime() - 5 * 60_000);
    const liveEnd = new Date(liveNow.getTime() + 40 * 60_000);
    if (!existingLiveSession) {
      const liveDemoSession = await Session.create({
        studentId: studentUser._id,
        teacherId: teacherUser._id,
        enrollmentId: demoEnrollmentId,
        courseId: ieltsCourse._id,
        isTrial: false,
        title: 'Live 1-1 Demo Room: Fluency & Pronunciation Lab',
        startAt: liveStart,
        endAt: liveEnd,
        durationMinutes: 45,
        status: 'scheduled',
        isActive: true,
        meetingProvider: 'jitsi',
        roomCode: 'WEBENG-DEMO-LIVE-1',
        joinUrl: 'https://meet.jit.si/WEBENG-DEMO-LIVE-1',
      });
      await SessionLedger.create(
        [
          {
            studentId: studentUser._id,
            enrollmentId: demoEnrollmentId,
            type: 'makeup_credit',
            delta: 1,
            reason: 'Cộng +1 buổi mẫu cho phòng học Realtime đang mở (WEBENG-DEMO-LIVE-1)',
            referenceType: 'Session',
            referenceId: String(liveDemoSession._id),
            actorId: adminUser._id,
          },
          {
            studentId: studentUser._id,
            enrollmentId: demoEnrollmentId,
            type: 'booking_debit',
            delta: -1,
            reason: 'Đặt buổi học Realtime đang mở (WEBENG-DEMO-LIVE-1)',
            referenceType: 'Session',
            referenceId: String(liveDemoSession._id),
            actorId: studentUser._id,
          },
        ],
        { ordered: true },
      );
    } else if (existingLiveSession.status === 'scheduled' && existingLiveSession.isActive) {
      existingLiveSession.startAt = liveStart;
      existingLiveSession.endAt = liveEnd;
      await existingLiveSession.save();
    }
  }

  const existingPath = await LearningPath.findOne({
    studentId: studentUser._id,
    templateCode: 'IELTS-B2-CORE',
  });
  if (!existingPath && demoEnrollmentId) {
    await LearningPath.create({
      studentId: studentUser._id,
      templateCode: 'IELTS-B2-CORE',
      title: 'Lộ trình IELTS Speaking & Fluency (B1 → B2+)',
      goalType: 'ielts',
      targetCefr: 'B2',
      paceStatus: 'on_track',
      milestones: [
        {
          id: 'ms-demo-1',
          title: 'Chặng 1: Phát âm âm cuối & Ngữ điệu tự nhiên',
          description: 'Khắc phục lỗi thiếu âm cuối /s/, /z/, /t/, /d/ và nối âm tự nhiên.',
          cefrTarget: 'B1',
          skillFocus: 'pronunciation',
          plannedSessions: 4,
          completedSessions: 1,
          status: 'in_progress',
          source: 'template',
        },
        {
          id: 'ms-demo-2',
          title: 'Chặng 2: IELTS Speaking Part 2 & Part 3 Contrast Reasoning',
          description: 'Mở rộng câu trả lời theo cấu trúc Point → Contrast → Real Example.',
          cefrTarget: 'B2',
          skillFocus: 'speaking',
          plannedSessions: 6,
          completedSessions: 0,
          status: 'pending',
          source: 'template',
        },
        {
          id: 'ms-demo-prop',
          title: 'Chặng bổ trợ (Đề xuất): Luyện Final Consonant Clusters /ts/ /ks/',
          description: 'Rule engine nhận thấy Pronunciation đang ở mức 52/100 sau buổi học mẫu.',
          cefrTarget: 'B1',
          skillFocus: 'pronunciation',
          plannedSessions: 2,
          completedSessions: 0,
          status: 'proposed',
          source: 'rule_engine',
          adjustmentType: 'reinforce',
          aiReason: 'Điểm phát âm âm cuối cần củng cố thêm 2 buổi trước khi tăng tốc Part 3.',
        },
      ],
    });
  }

  const existingHomework = await Homework.findOne({
    studentId: studentUser._id,
    title: 'Demo Part 3 Contrast & Ending Consonant Drills',
  });
  if (!existingHomework) {
    const sampleLesson = await Lesson.findOne({ slug: 'ielts-part3-contrast' });
    await Homework.create(
      [
        {
          studentId: studentUser._id,
          teacherId: teacherUser._id,
          sessionId: completedDemoSessionId,
          lessonId: sampleLesson?._id,
          title: 'Demo Part 3 Contrast & Ending Consonant Drills',
          homeworkType: 'multiple_choice',
          skillFocus: 'vocabulary',
          prompt: 'Chọn cụm từ nâng band và nối nghĩa phù hợp theo bài học IELTS Part 3.',
          questions: [
            {
              id: 'q-demo-mc-1',
              type: 'multiple_choice',
              prompt: 'Từ học thuật thay thế "solve traffic jam" ở mức Band 7.5+ là gì?',
              options: ['mitigate urban congestion', 'remove all bicycles', 'make big road', 'stop cars fast'],
              correctAnswer: 'mitigate urban congestion',
              maxPoints: 50,
            },
            {
              id: 'q-demo-fb-2',
              type: 'fill_blank',
              prompt: 'Điền từ còn thiếu: Sustainable ____ reduces long-term city emissions.',
              correctAnswer: 'infrastructure',
              maxPoints: 50,
            },
          ],
          maxScore: 100,
          status: 'assigned',
          proposedStatus: 'approved',
          dueAt: new Date(Date.now() + 3 * 86_400_000),
        },
        {
          studentId: studentUser._id,
          teacherId: teacherUser._id,
          sessionId: completedDemoSessionId,
          title: 'Demo IPA Reading Aloud Reflection',
          homeworkType: 'speaking',
          skillFocus: 'pronunciation',
          prompt: 'Đọc to 5 câu chứa danh từ số nhiều kết thúc bằng /s/ và /z/.',
          questions: [],
          maxScore: 100,
          status: 'graded',
          proposedStatus: 'approved',
          submittedNote: 'Em đã luyện đọc chậm 3 lần cụm projects & metrics.',
          submittedAt: new Date(Date.now() - 86_400_000),
          score: 86,
          teacherFeedback: 'Rõ âm cuối tốt hơn rõ rệt ở cặp rice/rise!',
          gradedBy: teacherUser._id,
          gradedAt: new Date(Date.now() - 43_200_000),
        },
      ],
      { ordered: true },
    );
  }

  const existingAiLog = await AILog.findOne({
    studentId: studentUser._id,
    appliedTargetId: 'demo-ai-proposal',
  });
  if (!existingAiLog) {
    await AILog.create({
      feature: 'weakness_analysis',
      provider: 'mock',
      aiModel: 'mock-offline-v1',
      actorId: teacherUser._id,
      studentId: studentUser._id,
      promptHash: 'demo-seed-weakness-hash',
      redactedInputPreview: 'Student B1 IELTS Speaking 7.0 focus on ending consonants and Part 3 contrast.',
      status: 'proposed',
      summary: 'AI đề xuất dành 15 phút đầu mỗi buổi cho cặp âm tối thiểu /s/-/z/ & phản xạ Part 3.',
      result: {
        topWeaknesses: ['Final consonant deletion (/s/, /z/)', 'Lexical repetition in Part 3'],
        recommendedDrill: 'Contrastive shadowing 10 câu/ngày',
      },
      latencyMs: 140,
      tokenEstimate: 310,
      consentVerified: true,
      piiRedacted: true,
      appliedTargetType: 'None',
      appliedTargetId: 'demo-ai-proposal',
    });
  }

  const existingAlert = await QualityAlert.findOne({ dedupeKey: 'demo:report-reminder-sample' });
  if (!existingAlert) {
    await QualityAlert.create({
      type: 'report_overdue',
      severity: 'medium',
      title: 'Mẫu kiểm tra chất lượng: Theo dõi SLA báo cáo 24h',
      detail: 'Cảnh báo mẫu để Admin kiểm tra quy trình xác nhận & xử lý trong màn hình Điều hành.',
      teacherId: teacher2User._id,
      studentId: studentUser._id,
      dedupeKey: 'demo:report-reminder-sample',
      status: 'open',
    });
  }

  console.log('Phase 6 demo seed dataset synced (teacher2@example.com + active demo enrollment/sessions/path/homework/AI).');

  // Seed Open Practice Data (NGSL/AWL + Free Dictionary API, 44 IPA Chart, VOA/British Council Dictation & Shadowing)
  const readSeedJson = <T>(filename: string): T => {
    const candidate = new URL(`./data/${filename}`, import.meta.url);
    return JSON.parse(fs.readFileSync(candidate, 'utf8')) as T;
  };

  interface OpenVocabJson {
    decks: Array<{
      slug: string;
      title: string;
      titleVi: string;
      description: string;
      category: 'cefr' | 'ielts' | 'business' | 'communication';
      cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
      goalType: 'ielts' | 'toeic' | 'communication' | 'business';
      sourceName: string;
      sourceUrl: string;
    }>;
    cards: Array<{
      deckSlug: string;
      term: string;
      ipa: string;
      partOfSpeech: string;
      meaningVi: string;
      definitionEn?: string;
      exampleEn?: string;
      audioUrl?: string;
      contextNote?: string;
      cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    }>;
  }

  const vocabPayload = readSeedJson<OpenVocabJson>('openVocabDecks.json');
  const deckIdBySlug = new Map<string, mongoose.Types.ObjectId>();
  for (const d of vocabPayload.decks) {
    const countForDeck = vocabPayload.cards.filter((c) => c.deckSlug === d.slug).length;
    const savedDeck = await VocabDeck.findOneAndUpdate(
      { slug: d.slug },
      { ...d, isSystem: true, cardsCount: countForDeck },
      { new: true, upsert: true },
    );
    deckIdBySlug.set(d.slug, savedDeck._id as mongoose.Types.ObjectId);
  }
  for (const c of vocabPayload.cards) {
    const deckId = deckIdBySlug.get(c.deckSlug);
    if (!deckId) continue;
    await VocabCard.findOneAndUpdate(
      { deckId, term: c.term },
      {
        deckId,
        term: c.term,
        ipa: c.ipa,
        partOfSpeech: c.partOfSpeech,
        meaningVi: c.meaningVi,
        definitionEn: c.definitionEn,
        exampleEn: c.exampleEn,
        audioUrl: c.audioUrl,
        contextNote: c.contextNote,
        cefrLevel: c.cefrLevel,
      },
      { new: true, upsert: true },
    );
  }

  const ipaPayload = readSeedJson<Array<Record<string, unknown> & { number: number }>>('openIpaChart.json');
  for (const ipaItem of ipaPayload) {
    await IpaSymbol.findOneAndUpdate({ number: ipaItem.number }, ipaItem, {
      new: true,
      upsert: true,
    });
  }

  const mediaPayload = readSeedJson<Array<Record<string, unknown> & { slug: string }>>(
    'openMediaLessons.json',
  );
  for (const mediaItem of mediaPayload) {
    await PracticeMediaLesson.findOneAndUpdate(
      { slug: mediaItem.slug },
      { ...mediaItem, isPublished: true },
      { new: true, upsert: true },
    );
  }

  await syncSessionVocabForStudent(String(studentUser._id));
  console.log(
    `Open Practice data synced (${vocabPayload.decks.length} decks, ${vocabPayload.cards.length} cards, ${ipaPayload.length} IPA symbols, ${mediaPayload.length} media lessons).`,
  );

  await mongoose.disconnect();
}

const isDirectEntry =
  typeof process.argv[1] === 'string' &&
  process.argv[1].replace(/\\/g, '/').endsWith('/seed/run.ts');

if (isDirectEntry) {
  runSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
