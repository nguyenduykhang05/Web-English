import { useCallback, useEffect, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { SAMPLE_STUDENT, STUDENT_TARGET_SKILLS } from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  mapApiMilestonesToView,
  type ApiAiLogDto,
  type ApiHomeworkDto,
  type ApiLearningPathDto,
  type ApiPracticeAttemptDto,
} from '@/lib/apiClient';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import type { LearningMilestone } from '@/types/domain';
import { Badge, ProposedAIBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { SkillRadar } from '@/components/ui/SkillRadar';

interface AssignedStudentRow {
  userId: string;
  user?: { fullName: string };
  currentCefr: string;
  weaknesses?: string[];
}

export default function TeacherStudentsPage() {
  const { pushToast } = useUIStore();
  const { milestones, skills, decideProposedMilestone } = usePlatformStore();
  const [liveStudent, setLiveStudent] = useState<AssignedStudentRow | null>(null);
  const [livePath, setLivePath] = useState<ApiLearningPathDto | null>(null);
  const [aiProposals, setAiProposals] = useState<ApiAiLogDto[]>([]);
  const [studentHomework, setStudentHomework] = useState<ApiHomeworkDto[]>([]);
  const [shadowReviews, setShadowReviews] = useState<ApiPracticeAttemptDto[]>([]);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [generatingAiEx, setGeneratingAiEx] = useState(false);

  const loadAssignedPath = useCallback(async () => {
    if (!getAccessToken()) return;
    const stuRes = await apiJson<{ items: AssignedStudentRow[] }>('/api/v1/students');
    if (stuRes.ok && stuRes.data.items.length > 0) {
      const first = stuRes.data.items[0];
      setLiveStudent(first);
      const [pathRes, aiLogsRes, hwRes, shadowRes] = await Promise.all([
        apiJson<ApiLearningPathDto | null>(`/api/v1/learning-paths/student/${first.userId}`),
        apiJson<ApiAiLogDto[]>(`/api/v1/ai/logs?studentId=${first.userId}&status=proposed`),
        apiJson<ApiHomeworkDto[]>(`/api/v1/curriculum/homework?studentId=${first.userId}`),
        apiJson<ApiPracticeAttemptDto[]>(
          `/api/v1/practice/attempts?studentId=${first.userId}&proposedStatus=proposed`,
        ),
      ]);
      if (pathRes.ok && pathRes.data) {
        setLivePath(pathRes.data);
      }
      if (aiLogsRes.ok) {
        setAiProposals(aiLogsRes.data);
      }
      if (hwRes.ok) {
        setStudentHomework(hwRes.data);
      }
      if (shadowRes.ok) {
        setShadowReviews(shadowRes.data);
      }
    }
  }, []);

  const handleGenerateAiExercise = async () => {
    if (!liveStudent || !getAccessToken()) return;
    setGeneratingAiEx(true);
    const res = await apiJson<ApiAiLogDto>('/api/v1/ai/exercise-generation', {
      method: 'POST',
      body: JSON.stringify({
        studentId: liveStudent.userId,
        skillFocus: 'vocabulary',
        cefrLevel: 'B2',
        homeworkType: 'multiple_choice',
        topic: 'IELTS Speaking Part 3 Fluency',
      }),
    });
    setGeneratingAiEx(false);
    if (res.ok) {
      pushToast({
        tone: 'success',
        title: 'AI đã sinh đề xuất bài tập (trạng thái proposed)',
        description: 'Vui lòng kiểm tra và bấm Duyệt bên dưới để giao cho học viên.',
      });
      await loadAssignedPath();
    } else {
      pushToast({ tone: 'danger', title: 'Không thể gọi AI', description: res.message });
    }
  };

  const handleAiProposalDecision = async (logId: string, decision: 'approved' | 'rejected') => {
    const res = await apiJson<ApiAiLogDto>(`/api/v1/ai/logs/${logId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    if (res.ok) {
      pushToast({
        tone: decision === 'approved' ? 'success' : 'neutral',
        title: decision === 'approved' ? 'Đã duyệt đề xuất AI' : 'Đã từ chối đề xuất AI',
      });
      await loadAssignedPath();
    } else {
      pushToast({ tone: 'danger', title: 'Thao tác thất bại', description: res.message });
    }
  };

  useEffect(() => {
    void loadAssignedPath();
  }, [loadAssignedPath]);

  const displayedMilestones: LearningMilestone[] = livePath
    ? mapApiMilestonesToView(livePath.milestones)
    : milestones;

  const handleDecision = async (milestoneId: string, decision: 'accepted' | 'rejected') => {
    if (livePath && getAccessToken()) {
      const res = await apiJson<ApiLearningPathDto>(
        `/api/v1/learning-paths/${livePath._id}/milestones/${milestoneId}/decision`,
        {
          method: 'POST',
          body: JSON.stringify({ decision }),
        },
      );
      if (res.ok) {
        setLivePath(res.data);
        pushToast({
          tone: decision === 'accepted' ? 'success' : 'neutral',
          title:
            decision === 'accepted'
              ? 'Đã phê duyệt đề xuất lộ trình lên hệ thống'
              : 'Đã từ chối đề xuất & giữ nguyên lộ trình',
        });
      } else {
        pushToast({ tone: 'danger', title: 'Phê duyệt thất bại', description: res.message });
      }
      return;
    }

    decideProposedMilestone(milestoneId, decision, 'Ms. Sarah Jenkins');
    pushToast({
      tone: decision === 'accepted' ? 'success' : 'neutral',
      title:
        decision === 'accepted'
          ? 'Đã chấp nhận đề xuất lộ trình & ghi nhận vào Audit Log'
          : 'Đã từ chối đề xuất & giữ nguyên lộ trình hiện tại',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Học viên được phân công &amp; Phê duyệt lộ trình</h1>
        <p className="text-sm text-ink-secondary mt-0.5">
          Quy tắc cốt lõi: Mọi gợi ý từ AI/Rule engine luôn cần quyết định cuối cùng của giáo viên.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5 items-start">
        <Panel className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-ink">
                {liveStudent?.user?.fullName ?? SAMPLE_STUDENT.name}
              </h2>
              <p className="text-xs text-ink-secondary">{SAMPLE_STUDENT.targetGoal}</p>
            </div>
            <Badge tone="confirmed" className="font-mono">
              CEFR {liveStudent?.currentCefr ?? SAMPLE_STUDENT.currentCefr}
            </Badge>
          </div>

          <SkillRadar current={skills} target={STUDENT_TARGET_SKILLS} height={240} />

          <div className="pt-3 border-t border-hairline space-y-1.5 text-xs">
            <p className="font-semibold text-ink">Điểm yếu tự khai &amp; ghi nhận lớp học:</p>
            <ul className="list-disc pl-4 space-y-1 text-ink-secondary">
              {SAMPLE_STUDENT.weaknesses.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel className="space-y-4">
          <h2 className="text-base font-bold text-ink">Danh sách chặng &amp; Đề xuất chờ duyệt</h2>

          <div className="divide-y divide-hairline">
            {displayedMilestones.map((ms) => (
              <div key={ms.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-ink">{ms.title}</p>
                    <p className="text-xs text-ink-secondary mt-0.5">{ms.description}</p>
                  </div>
                  {ms.status === 'proposed' ? (
                    <ProposedAIBadge />
                  ) : (
                    <Badge tone={ms.status === 'completed' ? 'completed' : 'neutral'}>
                      {ms.status}
                    </Badge>
                  )}
                </div>

                {ms.status === 'proposed' && (
                  <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-proposed-bg)]/45 border border-dashed border-[var(--status-proposed-border)] space-y-2.5">
                    {ms.aiReason && (
                      <p className="text-xs text-ink-secondary">
                        <span className="font-semibold text-ink">Căn cứ rule engine: </span>
                        {ms.aiReason}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleDecision(ms.id, 'accepted')}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Chấp nhận &amp; Áp dụng vào lộ trình</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleDecision(ms.id, 'rejected')}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Từ chối đề xuất</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {liveStudent && (
            <div className="pt-4 border-t border-hairline space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-ink">Đề xuất từ AI chờ duyệt ({aiProposals.length})</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={generatingAiEx}
                  onClick={() => void handleGenerateAiExercise()}
                >
                  <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{generatingAiEx ? 'AI đang tạo...' : 'Gợi ý bài tập AI'}</span>
                </Button>
              </div>
              {aiProposals.map((prop) => (
                <div
                  key={prop.id}
                  className="p-3 rounded-[var(--radius-md)] bg-subtle border border-hairline space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-ink">{prop.feature}</span>
                    <ProposedAIBadge />
                  </div>
                  <p className="text-ink-secondary">{prop.summary}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleAiProposalDecision(prop.id, 'approved')}
                    >
                      Duyệt đề xuất
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleAiProposalDecision(prop.id, 'rejected')}
                    >
                      Từ chối
                    </Button>
                  </div>
                </div>
              ))}

              <div className="pt-3 border-t border-hairline space-y-2.5">
                <h3 className="text-sm font-bold text-ink">
                  Bài tập đã giao &amp; Chờ chấm điểm ({studentHomework.length})
                </h3>
                {studentHomework.map((hw) => (
                  <div
                    key={hw.id}
                    className="p-3 rounded-[var(--radius-md)] bg-subtle border border-hairline flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-semibold text-ink">{hw.title}</p>
                      <p className="text-ink-muted font-mono">
                        {hw.status}
                        {hw.autoSuggestedScore !== undefined
                          ? ` · Auto gợi ý: ${hw.autoSuggestedScore}/${hw.maxScore}`
                          : ''}
                        {hw.score !== undefined ? ` · Điểm: ${hw.score}/${hw.maxScore}` : ''}
                      </p>
                    </div>
                    {hw.status === 'submitted' && (
                      <Button
                        variant="accent"
                        size="sm"
                        disabled={gradingId === hw.id}
                        onClick={async () => {
                          setGradingId(hw.id);
                          const finalScore = hw.autoSuggestedScore ?? 88;
                          const gRes = await apiJson(`/api/v1/curriculum/homework/${hw.id}/grade`, {
                            method: 'POST',
                            body: JSON.stringify({
                              score: finalScore,
                              teacherFeedback: 'Đã chấm điểm chính thức và cập nhật EMA kỹ năng.',
                            }),
                          });
                          setGradingId(null);
                          if (gRes.ok) {
                            pushToast({
                              tone: 'success',
                              title: `Đã chấm ${finalScore}/${hw.maxScore}đ cho ${hw.title}`,
                            });
                            await loadAssignedPath();
                          } else {
                            pushToast({
                              tone: 'danger',
                              title: 'Chấm điểm thất bại',
                              description: gRes.message,
                            });
                          }
                        }}
                      >
                        {gradingId === hw.id ? 'Đang chấm...' : 'Chấm điểm ngay'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {shadowReviews.length > 0 && (
                <div className="pt-3 border-t border-hairline space-y-2.5">
                  <h3 className="text-sm font-bold text-ink">
                    Bài Shadowing chờ giáo viên duyệt ({shadowReviews.length})
                  </h3>
                  {shadowReviews.map((att) => (
                    <div
                      key={att.id}
                      className="p-3 rounded-[var(--radius-md)] bg-[var(--status-proposed-bg)]/45 border border-dashed border-[var(--status-proposed-border)] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-ink">
                          {att.lessonTitle ?? 'Audio Lab'} · Câu {att.segmentIndex + 1}
                        </span>
                        <ProposedAIBadge />
                      </div>
                      <p className="font-mono text-ink-secondary">
                        AI chấm sơ bộ: {att.autoScore}/100 · Chính xác {att.accuracyPct}% ·{' '}
                        {att.spokenTranscript}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={async () => {
                            const r = await apiJson(`/api/v1/practice/attempts/${att.id}/review`, {
                              method: 'POST',
                              body: JSON.stringify({
                                decision: 'approved',
                                verifiedScore: att.autoScore,
                                teacherFeedback: 'Phát âm rõ ràng, nhịp câu tự nhiên.',
                              }),
                            });
                            if (r.ok) {
                              pushToast({
                                tone: 'success',
                                title: `Đã xác nhận điểm Shadowing ${att.autoScore}/100`,
                              });
                              await loadAssignedPath();
                            }
                          }}
                        >
                          Duyệt bài Shadowing
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            const r = await apiJson(`/api/v1/practice/attempts/${att.id}/review`, {
                              method: 'POST',
                              body: JSON.stringify({
                                decision: 'needs_retry',
                                teacherFeedback: 'Chú ý bật rõ âm cuối và nối âm tự nhiên hơn.',
                              }),
                            });
                            if (r.ok) {
                              pushToast({
                                tone: 'neutral',
                                title: 'Đã gửi yêu cầu luyện lại câu Shadowing',
                              });
                              await loadAssignedPath();
                            }
                          }}
                        >
                          Yêu cầu luyện lại
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
