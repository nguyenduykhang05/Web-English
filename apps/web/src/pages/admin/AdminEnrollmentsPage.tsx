import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  apiJson,
  getAccessToken,
  mapApiInvoiceToRecord,
  type ApiInvoiceDto,
  type LiveInvoiceRecord,
} from '@/lib/apiClient';
import { computeLedgerBalance, formatVND } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

export default function AdminEnrollmentsPage() {
  const { pushToast } = useUIStore();
  const { invoices, ledger, confirmInvoicePayment } = usePlatformStore();
  const [liveRows, setLiveRows] = useState<LiveInvoiceRecord[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const loadInvoices = async () => {
    if (!getAccessToken()) return;
    const res = await apiJson<ApiInvoiceDto[]>('/api/v1/invoices');
    if (res.ok && res.data.length > 0) {
      setLiveRows(res.data.map((inv) => mapApiInvoiceToRecord(inv, inv.studentId)));
    }
  };

  useEffect(() => {
    void loadInvoices();
  }, []);

  const displayedInvoices: LiveInvoiceRecord[] = liveRows ?? invoices;
  const currentBalance = computeLedgerBalance(ledger);

  const handleConfirm = async (inv: LiveInvoiceRecord) => {
    if (inv.paymentId && getAccessToken()) {
      setConfirmingId(inv.id);
      const res = await apiJson<{
        enrollmentStatus: string;
        remainingSessions: number;
      }>(`/api/v1/payments/${inv.paymentId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          transactionRef: `ADMIN-CONFIRM-${inv.code}`,
          paidAmountVnd: inv.amountVnd,
        }),
      });
      setConfirmingId(null);

      if (res.ok) {
        pushToast({
          tone: 'success',
          title: `Đã duyệt ${inv.code} (+${res.data.remainingSessions} buổi)`,
          description: 'Đã ghi bút toán purchase vào SessionLedger trong transaction.',
        });
        await loadInvoices();
      } else {
        pushToast({
          tone: 'danger',
          title: 'Xác nhận thanh toán thất bại',
          description: res.message,
        });
      }
      return;
    }

    confirmInvoicePayment(inv.id, 'Admin Linh Chi');
    pushToast({
      tone: 'success',
      title: `Đã duyệt ${inv.code} (+${inv.sessionsCount} buổi)`,
      description: 'Đã ghi bút toán credit vào sessionLedger và nhật ký Audit.',
    });
  };

  const handleRefund = async (inv: LiveInvoiceRecord) => {
    if (!getAccessToken()) return;
    setConfirmingId(inv.id);
    const res = await apiJson<{ deductedSessions: number; refundAmountVnd: number }>(
      `/api/v1/invoices/${inv.id}/refund`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'Admin hoàn tiền qua cổng đối soát' }),
      },
    );
    setConfirmingId(null);
    if (res.ok) {
      pushToast({
        tone: 'success',
        title: `Đã hoàn tiền hoá đơn ${inv.code}`,
        description: `Hoàn ${formatVND(res.data.refundAmountVnd)} & thu hồi ${res.data.deductedSessions} buổi còn dư.`,
      });
      await loadInvoices();
    } else {
      pushToast({ tone: 'danger', title: 'Hoàn tiền thất bại', description: res.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Tuyển sinh &amp; Xác nhận thanh toán</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Khi Admin xác nhận đã nhận chuyển khoản, hệ thống tự động ghi bút toán `credit` vào sổ cái buổi học trong transaction.
          </p>
        </div>
        <Badge tone="confirmed" className="font-mono">
          Số dư sổ cái Minh Anh hiện tại: {currentBalance} buổi
        </Badge>
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline text-ink-muted">
                <th className="py-2.5 pr-4 font-semibold">Mã hoá đơn</th>
                <th className="py-2.5 pr-4 font-semibold">Học viên</th>
                <th className="py-2.5 pr-4 font-semibold">Gói đăng ký</th>
                <th className="py-2.5 pr-4 font-semibold">Số tiền</th>
                <th className="py-2.5 pr-4 font-semibold">Trạng thái</th>
                <th className="py-2.5 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {displayedInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-3 pr-4 font-mono font-bold text-ink">{inv.code}</td>
                  <td className="py-3 pr-4 font-medium text-ink">{inv.studentName}</td>
                  <td className="py-3 pr-4">
                    <p className="text-ink">{inv.packageName}</p>
                    <p className="font-mono text-ink-muted">+{inv.sessionsCount} buổi</p>
                  </td>
                  <td className="py-3 pr-4 font-mono font-bold text-ink tabular-nums">
                    {formatVND(inv.amountVnd)}
                  </td>
                  <td className="py-3 pr-4">
                    {inv.status === 'paid' ? (
                      <Badge tone="completed">Đã xác nhận · Đã cộng sổ cái</Badge>
                    ) : inv.status === 'pending_verification' ? (
                      <Badge tone="confirmed">Học viên đã báo chuyển khoản</Badge>
                    ) : (
                      <Badge tone="proposed">Chờ chuyển khoản</Badge>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {inv.status !== 'paid' ? (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={confirmingId === inv.id}
                        onClick={() => void handleConfirm(inv)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {confirmingId === inv.id ? 'Đang xác nhận...' : 'Xác nhận đã nhận tiền'}
                        </span>
                      </Button>
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        <span className="text-ink-muted font-mono">{inv.createdAtLabel}</span>
                        {inv.isLiveApi && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={confirmingId === inv.id}
                            onClick={() => void handleRefund(inv)}
                          >
                            Hoàn tiền
                          </Button>
                        )}
                      </div>
                    )}
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
