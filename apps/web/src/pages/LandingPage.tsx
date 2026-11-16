import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  Layers,
  Route as RouteIcon,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Video,
} from 'lucide-react';
import {
  COURSE_PACKAGES,
  CURATED_LESSONS,
  INITIAL_LEDGER,
  INITIAL_MILESTONES,
  REFERENCE_SOURCES,
  STUDENT_CURRENT_SKILLS,
  STUDENT_TARGET_SKILLS,
  TEACHERS,
} from '@/data/mockPlatformData';
import { cn, computeLedgerBalance, formatVND, SKILL_LABELS } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/Button';
import { Badge, ProposedAIBadge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { SkillRadar } from '@/components/ui/SkillRadar';

type GoalOption = 'ielts' | 'communication' | 'pronunciation';
type MethodTab = 'roadmap' | 'classroom' | 'ledger';

const GOAL_CONFIG: Record<
  GoalOption,
  {
    labelVi: string;
    labelEn: string;
    teacherIndex: number;
    milestonePreviewVi: string;
    milestonePreviewEn: string;
  }
> = {
  ielts: {
    labelVi: 'IELTS 7.0+ (Academic)',
    labelEn: 'IELTS 7.0+ (Academic)',
    teacherIndex: 0,
    milestonePreviewVi: 'Chặng 1: Chuẩn hoá phản xạ Part 2–3 · Tập trung Speaking & Writing',
    milestonePreviewEn: 'Stage 1: Part 2–3 Fluency & Academic Writing logic',
  },
  communication: {
    labelVi: 'Giao tiếp công sở & Phỏng vấn',
    labelEn: 'Workplace & Tech Interviews',
    teacherIndex: 1,
    milestonePreviewVi: 'Chặng 1: Daily stand-up, thuyết trình sản phẩm & trả lời phỏng vấn',
    milestonePreviewEn: 'Stage 1: Stand-ups, product demos & behavioural interview drills',
  },
  pronunciation: {
    labelVi: 'Phát âm chuẩn IPA & Giảm ngập ngừng',
    labelEn: 'IPA Pronunciation & Natural Rhythm',
    teacherIndex: 2,
    milestonePreviewVi: 'Chặng 1: Sửa âm cuối /s/, /tʃ/, trọng âm từ & nối âm tự nhiên',
    milestonePreviewEn: 'Stage 1: Final consonant clarity, word stress & connected speech',
  },
};

const FAQ_ITEMS = [
  {
    qVi: 'Nếu bận đột xuất, tôi có được đổi hoặc huỷ buổi học mà không mất buổi không?',
    qEn: 'Can I reschedule or cancel a session without losing credits?',
    aVi: 'Có. Nếu bạn đổi hoặc huỷ trước 12 giờ (theo cấu hình chính sách của trung tâm), hệ thống tự động hoàn lại +1 buổi vào sổ theo dõi buổi học và ghi rõ lịch sử giao dịch.',
    aEn: 'Yes. Rescheduling or cancelling at least 12 hours ahead automatically refunds +1 session to your session ledger with full transaction history.',
  },
  {
    qVi: 'Tôi có thể đổi giáo viên nếu thấy chưa hợp phong cách giảng dạy không?',
    qEn: 'Can I switch teachers if the teaching style is not a match?',
    aVi: 'Có. Học viên được chủ động chọn hoặc đổi sang giáo viên khác trong danh sách phù hợp mục tiêu (IELTS, Giao tiếp công sở, Phát âm) mà vẫn giữ nguyên lộ trình và số buổi còn lại.',
    aEn: 'Yes. Learners can switch to another qualified teacher aligned with their goal while keeping all progress milestones and remaining session credits.',
  },
  {
    qVi: 'AI có tự ý thay đổi lộ trình học của học viên không?',
    qEn: 'Does AI automatically alter my learning plan without teacher review?',
    aVi: 'Không. Gợi ý từ hệ thống luôn ở trạng thái "AI gợi ý · Chờ duyệt". Giáo viên trực tiếp đồng hành cùng bạn sẽ kiểm tra, điều chỉnh độ khó và bấm duyệt trước khi áp dụng.',
    aEn: 'No. Every AI suggestion stays in proposed state until your assigned 1-on-1 teacher reviews, refines, and approves it.',
  },
  {
    qVi: 'Lớp học 1-1 diễn ra trên phần mềm nào và có cần cài thêm app không?',
    qEn: 'Where do 1-on-1 lessons take place and do I need extra software?',
    aVi: 'Bạn học trực tiếp ngay trên trình duyệt với phòng học chia đôi: một bên là video call 1-1 bảo mật, một bên là bảng ghi chú từ vựng và sửa lỗi phát âm thời gian thực cùng giáo viên.',
    aEn: 'Lessons run directly in your browser inside our split classroom: secure 1-on-1 video alongside shared real-time notes, vocabulary cards, and pronunciation feedback.',
  },
  {
    qVi: 'Học viên nhỏ tuổi (dưới 18 tuổi) được bảo vệ thông tin và theo dõi ra sao?',
    qEn: 'How are under-18 students tracked and protected?',
    aVi: 'Hồ sơ học viên dưới 18 tuổi gắn thông tin người giám hộ, yêu cầu xác nhận đồng ý bảo vệ dữ liệu và cho phép phụ huynh xem báo cáo chi tiết 7 kỹ năng sau từng buổi học.',
    aEn: 'Under-18 profiles link a guardian, require explicit data consent, and let parents review detailed 7-skill reports after every lesson.',
  },
];

const ONBOARDING_STEPS = [
  {
    step: '01',
    titleVi: 'Kiểm tra năng lực 7 kỹ năng',
    titleEn: '7-Skill Diagnostic',
    descVi: 'Học thử 50 phút với giáo viên để đo chính xác CEFR và phát hiện lỗ hổng phát âm, phản xạ.',
    descEn: '50-minute diagnostic lesson to pinpoint your CEFR band and speaking/pronunciation gaps.',
  },
  {
    step: '02',
    titleVi: 'Chuyên môn chấm & ghép giáo viên',
    titleEn: 'Evaluation & Matching',
    descVi: 'Giáo viên trực tiếp đánh giá nhu cầu (IELTS, công sở, phỏng vấn hoặc K12) và gợi ý thầy/cô hợp gu.',
    descEn: 'Specialists match your goals and GMT+7 schedule with vetted Native or Bilingual teachers.',
  },
  {
    step: '03',
    titleVi: 'Thiết kế & duyệt lộ trình riêng',
    titleEn: 'Approved Custom Path',
    descVi: 'Lộ trình theo từng chặng được giáo viên phê duyệt rõ ràng thay cho giáo trình rập khuôn.',
    descEn: 'Milestone roadmap explicitly reviewed and approved by your teacher before starting.',
  },
  {
    step: '04',
    titleVi: 'Học 1-1 & nhận báo cáo từng buổi',
    titleEn: '1-on-1 & Session Reports',
    descVi: 'Lớp chia đôi video + từ vựng trực tiếp, cập nhật điểm tiến bộ và bài tập sau mỗi giờ học.',
    descEn: 'Split video + live notes classroom with post-lesson feedback and ledger transparency.',
  },
];

const COMPARISON_ROWS = [
  {
    criteriaVi: 'Thời gian thực hành nói',
    criteriaEn: 'Active speaking time',
    centerVi: 'Chia đều 10–15 học viên, ít cơ hội nói',
    centerEn: 'Shared among 10–15 students',
    privateVi: '1 kèm 1 nhưng dễ bị gián đoạn',
    privateEn: '1-on-1 but inconsistent pacing',
    webEnglishVi: '100% tập trung 1 thầy – 1 trò suốt 50 phút',
    webEnglishEn: '100% 1-on-1 speaking focus for 50m',
  },
  {
    criteriaVi: 'Lộ trình & Học liệu',
    criteriaEn: 'Curriculum & Pacing',
    centerVi: 'Theo giáo trình cứng chung cả lớp',
    centerEn: 'Fixed group textbook pace',
    privateVi: 'Tự biên soạn, thiếu chuẩn CEFR',
    privateEn: 'Ad-hoc materials without CEFR tracking',
    webEnglishVi: 'Cá nhân hoá 7 kỹ năng + giáo viên duyệt từng chặng',
    webEnglishEn: 'Tailored 7-skill roadmap approved by teacher',
  },
  {
    criteriaVi: 'Lịch học & Đổi giáo viên',
    criteriaEn: 'Scheduling & Flexibility',
    centerVi: 'Cố định lịch trung tâm, khó bù buổi',
    centerEn: 'Rigid schedule, difficult make-ups',
    privateVi: 'Khó tìm người thay khi thầy/cô bận',
    privateEn: 'Hard to swap if tutor cancels',
    webEnglishVi: 'Chủ động chọn slot GMT+7, đổi/huỷ miễn phí >12h',
    webEnglishEn: 'Flexible GMT+7 slots, free cancel >12h',
  },
  {
    criteriaVi: 'Theo dõi tiến bộ & Số buổi',
    criteriaEn: 'Progress & Ledger',
    centerVi: 'Đánh giá cuối khoá, ít chi tiết từng buổi',
    centerEn: 'End-of-term grading only',
    privateVi: 'Ghi chép rời rạc, dễ nhầm số buổi',
    privateEn: 'Manual session tracking prone to gaps',
    webEnglishVi: 'Báo cáo sau mỗi buổi + sổ cái buổi học minh bạch',
    webEnglishEn: 'Post-class reports + immutable sessionLedger',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { lang, setPreviewRole, pushToast } = useUIStore();
  const [selectedGoal, setSelectedGoal] = useState<GoalOption>('ielts');
  const teacher = TEACHERS[GOAL_CONFIG[selectedGoal].teacherIndex];
  const [selectedSlotId, setSelectedSlotId] = useState<string>(
    TEACHERS[0].availableSlots[0].id,
  );
  const [trialBooked, setTrialBooked] = useState(false);
  const [methodTab, setMethodTab] = useState<MethodTab>('roadmap');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const activeSlot =
    teacher.availableSlots.find((s) => s.id === selectedSlotId) ??
    teacher.availableSlots[0];
  const ledgerBalance = computeLedgerBalance(INITIAL_LEDGER);

  const handleGoalChange = (goal: GoalOption) => {
    setSelectedGoal(goal);
    const nextTeacher = TEACHERS[GOAL_CONFIG[goal].teacherIndex];
    setSelectedSlotId(nextTeacher.availableSlots[0].id);
    setTrialBooked(false);
  };

  const handleReserveTrial = () => {
    setTrialBooked(true);
    pushToast({
      tone: 'success',
      title:
        lang === 'vi'
          ? 'Đã giữ lịch học thử mẫu (50 phút)'
          : 'Sample trial slot held (50 min)',
      description: `${activeSlot.dateLabel} · ${activeSlot.timeSlot} GMT+7 · ${teacher.name}`,
    });
  };

  const enterPortal = (role: 'student' | 'teacher' | 'admin') => {
    setPreviewRole(role);
    navigate(`/${role}`);
  };

  return (
    <div>
      {/* Hero & Interactive 1-on-1 Trial Scheduler */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-14 lg:pt-14 lg:pb-18">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] gap-8 lg:gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold text-ink leading-[1.12] tracking-tight">
              {lang === 'vi'
                ? 'Học tiếng Anh 1-1 theo lộ trình riêng, đo tiến bộ sau từng buổi.'
                : 'Personalized 1-on-1 English tailored to your 7-skill roadmap.'}
            </h1>

            <p className="text-base sm:text-lg text-ink-secondary leading-relaxed max-w-xl">
              {lang === 'vi'
                ? 'Mỗi học viên có hồ sơ năng lực 7 kỹ năng, giáo viên phù hợp múi giờ Việt Nam (GMT+7), phòng học tương tác trực tiếp và sổ theo dõi buổi học minh bạch.'
                : 'Every learner gets a 7-skill CEFR baseline, timezone-accurate 1-on-1 scheduling, an interactive classroom, and an immutable session ledger.'}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" onClick={() => navigate('/auth/register')}>
                <span>{lang === 'vi' ? 'Đăng ký học thử miễn phí' : 'Book free trial'}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="secondary" size="lg" onClick={() => enterPortal('student')}>
                <span>{lang === 'vi' ? 'Mở thử Portal Học viên' : 'Open Student Portal'}</span>
              </Button>
            </div>

            <div className="pt-4 border-t border-hairline grid grid-cols-3 gap-4 max-w-lg text-xs">
              <div>
                <p className="font-mono font-bold text-base text-ink tabular-nums">7 kỹ năng</p>
                <p className="text-ink-muted mt-0.5">
                  {lang === 'vi' ? 'Đánh giá CEFR A1–C2' : 'CEFR A1–C2 baseline'}
                </p>
              </div>
              <div>
                <p className="font-mono font-bold text-base text-ink tabular-nums">100%</p>
                <p className="text-ink-muted mt-0.5">
                  {lang === 'vi' ? 'Giáo viên duyệt lộ trình' : 'Teacher-approved paths'}
                </p>
              </div>
              <div>
                <p className="font-mono font-bold text-base text-ink tabular-nums">12 giờ</p>
                <p className="text-ink-muted mt-0.5">
                  {lang === 'vi' ? 'Miễn phí đổi/huỷ lịch' : 'Free reschedule window'}
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Cal.com-inspired 1-on-1 Trial Scheduler */}
          <Panel soft className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-hairline">
              <div>
                <h2 className="text-sm font-bold text-ink">
                  {lang === 'vi'
                    ? 'Đặt nhanh buổi đánh giá năng lực 1-1'
                    : 'Quick 1-on-1 diagnostic booking'}
                </h2>
                <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="font-mono">Asia/Ho_Chi_Minh (GMT+7)</span>
                </p>
              </div>
              <Badge tone="confirmed">50 phút · 0đ</Badge>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <span className="block text-xs font-semibold text-ink-secondary mb-2">
                  {lang === 'vi' ? '1. Chọn mục tiêu của bạn' : '1. Pick your goal'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(Object.keys(GOAL_CONFIG) as GoalOption[]).map((goal) => {
                    const active = selectedGoal === goal;
                    return (
                      <button
                        key={goal}
                        type="button"
                        onClick={() => handleGoalChange(goal)}
                        aria-pressed={active}
                        className={cn(
                          'text-left px-3 py-2 rounded-[var(--radius-sm)] text-xs font-medium border ui-transition cursor-pointer',
                          active
                            ? 'bg-accent-soft border-accent-border text-accent font-semibold'
                            : 'bg-surface border-hairline text-ink-secondary hover:bg-hover hover:text-ink',
                        )}
                      >
                        {lang === 'vi' ? GOAL_CONFIG[goal].labelVi : GOAL_CONFIG[goal].labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 rounded-[var(--radius-md)] bg-subtle flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-surface border border-hairline flex items-center justify-center font-mono text-xs font-bold text-ink shrink-0">
                    {teacher.avatarInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{teacher.name}</p>
                    <p className="text-xs text-ink-muted truncate">
                      {teacher.title} · {teacher.specialties[0]}
                    </p>
                  </div>
                </div>
                <Badge tone="completed" className="shrink-0 font-mono">
                  {teacher.matchScore}% hợp gu
                </Badge>
              </div>

              <div>
                <span className="block text-xs font-semibold text-ink-secondary mb-2">
                  {lang === 'vi'
                    ? '2. Chọn khung giờ trống (hiển thị theo giờ Việt Nam)'
                    : '2. Available slots (GMT+7)'}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {teacher.availableSlots.slice(0, 4).map((slot) => {
                    const selected = activeSlot.id === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => {
                          setSelectedSlotId(slot.id);
                          setTrialBooked(false);
                        }}
                        aria-pressed={selected}
                        className={cn(
                          'px-3 py-2 rounded-[var(--radius-sm)] border text-left ui-transition cursor-pointer',
                          selected
                            ? 'bg-ink-btn text-ink-btn-text border-transparent'
                            : 'bg-surface border-hairline text-ink hover:bg-subtle',
                        )}
                      >
                        <div className="font-mono text-xs font-semibold tabular-nums">
                          {slot.timeSlot} – {slot.endTimeSlot}
                        </div>
                        <div
                          className={cn(
                            'text-xs mt-0.5',
                            selected ? 'opacity-85' : 'text-ink-muted',
                          )}
                        >
                          {slot.dateLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="text-xs text-ink-secondary px-3 py-2 rounded-[var(--radius-sm)] bg-subtle flex items-center justify-between gap-2">
                <span className="truncate">
                  {lang === 'vi'
                    ? GOAL_CONFIG[selectedGoal].milestonePreviewVi
                    : GOAL_CONFIG[selectedGoal].milestonePreviewEn}
                </span>
              </div>

              {trialBooked ? (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-completed-bg)] border border-[var(--status-completed-border)] text-[var(--status-completed-text)] flex items-center justify-between gap-3">
                  <div className="text-xs">
                    <p className="font-bold">
                      {lang === 'vi' ? 'Đã giữ lịch học thử mẫu!' : 'Sample trial slot reserved!'}
                    </p>
                    <p className="font-mono mt-0.5">
                      {activeSlot.dateLabel} · {activeSlot.timeSlot} GMT+7
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate('/classroom/ses-101')}
                  >
                    {lang === 'vi' ? 'Xem phòng học' : 'Preview classroom'}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="accent"
                  size="lg"
                  className="w-full"
                  onClick={handleReserveTrial}
                >
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {lang === 'vi'
                      ? `Giữ lịch ${activeSlot.timeSlot} · ${activeSlot.dateLabel}`
                      : `Hold ${activeSlot.timeSlot} · ${activeSlot.dateLabel}`}
                  </span>
                </Button>
              )}
            </div>
          </Panel>
        </div>
      </section>

      {/* Section 2: 7-Skill Competency + Clean 3-Tab Study Preview (selective inspiration from Orca) */}
      <section id="how-it-works" className="border-t border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-10 items-start">
            <Panel className="bg-canvas">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-ink">
                  {lang === 'vi'
                    ? 'Hồ sơ 7 kỹ năng · Nguyễn Minh Anh (Mẫu)'
                    : '7-Skill Competency · Sample Profile'}
                </h3>
                <Badge tone="confirmed" className="font-mono">
                  CEFR B1 → IELTS 7.0
                </Badge>
              </div>
              <SkillRadar
                current={STUDENT_CURRENT_SKILLS}
                target={STUDENT_TARGET_SKILLS}
                height={280}
              />
              <div className="mt-3 pt-3 border-t border-hairline flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary">
                <span>
                  {lang === 'vi'
                    ? 'Trọng tâm cần bù: Speaking 5.5 · Pronunciation 5.5'
                    : 'Priority focus: Speaking 5.5 · Pronunciation 5.5'}
                </span>
                <ProposedAIBadge />
              </div>
            </Panel>

            <div className="space-y-6">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-ink">
                  {lang === 'vi'
                    ? 'Không học đại trà: lộ trình điều chỉnh theo tiến độ từng tuần'
                    : 'Built for personal pacing, never generic group syllabi'}
                </h2>
                <p className="mt-2.5 text-sm sm:text-base text-ink-secondary leading-relaxed">
                  {lang === 'vi'
                    ? 'Hệ thống đánh giá 7 kỹ năng làm nền tảng; mọi gợi ý bài tập hay chặng học đều chờ giáo viên trực tiếp phê duyệt trước khi giao cho bạn.'
                    : 'Your 7-skill profile guides every lesson, while assigned teachers verify and customize all AI-suggested exercises.'}
                </p>
              </div>

              {/* Clean 3-tab study preview */}
              <div>
                <div
                  role="tablist"
                  aria-label={lang === 'vi' ? 'Khám phá quy trình học 1-1' : 'Explore 1-on-1 flow'}
                  className="inline-flex flex-wrap items-center gap-1 p-1 rounded-[var(--radius-md)] bg-subtle border border-hairline mb-4"
                >
                  {(
                    [
                      {
                        id: 'roadmap',
                        labelVi: 'Lộ trình & Duyệt',
                        labelEn: 'Roadmap Review',
                        icon: <RouteIcon className="h-3.5 w-3.5" aria-hidden="true" />,
                      },
                      {
                        id: 'classroom',
                        labelVi: 'Phòng học 1-1',
                        labelEn: '1-on-1 Classroom',
                        icon: <Video className="h-3.5 w-3.5" aria-hidden="true" />,
                      },
                      {
                        id: 'ledger',
                        labelVi: 'Sổ buổi học',
                        labelEn: 'Session Ledger',
                        icon: <Layers className="h-3.5 w-3.5" aria-hidden="true" />,
                      },
                    ] as const
                  ).map((tab) => {
                    const active = methodTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        role="tab"
                        type="button"
                        aria-selected={active}
                        onClick={() => setMethodTab(tab.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium ui-transition cursor-pointer',
                          active
                            ? 'bg-surface text-ink border border-hairline font-semibold'
                            : 'text-ink-muted hover:text-ink border border-transparent',
                        )}
                      >
                        {tab.icon}
                        <span>{lang === 'vi' ? tab.labelVi : tab.labelEn}</span>
                      </button>
                    );
                  })}
                </div>

                {methodTab === 'roadmap' && (
                  <div className="divide-y divide-hairline border-y border-hairline">
                    {INITIAL_MILESTONES.slice(0, 3).map((ms) => (
                      <div key={ms.id} className="py-3.5 flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-ink">{ms.title}</span>
                            {ms.status === 'proposed' ? (
                              <ProposedAIBadge />
                            ) : (
                              <Badge tone="confirmed">
                                {ms.status === 'completed' ? 'Hoàn thành' : 'Giáo viên đã duyệt'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-ink-secondary leading-relaxed">{ms.description}</p>
                        </div>
                        <span className="font-mono text-xs text-ink-muted shrink-0">
                          {ms.completedSessions}/{ms.plannedSessions} buổi
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {methodTab === 'classroom' && (
                  <div className="divide-y divide-hairline border-y border-hairline">
                    <div className="py-3.5 flex items-start gap-3">
                      <div className="p-2 rounded-[var(--radius-sm)] bg-subtle text-ink shrink-0">
                        <Video className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-ink">
                          {lang === 'vi'
                            ? 'Phòng học chia đôi: Video 1-1 + Bảng từ vựng & Sửa phát âm'
                            : 'Split Classroom: 1-on-1 Video + Live Vocab & Error Notes'}
                        </h3>
                        <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                          {lang === 'vi'
                            ? 'Mọi lỗi phát âm âm cuối hay cách diễn đạt tự nhiên được giáo viên ghi chú ngay trong buổi sẽ tự động tổng hợp thành báo cáo sau giờ học.'
                            : 'Pronunciation notes and upgraded expressions captured during class flow directly into your post-lesson progress report.'}
                        </p>
                      </div>
                    </div>
                    <div className="py-3.5 flex items-center justify-between gap-3 text-xs">
                      <span className="text-ink-secondary">
                        Ví dụ ghi chú: <strong className="text-ink">Thiếu âm cuối /t/ · Connected speech</strong>
                      </span>
                      <Button variant="secondary" size="sm" onClick={() => navigate('/classroom/ses-101')}>
                        {lang === 'vi' ? 'Mở thử phòng học' : 'Preview classroom'}
                      </Button>
                    </div>
                  </div>
                )}

                {methodTab === 'ledger' && (
                  <div className="divide-y divide-hairline border-y border-hairline">
                    <div className="py-3.5 flex items-start gap-3">
                      <div className="p-2 rounded-[var(--radius-sm)] bg-subtle text-ink shrink-0">
                        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-ink">
                            {lang === 'vi'
                              ? 'Sổ cái buổi học minh bạch từng lượt'
                              : 'Transparent session ledger balance'}
                          </h3>
                          <Badge tone="confirmed" className="font-mono">
                            Còn {ledgerBalance} buổi
                          </Badge>
                        </div>
                        <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                          {lang === 'vi'
                            ? 'Tự động cộng khi nạp gói VietQR, trừ 1 buổi khi giữ lịch và hoàn trả đầy đủ nếu huỷ hợp lệ trước 12 giờ.'
                            : 'Credits add on confirmed VietQR payment, debit on booking, and refund automatically for valid 12h cancellations.'}
                        </p>
                      </div>
                    </div>
                    <div className="py-3 flex items-center justify-between gap-3 text-xs">
                      <span className="text-ink-muted">
                        +12 buổi nạp gói · -1 giữ lịch · +1 hoàn huỷ hợp lệ
                      </span>
                      <Button variant="secondary" size="sm" onClick={() => navigate('/student/billing')}>
                        {lang === 'vi' ? 'Xem sao kê & VietQR' : 'View Ledger & VietQR'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Transparent Packages */}
      <section id="packages" className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-ink">
              {lang === 'vi' ? 'Gói buổi học 1-1 minh bạch' : 'Transparent 1-on-1 study packages'}
            </h2>
            <p className="mt-1.5 text-sm text-ink-secondary">
              {lang === 'vi'
                ? 'Hỗ trợ chuyển khoản VietQR tự động điền nội dung và xác nhận kích hoạt số buổi ngay trong ngày.'
                : 'Clear VietQR bank transfer workflow with auditable session ledger activation.'}
            </p>
          </div>
          <Link
            to="/student/billing"
            className="text-sm font-semibold text-accent hover:underline"
          >
            {lang === 'vi' ? 'Xem thử màn hình Hoá đơn & VietQR →' : 'Preview Billing & VietQR →'}
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {COURSE_PACKAGES.map((pkg) => (
            <Panel
              key={pkg.id}
              soft={pkg.recommended}
              className={cn(
                'flex flex-col justify-between',
                pkg.recommended && 'border-accent-border',
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-ink">{pkg.name}</h3>
                  {pkg.recommended && <Badge tone="confirmed">Phổ biến</Badge>}
                </div>
                <p className="text-xs text-ink-secondary mt-1">{pkg.subtitle}</p>

                <div className="mt-4 pt-4 border-t border-hairline flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-ink tabular-nums">
                    {formatVND(pkg.priceVnd)}
                  </span>
                  {pkg.originalPriceVnd && (
                    <span className="font-mono text-xs text-ink-muted line-through tabular-nums">
                      {formatVND(pkg.originalPriceVnd)}
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-ink-muted mt-1">
                  {pkg.sessionsCount} buổi · Hiệu lực {pkg.validityDays} ngày
                </p>

                <ul className="mt-4 space-y-2 text-xs text-ink-secondary">
                  {pkg.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-hairline">
                <Button
                  variant={pkg.recommended ? 'primary' : 'secondary'}
                  className="w-full"
                  onClick={() => navigate('/auth/register')}
                >
                  {lang === 'vi' ? 'Chọn gói & học thử trước' : 'Try 1 free session first'}
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      {/* Section 4: Teachers */}
      <section id="teachers" className="border-t border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-ink">
                {lang === 'vi' ? 'Đội ngũ giáo viên đồng hành 1-1' : '1-on-1 Specialist Teachers'}
              </h2>
              <p className="mt-1.5 text-sm text-ink-secondary">
                {lang === 'vi'
                  ? 'Tất cả khung giờ dạy được quy đổi tự động từ múi giờ giáo viên sang giờ Việt Nam (GMT+7).'
                  : 'Weekly recurring schedules converted dynamically into Asia/Ho_Chi_Minh.'}
              </p>
            </div>
            <Link
              to="/student/booking"
              className="text-sm font-semibold text-accent hover:underline"
            >
              {lang === 'vi' ? 'Xem tất cả giáo viên & bộ lọc →' : 'Browse all tutors & filters →'}
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TEACHERS.slice(0, 3).map((tch) => (
              <Panel key={tch.id} className="flex flex-col justify-between bg-canvas">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-11 w-11 rounded-full bg-subtle border border-hairline flex items-center justify-center font-mono text-sm font-bold text-ink shrink-0">
                        {tch.avatarInitials}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-ink truncate">{tch.name}</h3>
                        <p className="text-xs text-ink-muted truncate">{tch.title}</p>
                      </div>
                    </div>
                    <Badge tone="neutral" className="shrink-0">
                      {tch.tier === 'native' ? 'Bản ngữ' : 'Song ngữ'}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Star className="h-3.5 w-3.5 text-[var(--status-proposed-text)]" aria-hidden="true" />
                      <strong className="text-ink">{tch.rating.toFixed(1)}</strong>
                      <span>({tch.reviewsCount}) · {tch.lessonsCompleted} buổi</span>
                    </span>
                    <span className="font-mono font-semibold text-ink">
                      {formatVND(tch.ratePerSessionVnd)}/50p
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-ink-secondary leading-relaxed">
                    {tch.bio}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tch.specialties.map((tag) => (
                      <Badge key={tag} tone="neutral">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-hairline space-y-1.5 text-xs">
                  {tch.weeklyHoursPreview.map((row) => (
                    <div key={row.dayLabel} className="flex items-center justify-between gap-2">
                      <span className="text-ink-muted flex items-center gap-1.5">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {row.dayLabel}
                      </span>
                      <span className="font-mono text-ink font-medium">{row.vnRange}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4b: Curated Real Lesson Materials & Verified Sources */}
      <section className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-ink">
                {lang === 'vi'
                  ? 'Chủ đề thực hành 1-1 theo chuẩn CEFR'
                  : 'Curated CEFR 1-on-1 Practice Topics'}
              </h2>
              <p className="mt-1.5 text-sm text-ink-secondary">
                {lang === 'vi'
                  ? '12 giáo trình mẫu trích xuất từ tài nguyên công khai British Council LearnEnglish, dùng trực tiếp trong lớp học và bài tập.'
                  : 'Sample curriculum topics collected from British Council LearnEnglish free resources.'}
              </p>
            </div>
            <Link to="/student/path" className="text-sm font-semibold text-accent hover:underline">
              {lang === 'vi' ? 'Xem đủ 12 chủ đề CEFR →' : 'View all 12 CEFR topics →'}
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CURATED_LESSONS.slice(0, 4).map((lesson) => (
              <Panel key={lesson.id} className="flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
                      <BookOpen className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />
                      {lesson.title}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge tone="completed" className="font-mono">
                        {lesson.cefr}
                      </Badge>
                      <Badge tone="neutral">{SKILL_LABELS[lesson.skill].en}</Badge>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-ink-secondary">{lesson.titleVi}</p>
                  <p className="text-xs text-ink-muted leading-relaxed">{lesson.discussionPrompt}</p>
                </div>

                <div className="pt-2.5 border-t border-hairline flex items-center justify-between gap-2 text-xs">
                  <a
                    href={lesson.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    <span>Nguồn: {lesson.sourceName}</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  <Link to="/classroom/ses-101" className="font-semibold text-ink hover:text-accent">
                    {lang === 'vi' ? 'Thử trong lớp →' : 'Try in class →'}
                  </Link>
                </div>
              </Panel>
            ))}
          </div>

          {/* Transparent Source Attribution */}
          <div className="p-5 rounded-[var(--radius-lg)] bg-surface border border-hairline">
            <p className="text-xs font-bold text-ink mb-3">
              {lang === 'vi'
                ? 'Nguồn dữ liệu mẫu & Nền tảng dạy tiếng Anh 1-1 đã tham khảo'
                : 'Reference Platforms & Curated Data Sources'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-xs">
              {REFERENCE_SOURCES.map((src) => (
                <div key={src.id} className="space-y-0.5">
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                  >
                    <span>{src.name}</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  <p className="text-ink-muted leading-relaxed">{src.role}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section 4c: 4-Step Personalized Journey & Comparison (Inspired by Kyna English & EIV) */}
      <section className="border-t border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-14">
          <div>
            <div className="mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-ink">
                {lang === 'vi'
                  ? 'Quy trình 4 bước cá nhân hoá lộ trình học'
                  : '4-Step Personalized Onboarding Process'}
              </h2>
              <p className="mt-1.5 text-sm text-ink-secondary">
                {lang === 'vi'
                  ? 'Tham khảo quy trình chuẩn từ các mô hình đào tạo 1-1 tại Việt Nam (Kyna English, EIV).'
                  : 'Structured assessment and matching flow inspired by leading Vietnamese 1-on-1 programs.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {ONBOARDING_STEPS.map((item) => (
                <Panel key={item.step} className="bg-canvas space-y-2">
                  <span className="inline-block font-mono text-xs font-bold text-accent">
                    Bước {item.step}
                  </span>
                  <h3 className="text-sm font-bold text-ink">
                    {lang === 'vi' ? item.titleVi : item.titleEn}
                  </h3>
                  <p className="text-xs text-ink-secondary leading-relaxed">
                    {lang === 'vi' ? item.descVi : item.descEn}
                  </p>
                </Panel>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-ink">
                {lang === 'vi'
                  ? 'So sánh mô hình học 1 kèm 1 trên WebEnglish'
                  : 'Why WebEnglish 1-on-1'}
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                {lang === 'vi'
                  ? 'Đối chiếu minh bạch giữa lớp truyền thống, gia sư tự do và nền tảng 1-1 có kiểm soát chất lượng.'
                  : 'Side-by-side comparison with traditional group classes and informal tutoring.'}
              </p>
            </div>

            <Panel padded={false} className="overflow-hidden bg-canvas">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-hairline bg-rail text-ink">
                      <th className="py-3.5 px-4 font-bold">
                        {lang === 'vi' ? 'Tiêu chí' : 'Criteria'}
                      </th>
                      <th className="py-3.5 px-4 font-semibold text-ink-secondary">
                        {lang === 'vi' ? 'Trung tâm lớp đông' : 'Group Center'}
                      </th>
                      <th className="py-3.5 px-4 font-semibold text-ink-secondary">
                        {lang === 'vi' ? 'Gia sư tự tìm' : 'Ad-hoc Private Tutor'}
                      </th>
                      <th className="py-3.5 px-4 font-bold text-accent">
                        WebEnglish 1-1
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {COMPARISON_ROWS.map((row) => (
                      <tr key={row.criteriaVi}>
                        <td className="py-3.5 px-4 font-semibold text-ink">
                          {lang === 'vi' ? row.criteriaVi : row.criteriaEn}
                        </td>
                        <td className="py-3.5 px-4 text-ink-muted">
                          {lang === 'vi' ? row.centerVi : row.centerEn}
                        </td>
                        <td className="py-3.5 px-4 text-ink-muted">
                          {lang === 'vi' ? row.privateVi : row.privateEn}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-ink bg-accent-soft/40">
                          {lang === 'vi' ? row.webEnglishVi : row.webEnglishEn}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      </section>

      {/* Section 5: FAQ Accordion (Clean structural pattern borrowed from Orca) */}
      <section className="border-t border-hairline">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-ink text-center mb-8">
            {lang === 'vi' ? 'Câu hỏi thường gặp' : 'Frequently asked questions'}
          </h2>

          <div className="divide-y divide-hairline border-y border-hairline bg-surface rounded-[var(--radius-lg)] px-5">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.qVi}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full py-4 flex items-center justify-between gap-4 text-left cursor-pointer group"
                  >
                    <span className="text-sm font-semibold text-ink group-hover:text-accent ui-transition">
                      {lang === 'vi' ? item.qVi : item.qEn}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-ink-muted shrink-0 ui-transition',
                        isOpen && 'rotate-180 text-ink',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <p className="pb-4 text-xs sm:text-sm text-ink-secondary leading-relaxed">
                      {lang === 'vi' ? item.aVi : item.aEn}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Direct Portal Preview Bar */}
          <div className="mt-12 p-6 rounded-[var(--radius-lg)] bg-rail border border-hairline flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>
                  {lang === 'vi'
                    ? 'Trải nghiệm trực tiếp toàn bộ giao diện 3 vai trò ngay bây giờ'
                    : 'Explore all 3 interactive role portals immediately'}
                </span>
              </div>
              <p className="text-xs text-ink-secondary">
                {lang === 'vi'
                  ? 'Chuyển đổi nhanh giữa Học viên, Giáo viên, Admin và Phòng học trực tuyến 1-1.'
                  : 'Switch live between Student, Teacher, Admin, and the 1-on-1 Classroom.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => enterPortal('student')}>
                {lang === 'vi' ? 'Vào Học viên' : 'Student Portal'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => enterPortal('teacher')}>
                {lang === 'vi' ? 'Vào Giáo viên' : 'Teacher Portal'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => enterPortal('admin')}>
                {lang === 'vi' ? 'Vào Admin' : 'Admin Ops'}
              </Button>
              <Button variant="accent" size="sm" onClick={() => navigate('/classroom/ses-101')}>
                {lang === 'vi' ? 'Phòng học 1-1' : 'Classroom'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
