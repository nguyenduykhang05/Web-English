import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Headphones,
  HelpCircle,
  Layers,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Sparkles,
  Square,
  Star,
  Volume2,
} from 'lucide-react';
import {
  FALLBACK_VOCAB_CARDS,
  FALLBACK_VOCAB_DECKS,
} from '@/data/practiceFallbackData';
import {
  apiJson,
  getAccessToken,
  type ApiVocabCardDto,
  type ApiVocabDeckDto,
} from '@/lib/apiClient';
import {
  computeClientSrsPreview,
  playPronunciation,
  type SrsRatingKey,
} from '@/lib/practiceHelpers';
import { cn } from '@/lib/utils';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/States';

type StudyMode = 'flashcard' | 'srs' | 'quiz' | 'match' | 'listening';
type CategoryFilter = 'all' | ApiVocabDeckDto['category'];

const CATEGORY_TABS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'session_notes', label: 'Từ buổi học 1-1' },
  { id: 'cefr', label: 'CEFR A1–B2' },
  { id: 'ielts', label: 'IELTS' },
  { id: 'business', label: 'Business' },
];

const MODE_TABS: { id: StudyMode; label: string }[] = [
  { id: 'flashcard', label: 'Thẻ ghi nhớ' },
  { id: 'srs', label: 'Lặp ngắt quãng (SRS)' },
  { id: 'quiz', label: 'Kiểm tra' },
  { id: 'match', label: 'Ghép cặp' },
  { id: 'listening', label: 'Luyện nghe từ' },
];

