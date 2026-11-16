import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardCheck } from 'lucide-react';
import { TEACHERS } from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  type ApiPayrollDto,
  type ApiSessionDto,
} from '@/lib/apiClient';
import { formatVND } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

export function TeacherReportsPage() {
  const { pushToast } = useUIStore();
  const { sessions, mistakesVocab, submitSessionReport } = usePlatformStore();

  const [liveCompleted, setLiveCompleted] = useState<
    { id: string; title: string; dateLabel: string; studentName: string; reportSubmitted: boolean; isLiveApi: boolean }[] | null
  >(null);

  const fallbackCompleted = sessions
    .filter((s) => s.status === 'completed')
    .map((s) => ({
      id: s.id,
      title: s.title,
      dateLabel: s.dateLabel,
      studentName: s.studentName,
      reportSubmitted: s.reportSubmitted,
      isLiveApi: false,
    }));

  const completedSessions = liveCompleted ?? fallbackCompleted;
  const [selectedId, setSelectedId] = useState(
    completedSessions.find((s) => !s.reportSubmitted)?.id ?? completedSessions[0]?.id ?? '',
  );
  const [summary, setSummary] = useState(
    'Học viên trả lời tốt phần mở đầu, cần luyện thêm phát âm âm cuối /s/ và /t/ trong câu dài.',
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadSessions = async () => {
      if (!getAccessToken()) return;
      const [sesRes, dashRes] = await Promise.all([
        apiJson<{ items: ApiSessionDto[] }>('/api/v1/sessions?status=completed'),
        apiJson<{ pendingReports: { sessionId: string }[] }>('/api/v1/dashboards/teacher'),
      ]);
      const pendingSet = new Set(
        (dashRes.ok ? dashRes.data.pendingReports : []).map((p) => p.sessionId),
      );
      if (sesRes.ok && sesRes.data.items.length > 0) {
        const mapped = sesRes.data.items.map((s) => ({
          id: s.id,
          title: s.title,
          dateLabel: s.startAt.slice(0, 10),
          studentName: s.studentId,
          reportSubmitted: dashRes.ok ? !pendingSet.has(s.id) : false,
          isLiveApi: true,
        }));
        setLiveCompleted(mapped);
        const firstPending = mapped.find((m) => !m.reportSubmitted);
        setSelectedId((firstPending ?? mapped[0]).id);
      }
    };
    void loadSessions();
  }, []);

  const selectedSession = completedSessions.find((s) => s.id === selectedId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !summary.trim()) return;

    if (selectedSession?.isLiveApi && getAccessToken()) {
      setSubmitting(true);
      const res = await apiJson(`/api/v1/reports/sessions/${selectedId}`, {
        method: 'PUT',
        body: JSON.stringify({
          summary: summary.trim(),
          strengths: ['Tương tác tự tin'],
          weaknesses: ['Cần chú ý âm cuối'],
        }),
      });
      setSubmitting(false);

      if (!res.ok) {
        pushToast({ tone: 'danger', title: 'Nộp báo cáo thất bại', description: res.message });
        return;
      }

      setLiveCompleted((prev) =>
        prev ? prev.map((item) => (item.id === selectedId ? { ...item, reportSubmitted: true } : item)) : prev,
      );
      pushToast({
        tone: 'success',
        title: 'Đã nộp báo cáo buổi học lên máy chủ',
        description: 'Tự động đồng bộ từ vựng trong phòng học & thông báo cho học viên.',
      });
      return;
    }

    submitSessionReport(selectedId, summary.trim());
    pushToast({
      tone: 'success',
      title: 'Đã nộp báo cáo buổi học thành công',
      description: 'Học viên đã nhận được tóm tắt lỗi, từ vựng và điểm 7 kỹ năng mới.',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Báo cáo sau buổi học (Hạn SLA 24 giờ)</h1>
        <p className="text-sm text-ink-secondary mt-0.5">
          Tự động kéo danh sách từ vựng &amp; lỗi đã gắn thẻ từ Phòng học 1-1 để rút ngắn thời gian ghi nhận.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-5 items-start">
        <Panel className="space-y-2">
          <h2 className="text-sm font-bold text-ink mb-2">Danh sách buổi đã dạy</h2>
          <div className="divide-y divide-hairline">
            {completedSessions.map((ses) => (
              <button
                key={ses.id}
                type="button"
                onClick={() => setSelectedId(ses.id)}
                className={`w-full text-left py-3 px-3 rounded-[var(--radius-sm)] cursor-pointer ui-transition ${
                  selectedId === ses.id ? 'bg-accent-soft/70' : 'hover:bg-subtle'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink truncate">{ses.title}</span>
                  {ses.reportSubmitted ? (
                    <Badge tone="completed">Đã nộp</Badge>
                  ) : (
                    <Badge tone="proposed">Chờ nộp</Badge>
                  )}
                </div>
                <p className="text-xs font-mono text-ink-muted mt-1">
                  {ses.dateLabel} · {ses.studentName}
                </p>
              </button>
            ))}
          </div>
        </Panel>

        <Panel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>Nội dung báo cáo · {selectedId}</span>
              </h2>
              <span className="text-xs font-mono text-ink-muted">Chỉnh sửa được trong 48h</span>
            </div>

            <div className="p-3 rounded-[var(--radius-md)] bg-subtle space-y-2">
              <p className="text-xs font-semibold text-ink">
                Thẻ Lỗi &amp; Từ vựng tự động lấy từ Phòng học ({mistakesVocab.length} mục):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mistakesVocab.map((m) => (
                  <Badge key={m.id} tone="neutral" className="font-mono">
                    {m.term} → {m.correction}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="report-summary" className="block text-xs font-semibold text-ink mb-1.5">
                Nhận xét tổng quan &amp; Định hướng buổi sau
              </label>
              <textarea
                id="report-summary"
                rows={5}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full p-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink"
              />
            </div>

            <Button type="submit" variant="primary" size="md" disabled={submitting}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>{submitting ? 'Đang lưu...' : 'Lưu & Chia sẻ cho học viên'}</span>
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

export function TeacherEarningsPage() {
  const teacher = TEACHERS[0];
  const [livePayrolls, setLivePayrolls] = useState<ApiPayrollDto[] | null>(null);

  useEffect(() => {
    const loadPayrolls = async () => {
      if (!getAccessToken()) return;
      const res = await apiJson<ApiPayrollDto[]>('/api/v1/payrolls');
      if (res.ok && res.data.length > 0) {
        setLivePayrolls(res.data);
      }
    };
    void loadPayrolls();
  }, []);

  const payoutRows = livePayrolls
    ? livePayrolls.flatMap((pr) =>
        pr.lineItems.map((item) => ({
          id: `${pr.id}-${item.sessionId}`,
          date: item.startAt.slice(0, 10),
          student: item.studentName,
          session: `${pr.month} (${item.sessionStatus})`,
          rate: item.amountVnd,
          status: pr.status === 'paid' ? 'Đã chi trả' : pr.status === 'approved' ? 'Đã duyệt' : 'Nháp',
        })),
      )
    : [
        { id: 'p1', date: '13/11/2026', student: 'Nguyễn Minh Anh', session: 'Buổi #06', rate: teacher.ratePerSessionVnd, status: 'Hợp lệ' },
        { id: 'p2', date: '11/11/2026', student: 'Nguyễn Minh Anh', session: 'Buổi #05', rate: teacher.ratePerSessionVnd, status: 'Hợp lệ' },
        { id: 'p3', date: '08/11/2026', student: 'Trần Hoàng Phúc', session: 'Buổi #04', rate: teacher.ratePerSessionVnd, status: 'Hợp lệ' },
      ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Thù lao &amp; Bảng công dự kiến</h1>
        <p className="text-sm text-ink-secondary mt-0.5">
          Chốt số liệu đối soát vào cuối tháng dựa trên các buổi hoàn tất đúng SLA.
        </p>
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline text-ink-muted">
                <th className="py-2.5 pr-4 font-semibold">Ngày dạy</th>
                <th className="py-2.5 pr-4 font-semibold">Học viên</th>
                <th className="py-2.5 pr-4 font-semibold">Buổi học</th>
                <th className="py-2.5 pr-4 font-semibold">Trạng thái</th>
                <th className="py-2.5 text-right font-semibold">Mức công</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {payoutRows.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 pr-4 font-mono text-ink-muted">{row.date}</td>
                  <td className="py-3 pr-4 font-semibold text-ink">{row.student}</td>
                  <td className="py-3 pr-4 text-ink-secondary">{row.session}</td>
                  <td className="py-3 pr-4">
                    <Badge tone="completed">{row.status}</Badge>
                  </td>
                  <td className="py-3 text-right font-mono font-bold text-ink tabular-nums">
                    {formatVND(row.rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
