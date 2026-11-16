import type { CefrLevel, GoalType, InvoiceRecord, LearningMilestone, LedgerEntry } from '@/types/domain';

export interface LiveInvoiceRecord extends InvoiceRecord {
  paymentId?: string;
  isLiveApi?: boolean;
  vietQrImageUrl?: string;
  checkoutUrl?: string;
}

export interface ApiPackageDto {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  subtitle?: string;
  sessionsCount: number;
  durationMinutes: number;
  validityDays: number;
  priceVnd: number;
  originalPriceVnd?: number;
  features: string[];
  isActive: boolean;
}

export interface ApiCourseDto {
  id?: string;
  _id?: string;
  slug: string;
  title: string;
  description: string;
  goalType: GoalType;
  isPublished: boolean;
  packages: ApiPackageDto[];
}

export interface ApiTeacherDto {
  id: string;
  userId: string;
  fullName: string;
  bio: string;
  specialties: string[];
  cefrLevels: string[];
  timezone: string;
  ratingAvg: number;
  reviewsCount: number;
}

export interface ApiInvoiceDto {
  id: string;
  invoiceCode: string;
  enrollmentId: string;
  studentId: string;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  status: 'unpaid' | 'paid' | 'void' | 'refunded';
  paidAt?: string;
  payment?: {
    id: string;
    provider: string;
    status: string;
    amountVnd: number;
    paymentMeta?: {
      bankName?: string;
      accountNumber?: string;
      accountHolder?: string;
      transferNote?: string;
      vietQrImageUrl?: string;
      checkoutUrl?: string;
    };
  };
}

export interface ApiLedgerResponse {
  balance: number;
  items: {
    id: string;
    type: string;
    delta: number;
    reason: string;
  }[];
  meta: { page: number; limit: number; total: number };
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return null;
  }
  return window.sessionStorage.getItem('we-access-token');
}

export async function apiJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  if (typeof fetch === 'undefined') {
    return { ok: false, status: 0, message: 'Fetch unavailable' };
  }

  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const res = await fetch(path, {
      ...init,
      headers,
      credentials: 'include',
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: T;
      error?: { message?: string };
    };
    if (!res.ok || body.data === undefined) {
      return {
        ok: false,
        status: res.status,
        message: body.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, data: body.data };
  } catch {
    return { ok: false, status: 0, message: 'Network unavailable' };
  }
}

export function mapApiInvoiceToRecord(
  inv: ApiInvoiceDto,
  studentLabel = 'Học viên',
): LiveInvoiceRecord {
  return {
    id: inv.id,
    code: inv.invoiceCode,
    studentName: studentLabel,
    packageName: `Gói đăng ký · ${inv.invoiceCode}`,
    sessionsCount: 12,
    amountVnd: inv.totalVnd,
    status: inv.status === 'paid' ? 'paid' : 'awaiting_transfer',
    createdAtLabel: inv.paidAt ? inv.paidAt.slice(0, 10) : 'Chờ đối soát',
    bankInfo: {
      bankName: inv.payment?.paymentMeta?.bankName ?? 'Vietcombank',
      accountNumber: inv.payment?.paymentMeta?.accountNumber ?? '1038492019',
      accountHolder: inv.payment?.paymentMeta?.accountHolder ?? 'WEBENGLISH 1-1',
      transferNote: inv.payment?.paymentMeta?.transferNote ?? inv.invoiceCode,
    },
    paymentId: inv.payment?.id,
    isLiveApi: true,
    vietQrImageUrl: inv.payment?.paymentMeta?.vietQrImageUrl,
    checkoutUrl: inv.payment?.paymentMeta?.checkoutUrl,
  };
}

export function mapApiLedgerEntries(res: ApiLedgerResponse): LedgerEntry[] {
  return res.items.map((item) => ({
    id: item.id,
    occurredAt: 'Synced · API',
    type:
      item.type === 'purchase' || item.type === 'makeup_credit'
        ? 'credit'
        : item.type === 'cancel_refund'
          ? 'refund'
          : item.type === 'booking_debit'
            ? 'debit'
            : item.type === 'penalty'
              ? 'penalty'
              : 'adjustment',
    delta: item.delta,
    reason: item.reason,
    actor: 'SessionLedger API',
  }));
}

export interface ApiSlotDto {
  startAt: string;
  endAt: string;
  teacherTimezone: string;
  teacherLocalLabel: string;
  studentTimezone: string;
  studentLocalLabel: string;
}

export interface ApiEnrollmentDto {
  id: string;
  studentId: string;
  teacherId?: string;
  courseId: string;
  packageId: string;
  status: string;
  purchasedSessions: number;
  remainingSessions: number;
}

