import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Clock, Download, ExternalLink, Globe, Repeat, Search, Star } from 'lucide-react';
import { TEACHERS } from '@/data/mockPlatformData';
import {
  apiJson,
  downloadSessionIcsFile,
  getAccessToken,
  type ApiEnrollmentDto,
  type ApiLedgerResponse,
  type ApiMatchedTeacherDto,
  type ApiSessionDto,
  type ApiSlotDto,
  type ApiTeacherDto,
} from '@/lib/apiClient';
import { cn, computeLedgerBalance, formatVND } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import type { TeacherProfile } from '@/types/domain';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/States';

type TutorFilter = 'all' | 'ielts' | 'communication' | 'pronunciation' | 'native' | 'bilingual';

const FILTER_OPTIONS: { id: TutorFilter; labelVi: string; labelEn: string }[] = [
  { id: 'all', labelVi: 'Tất cả', labelEn: 'All' },
  { id: 'ielts', labelVi: 'IELTS', labelEn: 'IELTS' },
  { id: 'communication', labelVi: 'Giao tiếp & Công sở', labelEn: 'Communication' },
  { id: 'pronunciation', labelVi: 'Phát âm IPA', labelEn: 'Pronunciation' },
  { id: 'native', labelVi: 'Giáo viên bản ngữ', labelEn: 'Native' },
  { id: 'bilingual', labelVi: 'Song ngữ Việt-Anh', labelEn: 'Bilingual VN-EN' },
];

interface BookingTeacher extends TeacherProfile {
  isLiveApi?: boolean;
}

interface BookingSlotView {
  id: string;
  dateIso: string;
  dateLabel: string;
  timeSlot: string;
  endTimeSlot: string;
  teacherLocalLabel?: string;
  teacherTimezone?: string;
  studentTimezone?: string;
  startAtUtc?: string;
}

interface ScheduledSessionView {
  id: string;
  title: string;
  dateLabel: string;
  timeRange: string;
  teacherName: string;
  isLiveApi?: boolean;
}

