export type UserRole = 'student' | 'teacher' | 'admin';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type SkillKey =
  | 'listening'
  | 'speaking'
  | 'reading'
  | 'writing'
  | 'vocabulary'
  | 'grammar'
  | 'pronunciation';

export type SkillRatings = Record<SkillKey, number>;

export type GoalType =
  | 'ielts'
  | 'toeic'
  | 'communication'
  | 'business'
  | 'kids'
  | 'interview'
  | 'other';

export type SessionStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled_by_student'
  | 'cancelled_by_teacher'
  | 'no_show'
  | 'rescheduled';

export type LedgerEntryType =
  | 'credit'
  | 'debit'
  | 'refund'
  | 'penalty'
  | 'adjustment';

export interface LedgerEntry {
  id: string;
  occurredAt: string;
  type: LedgerEntryType;
  delta: number;
  reason: string;
  sessionId?: string;
  invoiceCode?: string;
  actor: string;
}

export interface TeacherProfile {
  id: string;
  name: string;
  title: string;
  avatarInitials: string;
  sourceTimezone: string;
  tier: 'native' | 'bilingual';
  rating: number;
  reviewsCount: number;
  lessonsCompleted: number;
  cefrFocus: string[];
  specialties: string[];
  languages: string[];
  matchScore: number;
  bio: string;
  ratePerSessionVnd: number;
  weeklyHoursPreview: {
    dayLabel: string;
    teacherLocalRange: string;
    vnRange: string;
  }[];
  availableSlots: {
    id: string;
    dateIso: string;
    dateLabel: string;
    timeSlot: string;
    endTimeSlot: string;
    isRecurringReady: boolean;
  }[];
}

export interface SessionRecord {
  id: string;
  title: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  startIso: string;
  dateLabel: string;
  timeRange: string;
  durationMinutes: number;
  status: SessionStatus;
  meetingProvider: 'jitsi' | 'manual_link';
  roomCode: string;
  milestoneTitle: string;
  reportSubmitted: boolean;
  reportDueLabel?: string;
}

export type MilestoneStatus = 'completed' | 'in_progress' | 'upcoming' | 'proposed';

export interface LearningMilestone {
  id: string;
  order: number;
  title: string;
  cefrTarget: CefrLevel;
  skillsFocus: SkillKey[];
  status: MilestoneStatus;
  completedSessions: number;
  plannedSessions: number;
  description: string;
  aiReason?: string;
  humanDecisionBy?: string;
}

export type HomeworkStatus = 'todo' | 'submitted' | 'graded';

export interface HomeworkItem {
  id: string;
  title: string;
  sessionTitle: string;
  skill: SkillKey;
  dueLabel: string;
  status: HomeworkStatus;
  prompt: string;
  submittedNote?: string;
  score?: number;
  teacherFeedback?: string;
  isAiProposed?: boolean;
}

export interface CoursePackage {
  id: string;
  name: string;
  subtitle: string;
  goalType: GoalType;
  sessionsCount: number;
  durationMinutes: number;
  validityDays: number;
  priceVnd: number;
  originalPriceVnd?: number;
  features: string[];
  recommended?: boolean;
}

export interface InvoiceRecord {
  id: string;
  code: string;
  studentName: string;
  packageName: string;
  sessionsCount: number;
  amountVnd: number;
  status: 'pending_verification' | 'paid' | 'awaiting_transfer';
  createdAtLabel: string;
  bankInfo: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    transferNote: string;
  };
}

export interface QualityAlert {
  id: string;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  teacherName?: string;
  studentName?: string;
  createdAtLabel: string;
  status: 'open' | 'ack' | 'resolved';
}

export interface SystemSettings {
  cancelFreeHours: number;
  rescheduleFreeHours: number;
  teacherLateMinutes: number;
  reportDueHours: number;
  maxTrialPerEmail: number;
  defaultTimezone: string;
}

export interface AuditLogItem {
  id: string;
  timestampLabel: string;
  actor: string;
  role: UserRole;
  action: string;
  target: string;
  decisionStatus?: 'accepted' | 'edited' | 'rejected';
}

export interface MistakeVocabEntry {
  id: string;
  kind: 'vocab' | 'grammar' | 'pronunciation';
  term: string;
  correction: string;
  contextNote: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  timeLabel: string;
  unread: boolean;
  targetPath: string;
}

export interface CuratedLessonItem {
  id: string;
  title: string;
  titleVi: string;
  skill: SkillKey;
  cefr: CefrLevel;
  summary: string;
  discussionPrompt: string;
  sourceName: string;
  sourceUrl: string;
}

export interface ReferenceSourceItem {
  id: string;
  name: string;
  url: string;
  role: string;
}
