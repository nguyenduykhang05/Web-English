import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Receipt,
  Star,
  Video,
} from 'lucide-react';
import {
  SAMPLE_STUDENT,
  STUDENT_TARGET_SKILLS,
} from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  type ApiStudentDashboardDto,
} from '@/lib/apiClient';
import { computeLedgerBalance, SKILL_LABELS } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import type { SkillKey } from '@/types/domain';
import { Badge, ProposedAIBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { SkillRadar } from '@/components/ui/SkillRadar';
import { EmptyState } from '@/components/ui/States';

const SKILL_KEYS: SkillKey[] = [
  'listening',
  'speaking',
  'reading',
  'writing',
  'vocabulary',
  'grammar',
  'pronunciation',
];

export default function StudentDashboardPage() {
  const navigate = useNavigate();
  const { lang, pushToast } = useUIStore();
  const {
    sessions,
    ledger,
    milestones,
    homework,
    skills,
    settings,
    cancelSession,
  } = usePlatformStore();

  const [liveDash, setLiveDash] = useState<ApiStudentDashboardDto | null>(null);
  const [submittingReviewId, setSubmittingReviewId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!getAccessToken()) return;
    const res = await apiJson<ApiStudentDashboardDto>('/api/v1/dashboards/student');
    if (res.ok) {
      setLiveDash(res.data);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const remainingSessions = liveDash ? liveDash.remainingSessions : computeLedgerBalance(ledger);
  const currentCefr = liveDash?.currentCefr ?? SAMPLE_STUDENT.currentCefr;
  const upcomingSessions = liveDash
    ? liveDash.upcomingSessions.map((s) => ({
        id: s.id,
        title: s.title,
        dateLabel: s.startAt.slice(0, 10),
        timeRange: s.startAt.slice(11, 16),
        durationMinutes: s.durationMinutes,
        teacherName: 'Giáo viên 1-1',
        milestoneTitle: 'Lộ trình cá nhân hoá',
      }))
    : sessions.filter((s) => s.status === 'scheduled');
  const nextSession = upcomingSessions[0];
  const pendingHomework = homework.filter((h) => h.status === 'todo');
  const proposedMilestone = milestones.find((m) => m.status === 'proposed');

  const handleQuickReview = async (sessionId: string, rating: number) => {
    setSubmittingReviewId(sessionId);
    const res = await apiJson(`/api/v1/reports/sessions/${sessionId}/review`, {
      method: 'POST',
      body: JSON.stringify({ rating, tags: ['Đánh giá nhanh'] }),
    });
    setSubmittingReviewId(null);
    if (res.ok) {
      pushToast({ tone: 'success', title: `Đã gửi đánh giá ${rating}/5 sao` });
      await loadDashboard();
    } else {
      pushToast({ tone: 'danger', title: 'Không thể gửi đánh giá', description: res.message });
    }
  };

  const handleCancelNext = async (sessionId: string) => {
    if (liveDash && getAccessToken()) {
      const res = await apiJson<{ ledgerEffect: string }>(`/api/v1/sessions/${sessionId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Huỷ từ trang chủ học viên' }),
      });
      if (res.ok) {
        pushToast({ tone: 'success', title: `Đã huỷ buổi (${res.data.ledgerEffect})` });
        await loadDashboard();
      } else {
        pushToast({ tone: 'danger', title: 'Huỷ lịch thất bại', description: res.message });
      }
      return;
    }
    cancelSession(sessionId, true);
    pushToast({
      tone: 'success',
      title:
        lang === 'vi'
          ? `Đã huỷ lịch & hoàn +1 buổi vào sổ cái (trước ${settings.cancelFreeHours}h)`
          : `Cancelled & refunded +1 session to ledger (> ${settings.cancelFreeHours}h policy)`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {lang === 'vi'
              ? `Xin chào, ${SAMPLE_STUDENT.name}`
              : `Welcome back, ${SAMPLE_STUDENT.name}`}
          </h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            {SAMPLE_STUDENT.occupation} ·{' '}
            <span className="font-medium text-ink">{SAMPLE_STUDENT.targetGoal}</span> ·{' '}
            <span className="font-mono text-xs">{SAMPLE_STUDENT.deadlineLabel}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/student/booking">
            <Button variant="primary" size="md">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              <span>{lang === 'vi' ? 'Đặt lịch 1-1 mới' : 'Book 1-on-1 slot'}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Top Grid: Next Session + Derived Session Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)] gap-5">
        <Panel className="flex flex-col justify-between gap-4">
          {nextSession ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="confirmed">
                      {lang === 'vi' ? 'Buổi học sắp tới' : 'Next session'}
                    </Badge>
                    <span className="font-mono text-xs text-ink-muted">
                      {nextSession.dateLabel} · {nextSession.timeRange} GMT+7
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-ink pt-1">
                    {nextSession.title}
                  </h2>
                  <p className="text-xs text-ink-secondary">
                    {lang === 'vi' ? 'Giáo viên:' : 'Teacher:'}{' '}
                    <span className="font-semibold text-ink">{nextSession.teacherName}</span> ·{' '}
                    {nextSession.milestoneTitle}
                  </p>
                </div>
                <span className="font-mono text-xs px-2.5 py-1 rounded-[var(--radius-sm)] bg-subtle text-ink-secondary shrink-0">
                  {nextSession.durationMinutes} phút
                </span>
              </div>

              <div className="pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="accent"
                    size="md"
                    onClick={() => navigate(`/classroom/${nextSession.id}`)}
                  >
                    <Video className="h-4 w-4" aria-hidden="true" />
                    <span>{lang === 'vi' ? 'Vào phòng học 1-1' : 'Enter 1-on-1 Classroom'}</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => void handleCancelNext(nextSession.id)}
                  >
                    {lang === 'vi' ? 'Huỷ lịch (Hoàn buổi)' : 'Cancel & Refund'}
                  </Button>
                </div>
                <span className="text-xs text-ink-muted flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {lang === 'vi'
                    ? `Đổi/huỷ miễn phí trước ${settings.cancelFreeHours}h`
                    : `Free reschedule ${settings.cancelFreeHours}h prior`}
                </span>
              </div>
            </>
          ) : (
            <EmptyState
              title={lang === 'vi' ? 'Chưa có buổi học nào được đặt' : 'No upcoming sessions'}
              hint={
                lang === 'vi'
                  ? 'Chọn giáo viên và khung giờ trống phù hợp để bắt đầu buổi 1-1 tiếp theo.'
                  : 'Choose a teacher and available GMT+7 slot to schedule your next lesson.'
              }
              action={
                <Button variant="accent" size="sm" onClick={() => navigate('/student/booking')}>
                  {lang === 'vi' ? 'Đặt lịch ngay' : 'Book a slot'}
                </Button>
              }
            />
          )}
        </Panel>

        {/* Session Ledger Balance (Derived dynamically) */}
        <Panel className="bg-rail/60 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink-secondary">
                {lang === 'vi' ? 'Số buổi còn lại (Từ sessionLedger)' : 'Session Balance (Ledger)'}
              </p>
              <p className="mt-1 font-mono text-3xl font-bold text-ink tabular-nums">
                {remainingSessions}{' '}
                <span className="text-sm font-normal text-ink-muted">
                  {lang === 'vi' ? 'buổi' : 'sessions'}
                </span>
              </p>
            </div>
            <Badge tone={remainingSessions > 3 ? 'completed' : 'proposed'}>
              {remainingSessions > 3 ? 'Đủ số dư' : 'Sắp hết'}
            </Badge>
          </div>

          <div className="divide-y divide-hairline border-y border-hairline text-xs">
            {ledger.slice(0, 3).map((entry) => (
              <div key={entry.id} className="py-2 flex items-center justify-between gap-2">
                <span className="text-ink-secondary truncate">{entry.reason}</span>
                <span
                  className={`font-mono font-semibold tabular-nums shrink-0 ${
                    entry.delta > 0
                      ? 'text-[var(--status-completed-text)]'
                      : 'text-ink-muted'
                  }`}
                >
                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                </span>
              </div>
            ))}
          </div>

          <Link
            to="/student/billing"
            className="inline-flex items-center justify-between text-xs font-semibold text-accent hover:underline"
          >
            <span className="flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
              {lang === 'vi' ? 'Xem toàn bộ sổ cái & Hoá đơn VietQR' : 'View full ledger & VietQR'}
            </span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Panel>
      </div>

      {/* Middle Grid: 7-Skill Radar & Learning Path / Homework */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        <Panel>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-base font-bold text-ink">
                {lang === 'vi' ? 'Hồ sơ năng lực 7 kỹ năng' : '7-Skill Competency Profile'}
              </h2>
              <p className="text-xs text-ink-muted">
                {lang === 'vi'
                  ? `Hiện tại CEFR ${currentCefr} (${SAMPLE_STUDENT.currentBand}) → Mục tiêu ${SAMPLE_STUDENT.targetBand}`
                  : `Current ${currentCefr} (${SAMPLE_STUDENT.currentBand}) → Target ${SAMPLE_STUDENT.targetBand}`}
              </p>
              {liveDash && liveDash.pendingReviewSessions.length > 0 && (
                <div className="mt-2 p-2.5 rounded-[var(--radius-sm)] bg-subtle flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-ink">
                    Chờ đánh giá: {liveDash.pendingReviewSessions[0].title}
                  </span>
                  <button
                    type="button"
                    disabled={submittingReviewId === liveDash.pendingReviewSessions[0].id}
                    onClick={() =>
                      void handleQuickReview(liveDash.pendingReviewSessions[0].id, 5)
                    }
                    className="inline-flex items-center gap-1 text-accent font-semibold hover:underline cursor-pointer"
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Chấm 5★ ngay</span>
                  </button>
                </div>
              )}
            </div>
            <Link to="/student/progress" className="text-xs font-semibold text-accent hover:underline">
              {lang === 'vi' ? 'Chi tiết →' : 'Details →'}
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-4 items-center">
            <SkillRadar current={skills} target={STUDENT_TARGET_SKILLS} height={240} />

            <div className="divide-y divide-hairline text-xs">
              {SKILL_KEYS.map((key) => {
                const cur = skills[key];
                const tgt = STUDENT_TARGET_SKILLS[key];
                const gap = tgt - cur;
                return (
                  <div key={key} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="text-ink-secondary truncate">
                      {lang === 'vi' ? SKILL_LABELS[key].vi.split(' (')[0] : SKILL_LABELS[key].en}
                    </span>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="font-semibold text-ink">{cur.toFixed(1)}</span>
                      <span className="text-ink-muted">/ {tgt.toFixed(1)}</span>
                      {gap >= 1.5 && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-proposed-text)]" title="Ưu tiên cải thiện" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <div className="space-y-5">
          {/* Personalized Learning Path + Human-in-the-loop AI Suggestion */}
          <Panel>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-bold text-ink">
                {lang === 'vi' ? 'Lộ trình cá nhân hoá' : 'Personalized Learning Path'}
              </h2>
              <Link to="/student/path" className="text-xs font-semibold text-accent hover:underline">
                {lang === 'vi' ? 'Mở lộ trình →' : 'Open path →'}
              </Link>
            </div>

            <div className="divide-y divide-hairline">
              {milestones.slice(0, 3).map((ms) => {
                const pct =
                  ms.plannedSessions > 0
                    ? Math.round((ms.completedSessions / ms.plannedSessions) * 100)
                    : 0;
                return (
                  <div key={ms.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink line-clamp-1">
                        {ms.title}
                      </span>
                      {ms.status === 'proposed' ? (
                        <ProposedAIBadge />
                      ) : ms.status === 'completed' ? (
                        <Badge tone="completed">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Hoàn thành
                        </Badge>
                      ) : (
                        <Badge tone="confirmed">Đang học</Badge>
                      )}
                    </div>

                    {ms.status === 'proposed' && ms.aiReason ? (
                      <p className="text-xs text-ink-secondary bg-[var(--status-proposed-bg)]/60 px-2.5 py-1.5 rounded-[var(--radius-sm)]">
                        {ms.aiReason}
                      </p>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-subtle overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-ink-muted tabular-nums">
                          {ms.completedSessions}/{ms.plannedSessions} buổi
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {proposedMilestone && (
              <p className="mt-3 pt-2.5 border-t border-hairline text-xs text-ink-muted">
                {lang === 'vi'
                  ? 'Lưu ý: Đề xuất bổ sung chỉ có hiệu lực sau khi giáo viên Ms. Sarah Jenkins xác nhận.'
                  : 'Note: AI/rule proposals require explicit confirmation from your teacher.'}
              </p>
            )}
          </Panel>

          {/* Pending Homework Queue */}
          <Panel>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-bold text-ink">
                {lang === 'vi'
                  ? `Bài tập cần hoàn thành (${pendingHomework.length})`
                  : `Pending Homework (${pendingHomework.length})`}
              </h2>
              <Link to="/student/homework" className="text-xs font-semibold text-accent hover:underline">
                {lang === 'vi' ? 'Nộp bài →' : 'Submit →'}
              </Link>
            </div>

            {pendingHomework.length === 0 ? (
              <p className="text-xs text-ink-secondary py-2">
                {lang === 'vi' ? 'Bạn đã nộp tất cả bài tập tuần này.' : 'All homework submitted!'}
              </p>
            ) : (
              <div className="divide-y divide-hairline">
                {pendingHomework.map((hw) => (
                  <div key={hw.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">{hw.title}</p>
                      <p className="text-xs font-mono text-ink-muted mt-0.5">{hw.dueLabel}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate('/student/homework')}
                    >
                      {lang === 'vi' ? 'Làm bài' : 'Open'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
