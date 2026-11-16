import { useEffect, useState, type FormEvent } from 'react';
import { MailPlus } from 'lucide-react';
import { COURSE_PACKAGES, TEACHERS } from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  type ApiCourseDto,
  type ApiTeacherDto,
} from '@/lib/apiClient';
import { formatVND } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';

interface AdminPkgDisplay {
  id: string;
  name: string;
  subtitle: string;
  sessionsCount: number;
  validityDays: number;
  priceVnd: number;
}

interface AdminTeacherDisplay {
  id: string;
  name: string;
  title: string;
  timezone: string;
}

export default function AdminCoursesPage() {
  const { pushToast } = useUIStore();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [packagesList, setPackagesList] = useState<AdminPkgDisplay[]>(COURSE_PACKAGES);
  const [teachersList, setTeachersList] = useState<AdminTeacherDisplay[]>(
    TEACHERS.map((t) => ({
      id: t.id,
      name: t.name,
      title: t.title,
      timezone: t.sourceTimezone,
    })),
  );

  useEffect(() => {
    const loadCatalog = async () => {
      const [coursesRes, teachersRes] = await Promise.all([
        apiJson<ApiCourseDto[]>('/api/v1/courses?includeUnpublished=true'),
        apiJson<{ items: ApiTeacherDto[] }>('/api/v1/teachers'),
      ]);

      if (coursesRes.ok && coursesRes.data.length > 0) {
        const mappedPkgs = coursesRes.data.flatMap((c) =>
          c.packages.map((p) => ({
            id: p.id ?? p._id ?? p.code,
            name: p.name,
            subtitle: p.subtitle ?? c.title,
            sessionsCount: p.sessionsCount,
            validityDays: p.validityDays,
            priceVnd: p.priceVnd,
          })),
        );
        if (mappedPkgs.length > 0) {
          setPackagesList(mappedPkgs);
        }
      }

      if (teachersRes.ok && teachersRes.data.items.length > 0) {
        setTeachersList(
          teachersRes.data.items.map((t) => ({
            id: t.id,
            name: t.fullName,
            title: t.specialties.map((s) => s.toUpperCase()).join(' · ') || t.bio,
            timezone: t.timezone,
          })),
        );
      }
    };

    void loadCatalog();
  }, []);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.includes('@') || !inviteName.trim()) return;

    if (getAccessToken()) {
      setSubmittingInvite(true);
      const res = await apiJson<{ user?: { email: string } }>('/api/v1/users/invite-teacher', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          fullName: inviteName.trim(),
        }),
      });
      setSubmittingInvite(false);

      if (!res.ok) {
        pushToast({
          tone: 'danger',
          title: 'Không thể gửi lời mời giáo viên',
          description: res.message,
        });
        return;
      }
    }

    pushToast({
      tone: 'success',
      title: `Đã gửi lời mời giáo viên tới ${inviteEmail}`,
      description: 'Liên kết kích hoạt mật khẩu có hiệu lực trong 72 giờ.',
    });
    setInviteOpen(false);
    setInviteEmail('');
    setInviteName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Khoá học, Gói buổi &amp; Nhân sự</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Quản lý gói 1-1 và mời tài khoản giáo viên qua liên kết đặt mật khẩu (72 giờ).
          </p>
        </div>

        <Button variant="primary" size="md" onClick={() => setInviteOpen(true)}>
          <MailPlus className="h-4 w-4" aria-hidden="true" />
          <span>Mời giáo viên mới</span>
        </Button>
      </div>

      <Panel className="space-y-3">
        <h2 className="text-base font-bold text-ink">Danh mục Gói học đang mở bán</h2>
        <div className="divide-y divide-hairline">
          {packagesList.map((pkg) => (
            <div key={pkg.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-ink">{pkg.name}</p>
                <p className="text-xs text-ink-secondary">{pkg.subtitle}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone="neutral" className="font-mono">
                  {pkg.sessionsCount} buổi · {pkg.validityDays} ngày
                </Badge>
                <span className="font-mono text-sm font-bold text-ink tabular-nums">
                  {formatVND(pkg.priceVnd)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="space-y-3">
        <h2 className="text-base font-bold text-ink">Đội ngũ Giáo viên đang hoạt động</h2>
        <div className="divide-y divide-hairline">
          {teachersList.map((t) => (
            <div key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-ink">{t.name}</p>
                <p className="text-xs text-ink-secondary">{t.title}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-ink-muted">{t.timezone}</span>
                <Badge tone="completed">Đang nhận lớp</Badge>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Mời tài khoản Giáo viên 1-1"
        subtitle="Hệ thống tạo lời mời qua email với token đặt mật khẩu hết hạn sau 72 giờ."
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label htmlFor="inv-name" className="block text-xs font-semibold text-ink mb-1.5">
              Họ tên giáo viên
            </label>
            <input
              id="inv-name"
              type="text"
              required
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Ví dụ: Cô Nguyễn Thu Thảo"
              className="w-full h-10 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink"
            />
          </div>
          <div>
            <label htmlFor="inv-email" className="block text-xs font-semibold text-ink mb-1.5">
              Email nhận lời mời
            </label>
            <input
              id="inv-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teacher@example.com"
              className="w-full h-10 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline-strong text-sm text-ink"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setInviteOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={submittingInvite}>
              {submittingInvite ? 'Đang gửi...' : 'Gửi lời mời'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