export interface ApiQuickNoteDto {
  id: string;
  kind: 'vocab' | 'grammar' | 'pronunciation';
  term: string;
  correction: string;
  contextNote?: string;
}

export interface ApiChatMsgDto {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'student' | 'teacher';
  text: string;
  sentAt: string;
}

export interface ApiSessionDto {
  id: string;
  studentId: string;
  teacherId: string;
  enrollmentId?: string;
  isTrial: boolean;
  title: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  isActive: boolean;
  rescheduleCount: number;
  seriesId?: string;
  meetingProvider: 'jitsi' | 'manual_link';
  roomCode: string;
  joinUrl: string;
  sharedNotes: string;
  quickNotes: ApiQuickNoteDto[];
  chatMessages?: ApiChatMsgDto[];
}

export interface ApiTeacherProfileDetailDto extends ApiTeacherDto {
  weeklyAvailability: { dayOfWeek: number; startTime: string; endTime: string }[];
}

export async function downloadSessionIcsFile(sessionId: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return false;
  const token = getAccessToken();
  try {
    const res = await fetch(`/api/v1/sessions/${sessionId}/ics`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: 'include',
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${sessionId}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export interface ApiQualityAlertDto {
  id: string;
  type: string;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  status: 'open' | 'ack' | 'resolved';
  resolutionNote?: string;
}

export interface ApiPayrollDto {
  id: string;
  month: string;
  teacherId: string;
  teacherName: string;
  completedSessionsCount: number;
  noShowStudentSessionsCount: number;
  noShowTeacherSessionsCount: number;
  ratePerSessionVnd: number;
  grossVnd: number;
  bonusVnd: number;
  deductionVnd: number;
  netVnd: number;
  status: 'draft' | 'approved' | 'paid';
  lineItems: {
    sessionId: string;
    startAt: string;
    sessionStatus: string;
    studentName: string;
    amountVnd: number;
  }[];
}

export interface ApiStudentDashboardDto {
  remainingSessions: number;
  currentCefr: string;
  upcomingSessions: {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    durationMinutes: number;
    roomCode: string;
  }[];
  pendingReviewSessions: {
    id: string;
    title: string;
    startAt: string;
  }[];
  recentReports: {
    id: string;
    sessionId: string;
    summary: string;
    submittedAt: string;
  }[];
}

export interface ApiTeacherDashboardDto {
  metrics: {
    completedSessions: number;
    reportsSubmitted: number;
    onTimeReportRate: number;
    teacherReliabilityRate: number;
    ratingAvg: number;
  };
  upcomingSessions: {
    id: string;
    title: string;
    studentId: string;
    startAt: string;
    endAt: string;
    roomCode: string;
  }[];
  pendingReports: {
    sessionId: string;
    title: string;
    startAt: string;
    dueAt: string;
    overdue: boolean;
  }[];
  currentMonthPayroll: ApiPayrollDto | null;
}

export interface ApiAdminDashboardDto {
  kpis: {
    activeStudentsCount: number;
    activeTeachersCount: number;
    completedSessions30d: number;
    monthlyRevenueVnd: number;
    pendingInvoicesCount: number;
    openAlertsCount: number;
  };
  weeklyThroughput: { week: string; sessions: number }[];
  alerts: ApiQualityAlertDto[];
}

export interface ApiMilestoneDto {
  id: string;
  title: string;
  description: string;
  cefrTarget: CefrLevel;
  skillFocus: 'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary' | 'grammar' | 'pronunciation';
  plannedSessions: number;
  completedSessions: number;
  status: 'pending' | 'in_progress' | 'completed' | 'proposed' | 'rejected';
  source: string;
  aiReason?: string;
}

export function mapApiMilestonesToView(milestones: ApiMilestoneDto[]): LearningMilestone[] {
  return milestones
    .filter((m) => m.status !== 'rejected')
    .map((m, idx) => ({
      id: m.id,
      order: idx + 1,
      title: m.title,
      description: m.description,
      cefrTarget: m.cefrTarget,
      skillsFocus: [m.skillFocus],
      plannedSessions: m.plannedSessions,
      completedSessions: m.completedSessions,
      status:
        m.status === 'proposed' || m.status === 'completed' || m.status === 'in_progress'
          ? m.status
          : 'upcoming',
      aiReason: m.aiReason,
    }));
}

export interface ApiLearningPathDto {
  _id: string;
  title: string;
  targetCefr: string;
  paceStatus: 'on_track' | 'at_risk' | 'off_track';
  milestones: ApiMilestoneDto[];
}

export interface ApiLessonDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  cefrLevel: string;
  skillFocus: 'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary' | 'grammar' | 'pronunciation';
  sourceName?: string;
  sourceUrl?: string;
}

export interface ApiHomeworkDto {
  id: string;
  studentId: string;
  title: string;
  homeworkType: string;
  skillFocus: 'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary' | 'grammar' | 'pronunciation';
  prompt: string;
  status: 'assigned' | 'submitted' | 'graded' | 'overdue';
  submittedNote?: string;
  score?: number;
  maxScore: number;
  autoSuggestedScore?: number;
  teacherFeedback?: string;
  questions: {
    id: string;
    type: string;
    prompt: string;
    options?: string[];
  }[];
}

export interface ApiStudentProgressDto {
  currentCefr: string;
  skillScores: Record<
    'listening' | 'speaking' | 'reading' | 'writing' | 'vocabulary' | 'grammar' | 'pronunciation',
    number
  >;
  snapshots: {
    id: string;
    source: string;
    cefrLevel: string;
    overallScore: number;
    capturedAt: string;
  }[];
}

export interface ApiAuditLogDto {
  id: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
}

export interface ApiMatchedTeacherDto {
  teacherUserId: string;
  fullName: string;
  timezone: string;
  ratingAvg: number;
  specialties: string[];
  cefrLevels: string[];
  score: number;
  reasons: string[];
}

export interface ApiAiLogDto {
  id: string;
  feature: string;
  provider: string;
  aiModel: string;
  studentId: string;
  status: 'proposed' | 'approved' | 'rejected' | 'failed';
  summary: string;
  result: Record<string, unknown>;
}

export interface ApiVocabDeckDto {
  id: string;
  slug: string;
  title: string;
  titleVi: string;
  description: string;
  category: 'cefr' | 'ielts' | 'business' | 'communication' | 'session_notes';
  cefrLevel: CefrLevel;
  goalType: GoalType;
  isSystem: boolean;
  sourceName?: string;
  sourceUrl?: string;
  cardsCount: number;
  dueCount: number;
  masteredCount: number;
}

export interface ApiVocabCardDto {
  id: string;
  deckId: string;
  term: string;
  ipa: string;
  partOfSpeech: string;
  meaningVi: string;
  definitionEn?: string;
  exampleEn?: string;
  audioUrl?: string;
  contextNote?: string;
  cefrLevel: CefrLevel;
  starred: boolean;
  repetitions: number;
  intervalDays: number;
  dueAt: string;
  isDue: boolean;
  intervalPreviews: {
    again: string;
    hard: string;
    good: string;
    easy: string;
  };
}

export interface ApiIpaSymbolDto {
  id: string;
  number: number;
  symbol: string;
  category: 'monophthong' | 'diphthong' | 'consonant';
  voicing: 'vowel' | 'voiced' | 'unvoiced';
  nameVi: string;
  articulationTipVi: string;
  vietnamesePitfallVi: string;
  spellingPatterns: string[];
  confusingPairSymbol?: string;
  examples: {
    word: string;
    highlightPart: string;
    ipa: string;
    meaningVi: string;
  }[];
  sampleSentence: {
    textEn: string;
    textVi: string;
    targetWord: string;
  };
}

export interface ApiMediaSegmentDto {
  index: number;
  speaker?: string;
  startSec: number;
  endSec: number;
  textEn: string;
  textVi: string;
  keyPhrase?: string;
}

export interface ApiPracticeMediaLessonDto {
  id: string;
  slug: string;
  title: string;
  titleVi: string;
  topic: string;
  cefrLevel: CefrLevel;
  goalType: GoalType;
  durationSec: number;
  mediaType: 'mp4' | 'youtube' | 'speech';
  mediaUrl?: string;
  youtubeId?: string;
  sourceName: string;
  sourceUrl: string;
  licenseNote?: string;
  segments: ApiMediaSegmentDto[];
}

export interface ApiWordDiffDto {
  expected: string;
  actual?: string;
  status: 'exact' | 'wrong' | 'missing' | 'extra';
}

export interface ApiPracticeAttemptDto {
  id: string;
  studentId: string;
  studentName?: string;
  lessonId: string;
  lessonTitle?: string;
  segmentIndex: number;
  mode: 'dictation' | 'shadowing';
  typedText?: string;
  spokenTranscript?: string;
  autoScore: number;
  accuracyPct: number;
  fluencyPct?: number;
  completenessPct: number;
  wordDiffs: ApiWordDiffDto[];
  proposedStatus: 'proposed' | 'approved' | 'needs_retry';
  teacherFeedback?: string;
  verifiedScore?: number;
  reviewedAt?: string;
}
