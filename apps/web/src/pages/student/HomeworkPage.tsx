import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import {
  apiJson,
  getAccessToken,
  type ApiHomeworkDto,
} from '@/lib/apiClient';
import { SKILL_LABELS } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import type { HomeworkItem, HomeworkStatus } from '@/types/domain';
import { Badge, ProposedAIBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/States';

type FilterTab = 'all' | HomeworkStatus;

interface ExtendedHomeworkItem extends HomeworkItem {
  isLiveApi?: boolean;
  maxScore?: number;
  questions?: ApiHomeworkDto['questions'];
}

export default function HomeworkPage() {
  const { lang, pushToast } = useUIStore();
  const { homework, submitHomework } = usePlatformStore();

  const [tab, setTab] = useState<FilterTab>('all');
  const [liveItems, setLiveItems] = useState<ExtendedHomeworkItem[] | null>(null);
  const [activeHw, setActiveHw] = useState<ExtendedHomeworkItem | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [answersMap, setAnswersMap] = useState<Record<string, string>>({});

  const loadHomework = useCallback(async () => {
    if (!getAccessToken()) return;
    const res = await apiJson<ApiHomeworkDto[]>('/api/v1/curriculum/homework');
    if (res.ok && res.data.length > 0) {
      setLiveItems(
        res.data.map((h) => ({
          id: h.id,
          title: h.title,
          sessionTitle: `Dạng ${h.homeworkType}`,
          skill: h.skillFocus,
          dueLabel: h.autoSuggestedScore !== undefined ? `Gợi ý auto: ${h.autoSuggestedScore}/${h.maxScore}` : 'Đồng bộ API',
          status: h.status === 'assigned' || h.status === 'overdue' ? 'todo' : h.status,
          prompt: h.prompt,
          submittedNote: h.submittedNote,
          score: h.score,
          maxScore: h.maxScore,
          teacherFeedback: h.teacherFeedback,
          questions: h.questions,
          isLiveApi: true,
        })),
      );
    }
  }, []);

  useEffect(() => {
    void loadHomework();
  }, [loadHomework]);

  const sourceHomework: ExtendedHomeworkItem[] = liveItems ?? homework;
  const filtered =
    tab === 'all' ? sourceHomework : sourceHomework.filter((item) => item.status === tab);

  const handleOpenSubmit = (item: ExtendedHomeworkItem) => {
    setActiveHw(item);
    setNoteInput(item.submittedNote ?? '');
    setAnswersMap({});
  };

  const handleSaveSubmission = async () => {
    if (!activeHw) return;

    if (activeHw.isLiveApi && getAccessToken()) {
      const answers = Object.entries(answersMap).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));
      const res = await apiJson<ApiHomeworkDto>(`/api/v1/curriculum/homework/${activeHw.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          note: noteInput.trim() || undefined,
          answers,
        }),
      });
      if (!res.ok) {
        pushToast({ tone: 'danger', title: 'Nộp bài thất bại', description: res.message });
        return;
      }
      pushToast({
        tone: 'success',
        title: 'Đã nộp bài tập lên máy chủ',
        description:
          res.data.autoSuggestedScore !== undefined
            ? `Điểm trắc nghiệm gợi ý: ${res.data.autoSuggestedScore}/${res.data.maxScore}`
            : activeHw.title,
      });
      setActiveHw(null);
      setNoteInput('');
      await loadHomework();
      return;
    }

    if (!noteInput.trim()) return;
    submitHomework(activeHw.id, noteInput.trim());
    pushToast({
      tone: 'success',
      title: lang === 'vi' ? 'Đã nộp bài tập thành công' : 'Homework submitted',
      description: activeHw.title,
    });
    setActiveHw(null);
    setNoteInput('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {lang === 'vi' ? 'Bài tập về nhà' : 'Homework'}
          </h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            {lang === 'vi'
              ? 'Bài tập bám sát lỗi phát âm, từ vựng và kỹ năng từ các buổi học 1-1.'
              : 'Exercises tied directly to mistakes and goals from your 1-on-1 sessions.'}
          </p>
        </div>

        <div className="inline-flex p-0.5 rounded-[var(--radius-md)] bg-subtle border border-hairline">
          {(
            [
              { id: 'all', label: lang === 'vi' ? 'Tất cả' : 'All' },
              { id: 'todo', label: lang === 'vi' ? 'Cần làm' : 'To do' },
              { id: 'submitted', label: lang === 'vi' ? 'Đã nộp' : 'Submitted' },
              { id: 'graded', label: lang === 'vi' ? 'Đã chấm' : 'Graded' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTab(f.id)}
              className={`px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer ui-transition ${
                tab === f.id
                  ? 'bg-surface text-ink border border-hairline font-semibold'
                  : 'text-ink-muted hover:text-ink border border-transparent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={lang === 'vi' ? 'Không có bài tập trong mục này' : 'No homework in this view'}
          hint={lang === 'vi' ? 'Chuyển sang tab Tất cả để xem danh sách bài tập.' : 'Switch back to All to inspect other tasks.'}
          action={
            <Button variant="secondary" size="sm" onClick={() => setTab('all')}>
              {lang === 'vi' ? 'Xem tất cả' : 'View all'}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <Panel key={item.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-ink">{item.title}</h2>
                    {item.isAiProposed && <ProposedAIBadge />}
                  </div>
                  <p className="text-xs text-ink-muted">
                    {item.sessionTitle} ·{' '}
                    {lang === 'vi' ? SKILL_LABELS[item.skill].vi : SKILL_LABELS[item.skill].en} ·{' '}
                    <span className="font-mono">{item.dueLabel}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {item.status === 'graded' ? (
                    <Badge tone="completed" className="font-mono">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {item.score}/{item.maxScore ?? 10}
                    </Badge>
                  ) : item.status === 'submitted' ? (
                    <Badge tone="confirmed">Đã nộp · Chờ chấm</Badge>
                  ) : (
                    <Badge tone="proposed">Chưa nộp</Badge>
                  )}
                </div>
              </div>

              <p className="text-sm text-ink-secondary">{item.prompt}</p>

              {item.submittedNote && (
                <div className="p-3 rounded-[var(--radius-md)] bg-subtle text-xs text-ink-secondary">
                  <span className="font-semibold text-ink">Bài nộp của bạn: </span>
                  {item.submittedNote}
                </div>
              )}

              {item.teacherFeedback && (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-completed-bg)]/60 text-xs text-[var(--status-completed-text)]">
                  <span className="font-bold">Nhận xét giáo viên: </span>
                  {item.teacherFeedback}
                </div>
              )}

              <div className="pt-2 border-t border-hairline flex justify-end">
                <Button
                  variant={item.status === 'todo' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleOpenSubmit(item)}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {item.status === 'todo'
                      ? lang === 'vi'
                        ? 'Nộp bài'
                        : 'Submit'
                      : lang === 'vi'
                        ? 'Cập nhật bài nộp'
                        : 'Edit submission'}
                  </span>
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(activeHw)}
        onClose={() => setActiveHw(null)}
        title={activeHw?.title ?? ''}
        subtitle={activeHw?.sessionTitle}
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-secondary">{activeHw?.prompt}</p>
          {activeHw?.questions && activeHw.questions.length > 0 && (
            <div className="space-y-3">
              {activeHw.questions.map((q, idx) => (
                <div key={q.id} className="p-3 rounded-[var(--radius-md)] bg-subtle space-y-2 text-xs">
                  <p className="font-semibold text-ink">
                    Câu {idx + 1}: {q.prompt}
                  </p>
                  {q.options && q.options.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {q.options.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            checked={answersMap[q.id] === opt}
                            onChange={() => setAnswersMap((p) => ({ ...p, [q.id]: opt }))}
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={answersMap[q.id] ?? ''}
                      onChange={(e) => setAnswersMap((p) => ({ ...p, [q.id]: e.target.value }))}
                      placeholder="Nhập câu trả lời..."
                      className="w-full h-8 px-2.5 rounded bg-surface border border-hairline text-xs text-ink"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <div>
            <label htmlFor="hw-note" className="block text-xs font-semibold text-ink mb-1.5">
              {lang === 'vi'
                ? 'Nội dung bài làm hoặc link Google Drive / ghi âm'
                : 'Written response or audio/document link'}
            </label>
            <textarea
              id="hw-note"
              rows={5}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={
                lang === 'vi'
                  ? 'Nhập đoạn văn hoặc dán liên kết file ghi âm...'
                  : 'Paste essay response or audio recording link...'
              }
              className="w-full p-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setActiveHw(null)}>
              {lang === 'vi' ? 'Huỷ' : 'Cancel'}
            </Button>
            <Button variant="accent" size="sm" onClick={() => void handleSaveSubmission()}>
              {lang === 'vi' ? 'Gửi bài cho giáo viên' : 'Submit to teacher'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
