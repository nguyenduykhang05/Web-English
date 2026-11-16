import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { apiJson, getAccessToken, type ApiAuditLogDto } from '@/lib/apiClient';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

interface SettingsFormState {
  cancelFreeHours: number;
  rescheduleFreeHours: number;
  teacherLateMinutes: number;
  reportDueHours: number;
  skillEmaAlpha: number;
}

export default function AdminSettingsPage() {
  const { pushToast } = useUIStore();
  const { settings, auditLogs, updateSettings } = usePlatformStore();

  const [form, setForm] = useState<SettingsFormState>({
    cancelFreeHours: settings.cancelFreeHours,
    rescheduleFreeHours: settings.rescheduleFreeHours,
    teacherLateMinutes: settings.teacherLateMinutes,
    reportDueHours: settings.reportDueHours,
    skillEmaAlpha: 0.3,
  });
  const [saving, setSaving] = useState(false);
  const [liveAuditLogs, setLiveAuditLogs] = useState<ApiAuditLogDto[] | null>(null);

  const loadSettingsAndAudit = useCallback(async () => {
    if (!getAccessToken()) return;
    const [setRes, auditRes] = await Promise.all([
      apiJson<Record<string, Record<string, unknown>>>('/api/v1/settings'),
      apiJson<{ items: ApiAuditLogDto[] }>('/api/v1/settings/audit-logs?limit=25'),
    ]);

    if (setRes.ok) {
      const s = setRes.data;
      setForm({
        cancelFreeHours: Number(s['policies.cancelFreeHours']?.hours ?? 12),
        rescheduleFreeHours: Number(s['policies.rescheduleFreeHours']?.hours ?? 12),
        teacherLateMinutes: Number(s['policies.noShowMinutes']?.minutes ?? 10),
        reportDueHours: Number(s['policies.reportDueHours']?.hours ?? 24),
        skillEmaAlpha: Number(s['policies.skillEmaAlpha']?.alpha ?? 0.3),
      });
    }

    if (auditRes.ok) {
      setLiveAuditLogs(auditRes.data.items);
    }
  }, []);

  useEffect(() => {
    void loadSettingsAndAudit();
  }, [loadSettingsAndAudit]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();

    if (getAccessToken()) {
      setSaving(true);
      const updates = [
        { key: 'policies.cancelFreeHours', value: { hours: form.cancelFreeHours } },
        { key: 'policies.rescheduleFreeHours', value: { hours: form.rescheduleFreeHours } },
        { key: 'policies.noShowMinutes', value: { minutes: form.teacherLateMinutes } },
        { key: 'policies.reportDueHours', value: { hours: form.reportDueHours } },
        { key: 'policies.skillEmaAlpha', value: { alpha: form.skillEmaAlpha } },
      ];
      const results = await Promise.all(
        updates.map((u) =>
          apiJson('/api/v1/settings', {
            method: 'PUT',
            body: JSON.stringify(u),
          }),
        ),
      );
      setSaving(false);

      const firstErr = results.find((r) => !r.ok);
      if (firstErr && !firstErr.ok) {
        pushToast({
          tone: 'danger',
          title: 'Lưu chính sách thất bại',
          description: firstErr.message,
        });
        return;
      }

      pushToast({
        tone: 'success',
        title: 'Đã lưu chính sách vào Settings & ghi Audit Log',
        description: `cancelFreeHours=${form.cancelFreeHours}h · skillEmaAlpha=${form.skillEmaAlpha}`,
      });
      await loadSettingsAndAudit();
      return;
    }

    updateSettings(
      {
        ...settings,
        cancelFreeHours: form.cancelFreeHours,
        rescheduleFreeHours: form.rescheduleFreeHours,
        teacherLateMinutes: form.teacherLateMinutes,
        reportDueHours: form.reportDueHours,
      },
      'Admin Linh Chi',
    );
    pushToast({
      tone: 'success',
      title: 'Đã lưu chính sách vào Settings & ghi Audit Log',
    });
  };

  const renderedAuditRows = liveAuditLogs
    ? liveAuditLogs.map((l) => ({
        id: l.id,
        actor: l.actorId ? `ID:${l.actorId.slice(-6)}` : 'System',
        role: l.entity,
        action: `${l.action}${l.entityId ? ` (${l.entityId})` : ''}${l.after ? ` → ${JSON.stringify(l.after)}` : ''}`,
        decisionStatus: undefined as string | undefined,
        timestampLabel: l.ip ?? 'audit-db',
      }))
    : auditLogs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Chính sách động (Settings) &amp; Audit Log</h1>
        <p className="text-sm text-ink-secondary mt-0.5">
          Không hardcode hạn mức huỷ, đổi lịch, hệ số EMA hay SLA báo cáo — mọi thay đổi áp dụng trực tiếp và được ghi nhật ký.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-5 items-start">
        <Panel>
          <h2 className="text-base font-bold text-ink mb-4">Cấu hình ngưỡng chính sách</h2>
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            <div>
              <label htmlFor="set-cancel" className="block text-xs font-semibold text-ink mb-1">
                Hạn huỷ buổi miễn phí (giờ trước giờ học)
              </label>
              <input
                id="set-cancel"
                type="number"
                min={1}
                max={72}
                value={form.cancelFreeHours}
                onChange={(e) => setForm({ ...form, cancelFreeHours: Number(e.target.value) })}
                className="w-full h-9 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong font-mono text-sm text-ink"
              />
            </div>

            <div>
              <label htmlFor="set-resched" className="block text-xs font-semibold text-ink mb-1">
                Hạn đổi lịch miễn phí (giờ trước giờ học)
              </label>
              <input
                id="set-resched"
                type="number"
                min={1}
                max={72}
                value={form.rescheduleFreeHours}
                onChange={(e) => setForm({ ...form, rescheduleFreeHours: Number(e.target.value) })}
                className="w-full h-9 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong font-mono text-sm text-ink"
              />
            </div>

            <div>
              <label htmlFor="set-late" className="block text-xs font-semibold text-ink mb-1">
                Ngưỡng vắng mặt No-show (phút)
              </label>
              <input
                id="set-late"
                type="number"
                min={1}
                max={30}
                value={form.teacherLateMinutes}
                onChange={(e) => setForm({ ...form, teacherLateMinutes: Number(e.target.value) })}
                className="w-full h-9 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong font-mono text-sm text-ink"
              />
            </div>

            <div>
              <label htmlFor="set-report" className="block text-xs font-semibold text-ink mb-1">
                SLA nộp báo cáo buổi học (giờ)
              </label>
              <input
                id="set-report"
                type="number"
                min={6}
                max={72}
                value={form.reportDueHours}
                onChange={(e) => setForm({ ...form, reportDueHours: Number(e.target.value) })}
                className="w-full h-9 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong font-mono text-sm text-ink"
              />
            </div>

            <div>
              <label htmlFor="set-ema" className="block text-xs font-semibold text-ink mb-1">
                Hệ số EMA kỹ năng (`policies.skillEmaAlpha`)
              </label>
              <input
                id="set-ema"
                type="number"
                step="0.05"
                min={0.05}
                max={1}
                value={form.skillEmaAlpha}
                onChange={(e) => setForm({ ...form, skillEmaAlpha: Number(e.target.value) })}
                className="w-full h-9 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong font-mono text-sm text-ink"
              />
            </div>

            <Button type="submit" variant="primary" size="md" className="w-full" disabled={saving}>
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>{saving ? 'Đang lưu...' : 'Lưu chính sách hệ thống'}</span>
            </Button>
          </form>
        </Panel>

        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">Nhật ký Audit &amp; Phê duyệt AI</h2>
            <Badge tone="neutral" className="font-mono">
              {renderedAuditRows.length} bản ghi
            </Badge>
          </div>

          <div className="divide-y divide-hairline">
            {renderedAuditRows.map((log) => (
              <div key={log.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink">
                    {log.actor} <span className="font-normal text-ink-muted">({log.role})</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {log.decisionStatus && (
                      <Badge
                        tone={log.decisionStatus === 'accepted' ? 'completed' : 'neutral'}
                      >
                        {log.decisionStatus}
                      </Badge>
                    )}
                    <span className="font-mono text-xs text-ink-muted">
                      {log.timestampLabel}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-ink-secondary break-words">{log.action}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
