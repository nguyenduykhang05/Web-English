import { useEffect, useState } from 'react';
import { Globe, Plus } from 'lucide-react';
import { apiJson, getAccessToken, type ApiTeacherProfileDetailDto } from '@/lib/apiClient';
import { useUIStore } from '@/stores/useUIStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

interface WeeklyRule {
  id: string;
  dayOfWeek: number;
  day: string;
  startTime: string;
  endTime: string;
  localRange: string;
  vnRange: string;
  active: boolean;
}

const DAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export default function TeacherAvailabilityPage() {
  const { pushToast } = useUIStore();
  const [teacherTimezone, setTeacherTimezone] = useState('America/New_York');
  const [hasLiveTeacher, setHasLiveTeacher] = useState(false);
  const [rules, setRules] = useState<WeeklyRule[]>([
    { id: 'r1', dayOfWeek: 1, day: 'Thứ 2', startTime: '07:00', endTime: '10:00', localRange: '07:00 – 10:00 EST', vnRange: '19:00 – 22:00 GMT+7', active: true },
    { id: 'r2', dayOfWeek: 3, day: 'Thứ 4', startTime: '07:00', endTime: '10:00', localRange: '07:00 – 10:00 EST', vnRange: '19:00 – 22:00 GMT+7', active: true },
    { id: 'r3', dayOfWeek: 5, day: 'Thứ 6', startTime: '07:30', endTime: '10:30', localRange: '07:30 – 10:30 EST', vnRange: '19:30 – 22:30 GMT+7', active: true },
    { id: 'r4', dayOfWeek: 6, day: 'Thứ 7', startTime: '08:00', endTime: '11:00', localRange: '08:00 – 11:00 EST', vnRange: '20:00 – 23:00 GMT+7', active: false },
  ]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!getAccessToken()) return;
      const res = await apiJson<ApiTeacherProfileDetailDto>('/api/v1/teachers/me');
      if (res.ok) {
        setHasLiveTeacher(true);
        const tz = res.data.timezone || 'Asia/Ho_Chi_Minh';
        setTeacherTimezone(tz);
        if (res.data.weeklyAvailability.length > 0) {
          setRules(
            res.data.weeklyAvailability.map((slot, idx) => ({
              id: `api-${idx}`,
              dayOfWeek: slot.dayOfWeek,
              day: DAY_LABELS[slot.dayOfWeek] ?? `Thứ ${slot.dayOfWeek + 1}`,
              startTime: slot.startTime,
              endTime: slot.endTime,
              localRange: `${slot.startTime} – ${slot.endTime} (${tz})`,
              vnRange: 'Tự quy đổi sang múi giờ học viên',
              active: true,
            })),
          );
        }
      }
    };
    void loadProfile();
  }, []);

  const persistRules = async (nextRules: WeeklyRule[], successTitle: string) => {
    setRules(nextRules);
    if (hasLiveTeacher && getAccessToken()) {
      const weeklyAvailability = nextRules
        .filter((r) => r.active)
        .map((r) => ({
          dayOfWeek: r.dayOfWeek,
          startTime: r.startTime,
          endTime: r.endTime,
        }));
      const res = await apiJson<ApiTeacherProfileDetailDto>('/api/v1/teachers/me', {
        method: 'PUT',
        body: JSON.stringify({ weeklyAvailability }),
      });
      if (!res.ok) {
        pushToast({ tone: 'danger', title: 'Lưu lịch rảnh thất bại', description: res.message });
        return;
      }
    }
    pushToast({ tone: 'success', title: successTitle });
  };

  const toggleRule = (id: string) => {
    const next = rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r));
    void persistRules(next, 'Đã cập nhật quy tắc lịch rảnh hằng tuần');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Lịch rảnh hằng tuần &amp; Quy đổi múi giờ</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Quy tắc lưu theo múi giờ của giáo viên (`{teacherTimezone}`), tự động quy đổi sang giờ học viên (`Asia/Ho_Chi_Minh`).
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            const next: WeeklyRule[] = [
              ...rules,
              {
                id: `r-${Date.now()}`,
                dayOfWeek: 2,
                day: 'Thứ 3',
                startTime: '19:00',
                endTime: '21:00',
                localRange: `19:00 – 21:00 (${teacherTimezone})`,
                vnRange: 'Đồng bộ theo slot 30 phút',
                active: true,
              },
            ];
            void persistRules(next, 'Đã thêm khung giờ mới');
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Thêm khung giờ tuần</span>
        </Button>
      </div>

      <Panel>
        <div className="flex items-center gap-2 text-xs text-ink-secondary pb-3 border-b border-hairline">
          <Globe className="h-4 w-4 text-accent" aria-hidden="true" />
          <span>Khi bạn bật/tắt khung giờ, slot hiển thị cho học viên sẽ tự động mở hoặc khoá.</span>
        </div>

        <div className="divide-y divide-hairline">
          {rules.map((rule) => (
            <div key={rule.id} className="py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="w-16 text-sm font-bold text-ink">{rule.day}</span>
                <div>
                  <p className="font-mono text-xs font-semibold text-ink">{rule.localRange}</p>
                  <p className="font-mono text-xs text-accent mt-0.5">
                    → Học viên thấy: {rule.vnRange}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge tone={rule.active ? 'completed' : 'neutral'}>
                  {rule.active ? 'Đang mở đặt lịch' : 'Tạm khoá'}
                </Badge>
                <Button variant="secondary" size="sm" onClick={() => toggleRule(rule.id)}>
                  {rule.active ? 'Tạm tắt' : 'Bật lại'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
