import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, ClipboardCheck, Users, Video, Wallet } from 'lucide-react';
import { TEACHERS } from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  type ApiTeacherDashboardDto,
} from '@/lib/apiClient';
import { formatVND } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import { Badge, ProposedAIBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

export default function TeacherDashboardPage() {
  const navigate = useNavigate();
  const lang = useUIStore((s) => s.lang);
  const { sessions, milestones, homework } = usePlatformStore();
  const [liveDash, setLiveDash] = useState<ApiTeacherDashboardDto | null>(null);

  useEffect(() => {
    const loadDash = async () => {
      if (!getAccessToken()) return;
      const res = await apiJson<ApiTeacherDashboardDto>('/api/v1/dashboards/teacher');
      if (res.ok) setLiveDash(res.data);
    };
    void loadDash();
  }, []);

  const teacher = TEACHERS[0];
  const teacherSessions = sessions.filter((s) => s.teacherId === teacher.id);
  const upcoming = liveDash
    ? liveDash.upcomingSessions.map((s) => ({
        id: s.id,
        title: s.title,
        dateLabel: s.startAt.slice(0, 10),
        timeRange: s.startAt.slice(11, 16),
        studentName: s.studentId,
      }))
    : teacherSessions.filter((s) => s.status === 'scheduled');
  const pendingReportsCount = liveDash
    ? liveDash.pendingReports.length
    : sessions.filter((s) => s.status === 'completed' && !s.reportSubmitted).length;
  const ungradedHomework = homework.filter((h) => h.status === 'submitted');
  const proposedCount = milestones.filter((m) => m.status === 'proposed').length;
  const estimatedPayrollVnd =
    liveDash?.currentMonthPayroll?.netVnd ?? teacher.ratePerSessionVnd * 18;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {lang === 'vi' ? `Chào ${teacher.name}` : `Welcome, ${teacher.name}`}
          </h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            {teacher.title} · Múi giờ gốc{' '}
            <span className="font-mono text-xs">{teacher.sourceTimezone}</span>
          </p>
        </div>
        <Link to="/teacher/availability">
          <Button variant="secondary" size="md">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            <span>{lang === 'vi' ? 'Cài đặt lịch rảnh tuần' : 'Weekly availability'}</span>
          </Button>
        </Link>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Panel className="space-y-1">
          <p className="text-xs text-ink-muted">Buổi sắp dạy</p>
          <p className="font-mono text-2xl font-bold text-ink tabular-nums">{upcoming.length}</p>
          <p className="text-xs text-ink-secondary">Hiển thị theo GMT+7 &amp; EST</p>
        </Panel>

        <Panel className="space-y-1">
          <p className="text-xs text-ink-muted">Báo cáo chờ nộp (&lt;24h)</p>
          <p className="font-mono text-2xl font-bold text-[var(--status-proposed-text)] tabular-nums">
            {pendingReportsCount}
          </p>
          <Link to="/teacher/reports" className="text-xs text-accent font-semibold hover:underline">
            Hoàn tất ngay →
          </Link>
        </Panel>

        <Panel className="space-y-1">
          <p className="text-xs text-ink-muted">Bài tập cần chấm</p>
          <p className="font-mono text-2xl font-bold text-ink tabular-nums">
            {ungradedHomework.length}
          </p>
          <p className="text-xs text-ink-secondary">Cập nhật trực tiếp vào tiến bộ</p>
        </Panel>

        <Panel className="space-y-1">
          <p className="text-xs text-ink-muted">Thu nhập tạm tính tháng 11</p>
          <p className="font-mono text-2xl font-bold text-[var(--status-completed-text)] tabular-nums">
            {formatVND(estimatedPayrollVnd)}
          </p>
          <Link to="/teacher/earnings" className="text-xs text-accent font-semibold hover:underline">
            Chi tiết bảng công →
          </Link>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] gap-5">
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Lịch dạy 1-1 sắp tới</h2>
            <Badge tone="neutral" className="font-mono">
              GMT+7
            </Badge>
          </div>
          <div className="divide-y divide-hairline">
            {upcoming.map((ses) => (
              <div
                key={ses.id}
                className="py-3 first:pt-1 last:pb-1 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{ses.title}</p>
                  <p className="text-xs text-ink-secondary mt-0.5 font-mono">
                    {ses.dateLabel} · {ses.timeRange} · Học viên: {ses.studentName}
                  </p>
                </div>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => navigate(`/classroom/${ses.id}`)}
                >
                  <Video className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Mở lớp học</span>
                </Button>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">Đề xuất lộ trình cần duyệt</h2>
            <ProposedAIBadge />
          </div>
          <p className="text-xs text-ink-secondary leading-relaxed">
            Hiện có <span className="font-mono font-bold text-ink">{proposedCount}</span> đề xuất
            tăng cường lộ trình cho Nguyễn Minh Anh đang chờ giáo viên chấp nhận hoặc từ chối.
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" size="md" onClick={() => navigate('/teacher/students')}>
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>Xem &amp; Phê duyệt lộ trình học viên</span>
            </Button>
            <Button variant="secondary" size="md" onClick={() => navigate('/teacher/reports')}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              <span>Nộp báo cáo buổi học</span>
            </Button>
            <Button variant="ghost" size="md" onClick={() => navigate('/teacher/earnings')}>
              <Wallet className="h-4 w-4" aria-hidden="true" />
              <span>Bảng đối soát thù lao</span>
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
