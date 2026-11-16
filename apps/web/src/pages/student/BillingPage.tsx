import { useEffect, useState } from 'react';
import { Copy, QrCode, ShieldCheck } from 'lucide-react';
import { COURSE_PACKAGES } from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  mapApiInvoiceToRecord,
  mapApiLedgerEntries,
  type ApiCourseDto,
  type ApiInvoiceDto,
  type ApiLedgerResponse,
  type LiveInvoiceRecord,
} from '@/lib/apiClient';
import { computeLedgerBalance, formatVND } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import type { CoursePackage, LedgerEntry } from '@/types/domain';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';

function VietQrGraphic({ code }: { code: string }) {
  return (
    <div className="p-4 rounded-[var(--radius-md)] bg-white border border-hairline flex flex-col items-center">
      <svg
        width="136"
        height="136"
        viewBox="0 0 136 136"
        fill="none"
        aria-label={`Mã VietQR cho ${code}`}
      >
        <rect x="4" y="4" width="36" height="36" rx="4" stroke="#18181B" strokeWidth="6" />
        <rect x="16" y="16" width="12" height="12" fill="#18181B" />
        <rect x="96" y="4" width="36" height="36" rx="4" stroke="#18181B" strokeWidth="6" />
        <rect x="108" y="16" width="12" height="12" fill="#18181B" />
        <rect x="4" y="96" width="36" height="36" rx="4" stroke="#18181B" strokeWidth="6" />
        <rect x="16" y="108" width="12" height="12" fill="#18181B" />
        <rect x="52" y="10" width="8" height="8" fill="#18181B" />
        <rect x="68" y="10" width="14" height="8" fill="#18181B" />
        <rect x="52" y="26" width="16" height="8" fill="#18181B" />
        <rect x="52" y="48" width="32" height="32" rx="6" fill="#1D6FE8" />
        <rect x="10" y="54" width="12" height="12" fill="#18181B" />
        <rect x="28" y="64" width="10" height="18" fill="#18181B" />
        <rect x="96" y="54" width="14" height="12" fill="#18181B" />
        <rect x="116" y="68" width="12" height="14" fill="#18181B" />
        <rect x="54" y="94" width="16" height="12" fill="#18181B" />
        <rect x="78" y="96" width="14" height="14" fill="#18181B" />
        <rect x="102" y="96" width="22" height="12" fill="#18181B" />
        <rect x="54" y="114" width="36" height="12" fill="#18181B" />
        <rect x="98" y="116" width="26" height="10" fill="#18181B" />
      </svg>
      <p className="mt-2 font-mono text-xs text-zinc-600">{code}</p>
    </div>
  );
}