export default function VocabPracticePage() {
  const { pushToast } = useUIStore();
  const { mistakesVocab } = usePlatformStore();

  const [category, setCategory] = useState<CategoryFilter>('all');
  const [decks, setDecks] = useState<ApiVocabDeckDto[]>(FALLBACK_VOCAB_DECKS);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(FALLBACK_VOCAB_DECKS[0].id);
  const [cards, setCards] = useState<ApiVocabCardDto[]>(
    FALLBACK_VOCAB_CARDS[FALLBACK_VOCAB_DECKS[0].id] ?? [],
  );
  const [mode, setMode] = useState<StudyMode>('flashcard');
  const [syncing, setSyncing] = useState(false);

  // Flashcard states
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [minimalMode, setMinimalMode] = useState(false);
  const [autoplay, setAutoplay] = useState(false);

  // SRS states
  const [srsIdx, setSrsIdx] = useState(0);
  const [srsFlipped, setSrsFlipped] = useState(false);
  const [srsCompletedCount, setSrsCompletedCount] = useState(0);

  // Quiz states
  const [quizType, setQuizType] = useState<'choice' | 'typing'>('choice');
  const [quizDirection, setQuizDirection] = useState<'en_vi' | 'vi_en'>('en_vi');
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizTyped, setQuizTyped] = useState('');
  const [quizSelected, setQuizSelected] = useState<string | null>(null);
  const [quizHintShown, setQuizHintShown] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // Match game states
  const [matchSelectedLeft, setMatchSelectedLeft] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [matchMistakes, setMatchMistakes] = useState(0);
  const [matchSeconds, setMatchSeconds] = useState(0);

  // Listening drill states
  const [listenIdx, setListenIdx] = useState(0);
  const [listenInput, setListenInput] = useState('');
  const [listenChecked, setListenChecked] = useState(false);
  const [listenScore, setListenScore] = useState(0);

  // Custom Card Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newIpa, setNewIpa] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [newExample, setNewExample] = useState('');

  const loadDecks = useCallback(async () => {
    const res = await apiJson<ApiVocabDeckDto[]>('/api/v1/practice/decks');
    if (res.ok && res.data.length > 0) {
      setDecks(res.data);
      setSelectedDeckId((prev) =>
        res.data.some((d) => d.id === prev) ? prev : res.data[0].id,
      );
    }
  }, []);

  const loadDeckCards = useCallback(async (deckId: string) => {
    if (!deckId) return;
    if (deckId.startsWith('fallback-')) {
      setCards(FALLBACK_VOCAB_CARDS[deckId] ?? []);
      return;
    }
    const res = await apiJson<{ deck: ApiVocabDeckDto; cards: ApiVocabCardDto[] }>(
      `/api/v1/practice/decks/${deckId}`,
    );
    if (res.ok) {
      setCards(res.data.cards);
    }
  }, []);

  useEffect(() => {
    void loadDecks();
  }, [loadDecks]);

  useEffect(() => {
    void loadDeckCards(selectedDeckId);
    setCardIdx(0);
    setFlipped(false);
    setSrsIdx(0);
    setSrsFlipped(false);
    setSrsCompletedCount(0);
    setQuizIdx(0);
    setQuizCorrect(0);
    setQuizFinished(false);
    setQuizSelected(null);
    setQuizTyped('');
    setMatchedIds([]);
    setMatchMistakes(0);
    setMatchSeconds(0);
    setListenIdx(0);
    setListenInput('');
    setListenChecked(false);
    setListenScore(0);
  }, [selectedDeckId, loadDeckCards]);

  const filteredDecks = useMemo(
    () => (category === 'all' ? decks : decks.filter((d) => d.category === category)),
    [category, decks],
  );

  const activeDeck = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) ?? decks[0],
    [decks, selectedDeckId],
  );

  const studyCards = useMemo(() => {
    const pool = starredOnly ? cards.filter((c) => c.starred) : cards;
    return pool;
  }, [cards, starredOnly]);

  const currentFlashcard = studyCards[cardIdx % Math.max(1, studyCards.length)];

  // Keyboard shortcuts for Flashcard mode (Space = flip, Arrows = prev/next)
  useEffect(() => {
    if (mode !== 'flashcard' || addModalOpen || typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.code === 'ArrowRight' && studyCards.length > 0) {
        setCardIdx((i) => (i + 1) % studyCards.length);
        setFlipped(false);
      } else if (e.code === 'ArrowLeft' && studyCards.length > 0) {
        setCardIdx((i) => (i - 1 + studyCards.length) % studyCards.length);
        setFlipped(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, studyCards.length, addModalOpen]);

  // Hands-free Autoplay in Flashcard mode
  useEffect(() => {
    if (!autoplay || mode !== 'flashcard' || !currentFlashcard) return;
    const flipTimer = setTimeout(() => {
      setFlipped(true);
      playPronunciation(currentFlashcard.term, currentFlashcard.audioUrl);
    }, 1800);
    const nextTimer = setTimeout(() => {
      setFlipped(false);
      setCardIdx((i) => (i + 1) % Math.max(1, studyCards.length));
    }, 4200);
    return () => {
      clearTimeout(flipTimer);
      clearTimeout(nextTimer);
    };
  }, [autoplay, mode, currentFlashcard, studyCards.length, cardIdx]);

  // Match timer
  useEffect(() => {
    if (mode !== 'match' || cards.length < 2) return;
    const pairSlice = cards.slice(0, Math.min(6, cards.length));
    if (matchedIds.length >= pairSlice.length) return;
    const timer = setInterval(() => {
      setMatchSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, cards, matchedIds.length]);

  const handleSyncSessionVocab = async () => {
    setSyncing(true);
    if (getAccessToken()) {
      const res = await apiJson<{ deckId: string; syncedCount: number; totalCards: number }>(
        '/api/v1/practice/sync-session-vocab',
        { method: 'POST' },
      );
      setSyncing(false);
      if (res.ok) {
        await loadDecks();
        setSelectedDeckId(res.data.deckId);
        pushToast({
          tone: 'success',
          title: `Đã đồng bộ ${res.data.syncedCount} mục từ vựng từ buổi học 1-1`,
          description: `Bộ thẻ cá nhân hiện có ${res.data.totalCards} thẻ sẵn sàng ôn SRS.`,
        });
      } else {
        pushToast({ tone: 'danger', title: 'Đồng bộ thất bại', description: res.message });
      }
      return;
    }

    // Demo fallback sync from Classroom quickNotes store
    const syncedCards: ApiVocabCardDto[] = mistakesVocab.map((m, idx) => ({
      id: `demo-sync-${idx}-${m.id}`,
      deckId: 'fallback-deck-session',
      term: m.term,
      ipa: '',
      partOfSpeech: m.kind,
      meaningVi: m.correction,
      contextNote: m.contextNote,
      cefrLevel: 'B1',
      starred: true,
      repetitions: 0,
      intervalDays: 0,
      dueAt: new Date().toISOString(),
      isDue: true,
      intervalPreviews: { again: 'Hôm nay', hard: '1 ngày', good: '1 ngày', easy: '4 ngày' },
    }));
    setSelectedDeckId('fallback-deck-session');
    setCards(syncedCards);
    setSyncing(false);
    pushToast({
      tone: 'success',
      title: `Đã đồng bộ ${syncedCards.length} ghi chú lớp học 1-1 (Demo)`,
    });
  };

  const handleToggleStar = async (card: ApiVocabCardDto) => {
    const nextStarred = !card.starred;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, starred: nextStarred } : c)));
    if (getAccessToken() && !card.id.startsWith('fb-') && !card.id.startsWith('demo-')) {
      await apiJson(`/api/v1/practice/cards/${card.id}/star`, {
        method: 'PATCH',
        body: JSON.stringify({ starred: nextStarred }),
      });
    }
  };

  const srsDueCards = useMemo(() => cards.filter((c) => c.isDue), [cards]);
  const currentSrsCard = srsDueCards[srsIdx];

  const handleSrsRate = async (rating: SrsRatingKey) => {
    if (!currentSrsCard) return;
    if (getAccessToken() && !currentSrsCard.id.startsWith('fb-') && !currentSrsCard.id.startsWith('demo-')) {
      const res = await apiJson<{ nextLabelVi: string; intervalDays: number }>(
        '/api/v1/practice/srs/review',
        {
          method: 'POST',
          body: JSON.stringify({ cardId: currentSrsCard.id, rating }),
        },
      );
      if (res.ok) {
        pushToast({
          tone: 'success',
          title: `Đã hẹn ôn "${currentSrsCard.term}" sau: ${res.data.nextLabelVi}`,
        });
      }
    } else {
      const preview = computeClientSrsPreview(
        currentSrsCard.repetitions,
        currentSrsCard.intervalDays,
        2.5,
        rating,
      );
      pushToast({
        tone: 'success',
        title: `Lịch ôn tiếp theo cho "${currentSrsCard.term}": ${preview.labelVi}`,
      });
    }

    setCards((prev) =>
      prev.map((c) =>
        c.id === currentSrsCard.id ? { ...c, isDue: rating === 'again' } : c,
      ),
    );
    setSrsFlipped(false);
    setSrsCompletedCount((n) => n + 1);
    if (rating !== 'again' && srsIdx >= srsDueCards.length - 1) {
      setSrsIdx(0);
    } else if (rating === 'again') {
      setSrsIdx((i) => (i + 1) % Math.max(1, srsDueCards.length));
    }
  };

  const handleCreateCustomCard = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTerm.trim() || !newMeaning.trim()) return;

    if (getAccessToken()) {
      const res = await apiJson<{ id: string; deckId: string }>(
        '/api/v1/practice/cards',
        {
          method: 'POST',
          body: JSON.stringify({
            term: newTerm.trim(),
            ipa: newIpa.trim() || undefined,
            meaningVi: newMeaning.trim(),
            exampleEn: newExample.trim() || undefined,
          }),
        },
      );
      if (res.ok) {
        await loadDecks();
        setSelectedDeckId(res.data.deckId);
        await loadDeckCards(res.data.deckId);
        pushToast({ tone: 'success', title: `Đã thêm thẻ "${newTerm.trim()}" vào bộ cá nhân` });
      } else {
        pushToast({ tone: 'danger', title: 'Không thể thêm thẻ', description: res.message });
      }
    } else {
      const localCard: ApiVocabCardDto = {
        id: `local-${Date.now()}`,
        deckId: selectedDeckId,
        term: newTerm.trim(),
        ipa: newIpa.trim(),
        partOfSpeech: 'custom',
        meaningVi: newMeaning.trim(),
        exampleEn: newExample.trim() || undefined,
        cefrLevel: 'B1',
        starred: false,
        repetitions: 0,
        intervalDays: 0,
        dueAt: new Date().toISOString(),
        isDue: true,
        intervalPreviews: { again: 'Hôm nay', hard: '1 ngày', good: '1 ngày', easy: '4 ngày' },
      };
      setCards((prev) => [localCard, ...prev]);
      pushToast({ tone: 'success', title: `Đã thêm thẻ "${newTerm.trim()}" (Preview)` });
    }

    setNewTerm('');
    setNewIpa('');
    setNewMeaning('');
    setNewExample('');
    setAddModalOpen(false);
  };

  // Quiz setup for current question
  const currentQuizCard = cards[quizIdx];
  const quizOptions = useMemo(() => {
    if (!currentQuizCard || cards.length < 2) return [];
    const distractors = cards
      .filter((c) => c.id !== currentQuizCard.id)
      .slice(0, 3)
      .map((c) => (quizDirection === 'en_vi' ? c.meaningVi : c.term));
    const answer = quizDirection === 'en_vi' ? currentQuizCard.meaningVi : currentQuizCard.term;
    const all = [answer, ...distractors];
    // Deterministic rotation based on quizIdx so SSR & client stay consistent
    const shift = quizIdx % all.length;
    return [...all.slice(shift), ...all.slice(0, shift)];
  }, [cards, currentQuizCard, quizDirection, quizIdx]);

  const handleSubmitQuizStep = (choiceValue?: string) => {
    if (!currentQuizCard) return;
    const expected = quizDirection === 'en_vi' ? currentQuizCard.meaningVi : currentQuizCard.term;
    const given = choiceValue ?? quizTyped.trim();
    const isRight = given.toLowerCase() === expected.trim().toLowerCase();
    if (choiceValue !== undefined) setQuizSelected(choiceValue);
    if (isRight) setQuizCorrect((c) => c + 1);
  };

  // Match pairs slice
  const matchPairs = useMemo(() => cards.slice(0, Math.min(6, cards.length)), [cards]);
  const shuffledRightMatch = useMemo(() => {
    if (matchPairs.length <= 1) return matchPairs;
    return [...matchPairs.slice(1), matchPairs[0]];
  }, [matchPairs]);

  // Listening live character & word match indicator (inspired by GVocab)
  const currentListenCard = cards[listenIdx];
  const listenLiveStats = useMemo(() => {
    if (!currentListenCard) return { matchedChars: 0, totalChars: 0, exact: false };
    const target = currentListenCard.term.trim().toLowerCase();
    const typed = listenInput.trim().toLowerCase();
    let matchedChars = 0;
    for (let i = 0; i < Math.min(target.length, typed.length); i += 1) {
      if (target[i] === typed[i]) matchedChars += 1;
      else break;
    }
    return {
      matchedChars,
      totalChars: target.length,
      exact: typed === target,
    };
  }, [currentListenCard, listenInput]);

  return (
    <div className="space-y-6">
      {/* Header & 1-1 Sync CTA */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Kho Từ Vựng, Flashcard &amp; SRS</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            Bộ từ vựng mở chuẩn NGSL/AWL kèm phát âm IPA, đồng bộ trực tiếp lỗi sai &amp; từ mới từ buổi học 1-1.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={syncing}
            onClick={() => void handleSyncSessionVocab()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 text-accent', syncing && 'animate-spin')} aria-hidden="true" />
            <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ buổi học 1-1'}</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => setAddModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Thêm thẻ mới</span>
          </Button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setCategory(t.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ui-transition',
              category === t.id
                ? 'bg-accent-soft text-accent border-accent-border font-semibold'
                : 'bg-surface text-ink-secondary border-hairline hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Deck Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredDecks.map((deck) => {
          const isSelected = deck.id === selectedDeckId;
          return (
            <button
              key={deck.id}
              type="button"
              onClick={() => setSelectedDeckId(deck.id)}
              className={cn(
                'text-left p-4 rounded-[var(--radius-lg)] border bg-surface ui-transition cursor-pointer space-y-2',
                isSelected
                  ? 'border-accent ring-2 ring-accent/20'
                  : 'border-hairline hover:border-ink-muted/40',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <Badge tone={deck.category === 'session_notes' ? 'confirmed' : 'neutral'} className="font-mono">
                  {deck.category === 'session_notes' ? '1-1 Notes' : `CEFR ${deck.cefrLevel}`}
                </Badge>
                <span className="font-mono text-xs text-ink-muted">
                  {deck.cardsCount} thẻ · <strong className="text-accent">{deck.dueCount} cần ôn</strong>
                </span>
              </div>
              <h2 className="text-sm font-bold text-ink leading-snug">{deck.titleVi}</h2>
              <p className="text-xs text-ink-secondary line-clamp-2">{deck.description}</p>
              {deck.sourceName && (
                <p className="text-[11px] text-ink-muted font-mono truncate">
                  Nguồn: {deck.sourceName}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Mode Switcher */}
      {activeDeck && (
        <Panel className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-hairline">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
                <h2 className="text-base font-bold text-ink">{activeDeck.titleVi}</h2>
                {activeDeck.sourceUrl && (
                  <a
                    href={activeDeck.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <span>Nguồn mở</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                Chọn 1 trong 5 chế độ luyện tập trên cùng bộ {cards.length} thẻ · Đã đánh dấu{' '}
                {cards.filter((c) => c.starred).length} thẻ khó.
              </p>
            </div>

            <div className="inline-flex flex-wrap p-1 rounded-[var(--radius-md)] bg-subtle border border-hairline gap-1">
              {MODE_TABS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer ui-transition',
                    mode === m.id
                      ? 'bg-surface text-ink border border-hairline font-semibold'
                      : 'text-ink-muted hover:text-ink border border-transparent',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {cards.length === 0 ? (
            <EmptyState
              title="Bộ thẻ chưa có từ vựng"
              hint="Bấm Đồng bộ từ buổi học 1-1 hoặc Thêm thẻ mới để bắt đầu."
            />
          ) : (
            <>
              {/* MODE 1: FLASHCARD */}
              {mode === 'flashcard' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStarredOnly((s) => !s);
                          setCardIdx(0);
                          setFlipped(false);
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] border cursor-pointer',
                          starredOnly
                            ? 'bg-accent-soft text-accent border-accent-border font-semibold'
                            : 'bg-subtle text-ink-secondary border-hairline',
                        )}
                      >
                        <Star className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Chỉ thẻ đánh star ({cards.filter((c) => c.starred).length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMinimalMode((m) => !m)}
                        className={cn(
                          'px-2.5 py-1 rounded-[var(--radius-sm)] border cursor-pointer',
                          minimalMode
                            ? 'bg-accent-soft text-accent border-accent-border font-semibold'
                            : 'bg-subtle text-ink-secondary border-hairline',
                        )}
                      >
                        Chế độ tối giản
                      </button>

                      <button
                        type="button"
                        onClick={() => setAutoplay((a) => !a)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] border cursor-pointer',
                          autoplay
                            ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-hairline font-semibold'
                            : 'bg-subtle text-ink-secondary border-hairline',
                        )}
                      >
                        {autoplay ? (
                          <Square className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Play className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>{autoplay ? 'Dừng tự động phát' : 'Tự động phát'}</span>
                      </button>
                    </div>

                    <span className="font-mono text-ink-muted">
                      Phím tắt: Space (lật) · ←/→ (chuyển thẻ)
                    </span>
                  </div>

                  {!currentFlashcard ? (
                    <EmptyState
                      title="Chưa có thẻ được đánh star"
                      hint="Tắt bộ lọc Chỉ thẻ đánh star hoặc bấm dấu sao trên thẻ cần ghi nhớ."
                      action={
                        <Button variant="secondary" size="sm" onClick={() => setStarredOnly(false)}>
                          Hiện tất cả thẻ
                        </Button>
                      }
                    />
                  ) : (
                    <div className="max-w-2xl mx-auto space-y-4">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setFlipped((f) => !f)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setFlipped((f) => !f);
                        }}
                        className="min-h-[240px] p-6 sm:p-8 rounded-[var(--radius-lg)] bg-subtle/60 border border-hairline flex flex-col justify-between cursor-pointer hover:border-accent/50 ui-transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-ink-muted">
                            {flipped ? 'Mặt sau · Nghĩa & Ngữ cảnh' : 'Mặt trước · Thuật ngữ'} ·{' '}
                            {cardIdx + 1}/{studyCards.length}
                          </span>
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              aria-label="Phát âm từ vựng"
                              onClick={() =>
                                playPronunciation(currentFlashcard.term, currentFlashcard.audioUrl)
                              }
                              className="p-2 rounded-[var(--radius-sm)] bg-surface border border-hairline text-accent hover:bg-hover cursor-pointer"
                            >
                              <Volume2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label="Đánh dấu từ khó"
                              onClick={() => void handleToggleStar(currentFlashcard)}
                              className={cn(
                                'p-2 rounded-[var(--radius-sm)] bg-surface border border-hairline cursor-pointer',
                                currentFlashcard.starred ? 'text-amber-600' : 'text-ink-muted',
                              )}
                            >
                              <Star
                                className={cn('h-4 w-4', currentFlashcard.starred && 'fill-current')}
                                aria-hidden="true"
                              />
                            </button>
                          </div>
                        </div>

                        {!flipped ? (
                          <div className="py-6 text-center space-y-2">
                            <p className="text-3xl font-extrabold text-ink tracking-tight">
                              {currentFlashcard.term}
                            </p>
                            {currentFlashcard.ipa && (
                              <p className="font-mono text-sm text-accent">{currentFlashcard.ipa}</p>
                            )}
                            {!minimalMode && currentFlashcard.partOfSpeech && (
                              <p className="text-xs text-ink-muted uppercase font-mono">
                                {currentFlashcard.partOfSpeech} · CEFR {currentFlashcard.cefrLevel}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="py-4 space-y-3 text-center">
                            <p className="text-xl font-bold text-ink">{currentFlashcard.meaningVi}</p>
                            {!minimalMode && currentFlashcard.definitionEn && (
                              <p className="text-xs text-ink-secondary">{currentFlashcard.definitionEn}</p>
                            )}
                            {!minimalMode && currentFlashcard.exampleEn && (
                              <div className="p-3 rounded-[var(--radius-md)] bg-surface border border-hairline text-xs text-ink-secondary italic">
                                “{currentFlashcard.exampleEn}”
                              </div>
                            )}
                            {!minimalMode && currentFlashcard.contextNote && (
                              <p className="text-xs text-accent font-medium">
                                Ghi chú 1-1: {currentFlashcard.contextNote}
                              </p>
                            )}
                          </div>
                        )}

                        <p className="text-center text-xs text-ink-muted">
                          Bấm vào thẻ hoặc nhấn Space để lật
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setCardIdx((i) => (i - 1 + studyCards.length) % studyCards.length);
                            setFlipped(false);
                          }}
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          <span>Thẻ trước</span>
                        </Button>
                        <span className="font-mono text-xs text-ink-secondary">
                          {cardIdx + 1} / {studyCards.length}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setCardIdx((i) => (i + 1) % studyCards.length);
                            setFlipped(false);
                          }}
                        >
                          <span>Thẻ sau</span>
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODE 2: SRS SPACED REPETITION */}
              {mode === 'srs' && (
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-ink-secondary">
                      Hôm nay còn <strong className="text-accent">{srsDueCards.length}</strong> thẻ cần ôn · Đã hoàn thành phiên này: {srsCompletedCount}
                    </span>
                    <Badge tone="neutral">SM-2 Algorithm</Badge>
                  </div>

                  {!currentSrsCard ? (
                    <EmptyState
                      title="Đã ôn xong toàn bộ thẻ tới hạn!"
                      hint="Thuật toán lặp lại ngắt quãng (SRS) đã lên lịch ôn tiếp vào đúng thời điểm trước khi bạn quên."
                      action={
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setCards((prev) => prev.map((c) => ({ ...c, isDue: true })));
                            setSrsIdx(0);
                            setSrsFlipped(false);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Ôn lại toàn bộ bộ thẻ</span>
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-4">
                      <div className="p-6 rounded-[var(--radius-lg)] bg-subtle/60 border border-hairline space-y-4 text-center">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-ink-muted">
                            Lượt lặp #{currentSrsCard.repetitions} · Khoảng hiện tại:{' '}
                            {currentSrsCard.intervalDays} ngày
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              playPronunciation(currentSrsCard.term, currentSrsCard.audioUrl)
                            }
                            className="p-2 rounded-[var(--radius-sm)] bg-surface border border-hairline text-accent cursor-pointer"
                          >
                            <Volume2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>

                        <p className="text-3xl font-extrabold text-ink">{currentSrsCard.term}</p>
                        {currentSrsCard.ipa && (
                          <p className="font-mono text-sm text-accent">{currentSrsCard.ipa}</p>
                        )}

                        {!srsFlipped ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSrsFlipped(true);
                              playPronunciation(currentSrsCard.term, currentSrsCard.audioUrl);
                            }}
                          >
                            Hiện đáp án
                          </Button>
                        ) : (
                          <div className="pt-4 border-t border-hairline space-y-2">
                            <p className="text-lg font-bold text-ink">{currentSrsCard.meaningVi}</p>
                            {currentSrsCard.exampleEn && (
                              <p className="text-xs text-ink-secondary italic">
                                “{currentSrsCard.exampleEn}”
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {srsFlipped && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {(
                            [
                              { key: 'again', label: 'Quên', hint: currentSrsCard.intervalPreviews.again, tone: 'danger' },
                              { key: 'hard', label: 'Khó', hint: currentSrsCard.intervalPreviews.hard, tone: 'secondary' },
                              { key: 'good', label: 'Được', hint: currentSrsCard.intervalPreviews.good, tone: 'accent' },
                              { key: 'easy', label: 'Dễ', hint: currentSrsCard.intervalPreviews.easy, tone: 'primary' },
                            ] as const
                          ).map((btn) => (
                            <Button
                              key={btn.key}
                              variant={btn.tone}
                              size="sm"
                              className="flex-col h-auto py-2.5 gap-0.5"
                              onClick={() => void handleSrsRate(btn.key)}
                            >
                              <span className="font-bold">{btn.label}</span>
                              <span className="font-mono text-[11px] opacity-85">{btn.hint}</span>
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* MODE 3: QUIZ */}
              {mode === 'quiz' && (
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuizType((t) => (t === 'choice' ? 'typing' : 'choice'))}
                        className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-subtle border border-hairline text-ink-secondary cursor-pointer"
                      >
                        Chế độ: {quizType === 'choice' ? 'Trắc nghiệm 4 đáp án' : 'Tự luận gõ từ'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuizDirection((d) => (d === 'en_vi' ? 'vi_en' : 'en_vi'))}
                        className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-subtle border border-hairline text-ink-secondary cursor-pointer"
                      >
                        Chiều: {quizDirection === 'en_vi' ? 'Anh → Việt' : 'Việt → Anh'}
                      </button>
                    </div>
                    <span className="font-mono text-ink-muted">
                      Câu {Math.min(quizIdx + 1, cards.length)}/{cards.length} · Đúng: {quizCorrect}
                    </span>
                  </div>

                  {quizFinished || !currentQuizCard ? (
                    <div className="p-6 rounded-[var(--radius-lg)] bg-subtle border border-hairline text-center space-y-3">
                      <CheckCircle2 className="h-8 w-8 text-[var(--status-completed-text)] mx-auto" aria-hidden="true" />
                      <h3 className="text-lg font-bold text-ink">
                        Hoàn thành bài kiểm tra: {quizCorrect}/{cards.length} câu đúng
                      </h3>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setQuizIdx(0);
                          setQuizCorrect(0);
                          setQuizFinished(false);
                          setQuizSelected(null);
                          setQuizTyped('');
                          setQuizHintShown(false);
                        }}
                      >
                        Làm lại bài kiểm tra
                      </Button>
                    </div>
                  ) : (
                    <div className="p-5 rounded-[var(--radius-lg)] bg-subtle/60 border border-hairline space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-ink-muted">
                            {quizDirection === 'en_vi' ? 'Chọn nghĩa tiếng Việt đúng cho:' : 'Nhập/chọn từ tiếng Anh cho:'}
                          </p>
                          <p className="text-2xl font-bold text-ink mt-1">
                            {quizDirection === 'en_vi' ? currentQuizCard.term : currentQuizCard.meaningVi}
                          </p>
                          {quizDirection === 'en_vi' && currentQuizCard.ipa && (
                            <p className="font-mono text-xs text-accent mt-0.5">{currentQuizCard.ipa}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setQuizHintShown(true)}
                        >
                          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Gợi ý</span>
                        </Button>
                      </div>

                      {quizHintShown && (
                        <p className="text-xs font-mono text-accent bg-accent-soft/60 px-3 py-1.5 rounded-[var(--radius-sm)]">
                          Gợi ý bắt đầu bằng: “
                          {(quizDirection === 'en_vi'
                            ? currentQuizCard.meaningVi
                            : currentQuizCard.term
                          ).slice(0, 3)}
                          ...”
                        </p>
                      )}

                      {quizType === 'choice' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {quizOptions.map((opt) => {
                            const expected =
                              quizDirection === 'en_vi'
                                ? currentQuizCard.meaningVi
                                : currentQuizCard.term;
                            const isSelected = quizSelected === opt;
                            const isAnswer = opt === expected;
                            return (
                              <button
                                key={opt}
                                type="button"
                                disabled={quizSelected !== null}
                                onClick={() => handleSubmitQuizStep(opt)}
                                className={cn(
                                  'text-left p-3 rounded-[var(--radius-md)] border text-xs font-medium cursor-pointer ui-transition',
                                  quizSelected === null
                                    ? 'bg-surface border-hairline hover:border-accent'
                                    : isAnswer
                                      ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)] border-emerald-400 font-semibold'
                                      : isSelected
                                        ? 'bg-[var(--status-alert-bg)] text-[var(--status-alert-text)] border-red-400'
                                        : 'bg-surface border-hairline opacity-60',
                                )}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={quizTyped}
                            onChange={(e) => setQuizTyped(e.target.value)}
                            placeholder="Nhập đáp án..."
                            className="flex-1 px-3 py-2 rounded-[var(--radius-sm)] border border-hairline bg-surface text-sm text-ink"
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleSubmitQuizStep()}
                          >
                            Kiểm tra
                          </Button>
                        </div>
                      )}

                      {(quizSelected !== null || quizType === 'typing') && (
                        <div className="flex justify-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              if (quizIdx + 1 >= cards.length) {
                                setQuizFinished(true);
                              } else {
                                setQuizIdx((i) => i + 1);
                                setQuizSelected(null);
                                setQuizTyped('');
                                setQuizHintShown(false);
                              }
                            }}
                          >
                            <span>{quizIdx + 1 >= cards.length ? 'Xem kết quả' : 'Câu tiếp theo'}</span>
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* MODE 4: MATCH PAIRS */}
              {mode === 'match' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3 font-mono">
                      <span className="inline-flex items-center gap-1 text-ink">
                        <Clock3 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                        {String(Math.floor(matchSeconds / 60)).padStart(2, '0')}:
                        {String(matchSeconds % 60).padStart(2, '0')}
                      </span>
                      <span className="text-ink-secondary">
                        Đã ghép: {matchedIds.length}/{matchPairs.length}
                      </span>
                      <span className="text-[var(--status-alert-text)]">
                        Sai: {matchMistakes}
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setMatchedIds([]);
                        setMatchMistakes(0);
                        setMatchSeconds(0);
                        setMatchSelectedLeft(null);
                      }}
                    >
                      <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Chơi lại</span>
                    </Button>
                  </div>

                  {matchedIds.length === matchPairs.length ? (
                    <div className="p-6 rounded-[var(--radius-lg)] bg-[var(--status-completed-bg)]/60 border border-hairline text-center space-y-2">
                      <Sparkles className="h-6 w-6 text-[var(--status-completed-text)] mx-auto" aria-hidden="true" />
                      <p className="text-base font-bold text-[var(--status-completed-text)]">
                        Hoàn thành ghép {matchPairs.length} cặp trong {matchSeconds} giây · {matchMistakes} lần sai!
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-ink-muted">1. Chọn từ tiếng Anh</p>
                        {matchPairs.map((c) => {
                          const done = matchedIds.includes(c.id);
                          const active = matchSelectedLeft === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              disabled={done}
                              onClick={() => setMatchSelectedLeft(c.id)}
                              className={cn(
                                'w-full text-left px-3.5 py-2.5 rounded-[var(--radius-md)] border text-sm font-semibold ui-transition cursor-pointer',
                                done
                                  ? 'bg-[var(--status-completed-bg)]/50 text-ink-muted border-hairline line-through opacity-50'
                                  : active
                                    ? 'bg-accent-soft text-accent border-accent'
                                    : 'bg-surface text-ink border-hairline hover:border-accent/50',
                              )}
                            >
                              {c.term}
                            </button>
                          );
                        })}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-ink-muted">2. Chọn nghĩa tương ứng</p>
                        {shuffledRightMatch.map((c) => {
                          const done = matchedIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              disabled={done || !matchSelectedLeft}
                              onClick={() => {
                                if (!matchSelectedLeft) return;
                                if (matchSelectedLeft === c.id) {
                                  setMatchedIds((prev) => [...prev, c.id]);
                                  setMatchSelectedLeft(null);
                                  playPronunciation(c.term, c.audioUrl);
                                } else {
                                  setMatchMistakes((m) => m + 1);
                                  setMatchSelectedLeft(null);
                                }
                              }}
                              className={cn(
                                'w-full text-left px-3.5 py-2.5 rounded-[var(--radius-md)] border text-xs ui-transition cursor-pointer',
                                done
                                  ? 'bg-[var(--status-completed-bg)]/50 text-ink-muted border-hairline opacity-50'
                                  : 'bg-surface text-ink-secondary border-hairline hover:border-accent/50',
                              )}
                            >
                              {c.meaningVi}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODE 5: LISTENING DRILL */}
              {mode === 'listening' && currentListenCard && (
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="flex items-center justify-between text-xs font-mono text-ink-muted">
                    <span>
                      Câu {listenIdx + 1}/{cards.length} · Đúng: {listenScore}
                    </span>
                    <span className="text-accent">
                      Đã khớp {listenLiveStats.matchedChars}/{listenLiveStats.totalChars} ký tự
                    </span>
                  </div>

                  <div className="p-6 rounded-[var(--radius-lg)] bg-subtle/60 border border-hairline space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-ink flex items-center gap-2">
                          <Headphones className="h-4 w-4 text-accent" aria-hidden="true" />
                          <span>Nghe và gõ chính xác từ/cụm từ tiếng Anh</span>
                        </p>
                        <p className="text-xs text-ink-secondary">
                          Nghĩa gợi ý: <strong>{currentListenCard.meaningVi}</strong>
                        </p>
                      </div>
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() =>
                          playPronunciation(currentListenCard.term, currentListenCard.audioUrl)
                        }
                      >
                        <Volume2 className="h-4 w-4" aria-hidden="true" />
                        <span>Phát âm</span>
                      </Button>
                    </div>

                    <input
                      type="text"
                      value={listenInput}
                      onChange={(e) => {
                        setListenInput(e.target.value);
                        setListenChecked(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !listenChecked) {
                          setListenChecked(true);
                          if (listenLiveStats.exact) setListenScore((s) => s + 1);
                        }
                      }}
                      placeholder="Nhập từ bạn nghe được..."
                      className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-hairline bg-surface font-mono text-sm text-ink"
                    />

                    {listenChecked && (
                      <div
                        className={cn(
                          'p-3 rounded-[var(--radius-md)] text-xs space-y-1',
                          listenLiveStats.exact
                            ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]'
                            : 'bg-[var(--status-alert-bg)] text-[var(--status-alert-text)]',
                        )}
                      >
                        <p className="font-bold">
                          {listenLiveStats.exact ? 'Chính xác tuyệt đối!' : 'Chưa khớp hoàn toàn.'}
                        </p>
                        <p className="font-mono">
                          Đáp án đúng: {currentListenCard.term}{' '}
                          {currentListenCard.ipa && `(${currentListenCard.ipa})`}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      {!listenChecked ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setListenChecked(true);
                            if (listenLiveStats.exact) setListenScore((s) => s + 1);
                          }}
                        >
                          Kiểm tra
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setListenIdx((i) => (i + 1) % cards.length);
                            setListenInput('');
                            setListenChecked(false);
                          }}
                        >
                          Câu tiếp theo →
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Panel>
      )}

      {/* Add Custom Vocab Card Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Thêm thẻ từ vựng cá nhân"
        subtitle="Lưu vào bộ thẻ cá nhân để ôn tập bằng Flashcard & SRS"
      >
        <form onSubmit={(e) => void handleCreateCustomCard(e)} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-ink">Từ / Cụm từ tiếng Anh *</label>
            <input
              type="text"
              required
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              placeholder="Ví dụ: mitigate congestion"
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-sm)] border border-hairline bg-surface text-sm text-ink"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink">Phiên âm IPA</label>
            <input
              type="text"
              value={newIpa}
              onChange={(e) => setNewIpa(e.target.value)}
              placeholder="/ˈmɪt.ɪ.ɡeɪt/"
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-sm)] border border-hairline bg-surface font-mono text-sm text-ink"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink">Nghĩa tiếng Việt *</label>
            <input
              type="text"
              required
              value={newMeaning}
              onChange={(e) => setNewMeaning(e.target.value)}
              placeholder="giảm thiểu ùn tắc"
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-sm)] border border-hairline bg-surface text-sm text-ink"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink">Câu ví dụ</label>
            <textarea
              rows={2}
              value={newExample}
              onChange={(e) => setNewExample(e.target.value)}
              placeholder="Metro lines mitigate urban congestion."
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-sm)] border border-hairline bg-surface text-sm text-ink"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAddModalOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Lưu thẻ
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
