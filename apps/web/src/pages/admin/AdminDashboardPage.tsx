import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react';
import { ADMIN_REVENUE_SERIES } from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  type ApiAdminDashboardDto,
} from '@/lib/apiClient';
import { computeLedgerBalance, formatVND } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

export default function AdminDashboardPage() {
  const { lang, pushToast } = useUIStore();
  const { alerts, invoices, ledger, advanceAlertStatus } = usePlatformStore();
  const [liveDash, setLiveDash] = useState<ApiAdminDashboardDto | null>(null);
  const [generatingPayroll, setGeneratingPayroll] = useState(false);

  const loadAdminDash = useCallback(async () => {
    if (!getAccessToken()) return;
    const res = await apiJson<ApiAdminDashboardDto>('/api/v1/dashboards/admin');
    if (res.ok) setLiveDash(res.data);
  }, []);

  useEffect(() => {
    void loadAdminDash();
  }, [loadAdminDash]);

  const openAlerts = liveDash ? liveDash.kpis.openAlertsCount : alerts.filter((a) => a.status !== 'resolved').length;
  const pendingTransfers = liveDash
    ? liveDash.kpis.pendingInvoicesCount
    : invoices.filter((i) => i.status === 'pending_verification').length;
  const studentBalance = computeLedgerBalance(ledger);
  const completedCount = liveDash ? liveDash.kpis.completedSessions30d : 690;
  const revenueVnd = liveDash ? liveDash.kpis.monthlyRevenueVnd : 207900000;
  const chartData = liveDash ? liveDash.weeklyThroughput : ADMIN_REVENUE_SERIES;
  const displayedAlerts = liveDash
    ? liveDash.alerts.map((a) => ({
        id: a.id,
        title: a.title,
        detail: a.detail,
        createdAtLabel: a.type,
        status: a.status,
        isLiveApi: true,
      }))
    : alerts.map((a) => ({ ...a, isLiveApi: false }));

  const handleGenerateCurrentMonthPayroll = async () => {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    setGeneratingPayroll(true);
    const res = await apiJson<unknown[]>('/api/v1/payrolls/generate', {
      method: 'POST',
      body: JSON.stringify({ month }),
    });
    setGeneratingPayroll(false);
    if (res.ok) {
      pushToast({
        tone: 'success',
        title: `Đã tổng hợp bảng công tháng ${month}`,
        description: `Tạo/cập nhật ${res.data.length} bảng lương giáo viên (trạng thái draft).`,
      });
    } else {
      pushToast({ tone: 'danger', title: 'Tổng hợp bảng công thất bại', description: res.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {lang === 'vi' ? 'Tổng quan vận hành hệ thống' : 'Platform Operations Overview'}
          </h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            {lang === 'vi'
              ? 'Theo dõi cảnh báo SLA chất lượng, đối soát chuyển khoản và sản lượng lớp học 1-1.'
              : 'Monitor SLA quality alerts, manual bank reconciliations, and weekly session throughput.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {liveDash && (
            <Button
              variant="secondary"
              size="md"
              disabled={generatingPayroll}
              onClick={() => void handleGenerateCurrentMonthPayroll()}
            >
              <Wallet className="h-4 w-4" aria-hidden="true" />
              <span>{generatingPayroll ? 'Đang tính lương...' : 'Chốt bảng công tháng'}</span>
            </Button>
          )}
          <Link to="/admin/enrollments">
            <Button variant="primary" size="md">
              Đối soát chuyển khoản ({pendingTransfers})
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Panel className="space-y-1">
          <p className="text-xs text-ink-muted">Buổi học hoàn tất (4 tuần)</p>
          <p className="font-mono text-2xl font-bold text-ink tabular-nums">{completedCount}</p>
          <p className="text-xs text-[var(--status-completed-text)]">94.8% đúng giờ</p>
        </Panel>

        <Panel className="space-y-1">
          <p className="text-xs text-ink-muted">Doanh thu ghi nhận tháng</p>
          <p className="font-mono text-2xl font-bold text-ink tabular-nums">
            {formatVND(revenueVnd)}
          </p>
          <p className="text-xs text-ink-secondary">VietQR &amp; Chuyển khoản trực tiếp</p>
        </Panel>

        <Panel className="space-y-1">
          <p className="text-xs text-ink-muted">Cảnh báo chất lượng đang mở</p>
          <p className="font-mono text-2xl font-bold text-[var(--status-proposed-text)] tabular-nums">
            {openAlerts}
          </p>
          <p className="text-xs text-ink-secondary">SLA báo cáo 24h &amp; Giữ nhịp học</p>
        </Panel>

        <Panel className="space-y-1">
          <p className="text-xs text-ink-muted">
            {liveDash ? 'Quy mô hoạt động (HV / GV)' : 'Sổ cái mẫu Nguyễn Minh Anh'}
          </p>
          <p className="font-mono text-2xl font-bold text-accent tabular-nums">
            {liveDash
              ? `${liveDash.kpis.activeStudentsCount} HV · ${liveDash.kpis.activeTeachersCount} GV`
              : `${studentBalance} buổi`}
          </p>
          <p className="text-xs text-ink-secondary">
            {liveDash
              ? 'Học viên & giáo viên active trên hệ thống'
              : 'Đồng bộ tức thì khi duyệt thanh toán'}
          </p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-5 items-start">
        <Panel>
          <h2 className="text-base font-bold text-ink mb-1">Sản lượng buổi 1-1 theo tuần</h2>
          <p className="text-xs text-ink-muted mb-4">Số buổi thực học (lớp 50 phút)</p>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="var(--border-hairline)" strokeDasharray="3 3" />
                <XAxis dataKey="week" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="sessions"
                  name="Buổi 1-1"
                  fill="var(--accent)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Quality Alerts open -> ack -> resolved */}
        <Panel className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Cảnh báo vận hành (Alerts)</h2>
            <Badge tone="neutral" className="font-mono">
              open → ack → resolved
            </Badge>
          </div>

          <div className="divide-y divide-hairline">
            {displayedAlerts.map((alert) => (
              <div key={alert.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={`h-4 w-4 mt-0.5 shrink-0 ${
                        alert.status === 'resolved'
                          ? 'text-ink-muted'
                          : 'text-[var(--status-proposed-text)]'
                      }`}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-bold text-ink">{alert.title}</p>
                      <p className="text-xs text-ink-secondary mt-0.5">{alert.detail}</p>
                      <p className="text-xs font-mono text-ink-muted mt-1">
                        {alert.createdAtLabel}
                      </p>
                    </div>
                  </div>

                  <Badge
                    tone={
                      alert.status === 'resolved'
                        ? 'completed'
                        : alert.status === 'ack'
                          ? 'confirmed'
                          : 'alert'
                    }
                    className="uppercase font-mono shrink-0"
                  >
                    {alert.status}
                  </Badge>
                </div>

                {alert.status !== 'resolved' && (
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const nextStatus = alert.status === 'open' ? 'ack' : 'resolved';
                        if (alert.isLiveApi && getAccessToken()) {
                          const res = await apiJson(`/api/v1/quality/alerts/${alert.id}/advance`, {
                            method: 'POST',
                            body: JSON.stringify({ status: nextStatus }),
                          });
                          if (!res.ok) {
                            pushToast({ tone: 'danger', title: 'Cập nhật thất bại', description: res.message });
                            return;
                          }
                          await loadAdminDash();
                        } else {
                          advanceAlertStatus(alert.id);
                        }
                        pushToast({
                          tone: 'success',
                          title:
                            alert.status === 'open'
                              ? 'Đã chuyển cảnh báo sang trạng thái ACK'
                              : 'Đã đánh dấu xử lý xong (Resolved)',
                        });
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{alert.status === 'open' ? 'Nhận xử lý (ACK)' : 'Hoàn tất (Resolve)'}</span>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