function mapApiTeacher(t: ApiTeacherDto, matched?: ApiMatchedTeacherDto): BookingTeacher {
  const parts = t.fullName.trim().split(/\s+/);
  const initials = parts.slice(-2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'TC';
  return {
    id: t.userId,
    name: matched?.reasons?.length ? t.fullName : t.fullName,
    title:
      matched?.reasons?.length
        ? matched.reasons.slice(0, 2).join(' · ')
        : t.specialties.map((s) => s.toUpperCase()).join(' · ') || 'English 1-1 Coach',
    avatarInitials: initials,
    sourceTimezone: t.timezone,
    tier: t.timezone === 'America/New_York' ? 'native' : 'bilingual',
    rating: t.ratingAvg,
    reviewsCount: t.reviewsCount,
    lessonsCompleted: 120,
    cefrFocus: t.cefrLevels,
    specialties: t.specialties,
    languages: ['English', 'Vietnamese'],
    matchScore: matched?.score ?? 92,
    bio: t.bio,
    ratePerSessionVnd: 350_000,
    weeklyHoursPreview: [],
    availableSlots: [],
    isLiveApi: true,
  };
}

export default function BookingPage() {
  const { lang, pushToast } = useUIStore();
  const { ledger, sessions, settings, bookSlot, cancelSession } = usePlatformStore();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TutorFilter>('all');
  const [liveTeachers, setLiveTeachers] = useState<BookingTeacher[] | null>(null);
  const [liveSlots, setLiveSlots] = useState<BookingSlotView[]>([]);
  const [liveEnrollments, setLiveEnrollments] = useState<ApiEnrollmentDto[]>([]);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [liveSessions, setLiveSessions] = useState<ScheduledSessionView[] | null>(null);
  const [bookAsTrial, setBookAsTrial] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const [selectedTeacherId, setSelectedTeacherId] = useState(TEACHERS[0].id);
  const [selectedSlotId, setSelectedSlotId] = useState(TEACHERS[0].availableSlots[0].id);
  const [recurringWeekly, setRecurringWeekly] = useState(false);

  const loadStudentBookingContext = useCallback(async () => {
    if (!getAccessToken()) return;
    const [teachersRes, matchedRes, enrRes, ledgerRes, sesRes] = await Promise.all([
      apiJson<{ items: ApiTeacherDto[] }>('/api/v1/teachers'),
      apiJson<ApiMatchedTeacherDto[]>('/api/v1/enrollments/match-teachers'),
      apiJson<ApiEnrollmentDto[]>('/api/v1/enrollments'),
      apiJson<ApiLedgerResponse>('/api/v1/ledger/me'),
      apiJson<{ items: ApiSessionDto[] }>('/api/v1/sessions?status=scheduled'),
    ]);

    const teacherNameById = new Map<string, string>();
    const matchMap = new Map(
      (matchedRes.ok ? matchedRes.data : []).map((m) => [m.teacherUserId, m]),
    );

    if (teachersRes.ok && teachersRes.data.items.length > 0) {
      for (const t of teachersRes.data.items) {
        teacherNameById.set(t.userId, t.fullName);
      }
      const mapped = teachersRes.data.items
        .map((t) => mapApiTeacher(t, matchMap.get(t.userId)))
        .sort((a, b) => b.matchScore - a.matchScore);
      setLiveTeachers(mapped);
      setSelectedTeacherId((prev) =>
        mapped.some((t) => t.id === prev) ? prev : mapped[0].id,
      );
    }
    if (enrRes.ok) {
      setLiveEnrollments(enrRes.data);
    }
    if (ledgerRes.ok) {
      setLiveBalance(ledgerRes.data.balance);
    }
    if (sesRes.ok) {
      setLiveSessions(
        sesRes.data.items.map((s) => ({
          id: s.id,
          title: s.title,
          dateLabel: s.startAt.slice(0, 10),
          timeRange: `${s.startAt.slice(11, 16)} (${s.durationMinutes}p)`,
          teacherName: teacherNameById.get(s.teacherId) ?? s.teacherId,
          isLiveApi: true,
        })),
      );
    }
  }, []);

  useEffect(() => {
    void loadStudentBookingContext();
  }, [loadStudentBookingContext]);

  const balance = liveBalance ?? computeLedgerBalance(ledger);
  const sourceTeachers: BookingTeacher[] = liveTeachers ?? TEACHERS;

  const filteredTeachers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sourceTeachers.filter((t) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'native' && t.tier === 'native') ||
        (filter === 'bilingual' && t.tier === 'bilingual') ||
        (filter === 'ielts' &&
          (t.specialties.some((s) => /ielts/i.test(s)) || /ielts/i.test(t.title))) ||
        (filter === 'communication' &&
          t.specialties.some((s) => /giao tiếp|speaking|công sở|nói|phỏng vấn|communication|business/i.test(s))) ||
        (filter === 'pronunciation' &&
          t.specialties.some((s) => /phát âm|ngữ âm|ipa/i.test(s)));

      if (!matchesFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.specialties.some((sp) => sp.toLowerCase().includes(q)) ||
        t.title.toLowerCase().includes(q)
      );
    });
  }, [query, filter, sourceTeachers]);

  const activeTeacher =
    filteredTeachers.find((t) => t.id === selectedTeacherId) ?? filteredTeachers[0];

  const loadTeacherLiveSlots = useCallback(async (teacherId: string) => {
    const res = await apiJson<{ slots: ApiSlotDto[] }>(
      `/api/v1/sessions/available-slots?teacherId=${encodeURIComponent(teacherId)}&days=7&durationMinutes=45`,
    );
    if (res.ok) {
      const mapped: BookingSlotView[] = res.data.slots.slice(0, 12).map((s) => ({
        id: s.startAt,
        dateIso: s.studentLocalLabel.slice(0, 10),
        dateLabel: s.studentLocalLabel.slice(0, 10),
        timeSlot: s.studentLocalLabel.slice(11, 16),
        endTimeSlot: s.endAt.slice(11, 16),
        teacherLocalLabel: s.teacherLocalLabel,
        teacherTimezone: s.teacherTimezone,
        studentTimezone: s.studentTimezone,
        startAtUtc: s.startAt,
      }));
      setLiveSlots(mapped);
      if (mapped.length > 0) {
        setSelectedSlotId(mapped[0].id);
      }
    } else {
      setLiveSlots([]);
    }
  }, []);

  useEffect(() => {
    if (activeTeacher?.isLiveApi) {
      void loadTeacherLiveSlots(activeTeacher.id);
    }
  }, [activeTeacher?.id, activeTeacher?.isLiveApi, loadTeacherLiveSlots]);

  const displayedSlots: BookingSlotView[] = activeTeacher?.isLiveApi
    ? liveSlots
    : (activeTeacher?.availableSlots ?? []);

  const activeSlot =
    displayedSlots.find((s) => s.id === selectedSlotId) ?? displayedSlots[0];

  const handleConfirmBooking = async () => {
    if (!activeTeacher || !activeSlot) return;

    if (activeTeacher.isLiveApi && activeSlot.startAtUtc && getAccessToken()) {
      const activeEnrollment = liveEnrollments.find(
        (e) => e.status === 'active' && e.remainingSessions >= (recurringWeekly ? 4 : 1),
      );
      if (!bookAsTrial && !activeEnrollment) {
        pushToast({
          tone: 'danger',
          title: 'Chưa có gói học active đủ số buổi',
          description: 'Hãy bật "Đặt buổi học thử miễn phí" hoặc mua gói ở mục Thanh toán.',
        });
        return;
      }

      setSubmittingBooking(true);
      const res = await apiJson<{ sessions: ApiSessionDto[] }>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({
          teacherId: activeTeacher.id,
          enrollmentId: bookAsTrial ? undefined : activeEnrollment?.id,
          startAt: activeSlot.startAtUtc,
          durationMinutes: 45,
          isTrial: bookAsTrial,
          recurringCount: !bookAsTrial && recurringWeekly ? 4 : 1,
        }),
      });
      setSubmittingBooking(false);

      if (!res.ok) {
        pushToast({
          tone: 'danger',
          title: 'Không thể giữ lịch học',
          description: res.message,
        });
        return;
      }

      pushToast({
        tone: 'success',
        title: `Đã đặt thành công ${res.data.sessions.length} buổi học 1-1`,
        description: `${activeSlot.dateLabel} · ${activeSlot.timeSlot} với ${activeTeacher.name}`,
      });
      await Promise.all([
        loadStudentBookingContext(),
        loadTeacherLiveSlots(activeTeacher.id),
      ]);
      return;
    }

    const ok = bookSlot(activeTeacher, activeSlot.id, recurringWeekly);
    if (!ok) {
      pushToast({
        tone: 'danger',
        title: lang === 'vi' ? 'Không đủ số buổi trong sổ cái' : 'Insufficient session balance',
      });
      return;
    }
    pushToast({
      tone: 'success',
      title: lang === 'vi' ? 'Đã đặt lịch 1-1 thành công (-1 buổi)' : 'Booked 1-on-1 slot (-1 session)',
      description: `${activeSlot.dateLabel} · ${activeSlot.timeSlot} GMT+7 · ${activeTeacher.name}`,
    });
  };

  const scheduledSessions: ScheduledSessionView[] =
    liveSessions ?? sessions.filter((s) => s.status === 'scheduled');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {lang === 'vi' ? 'Đặt lịch học 1-1' : 'Book 1-on-1 Session'}
          </h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            {lang === 'vi'
              ? 'Gợi ý giáo viên khớp mục tiêu IELTS & múi giờ hiển thị tại Asia/Ho_Chi_Minh (GMT+7).'
              : 'Matched teachers converted from local teaching rules to GMT+7.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral" className="font-mono">
            Sổ cái còn: {balance} buổi
          </Badge>
          <Badge tone="confirmed" className="font-mono">
            Huỷ miễn phí &gt;{settings.cancelFreeHours}h
          </Badge>
        </div>
      </div>

      {/* Cal.com-style Two-Column Booking Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5 items-start">
        {/* Left: Teacher Matcher + Search */}
        <Panel className="space-y-4">
          <div className="relative">
            <Search
              className="h-4 w-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                lang === 'vi'
                  ? 'Tìm theo tên giáo viên hoặc IELTS, Phát âm...'
                  : 'Filter by teacher or specialty...'
              }
              aria-label="Tìm giáo viên"
              className="w-full h-9 pl-9 pr-3 rounded-[var(--radius-md)] bg-subtle border border-hairline text-sm text-ink placeholder:text-ink-muted"
            />
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo chuyên môn">
            {FILTER_OPTIONS.map((opt) => {
              const active = filter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(opt.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-[var(--radius-full)] text-xs font-medium border ui-transition cursor-pointer',
                    active
                      ? 'bg-accent-soft border-accent-border text-accent font-semibold'
                      : 'bg-subtle border-hairline text-ink-secondary hover:bg-hover hover:text-ink',
                  )}
                >
                  {lang === 'vi' ? opt.labelVi : opt.labelEn}
                </button>
              );
            })}
          </div>

          {filteredTeachers.length === 0 ? (
            <EmptyState
              title={lang === 'vi' ? 'Không tìm thấy giáo viên phù hợp' : 'No matching teachers'}
              hint={
                lang === 'vi'
                  ? 'Xoá từ khoá hoặc đổi bộ lọc để xem toàn bộ giáo viên đang mở lịch.'
                  : 'Clear filters to see all available teachers.'
              }
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  {lang === 'vi' ? 'Xem tất cả giáo viên' : 'Show all teachers'}
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-hairline">
              {filteredTeachers.map((teacher) => {
                const selected = activeTeacher?.id === teacher.id;
                return (
                  <button
                    key={teacher.id}
                    type="button"
                    onClick={() => {
                      setSelectedTeacherId(teacher.id);
                      if (teacher.availableSlots[0]) {
                        setSelectedSlotId(teacher.availableSlots[0].id);
                      }
                    }}
                    className={`w-full text-left py-3.5 px-3 rounded-[var(--radius-md)] ui-transition cursor-pointer ${
                      selected ? 'bg-accent-soft/70' : 'hover:bg-subtle'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-surface border border-hairline flex items-center justify-center font-mono text-xs font-bold text-ink shrink-0">
                          {teacher.avatarInitials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-ink truncate">{teacher.name}</p>
                            <Badge tone="neutral">
                              {teacher.tier === 'native' ? 'Bản ngữ' : 'Song ngữ'}
                            </Badge>
                          </div>
                          <p className="text-xs text-ink-secondary truncate">{teacher.title}</p>
                        </div>
                      </div>
                      <Badge tone="completed" className="font-mono shrink-0">
                        {teacher.matchScore}% hợp
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Star className="h-3.5 w-3.5 text-[var(--status-proposed-text)]" aria-hidden="true" />
                        <strong className="text-ink">{teacher.rating.toFixed(1)}</strong>
                        <span>({teacher.reviewsCount}) · {teacher.lessonsCompleted} buổi</span>
                      </span>
                      <span className="font-mono font-semibold text-ink">
                        {formatVND(teacher.ratePerSessionVnd)}/50p
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-mono text-ink-muted flex items-center gap-1.5">
                      <Globe className="h-3 w-3" aria-hidden="true" />
                      Gốc: {teacher.sourceTimezone} ·{' '}
                      {teacher.isLiveApi ? 'Đồng bộ thời gian thực' : `${teacher.availableSlots.length} slot tuần này`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-hairline flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            <span>Cấu trúc lọc &amp; hiển thị tham khảo từ:</span>
            <span className="inline-flex items-center gap-2">
              <a
                href="https://preply.com/en/online/english-tutors"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                Preply <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              ·
              <a
                href="https://www.italki.com/en/teachers/english"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                italki <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </span>
          </div>
        </Panel>

        {/* Right: Slot Picker & Confirmation */}
        {activeTeacher && (
          <Panel className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-hairline">
              <div>
                <h2 className="text-base font-bold text-ink">{activeTeacher.name}</h2>
                <p className="text-xs text-ink-secondary mt-0.5">{activeTeacher.bio}</p>
              </div>
              <Badge tone="neutral" className="font-mono">
                {activeTeacher.isLiveApi ? '45 phút / buổi' : '50 phút / buổi'}
              </Badge>
            </div>

            <div>
              <p className="text-xs font-semibold text-ink-secondary mb-2.5">
                {lang === 'vi'
                  ? 'Chọn khung giờ trống (đã quy đổi sang GMT+7)'
                  : 'Select available GMT+7 slot'}
              </p>
              {displayedSlots.length === 0 ? (
                <EmptyState
                  title="Chưa có slot trống phù hợp"
                  hint="Giáo viên chưa mở ca rảnh trong 7 ngày tới (hoặc cách hiện tại < 6 giờ)."
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {displayedSlots.map((slot) => {
                    const isChosen = activeSlot?.id === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        aria-pressed={isChosen}
                        onClick={() => setSelectedSlotId(slot.id)}
                        className={`p-3 rounded-[var(--radius-md)] border text-left ui-transition cursor-pointer ${
                          isChosen
                            ? 'bg-[var(--ink-btn)] text-[var(--ink-btn-text)] border-transparent'
                            : 'bg-surface border-hairline hover:bg-subtle text-ink'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold tabular-nums">
                            {slot.timeSlot} – {slot.endTimeSlot}
                          </span>
                          <Clock className="h-3.5 w-3.5 opacity-75" aria-hidden="true" />
                        </div>
                        <p className={`text-xs mt-1 ${isChosen ? 'opacity-85' : 'text-ink-muted'}`}>
                          {slot.dateLabel} · {slot.studentTimezone ?? 'Asia/Ho_Chi_Minh'}
                        </p>
                        {slot.teacherLocalLabel && slot.teacherTimezone && (
                          <p className={`text-[11px] font-mono mt-0.5 ${isChosen ? 'opacity-80' : 'text-ink-muted'}`}>
                            GV: {slot.teacherLocalLabel} ({slot.teacherTimezone})
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {activeTeacher.isLiveApi && (
              <label className="flex items-center justify-between gap-3 p-3 rounded-[var(--radius-md)] bg-subtle cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-ink">Đặt buổi học thử miễn phí (Trial 1 lần)</p>
                  <p className="text-xs text-ink-muted">Không trừ vào sổ cái gói học nếu chưa mua gói.</p>
                </div>
                <input
                  type="checkbox"
                  checked={bookAsTrial}
                  onChange={(e) => setBookAsTrial(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </label>
            )}

            <label className="flex items-center justify-between gap-3 p-3 rounded-[var(--radius-md)] bg-subtle cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Repeat className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-ink">
                    {lang === 'vi'
                      ? 'Đặt cố định khung giờ này hằng tuần (Recurring)'
                      : 'Lock recurring weekly slot'}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {lang === 'vi'
                      ? 'Giữ chỗ trước 4 tuần liên tiếp, trừ buổi theo từng buổi.'
                      : 'Reserves next 4 weeks while deducting 1 session per booking.'}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={recurringWeekly}
                onChange={(e) => setRecurringWeekly(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>

            {activeSlot && (
              <div className="pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-ink-secondary">
                  <p>
                    Đang chọn:{' '}
                    <span className="font-mono font-semibold text-ink">
                      {activeSlot.dateLabel} · {activeSlot.timeSlot}
                    </span>
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Khoá trùng lịch transactional (chống double-booking 100%)
                  </p>
                </div>
                <Button
                  variant="accent"
                  size="lg"
                  disabled={submittingBooking}
                  onClick={() => void handleConfirmBooking()}
                >
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {submittingBooking
                      ? 'Đang giữ lịch...'
                      : lang === 'vi'
                        ? 'Xác nhận giữ lịch (-1 buổi)'
                        : 'Confirm booking (-1 session)'}
                  </span>
                </Button>
              </div>
            )}
          </Panel>
        )}
      </div>

      {/* Scheduled Sessions List */}
      <Panel>
        <h2 className="text-base font-bold text-ink mb-3">
          {lang === 'vi'
            ? `Lịch đã đặt sắp tới (${scheduledSessions.length})`
            : `Upcoming Scheduled Sessions (${scheduledSessions.length})`}
        </h2>

        {scheduledSessions.length === 0 ? (
          <EmptyState
            title={lang === 'vi' ? 'Chưa có lịch học nào' : 'No booked sessions'}
            hint={lang === 'vi' ? 'Chọn một khung giờ ở trên để giữ lịch học 1-1.' : 'Select a slot above to schedule.'}
          />
        ) : (
          <div className="divide-y divide-hairline">
            {scheduledSessions.map((ses) => (
              <div
                key={ses.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{ses.title}</p>
                  <p className="text-xs text-ink-secondary font-mono mt-0.5">
                    {ses.dateLabel} · {ses.timeRange} GMT+7 · {ses.teacherName}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ses.isLiveApi && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void downloadSessionIcsFile(ses.id)}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>.ICS</span>
                      </Button>
                      <Link to={`/classroom/${ses.id}`}>
                        <Button variant="accent" size="sm">Vào phòng học</Button>
                      </Link>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      if (ses.isLiveApi && getAccessToken()) {
                        const res = await apiJson<{ ledgerEffect: string; remainingSessions: number }>(
                          `/api/v1/sessions/${ses.id}/cancel`,
                          { method: 'POST', body: JSON.stringify({ reason: 'Học viên huỷ trên web' }) },
                        );
                        if (!res.ok) {
                          pushToast({ tone: 'danger', title: 'Huỷ lịch thất bại', description: res.message });
                          return;
                        }
                        pushToast({
                          tone: 'success',
                          title: `Đã huỷ buổi (${res.data.ledgerEffect})`,
                          description: `Số dư hiện tại: ${res.data.remainingSessions} buổi`,
                        });
                        await loadStudentBookingContext();
                        if (activeTeacher?.isLiveApi) {
                          await loadTeacherLiveSlots(activeTeacher.id);
                        }
                        return;
                      }
                      cancelSession(ses.id, true);
                      pushToast({
                        tone: 'success',
                        title: 'Đã huỷ & hoàn +1 buổi vào sổ cái',
                      });
                    }}
                  >
                    {lang === 'vi' ? 'Huỷ lịch' : 'Cancel'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
