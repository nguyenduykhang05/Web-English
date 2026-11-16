import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Headphones,
  Mic,
  MicOff,
  Repeat,
  RotateCcw,
  Sparkles,
  Volume2,
} from 'lucide-react';
import {
  FALLBACK_IPA_SYMBOLS,
  FALLBACK_MEDIA_LESSONS,
} from '@/data/practiceFallbackData';
import {
  apiJson,
  getAccessToken,
  type ApiIpaSymbolDto,
  type ApiPracticeAttemptDto,
  type ApiPracticeMediaLessonDto,
  type ApiWordDiffDto,
} from '@/lib/apiClient';
import {
  evaluatePracticeTextClient,
  maskSentenceForDictation,
  playPronunciation,
  speakWithTts,
  splitHighlightedWord,
} from '@/lib/practiceHelpers';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { Badge, ProposedAIBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

type LabTab = 'media' | 'ipa';
type MediaMode = 'dictation' | 'shadowing';
type IpaSubTab = 'chart' | 'quiz';

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function AudioLabPage() {
  const { pushToast } = useUIStore();

  const [labTab, setLabTab] = useState<LabTab>('media');
  const [lessons, setLessons] = useState<ApiPracticeMediaLessonDto[]>(FALLBACK_MEDIA_LESSONS);
  const [cefrFilter, setCefrFilter] = useState<string>('ALL');
  const [selectedLessonId, setSelectedLessonId] = useState<string>(FALLBACK_MEDIA_LESSONS[0].id);
  const [segIdx, setSegIdx] = useState(0);
  const [mediaMode, setMediaMode] = useState<MediaMode>('dictation');
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [listenOnly, setListenOnly] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);
  const [loopSegment, setLoopSegment] = useState(false);

  // Dictation state
  const [typedDictation, setTypedDictation] = useState('');
  const [revealedWordIndices, setRevealedWordIndices] = useState<number[]>([]);
  const [dictationResult, setDictationResult] = useState<{
    accuracyPct: number;
    completenessPct: number;
    autoScore: number;
    wordDiffs: ApiWordDiffDto[];
  } | null>(null);

  // Shadowing state
  const [shadowStep, setShadowStep] = useState<1 | 2 | 3 | 4>(1);
  const [hideTextForShadow, setHideTextForShadow] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [spokenTranscript, setSpokenTranscript] = useState('');
  const [shadowResult, setShadowResult] = useState<{
    accuracyPct: number;
    completenessPct: number;
    fluencyPct?: number;
    autoScore: number;
    wordDiffs: ApiWordDiffDto[];
    proposedStatus: 'proposed' | 'approved' | 'needs_retry';
  } | null>(null);
  const [recentAttempts, setRecentAttempts] = useState<ApiPracticeAttemptDto[]>([]);

  // Word lookup quick-save popover
  const [selectedWordToken, setSelectedWordToken] = useState<string | null>(null);

  // IPA state
  const [ipaSymbols, setIpaSymbols] = useState<ApiIpaSymbolDto[]>(FALLBACK_IPA_SYMBOLS);
  const [ipaSubTab, setIpaSubTab] = useState<IpaSubTab>('chart');
  const [activeIpaNumber, setActiveIpaNumber] = useState<number>(FALLBACK_IPA_SYMBOLS[0].number);

  // IPA Quiz state
  const [ipaQuizIdx, setIpaQuizIdx] = useState(0);
  const [ipaQuizSelected, setIpaQuizSelected] = useState<string | null>(null);
  const [ipaQuizScore, setIpaQuizScore] = useState(0);
  const [ipaQuizDone, setIpaQuizDone] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recStartRef = useRef<number>(0);

  const loadLabData = useCallback(async () => {
    const [mediaRes, ipaRes] = await Promise.all([
      apiJson<ApiPracticeMediaLessonDto[]>('/api/v1/practice/media'),
      apiJson<ApiIpaSymbolDto[]>('/api/v1/practice/ipa'),
    ]);
    if (mediaRes.ok && mediaRes.data.length > 0) {
      setLessons(mediaRes.data);
      setSelectedLessonId((prev) =>
        mediaRes.data.some((l) => l.id === prev) ? prev : mediaRes.data[0].id,
      );
    }
    if (ipaRes.ok && ipaRes.data.length > 0) {
      setIpaSymbols(ipaRes.data);
      setActiveIpaNumber((prev) =>
        ipaRes.data.some((s) => s.number === prev) ? prev : ipaRes.data[0].number,
      );
    }
    if (getAccessToken()) {
      const attRes = await apiJson<ApiPracticeAttemptDto[]>('/api/v1/practice/attempts');
      if (attRes.ok) {
        setRecentAttempts(attRes.data.slice(0, 6));
      }
    }
  }, []);

  useEffect(() => {
    void loadLabData();
  }, [loadLabData]);

  const filteredLessons = useMemo(
    () => (cefrFilter === 'ALL' ? lessons : lessons.filter((l) => l.cefrLevel === cefrFilter)),
    [cefrFilter, lessons],
  );

  const activeLesson = useMemo(
    () => lessons.find((l) => l.id === selectedLessonId) ?? lessons[0],
    [lessons, selectedLessonId],
  );

  const activeSegment = activeLesson?.segments[segIdx] ?? activeLesson?.segments[0];

  useEffect(() => {
    setTypedDictation('');
    setRevealedWordIndices([]);
    setDictationResult(null);
    setShadowResult(null);
    setSpokenTranscript('');
    setSelectedWordToken(null);
  }, [selectedLessonId, segIdx]);

  // Loop segment playback when enabled
  useEffect(() => {
    if (!loopSegment || labTab !== 'media' || !activeSegment) return;
    const timer = setInterval(() => {
      speakWithTts(activeSegment.textEn, playbackRate);
    }, 6500);
    return () => clearInterval(timer);
  }, [loopSegment, labTab, activeSegment, playbackRate]);

  // Recording timer
  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => {
      setRecordedSeconds(Math.max(1, Math.round((Date.now() - recStartRef.current) / 100) / 10));
    }, 200);
    return () => clearInterval(t);
  }, [isRecording]);

  const handlePlayCurrentSegment = () => {
    if (!activeSegment) return;
    if (videoRef.current && activeLesson?.mediaType === 'mp4' && !listenOnly) {
      videoRef.current.playbackRate = playbackRate;
      void videoRef.current.play().catch(() => {
        speakWithTts(activeSegment.textEn, playbackRate);
      });
    }
    speakWithTts(activeSegment.textEn, playbackRate);
  };

  const handleCheckDictation = async () => {
    if (!activeLesson || !activeSegment || !typedDictation.trim()) return;
    if (getAccessToken() && !activeLesson.id.startsWith('fallback-')) {
      const res = await apiJson<{
        accuracyPct: number;
        completenessPct: number;
        autoScore: number;
        wordDiffs: ApiWordDiffDto[];
      }>('/api/v1/practice/dictation', {
        method: 'POST',
        body: JSON.stringify({
          lessonId: activeLesson.id,
          segmentIndex: activeSegment.index,
          typedText: typedDictation.trim(),
        }),
      });
      if (res.ok) {
        setDictationResult(res.data);
        return;
      }
    }
    setDictationResult(evaluatePracticeTextClient(activeSegment.textEn, typedDictation.trim()));
  };

  const handleStartRecording = async () => {
    if (!activeSegment) return;
    setShadowStep(4);
    setShadowResult(null);
    recStartRef.current = Date.now();
    setRecordedSeconds(0);
    setIsRecording(true);

    // Optional browser SpeechRecognition for real-time transcript
    if (typeof window !== 'undefined') {
      const win = window as unknown as {
        SpeechRecognition?: new () => BrowserSpeechRecognition;
        webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
      };
      const SpeechRecCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
      if (SpeechRecCtor) {
        try {
          const rec = new SpeechRecCtor();
          rec.lang = 'en-US';
          rec.interimResults = false;
          rec.maxAlternatives = 1;
          rec.onresult = (evt) => {
            const first = evt.results[0]?.[0]?.transcript;
            if (first) setSpokenTranscript(first);
          };
          rec.onerror = () => {
            // Silently ignore if mic permission or offline speech service unavailable
          };
          rec.start();
          recognitionRef.current = rec;
        } catch {
          // Ignore SpeechRecognition startup error
        }
      }

      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream);
          recorder.onstop = () => {
            stream.getTracks().forEach((tr) => tr.stop());
          };
          recorder.start();
          mediaRecorderRef.current = recorder;
        } catch {
          // Allow demo/offline transcript fallback when mic unavailable
        }
      }
    }
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    const elapsed = Math.max(0.8, Math.round((Date.now() - recStartRef.current) / 100) / 10);
    setRecordedSeconds(elapsed);

    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore
    }
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // Ignore
    }

    if (!spokenTranscript.trim() && activeSegment) {
      // Pre-fill demo transcript if browser lacks SpeechRecognition so user can edit & submit
      setSpokenTranscript(activeSegment.textEn);
      pushToast({
        tone: 'neutral',
        title: 'Đã dừng ghi âm — Kiểm tra transcript trước khi gửi giáo viên',
        description: 'Bạn có thể chỉnh sửa lại câu đã nói (nếu trình duyệt chưa bật Speech-to-Text) trước khi bấm Chấm & Gửi.',
      });
    }
  };

  const handleSubmitShadowing = async () => {
    if (!activeLesson || !activeSegment || !spokenTranscript.trim()) return;
    const duration = recordedSeconds > 0.3 ? recordedSeconds : 3.2;

    if (getAccessToken() && !activeLesson.id.startsWith('fallback-')) {
      const res = await apiJson<{
        accuracyPct: number;
        completenessPct: number;
        fluencyPct?: number;
        autoScore: number;
        wordDiffs: ApiWordDiffDto[];
        proposedStatus: 'proposed' | 'approved' | 'needs_retry';
      }>('/api/v1/practice/shadowing', {
        method: 'POST',
        body: JSON.stringify({
          lessonId: activeLesson.id,
          segmentIndex: activeSegment.index,
          spokenTranscript: spokenTranscript.trim(),
          durationSec: duration,
        }),
      });
      if (res.ok) {
        setShadowResult(res.data);
        pushToast({
          tone: 'success',
          title: `AI chấm sơ bộ: ${res.data.autoScore}/100 (Chờ giáo viên duyệt)`,
        });
        await loadLabData();
        return;
      }
    }

    const evalLocal = evaluatePracticeTextClient(
      activeSegment.textEn,
      spokenTranscript.trim(),
      duration,
    );
    setShadowResult({ ...evalLocal, proposedStatus: 'proposed' });
    pushToast({
      tone: 'success',
      title: `AI chấm sơ bộ: ${evalLocal.autoScore}/100 (proposed · chờ giáo viên duyệt)`,
    });
  };

  const handleSaveWordFromSubtitle = async (word: string) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, '').trim();
    if (!clean) return;
    if (getAccessToken()) {
      const res = await apiJson('/api/v1/practice/cards', {
        method: 'POST',
        body: JSON.stringify({
          term: clean,
          meaningVi: `Từ vựng trích từ bài "${activeLesson?.title ?? 'Audio Lab'}"`,
          exampleEn: activeSegment?.textEn,
          contextNote: `Lưu trực tiếp từ phụ đề Audio Lab (${activeLesson?.cefrLevel ?? 'B1'})`,
        }),
      });
      if (res.ok) {
        pushToast({
          tone: 'success',
          title: `Đã lưu "${clean}" vào bộ Flashcard cá nhân`,
        });
      }
    } else {
      pushToast({
        tone: 'success',
        title: `Đã đánh dấu "${clean}" (Đăng nhập để lưu vào Flashcard SRS)`,
      });
    }
    setSelectedWordToken(null);
  };

  // Masked words for Dictation hints
  const maskedWords = useMemo(
    () => (activeSegment ? maskSentenceForDictation(activeSegment.textEn, revealedWordIndices) : []),
    [activeSegment, revealedWordIndices],
  );

  // Active IPA symbol & groupings
  const activeIpa = useMemo(
    () => ipaSymbols.find((s) => s.number === activeIpaNumber) ?? ipaSymbols[0],
    [ipaSymbols, activeIpaNumber],
  );
  const monophthongs = useMemo(
    () => ipaSymbols.filter((s) => s.category === 'monophthong'),
    [ipaSymbols],
  );
  const diphthongs = useMemo(
    () => ipaSymbols.filter((s) => s.category === 'diphthong'),
    [ipaSymbols],
  );
  const consonants = useMemo(
    () => ipaSymbols.filter((s) => s.category === 'consonant'),
    [ipaSymbols],
  );

  // Build deterministic IPA Quiz questions from loaded IPA chart
  const ipaQuizItems = useMemo(() => {
    const pool = ipaSymbols.slice(0, Math.min(8, ipaSymbols.length));
    return pool.map((sym, idx) => {
      const ex = sym.examples[0] ?? { word: 'speak', highlightPart: 'ea', ipa: '/spiːk/', meaningVi: 'nói' };
      const distractors = ipaSymbols
        .filter((other) => other.symbol !== sym.symbol)
        .slice(0, 3)
        .map((other) => `/${other.symbol}/`);
      const correct = `/${sym.symbol}/`;
      const options = [correct, ...distractors];
      const shift = idx % options.length;
      return {
        symbol: sym,
        example: ex,
        correct,
        options: [...options.slice(shift), ...options.slice(0, shift)],
      };
    });
  }, [ipaSymbols]);

  const currentIpaQuiz = ipaQuizItems[ipaQuizIdx];

  return (
    <div className="space-y-6">
      {/* Header + Top Tab Switcher */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Lab Nghe Chép (Dictation), Shadowing &amp; Bảng 44 Âm IPA
          </h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Thực hành nghe-nói từng câu từ nguồn VOA Public Domain &amp; British Council; AI chấm sơ bộ ở trạng thái chờ giáo viên duyệt.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-[var(--radius-md)] bg-subtle border border-hairline gap-1">
          <button
            type="button"
            onClick={() => setLabTab('media')}
            className={cn(
              'px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer ui-transition',
              labTab === 'media'
                ? 'bg-surface text-ink border border-hairline font-semibold'
                : 'text-ink-muted hover:text-ink border border-transparent',
            )}
          >
            Dictation &amp; Shadowing
          </button>
          <button
            type="button"
            onClick={() => setLabTab('ipa')}
            className={cn(
              'px-3.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer ui-transition',
              labTab === 'ipa'
                ? 'bg-surface text-ink border border-hairline font-semibold'
                : 'text-ink-muted hover:text-ink border border-transparent',
            )}
          >
            Bảng 44 âm IPA &amp; Quiz
          </button>
        </div>
      </div>

      {/* TAB 1: DICTATION & SHADOWING */}
      {labTab === 'media' && activeLesson && activeSegment && (
        <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-5 items-start">
          {/* Left: Media Lesson Picker */}
          <Panel className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">Kho bài thực hành ({filteredLessons.length})</h2>
              <div className="flex gap-1">
                {['ALL', 'A1', 'B1'].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setCefrFilter(lvl)}
                    className={cn(
                      'px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-mono border cursor-pointer',
                      cefrFilter === lvl
                        ? 'bg-accent-soft text-accent border-accent-border font-bold'
                        : 'bg-subtle text-ink-muted border-hairline',
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {filteredLessons.map((lesson) => {
                const active = lesson.id === activeLesson.id;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => {
                      setSelectedLessonId(lesson.id);
                      setSegIdx(0);
                    }}
                    className={cn(
                      'w-full text-left p-3 rounded-[var(--radius-md)] border ui-transition cursor-pointer space-y-1.5',
                      active
                        ? 'bg-accent-soft/50 border-accent'
                        : 'bg-subtle/40 border-hairline hover:border-ink-muted/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="neutral" className="font-mono">
                        {lesson.cefrLevel}
                      </Badge>
                      <span className="font-mono text-[11px] text-ink-muted">
                        {lesson.segments.length} câu
                      </span>
                    </div>
                    <p className="text-xs font-bold text-ink leading-snug">{lesson.titleVi}</p>
                    <p className="text-[11px] text-ink-muted truncate">{lesson.sourceName}</p>
                  </button>
                );
              })}
            </div>

            {recentAttempts.length > 0 && (
              <div className="pt-3 border-t border-hairline space-y-2">
                <p className="text-xs font-bold text-ink">Lịch sử nộp gần đây</p>
                {recentAttempts.map((att) => (
                  <div
                    key={att.id}
                    className="p-2.5 rounded-[var(--radius-sm)] bg-subtle border border-hairline text-[11px] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono font-bold uppercase text-ink">
                        {att.mode} · Câu {att.segmentIndex + 1}
                      </span>
                      <span className="font-mono text-accent font-bold">
                        {att.verifiedScore ?? att.autoScore}/100
                      </span>
                    </div>
                    {att.proposedStatus === 'proposed' ? (
                      <ProposedAIBadge />
                    ) : (
                      <Badge tone={att.proposedStatus === 'approved' ? 'completed' : 'alert'}>
                        {att.proposedStatus === 'approved' ? 'GV đã duyệt' : 'Cần luyện lại'}
                      </Badge>
                    )}
                    {att.teacherFeedback && (
                      <p className="text-ink-secondary">{att.teacherFeedback}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Right: Interactive Player + Segment Practice */}
          <div className="space-y-5">
            <Panel className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="confirmed" className="font-mono">
                      CEFR {activeLesson.cefrLevel}
                    </Badge>
                    <span className="text-xs text-ink-muted">{activeLesson.topic}</span>
                  </div>
                  <h2 className="text-lg font-bold text-ink mt-1">{activeLesson.titleVi}</h2>
                  <a
                    href={activeLesson.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline mt-0.5"
                  >
                    <span>Nguồn: {activeLesson.sourceName}</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>

                <div className="inline-flex p-1 rounded-[var(--radius-md)] bg-subtle border border-hairline">
                  <button
                    type="button"
                    onClick={() => setMediaMode('dictation')}
                    className={cn(
                      'px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer',
                      mediaMode === 'dictation'
                        ? 'bg-surface text-ink border border-hairline font-semibold'
                        : 'text-ink-muted',
                    )}
                  >
                    1. Nghe chép (Dictation)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaMode('shadowing')}
                    className={cn(
                      'px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer',
                      mediaMode === 'shadowing'
                        ? 'bg-surface text-ink border border-hairline font-semibold'
                        : 'text-ink-muted',
                    )}
                  >
                    2. Nói theo (Shadowing)
                  </button>
                </div>
              </div>

              {/* Optional VOA Public Domain MP4 Player */}
              {activeLesson.mediaType === 'mp4' && activeLesson.mediaUrl && !listenOnly && (
                <div className="rounded-[var(--radius-md)] overflow-hidden border border-hairline bg-black/90">
                  <video
                    ref={videoRef}
                    src={activeLesson.mediaUrl}
                    controls
                    preload="metadata"
                    className="w-full max-h-[260px]"
                  />
                </div>
              )}

              {/* Playback Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[var(--radius-md)] bg-subtle border border-hairline">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" size="sm" onClick={handlePlayCurrentSegment}>
                    <Volume2 className="h-4 w-4" aria-hidden="true" />
                    <span>Nghe câu {segIdx + 1}</span>
                  </Button>

                  <div className="inline-flex items-center gap-1 bg-surface border border-hairline rounded-[var(--radius-sm)] px-2 py-1 text-xs font-mono">
                    {[0.5, 0.75, 1.0, 1.25].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setPlaybackRate(r)}
                        className={cn(
                          'px-1.5 py-0.5 rounded cursor-pointer',
                          playbackRate === r
                            ? 'bg-accent text-white font-bold'
                            : 'text-ink-secondary hover:text-ink',
                        )}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setLoopSegment((l) => !l)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs border cursor-pointer',
                      loopSegment
                        ? 'bg-accent-soft text-accent border-accent-border font-semibold'
                        : 'bg-surface text-ink-secondary border-hairline',
                    )}
                  >
                    <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Lặp câu</span>
                  </button>

                  {activeLesson.mediaType === 'mp4' && (
                    <button
                      type="button"
                      onClick={() => setListenOnly((v) => !v)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs border cursor-pointer',
                        listenOnly
                          ? 'bg-accent-soft text-accent border-accent-border font-semibold'
                          : 'bg-surface text-ink-secondary border-hairline',
                      )}
                    >
                      <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{listenOnly ? 'Đang ẩn video (Chỉ nghe)' : 'Chỉ nghe'}</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowTranslation((s) => !s)}
                  className="inline-flex items-center gap-1 text-xs text-ink-secondary hover:text-ink cursor-pointer"
                >
                  {showTranslation ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{showTranslation ? 'Ẩn bản dịch' : 'Hiện bản dịch'}</span>
                </button>
              </div>

              {/* Sentence Selector Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {activeLesson.segments.map((seg, idx) => (
                  <button
                    key={seg.index}
                    type="button"
                    onClick={() => setSegIdx(idx)}
                    className={cn(
                      'px-2.5 py-1 rounded-[var(--radius-sm)] font-mono text-xs border cursor-pointer',
                      idx === segIdx
                        ? 'bg-ink text-surface border-ink font-bold'
                        : 'bg-surface text-ink-secondary border-hairline hover:border-ink-muted',
                    )}
                  >
                    Câu {idx + 1}
                  </button>
                ))}
              </div>

              {/* DICTATION WORKBENCH */}
              {mediaMode === 'dictation' && (
                <div className="space-y-4 pt-2">
                  <div className="p-4 rounded-[var(--radius-md)] bg-subtle/60 border border-hairline space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-ink">
                        {activeSegment.speaker ? `${activeSegment.speaker}: ` : ''}Bấm vào ô từ bị bí để mở gợi ý 1 từ:
                      </span>
                      {activeSegment.keyPhrase && (
                        <Badge tone="neutral" className="font-mono">
                          Cụm khóa: {activeSegment.keyPhrase}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {maskedWords.map((mask, wIdx) => {
                        const revealed = revealedWordIndices.includes(wIdx);
                        return (
                          <button
                            key={`${segIdx}-mask-${wIdx}`}
                            type="button"
                            onClick={() =>
                              setRevealedWordIndices((prev) =>
                                prev.includes(wIdx) ? prev : [...prev, wIdx],
                              )
                            }
                            className={cn(
                              'px-2 py-1 rounded-[var(--radius-sm)] font-mono text-xs border cursor-pointer',
                              revealed
                                ? 'bg-accent-soft text-accent border-accent-border font-semibold'
                                : 'bg-surface text-ink-secondary border-hairline hover:border-accent',
                            )}
                          >
                            {mask}
                          </button>
                        );
                      })}
                    </div>

                    {showTranslation && (
                      <p className="text-xs text-ink-secondary pt-1">
                        Nghĩa câu: <em>{activeSegment.textVi}</em>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={typedDictation}
                      onChange={(e) => setTypedDictation(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.shiftKey) {
                          e.preventDefault();
                          void handleCheckDictation();
                        }
                      }}
                      placeholder="Gõ chính xác câu tiếng Anh bạn vừa nghe được... (Shift+Enter để kiểm tra)"
                      className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-hairline bg-surface font-mono text-sm text-ink"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTypedDictation(activeSegment.textEn)}
                      >
                        Điền nhanh đáp án mẫu (Demo)
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!typedDictation.trim()}
                        onClick={() => void handleCheckDictation()}
                      >
                        Kiểm tra chính tả
                      </Button>
                    </div>
                  </div>

                  {dictationResult && (
                    <div className="p-4 rounded-[var(--radius-md)] bg-surface border border-hairline space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-ink">
                          Kết quả đối chiếu từng từ
                        </span>
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <Badge tone={dictationResult.accuracyPct >= 80 ? 'completed' : 'proposed'}>
                            Chính xác: {dictationResult.accuracyPct}%
                          </Badge>
                          <Badge tone="neutral">Điểm: {dictationResult.autoScore}/100</Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {dictationResult.wordDiffs.map((wd, idx) => (
                          <div
                            key={`${wd.expected}-${idx}`}
                            className={cn(
                              'px-2.5 py-1 rounded-[var(--radius-sm)] text-xs font-mono border',
                              wd.status === 'exact'
                                ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-emerald-300'
                                : wd.status === 'wrong'
                                  ? 'bg-[var(--status-alert-bg)] text-[var(--status-alert-text)] border-red-300'
                                  : 'bg-[var(--status-proposed-bg)] text-[var(--status-proposed-text)] border-dashed border-amber-400',
                            )}
                          >
                            {wd.status === 'wrong' && wd.actual && (
                              <span className="line-through mr-1 opacity-75">{wd.actual}</span>
                            )}
                            <span className="font-bold">{wd.expected}</span>
                          </div>
                        ))}
                      </div>

                      <p className="text-xs text-ink-muted">
                        Bấm vào từ bất kỳ trên phụ đề ở chế độ Shadowing để lưu nhanh vào Flashcard.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* SHADOWING WORKBENCH */}
              {mediaMode === 'shadowing' && (
                <div className="space-y-4 pt-2">
                  {/* 4 Guided Steps */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { step: 1 as const, label: '1. Nghe mẫu' },
                      { step: 2 as const, label: '2. Đọc đè có chữ' },
                      { step: 3 as const, label: '3. Shadow ẩn chữ' },
                      { step: 4 as const, label: '4. Ghi âm & Nộp' },
                    ].map((s) => (
                      <button
                        key={s.step}
                        type="button"
                        onClick={() => {
                          setShadowStep(s.step);
                          setHideTextForShadow(s.step === 3);
                        }}
                        className={cn(
                          'px-3 py-2 rounded-[var(--radius-sm)] text-xs font-medium border cursor-pointer ui-transition',
                          shadowStep === s.step
                            ? 'bg-accent text-white border-accent font-semibold'
                            : 'bg-subtle text-ink-secondary border-hairline',
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Click-to-Lookup Interactive Subtitle Box */}
                  <div className="p-4 rounded-[var(--radius-md)] bg-subtle/60 border border-hairline space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-ink">
                        {activeSegment.speaker ? `${activeSegment.speaker}: ` : ''}Bấm vào từ bất kỳ để lưu vào Flashcard:
                      </span>
                      <button
                        type="button"
                        onClick={() => setHideTextForShadow((h) => !h)}
                        className="text-accent hover:underline cursor-pointer"
                      >
                        {hideTextForShadow ? 'Hiện chữ' : 'Ẩn chữ để Shadow'}
                      </button>
                    </div>

                    {hideTextForShadow ? (
                      <p className="text-sm font-mono text-ink-muted italic py-2">
                        [Đang ẩn chữ — Nghe giọng mẫu và nói đuổi ngay lập tức theo nhịp điệu]
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 leading-relaxed">
                        {activeSegment.textEn.split(/\s+/).map((tok, tIdx) => (
                          <button
                            key={`${segIdx}-tok-${tIdx}`}
                            type="button"
                            onClick={() => setSelectedWordToken(tok)}
                            className="px-1.5 py-0.5 rounded bg-surface border border-hairline text-sm font-medium text-ink hover:border-accent hover:text-accent cursor-pointer"
                          >
                            {tok}
                          </button>
                        ))}
                      </div>
                    )}

                    {showTranslation && (
                      <p className="text-xs text-ink-secondary">
                        Dịch nghĩa: {activeSegment.textVi}
                      </p>
                    )}

                    {selectedWordToken && (
                      <div className="p-3 rounded-[var(--radius-md)] bg-surface border border-accent-border flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs">
                          <span className="font-bold text-ink text-sm mr-2">
                            {selectedWordToken.replace(/[^a-zA-Z'-]/g, '')}
                          </span>
                          <span className="text-ink-muted">Nghe phát âm hoặc lưu sang bộ Flashcard SRS</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              playPronunciation(selectedWordToken.replace(/[^a-zA-Z'-]/g, ''))
                            }
                          >
                            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Nghe</span>
                          </Button>
                          <Button
                            variant="accent"
                            size="sm"
                            onClick={() => void handleSaveWordFromSubtitle(selectedWordToken)}
                          >
                            <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Lưu vào Flashcard</span>
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recording & Transcript Submission */}
                  <div className="p-4 rounded-[var(--radius-md)] bg-surface border border-hairline space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {!isRecording ? (
                          <Button variant="accent" size="sm" onClick={() => void handleStartRecording()}>
                            <Mic className="h-4 w-4" aria-hidden="true" />
                            <span>Bắt đầu thu âm Shadowing</span>
                          </Button>
                        ) : (
                          <Button variant="danger" size="sm" onClick={handleStopRecording}>
                            <MicOff className="h-4 w-4" aria-hidden="true" />
                            <span>Dừng ghi âm ({recordedSeconds}s)</span>
                          </Button>
                        )}
                      </div>
                      <span className="font-mono text-xs text-ink-muted">
                        Hỗ trợ Speech-to-Text + Chỉnh sửa thủ công
                      </span>
                    </div>

                    <textarea
                      rows={2}
                      value={spokenTranscript}
                      onChange={(e) => setSpokenTranscript(e.target.value)}
                      placeholder="Nội dung nhận diện giọng nói (hoặc nhập câu bạn vừa đọc để AI chấm sơ bộ gửi giáo viên duyệt)..."
                      className="w-full px-3 py-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle/40 font-mono text-xs text-ink"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ProposedAIBadge />
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!spokenTranscript.trim()}
                        onClick={() => void handleSubmitShadowing()}
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Chấm sơ bộ &amp; Gửi giáo viên duyệt</span>
                      </Button>
                    </div>
                  </div>

                  {shadowResult && (
                    <div className="p-4 rounded-[var(--radius-md)] bg-[var(--status-proposed-bg)]/45 border border-dashed border-[var(--status-proposed-border)] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-ink">
                            Điểm AI sơ bộ: {shadowResult.autoScore}/100
                          </span>
                          <ProposedAIBadge />
                        </div>
                        <div className="flex flex-wrap gap-2 font-mono text-xs">
                          <Badge tone="neutral">Chính xác: {shadowResult.accuracyPct}%</Badge>
                          <Badge tone="neutral">Đầy đủ: {shadowResult.completenessPct}%</Badge>
                          {shadowResult.fluencyPct !== undefined && (
                            <Badge tone="neutral">Trôi chảy: {shadowResult.fluencyPct}%</Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {shadowResult.wordDiffs.map((wd, idx) => (
                          <span
                            key={`${wd.expected}-sh-${idx}`}
                            className={cn(
                              'px-2 py-0.5 rounded font-mono text-xs border',
                              wd.status === 'exact'
                                ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-emerald-300'
                                : wd.status === 'wrong'
                                  ? 'bg-[var(--status-alert-bg)] text-[var(--status-alert-text)] border-red-300'
                                  : 'bg-surface text-ink-muted line-through border-hairline',
                            )}
                          >
                            {wd.expected}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* TAB 2: 44-SOUND IPA CHART & QUIZ */}
      {labTab === 'ipa' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-secondary">
              Bấm vào từng ký hiệu IPA để nghe phát âm, xem mẹo khẩu hình cho người Việt và các từ ví dụ tô đậm.
            </p>
            <div className="inline-flex p-1 rounded-[var(--radius-md)] bg-subtle border border-hairline">
              <button
                type="button"
                onClick={() => setIpaSubTab('chart')}
                className={cn(
                  'px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer',
                  ipaSubTab === 'chart'
                    ? 'bg-surface text-ink border border-hairline font-semibold'
                    : 'text-ink-muted',
                )}
              >
                Học Bảng 44 âm IPA
              </button>
              <button
                type="button"
                onClick={() => setIpaSubTab('quiz')}
                className={cn(
                  'px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer',
                  ipaSubTab === 'quiz'
                    ? 'bg-surface text-ink border border-hairline font-semibold'
                    : 'text-ink-muted',
                )}
              >
                Luyện tập IPA Quiz
              </button>
            </div>
          </div>

          {ipaSubTab === 'chart' && activeIpa && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)] gap-5 items-start">
              <Panel className="space-y-5">
                {[
                  { title: `Nguyên âm đơn (${monophthongs.length})`, items: monophthongs },
                  { title: `Nguyên âm đôi (${diphthongs.length})`, items: diphthongs },
                  { title: `Phụ âm (${consonants.length})`, items: consonants },
                ].map((group) => (
                  <div key={group.title} className="space-y-2.5">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                      {group.title}
                    </h2>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {group.items.map((sym) => {
                        const isSelected = sym.number === activeIpa.number;
                        const sampleWord = sym.examples[0]?.word ?? sym.sampleSentence.targetWord;
                        return (
                          <button
                            key={sym.symbol}
                            type="button"
                            onClick={() => {
                              setActiveIpaNumber(sym.number);
                              speakWithTts(sampleWord, 0.9);
                            }}
                            className={cn(
                              'p-2.5 rounded-[var(--radius-md)] border text-center cursor-pointer ui-transition',
                              isSelected
                                ? 'bg-accent text-white border-accent'
                                : 'bg-subtle/60 text-ink border-hairline hover:border-accent/60',
                            )}
                          >
                            <p className="font-mono text-base font-bold">/{sym.symbol}/</p>
                            <p
                              className={cn(
                                'text-[11px] truncate mt-0.5',
                                isSelected ? 'text-white/90' : 'text-ink-muted',
                              )}
                            >
                              {sampleWord}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </Panel>

              {/* IPA Detail Card */}
              <Panel className="space-y-4 sticky top-20">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-3xl font-extrabold text-accent">
                        /{activeIpa.symbol}/
                      </span>
                      <Badge tone="neutral" className="font-mono">
                        {activeIpa.voicing}
                      </Badge>
                    </div>
                    <h3 className="text-base font-bold text-ink mt-1">{activeIpa.nameVi}</h3>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      speakWithTts(
                        activeIpa.examples[0]?.word ?? activeIpa.sampleSentence.targetWord,
                        0.85,
                      )
                    }
                  >
                    <Volume2 className="h-4 w-4 text-accent" aria-hidden="true" />
                    <span>Nghe âm</span>
                  </Button>
                </div>

                <div className="p-3 rounded-[var(--radius-md)] bg-subtle space-y-1.5 text-xs">
                  <p className="font-bold text-ink">Mẹo đặt khẩu hình:</p>
                  <p className="text-ink-secondary">{activeIpa.articulationTipVi}</p>
                </div>

                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--status-proposed-bg)]/55 border border-dashed border-[var(--status-proposed-border)] space-y-1 text-xs">
                  <p className="font-bold text-[var(--status-proposed-text)]">
                    Lỗi người Việt hay gặp:
                  </p>
                  <p className="text-ink-secondary">{activeIpa.vietnamesePitfallVi}</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-ink">Cách viết thường gặp:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeIpa.spellingPatterns.map((sp) => (
                      <Badge key={sp} tone="neutral" className="font-mono">
                        {sp}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-ink">Từ ví dụ (tô đậm vị trí phát âm):</p>
                  <div className="space-y-1.5">
                    {activeIpa.examples.map((ex) => {
                      const parts = splitHighlightedWord(ex.word, ex.highlightPart);
                      return (
                        <div
                          key={ex.word}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-subtle border border-hairline text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-ink">
                              {parts.prefix}
                              <span className="text-accent underline decoration-2">
                                {parts.match}
                              </span>
                              {parts.suffix}
                            </span>
                            <span className="font-mono text-ink-muted">{ex.ipa}</span>
                            <span className="text-ink-secondary">— {ex.meaningVi}</span>
                          </div>
                          <button
                            type="button"
                            aria-label={`Nghe từ ${ex.word}`}
                            onClick={() => speakWithTts(ex.word, 0.9)}
                            className="p-1.5 rounded bg-surface border border-hairline text-accent cursor-pointer"
                          >
                            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-hairline space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink">Câu ví dụ:</span>
                    <button
                      type="button"
                      onClick={() => speakWithTts(activeIpa.sampleSentence.textEn, 0.9)}
                      className="text-accent hover:underline cursor-pointer"
                    >
                      Nghe cả câu
                    </button>
                  </div>
                  <p className="font-medium text-ink">{activeIpa.sampleSentence.textEn}</p>
                  <p className="text-ink-secondary">{activeIpa.sampleSentence.textVi}</p>
                </div>
              </Panel>
            </div>
          )}

          {ipaSubTab === 'quiz' && (
            <Panel className="max-w-2xl mx-auto space-y-4">
              {ipaQuizDone || !currentIpaQuiz ? (
                <div className="py-6 text-center space-y-3">
                  <CheckCircle2 className="h-8 w-8 text-[var(--status-completed-text)] mx-auto" aria-hidden="true" />
                  <h2 className="text-lg font-bold text-ink">
                    Hoàn thành IPA Quiz: {ipaQuizScore}/{ipaQuizItems.length} câu đúng!
                  </h2>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setIpaQuizIdx(0);
                      setIpaQuizSelected(null);
                      setIpaQuizScore(0);
                      setIpaQuizDone(false);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Luyện lại</span>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-ink-muted">
                    <span>
                      Câu {ipaQuizIdx + 1}/{ipaQuizItems.length}
                    </span>
                    <span>Đúng: {ipaQuizScore}</span>
                  </div>

                  <div className="p-5 rounded-[var(--radius-lg)] bg-subtle border border-hairline text-center space-y-3">
                    <p className="text-xs text-ink-secondary">
                      Phần được tô đậm trong từ dưới đây phát âm là ký hiệu IPA nào?
                    </p>
                    {(() => {
                      const p = splitHighlightedWord(
                        currentIpaQuiz.example.word,
                        currentIpaQuiz.example.highlightPart,
                      );
                      return (
                        <p className="text-3xl font-extrabold text-ink">
                          {p.prefix}
                          <span className="text-accent underline decoration-2">{p.match}</span>
                          {p.suffix}
                        </p>
                      );
                    })()}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => speakWithTts(currentIpaQuiz.example.word, 0.85)}
                    >
                      <Volume2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                      <span>Nghe phát âm từ này</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {currentIpaQuiz.options.map((opt) => {
                      const isPicked = ipaQuizSelected === opt;
                      const isRight = opt === currentIpaQuiz.correct;
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={ipaQuizSelected !== null}
                          onClick={() => {
                            setIpaQuizSelected(opt);
                            if (opt === currentIpaQuiz.correct) setIpaQuizScore((s) => s + 1);
                          }}
                          className={cn(
                            'p-4 rounded-[var(--radius-md)] border font-mono text-lg font-bold cursor-pointer ui-transition',
                            ipaQuizSelected === null
                              ? 'bg-surface border-hairline hover:border-accent'
                              : isRight
                                ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-emerald-400'
                                : isPicked
                                  ? 'bg-[var(--status-alert-bg)] text-[var(--status-alert-text)] border-red-400'
                                  : 'bg-surface border-hairline opacity-60',
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {ipaQuizSelected !== null && (
                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          if (ipaQuizIdx + 1 >= ipaQuizItems.length) {
                            setIpaQuizDone(true);
                          } else {
                            setIpaQuizIdx((i) => i + 1);
                            setIpaQuizSelected(null);
                          }
                        }}
                      >
                        {ipaQuizIdx + 1 >= ipaQuizItems.length ? 'Xem kết quả' : 'Câu tiếp theo →'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
