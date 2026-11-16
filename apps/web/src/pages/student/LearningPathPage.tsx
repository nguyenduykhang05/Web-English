import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, CircleDot, Clock3, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react';
import { CURATED_LESSONS, SAMPLE_STUDENT } from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  mapApiMilestonesToView,
  type ApiLearningPathDto,
  type ApiLessonDto,
} from '@/lib/apiClient';
import { cn, SKILL_LABELS } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import type { LearningMilestone, SkillKey } from '@/types/domain';
import { Badge, ProposedAIBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';

type SkillFilter = 'all' | Extract<SkillKey, 'speaking' | 'listening' | 'reading' | 'writing' | 'vocabulary'>;

const SKILL_FILTERS: { id: SkillFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả (12)' },
  { id: 'speaking', label: 'Speaking' },
  { id: 'listening', label: 'Listening' },
  { id: 'reading', label: 'Reading' },
  { id: 'writing', label: 'Writing' },
  { id: 'vocabulary', label: 'Business / Vocab' },
];

interface PlacementPromptState {
  assessmentId: string;
  step: number;
  totalSteps: number;
  question: { id: string; level: string; prompt: string; options: string[] };
}

export default function LearningPathPage() {
  const { lang, pushToast } = useUIStore();
  const milestones = usePlatformStore((s) => s.milestones);
  const [skillFilter, setSkillFilter] = useState<SkillFilter>('all');
  const [livePath, setLivePath] = useState<ApiLearningPathDto | null>(null);
  const [liveLessons, setLiveLessons] = useState<ApiLessonDto[] | null>(null);
  const [placementStep, setPlacementStep] = useState<PlacementPromptState | null>(null);
  const [generatingPath, setGeneratingPath] = useState(false);

  const loadLearningData = useCallback(async () => {
    const lessonsRes = await apiJson<ApiLessonDto[]>('/api/v1/curriculum/lessons');
    if (lessonsRes.ok && lessonsRes.data.length > 0) {
      setLiveLessons(lessonsRes.data);
    }
    if (!getAccessToken()) return;
    const pathRes = await apiJson<ApiLearningPathDto | null>('/api/v1/learning-paths/me');
    if (pathRes.ok && pathRes.data) {
      setLivePath(pathRes.data);
    }
  }, []);

  useEffect(() => {
    void loadLearningData();
  }, [loadLearningData]);

  const displayedMilestones: LearningMilestone[] = livePath
    ? mapApiMilestonesToView(livePath.milestones)
    : milestones;

  const handleStartPlacement = async () => {
    if (!getAccessToken()) {
      pushToast({
        tone: 'neutral',
        title: 'Đăng nhập học viên để làm bài Placement thích ứng',
      });
      return;
    }
    const res = await apiJson<PlacementPromptState>('/api/v1/learning-paths/placement/start', {
      method: 'POST',
      body: JSON.stringify({ targetGoal: 'ielts' }),
    });
    if (res.ok) {
      setPlacementStep(res.data);
    } else {
      pushToast({ tone: 'danger', title: 'Không thể khởi tạo Placement', description: res.message });
    }
  };

  const handleAnswerPlacement = async (selectedIndex: number) => {
    if (!placementStep) return;
    const res = await apiJson<{
      completed: boolean;
      assessmentId: string;
      cefrResult?: string;
      overallScore?: number;
      step?: number;
      totalSteps?: number;
      question?: PlacementPromptState['question'];
    }>(`/api/v1/learning-paths/placement/${placementStep.assessmentId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ questionId: placementStep.question.id, selectedIndex }),
    });
    if (!res.ok) {
      pushToast({ tone: 'danger', title: 'Lỗi nộp câu trả lời', description: res.message });
      return;
    }
    if (res.data.completed) {
      setPlacementStep(null);
      pushToast({
        tone: 'success',
        title: `Hoàn tất Placement: CEFR ${res.data.cefrResult} (${res.data.overallScore}/100)`,
        description: 'Đã cập nhật hồ sơ năng lực 7 kỹ năng của bạn.',
      });
      await loadLearningData();
    } else if (res.data.question && res.data.step && res.data.totalSteps) {
      setPlacementStep({
        assessmentId: res.data.assessmentId,
        step: res.data.step,
        totalSteps: res.data.totalSteps,
        question: res.data.question,
      });
    }
  };

  const handleGeneratePath = async () => {
    if (!getAccessToken()) return;
    setGeneratingPath(true);
    const res = await apiJson<ApiLearningPathDto>('/api/v1/learning-paths/generate', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setGeneratingPath(false);
    if (res.ok) {
      setLivePath(res.data);
      pushToast({
        tone: 'success',
        title: 'Đã sinh lộ trình cá nhân hoá theo hồ sơ kỹ năng',
      });
    } else {
      pushToast({ tone: 'danger', title: 'Không thể sinh lộ trình', description: res.message });
    }
  };

  const visibleLessons =
    skillFilter === 'all'
      ? CURATED_LESSONS
      : CURATED_LESSONS.filter((l) => l.skill === skillFilter);

  const apiFilteredLessons = liveLessons
    ? skillFilter === 'all'
      ? liveLessons
      : liveLessons.filter((l) => l.skillFocus === skillFilter)
    : null;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">
              {lang === 'vi' ? 'Lộ trình học cá nhân hoá' : 'Personalized Learning Path'}
            </h1>
            <p className="text-sm text-ink-secondary mt-0.5">
              {SAMPLE_STUDENT.currentCefr} → {SAMPLE_STUDENT.targetGoal} ·{' '}
              {lang === 'vi'
                ? 'Mọi điều chỉnh tự động đều ở trạng thái đề xuất chờ giáo viên xác nhận.'
                : 'Adaptive recommendations remain in proposed status until teacher sign-off.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {livePath && (
              <Badge tone="confirmed" className="font-mono">
                Tiến độ: {livePath.paceStatus}
              </Badge>
            )}
            <Button variant="secondary" size="sm" onClick={() => void handleStartPlacement()}>
              <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>Placement Test thích ứng</span>
            </Button>
            {getAccessToken() && (
              <Button
                variant="primary"
                size="sm"
                disabled={generatingPath}
                onClick={() => void handleGeneratePath()}
              >
                {generatingPath ? 'Đang sinh...' : 'Sinh lộ trình mới'}
              </Button>
            )}
            <Link to="/teacher/students">
              <Button variant="secondary" size="sm">
                <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>
                  {lang === 'vi'
                    ? 'Xem góc nhìn Giáo viên phê duyệt →'
                    : 'Inspect Teacher Approval View →'}
                </span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          {displayedMilestones.map((ms) => {
            const pct =
              ms.plannedSessions > 0
                ? Math.round((ms.completedSessions / ms.plannedSessions) * 100)
                : 0;

            return (
              <Panel
                key={ms.id}
                className={
                  ms.status === 'proposed'
                    ? 'border-dashed border-[var(--status-proposed-border)] bg-[var(--status-proposed-bg)]/30'
                    : undefined
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {ms.status === 'completed' ? (
                        <CheckCircle2
                          className="h-5 w-5 text-[var(--status-completed-text)]"
                          aria-hidden="true"
                        />
                      ) : ms.status === 'in_progress' ? (
                        <CircleDot className="h-5 w-5 text-accent" aria-hidden="true" />
                      ) : (
                        <Clock3 className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-ink">{ms.title}</h2>
                        <Badge tone="neutral" className="font-mono">
                          CEFR {ms.cefrTarget}
                        </Badge>
                      </div>
                      <p className="text-sm text-ink-secondary leading-relaxed">
                        {ms.description}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {ms.status === 'proposed' ? (
                      <ProposedAIBadge />
                    ) : ms.status === 'completed' ? (
                      <Badge tone="completed">Hoàn thành</Badge>
                    ) : ms.status === 'in_progress' ? (
                      <Badge tone="confirmed">Đang học</Badge>
                    ) : (
                      <Badge tone="neutral">Sắp tới</Badge>
                    )}
                  </div>
                </div>

                {ms.aiReason && (
                  <div className="mt-3 px-3.5 py-2.5 rounded-[var(--radius-md)] bg-surface border border-hairline text-xs text-ink-secondary">
                    <span className="font-semibold text-ink">Lý do đề xuất: </span>
                    {ms.aiReason}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ms.skillsFocus.map((skill) => (
                      <Badge key={skill} tone="neutral">
                        {lang === 'vi'
                          ? SKILL_LABELS[skill].vi.split(' (')[0]
                          : SKILL_LABELS[skill].en}
                      </Badge>
                    ))}
                    {ms.humanDecisionBy && (
                      <span className="text-xs text-ink-muted ml-2">
                        Duyệt bởi {ms.humanDecisionBy}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 min-w-[180px]">
                    <div className="flex-1 h-2 rounded-full bg-subtle overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-semibold text-ink tabular-nums">
                      {ms.completedSessions}/{ms.plannedSessions} buổi
                    </span>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      </div>

      {/* Curated Public Materials Library with Source Links */}
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-hairline">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
              <h2 className="text-base font-bold text-ink">
                {lang === 'vi'
                  ? 'Thư viện chủ đề & giáo trình thực hành 1-1 theo CEFR'
                  : 'Curated CEFR 1-on-1 Practice Library'}
              </h2>
            </div>
            <p className="text-xs text-ink-secondary mt-1">
              {lang === 'vi'
                ? 'Dữ liệu chủ đề mẫu được tổng hợp từ nguồn mở British Council LearnEnglish để học viên & giáo viên chọn thực hành trực tiếp trong buổi học.'
                : 'Real public curriculum topics curated from British Council LearnEnglish with verified source URLs.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo kỹ năng">
            {SKILL_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={skillFilter === f.id}
                onClick={() => setSkillFilter(f.id)}
                className={cn(
                  'px-2.5 py-1 rounded-[var(--radius-full)] text-xs font-medium border ui-transition cursor-pointer',
                  skillFilter === f.id
                    ? 'bg-accent-soft border-accent-border text-accent font-semibold'
                    : 'bg-subtle border-hairline text-ink-secondary hover:bg-hover hover:text-ink',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-hairline">
          {apiFilteredLessons
            ? apiFilteredLessons.map((lesson) => (
                <div key={lesson.id} className="py-3.5 flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink">{lesson.title}</span>
                      <Badge tone="completed" className="font-mono">
                        {lesson.cefrLevel}
                      </Badge>
                      <Badge tone="neutral">{SKILL_LABELS[lesson.skillFocus].en}</Badge>
                    </div>
                    <p className="text-xs text-ink-muted leading-relaxed">{lesson.description}</p>
                    {lesson.sourceUrl && (
                      <a
                        href={lesson.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline pt-0.5"
                      >
                        <span>Nguồn: {lesson.sourceName ?? lesson.sourceUrl}</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                  <Link to="/classroom/ses-101">
                    <Button variant="secondary" size="sm">
                      {lang === 'vi' ? 'Dùng trong lớp 1-1' : 'Open in Classroom'}
                    </Button>
                  </Link>
                </div>
              ))
            : visibleLessons.map((lesson) => (
                <div key={lesson.id} className="py-3.5 flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink">{lesson.title}</span>
                      <Badge tone="completed" className="font-mono">
                        {lesson.cefr}
                      </Badge>
                      <Badge tone="neutral">{SKILL_LABELS[lesson.skill].en}</Badge>
                    </div>
                    <p className="text-xs font-medium text-ink-secondary">{lesson.titleVi}</p>
                    <p className="text-xs text-ink-muted leading-relaxed">{lesson.discussionPrompt}</p>
                    <a
                      href={lesson.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline pt-0.5"
                    >
                      <span>Nguồn: {lesson.sourceName}</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>

                  <Link to="/classroom/ses-101">
                    <Button variant="secondary" size="sm">
                      {lang === 'vi' ? 'Dùng trong lớp 1-1' : 'Open in Classroom'}
                    </Button>
                  </Link>
                </div>
              ))}
        </div>
      </Panel>

      <Modal
        open={Boolean(placementStep)}
        onClose={() => setPlacementStep(null)}
        title={`Kiểm tra trình độ thích ứng · Câu ${placementStep?.step ?? 1}/${placementStep?.totalSteps ?? 6}`}
        subtitle={`Mức độ câu hỏi hiện tại: CEFR ${placementStep?.question.level ?? 'B1'}`}
      >
        {placementStep && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-ink">{placementStep.question.prompt}</p>
            <div className="space-y-2">
              {placementStep.question.options.map((opt, idx) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => void handleAnswerPlacement(idx)}
                  className="w-full text-left p-3 rounded-[var(--radius-md)] border border-hairline hover:bg-accent-soft text-xs font-medium text-ink cursor-pointer ui-transition"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