export default function BillingPage() {
  const { lang, pushToast } = useUIStore();
  const { ledger, invoices, markTransferSent } = usePlatformStore();
  const [qrInvoice, setQrInvoice] = useState<LiveInvoiceRecord | null>(null);
  const [livePackages, setLivePackages] = useState<CoursePackage[]>(COURSE_PACKAGES);
  const [liveInvoices, setLiveInvoices] = useState<LiveInvoiceRecord[] | null>(null);
  const [liveLedger, setLiveLedger] = useState<{ balance: number; entries: LedgerEntry[] } | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'manual_bank_transfer' | 'vnpay_sandbox'>('manual_bank_transfer');
  const [enrollingPkgId, setEnrollingPkgId] = useState<string | null>(null);
  const [hasLiveCatalog, setHasLiveCatalog] = useState(false);

  const loadBillingData = async () => {
    const coursesRes = await apiJson<ApiCourseDto[]>('/api/v1/courses');
    if (coursesRes.ok && coursesRes.data.length > 0) {
      const flattened: CoursePackage[] = coursesRes.data.flatMap((c) =>
        c.packages
          .filter((p) => p.isActive)
          .map((p) => ({
            id: p.id ?? p._id ?? p.code,
            name: p.name,
            subtitle: p.subtitle ?? c.title,
            goalType: c.goalType,
            sessionsCount: p.sessionsCount,
            durationMinutes: p.durationMinutes,
            validityDays: p.validityDays,
            priceVnd: p.priceVnd,
            originalPriceVnd: p.originalPriceVnd,
            features: p.features,
          })),
      );
      if (flattened.length > 0) {
        setLivePackages(flattened);
        setHasLiveCatalog(true);
      }
    }

    if (!getAccessToken()) return;

    const [invRes, ledgerRes] = await Promise.all([
      apiJson<ApiInvoiceDto[]>('/api/v1/invoices'),
      apiJson<ApiLedgerResponse>('/api/v1/ledger/me'),
    ]);

    if (invRes.ok && invRes.data.length > 0) {
      setLiveInvoices(invRes.data.map((inv) => mapApiInvoiceToRecord(inv)));
    }
    if (ledgerRes.ok) {
      setLiveLedger({
        balance: ledgerRes.data.balance,
        entries: mapApiLedgerEntries(ledgerRes.data),
      });
    }
  };

  useEffect(() => {
    void loadBillingData();
  }, []);

  const displayedInvoices: LiveInvoiceRecord[] = liveInvoices ?? invoices;
  const displayedLedger = liveLedger ? liveLedger.entries : ledger;
  const balance = liveLedger ? liveLedger.balance : computeLedgerBalance(ledger);

  const handleEnrollLivePackage = async (pkg: CoursePackage) => {
    if (!hasLiveCatalog || !getAccessToken()) {
      pushToast({
        tone: 'neutral',
        title: lang === 'vi' ? 'Đăng nhập để tạo hoá đơn VietQR' : 'Sign in to create VietQR invoice',
        description:
          lang === 'vi'
            ? 'Hãy đăng nhập tài khoản học viên để tạo đơn đăng ký thật qua API.'
            : 'Sign in with a student account to create an enrollment via API.',
      });
      return;
    }

    setEnrollingPkgId(pkg.id);
    const res = await apiJson<{
      invoice: { invoiceCode: string; totalVnd: number };
      payment: { paymentMeta?: { vietQrImageUrl?: string; checkoutUrl?: string } };
    }>('/api/v1/enrollments', {
      method: 'POST',
      body: JSON.stringify({
        packageId: pkg.id,
        couponCode: couponCode.trim() ? couponCode.trim().toUpperCase() : undefined,
        paymentMethod,
      }),
    });
    setEnrollingPkgId(null);

    if (res.ok) {
      pushToast({
        tone: 'success',
        title: `Đã tạo hoá đơn ${res.data.invoice.invoiceCode}`,
        description: `Số tiền cần thanh toán: ${formatVND(res.data.invoice.totalVnd)}`,
      });
      setCouponCode('');
      await loadBillingData();
    } else {
      pushToast({
        tone: 'danger',
        title: 'Không thể tạo đăng ký',
        description: res.message,
      });
    }
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    pushToast({
      tone: 'success',
      title: lang === 'vi' ? 'Đã sao chép nội dung' : 'Copied to clipboard',
      description: text,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {lang === 'vi' ? 'Sổ cái buổi học & Hoá đơn VietQR' : 'Session Ledger & Billing'}
          </h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            {lang === 'vi'
              ? 'Số buổi học còn lại luôn được tính trực tiếp từ lịch sử cộng/trừ/hoàn của sổ cái.'
              : 'Remaining session count is strictly computed from immutable ledger entries.'}
          </p>
        </div>
        <div className="px-4 py-2 rounded-[var(--radius-md)] bg-surface border border-hairline flex items-center gap-3">
          <span className="text-xs text-ink-secondary">Số dư hiện tại:</span>
          <span className="font-mono text-xl font-bold text-ink tabular-nums">
            {balance} buổi
          </span>
        </div>
      </div>

      {/* Invoices */}
      <Panel>
        <h2 className="text-base font-bold text-ink mb-3">
          {lang === 'vi' ? 'Hoá đơn & Thanh toán chuyển khoản' : 'Invoices & Bank Transfers'}
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline text-ink-muted">
                <th className="py-2.5 pr-4 font-semibold">Mã hoá đơn</th>
                <th className="py-2.5 pr-4 font-semibold">Gói học</th>
                <th className="py-2.5 pr-4 font-semibold">Số tiền</th>
                <th className="py-2.5 pr-4 font-semibold">Trạng thái</th>
                <th className="py-2.5 text-right font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {displayedInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-3 pr-4 font-mono font-semibold text-ink">{inv.code}</td>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-ink">{inv.packageName}</p>
                    <p className="text-ink-muted font-mono">+{inv.sessionsCount} buổi</p>
                  </td>
                  <td className="py-3 pr-4 font-mono font-bold text-ink tabular-nums">
                    {formatVND(inv.amountVnd)}
                  </td>
                  <td className="py-3 pr-4">
                    {inv.status === 'paid' ? (
                      <Badge tone="completed">Đã xác nhận · Đã cộng sổ cái</Badge>
                    ) : inv.status === 'pending_verification' ? (
                      <Badge tone="confirmed">Chờ Admin đối soát</Badge>
                    ) : (
                      <Badge tone="proposed">Chưa chuyển khoản</Badge>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {inv.status !== 'paid' ? (
                      <div className="inline-flex items-center gap-2">
                        {inv.checkoutUrl && (
                          <a href={inv.checkoutUrl} target="_blank" rel="noreferrer">
                            <Button variant="primary" size="sm">VNPay Sandbox</Button>
                          </a>
                        )}
                        <Button variant="accent" size="sm" onClick={() => setQrInvoice(inv)}>
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{lang === 'vi' ? 'Mở mã VietQR' : 'Pay via VietQR'}</span>
                        </Button>
                      </div>
                    ) : (
                      <span className="font-mono text-ink-muted">{inv.createdAtLabel}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Immutable Ledger Audit Table */}
      <Panel>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-bold text-ink">
            {lang === 'vi' ? 'Nhật ký Sổ cái buổi học (sessionLedger)' : 'Session Ledger Journal'}
          </h2>
          <Badge tone="neutral" className="font-mono">
            {displayedLedger.length} giao dịch
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-hairline text-ink-muted">
                <th className="py-2 pr-4 font-semibold">Thời gian</th>
                <th className="py-2 pr-4 font-semibold">Loại</th>
                <th className="py-2 pr-4 font-semibold">Diễn giải</th>
                <th className="py-2 pr-4 font-semibold">Người thực hiện</th>
                <th className="py-2 text-right font-semibold">Biến động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {displayedLedger.map((row) => (
                <tr key={row.id}>
                  <td className="py-2.5 pr-4 font-mono text-ink-muted whitespace-nowrap">
                    {row.occurredAt}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge
                      tone={
                        row.type === 'credit' || row.type === 'refund'
                          ? 'completed'
                          : 'neutral'
                      }
                    >
                      {row.type}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4 text-ink">{row.reason}</td>
                  <td className="py-2.5 pr-4 text-ink-secondary">{row.actor}</td>
                  <td
                    className={`py-2.5 text-right font-mono font-bold tabular-nums ${
                      row.delta > 0
                        ? 'text-[var(--status-completed-text)]'
                        : 'text-ink'
                    }`}
                  >
                    {row.delta > 0 ? `+${row.delta}` : row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Packages Preview & Quick Enrollment */}
      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">
              {lang === 'vi' ? 'Gói buổi học đang mở bán' : 'Available Course Packages'}
            </h2>
            <p className="text-xs text-ink-secondary">
              {lang === 'vi'
                ? 'Chọn gói phù hợp và nhập mã giảm giá (nếu có) để tạo hoá đơn VietQR.'
                : 'Select a package and apply a coupon code to create a VietQR invoice.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as 'manual_bank_transfer' | 'vnpay_sandbox')
              }
              aria-label="Phương thức thanh toán"
              className="h-9 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-xs text-ink"
            >
              <option value="manual_bank_transfer">Chuyển khoản VietQR</option>
              <option value="vnpay_sandbox">VNPay Sandbox</option>
            </select>
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="Mã giảm giá (vd: WEBENGLISH10)"
              aria-label="Mã giảm giá"
              className="h-9 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-xs font-mono text-ink"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {livePackages.map((pkg) => (
            <div
              key={pkg.id}
              className="p-4 rounded-[var(--radius-md)] border border-hairline bg-surface flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <p className="text-sm font-bold text-ink">{pkg.name}</p>
                <p className="font-mono text-lg font-bold text-accent tabular-nums">
                  {formatVND(pkg.priceVnd)}
                </p>
                <p className="text-xs text-ink-muted">{pkg.subtitle}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={enrollingPkgId === pkg.id}
                onClick={() => void handleEnrollLivePackage(pkg)}
              >
                {enrollingPkgId === pkg.id ? 'Đang tạo đơn...' : 'Đăng ký & Tạo VietQR'}
              </Button>
            </div>
          ))}
        </div>
      </Panel>

      {/* VietQR Modal */}
      <Modal
        open={Boolean(qrInvoice)}
        onClose={() => setQrInvoice(null)}
        title={`Chuyển khoản VietQR · ${qrInvoice?.code ?? ''}`}
        subtitle={qrInvoice?.packageName}
      >
        {qrInvoice && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-5 items-center">
              <VietQrGraphic code={qrInvoice.code} />

              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-ink-muted">Ngân hàng</span>
                  <p className="font-semibold text-ink">{qrInvoice.bankInfo.bankName}</p>
                </div>
                <div>
                  <span className="text-ink-muted">Số tài khoản</span>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-sm text-ink">
                      {qrInvoice.bankInfo.accountNumber}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(qrInvoice.bankInfo.accountNumber)}
                      aria-label="Sao chép số tài khoản"
                      className="p-1 text-accent hover:bg-subtle rounded cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-ink-muted">Số tiền chính xác</span>
                  <p className="font-mono font-bold text-base text-accent tabular-nums">
                    {formatVND(qrInvoice.amountVnd)}
                  </p>
                </div>
                <div>
                  <span className="text-ink-muted">Nội dung chuyển khoản</span>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-semibold text-ink">
                      {qrInvoice.bankInfo.transferNote}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(qrInvoice.bankInfo.transferNote)}
                      aria-label="Sao chép nội dung chuyển khoản"
                      className="p-1 text-accent hover:bg-subtle rounded cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-[var(--radius-md)] bg-subtle text-xs text-ink-secondary flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Sau khi nhấn &ldquo;Tôi đã chuyển khoản&rdquo;, Admin có thể xác nhận ngay tại màn hình Tuyển sinh &amp; Thanh toán để cộng +{qrInvoice.sessionsCount} buổi vào sổ cái.
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setQrInvoice(null)}>
                Đóng
              </Button>
              {!qrInvoice.isLiveApi && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    markTransferSent(qrInvoice.id);
                    pushToast({
                      tone: 'success',
                      title: 'Đã gửi xác nhận chuyển khoản',
                      description: 'Vào vai trò Admin → Tuyển sinh & Thanh toán để duyệt ngay.',
                    });
                    setQrInvoice(null);
                  }}
                >
                  Tôi đã chuyển khoản
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
