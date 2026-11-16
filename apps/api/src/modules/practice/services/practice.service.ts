import { randomUUID } from 'node:crypto';
import type {
  CefrLevel,
  CreateCustomVocabCardInput,
  ImportYoutubeMediaInput,
  ReviewPracticeAttemptInput,
  SrsRating,
  SubmitDictationAttemptInput,
  SubmitShadowingAttemptInput,
  UserRole,
  VocabDeckCategory,
} from '@webenglish/shared';
import { AppError } from '../../../middleware/errorHandler.js';
import { notifyUser } from '../../notifications/services/notification.service.js';
import { SessionReport } from '../../reports/models/sessionReport.model.js';
import { Session } from '../../sessions/models/session.model.js';
import { AuditLog } from '../../settings/models/auditLog.model.js';
import { IpaSymbol } from '../models/ipaSymbol.model.js';
import { PracticeAttempt } from '../models/practiceAttempt.model.js';
import { PracticeMediaLesson } from '../models/practiceMediaLesson.model.js';
import { UserVocabProgress } from '../models/userVocabProgress.model.js';
import { VocabCard } from '../models/vocabCard.model.js';
import { VocabDeck } from '../models/vocabDeck.model.js';
import { evaluateWordSequence } from './speechDiff.helper.js';
import { computeNextSrsState, previewSrsIntervals } from './srs.helper.js';

export async function listDecks(
  query: { category?: VocabDeckCategory; cefrLevel?: CefrLevel },
  actor?: { id: string; role: UserRole },
) {
  const filter: Record<string, unknown> = actor
    ? {
        $or: [{ isSystem: true }, { ownerStudentId: actor.id }],
      }
    : { isSystem: true };

  if (query.category) filter.category = query.category;
  if (query.cefrLevel) filter.cefrLevel = query.cefrLevel;

  const decks = await VocabDeck.find(filter).sort({ isSystem: 1, createdAt: 1 }).lean();

  const dueByDeck = new Map<string, number>();
  const masteredByDeck = new Map<string, number>();
  if (actor) {
    const now = new Date();
    const deckIds = decks.map((d) => d._id);
    const progresses = await UserVocabProgress.find({
      studentId: actor.id,
      deckId: { $in: deckIds },
    }).lean();

    const startedCountByDeck = new Map<string, number>();
    for (const p of progresses) {
      const k = String(p.deckId);
      startedCountByDeck.set(k, (startedCountByDeck.get(k) ?? 0) + 1);
      if (p.dueAt <= now) {
        dueByDeck.set(k, (dueByDeck.get(k) ?? 0) + 1);
      }
      if (p.intervalDays >= 6) {
        masteredByDeck.set(k, (masteredByDeck.get(k) ?? 0) + 1);
      }
    }

    for (const d of decks) {
      const k = String(d._id);
      const unstarted = Math.max(0, d.cardsCount - (startedCountByDeck.get(k) ?? 0));
      dueByDeck.set(k, (dueByDeck.get(k) ?? 0) + unstarted);
    }
  }

  return decks.map((d) => ({
    id: String(d._id),
    slug: d.slug,
    title: d.title,
    titleVi: d.titleVi,
    description: d.description,
    category: d.category,
    cefrLevel: d.cefrLevel,
    goalType: d.goalType,
    isSystem: d.isSystem,
    sourceName: d.sourceName,
    sourceUrl: d.sourceUrl,
    cardsCount: d.cardsCount,
    dueCount: actor ? (dueByDeck.get(String(d._id)) ?? d.cardsCount) : d.cardsCount,
    masteredCount: actor ? (masteredByDeck.get(String(d._id)) ?? 0) : 0,
  }));
}

export async function getDeckWithCards(deckId: string, actor?: { id: string; role: UserRole }) {
  const deck = await VocabDeck.findById(deckId).lean();
  if (!deck) {
    throw new AppError(404, 'NOT_FOUND', 'Vocabulary deck not found');
  }
  if (!deck.isSystem) {
    if (!actor) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    if (actor.role === 'student' && String(deck.ownerStudentId) !== actor.id) {
      throw new AppError(403, 'FORBIDDEN', 'Cannot access another student personal deck');
    }
  }

  const cards = await VocabCard.find({ deckId: deck._id }).sort({ createdAt: 1 }).lean();
  const progressMap = new Map<
    string,
    {
      repetitions: number;
      intervalDays: number;
      easeFactor: number;
      lapses: number;
      dueAt: Date;
      starred: boolean;
      totalReviews: number;
    }
  >();

  if (actor) {
    const progresses = await UserVocabProgress.find({
      studentId: actor.id,
      deckId: deck._id,
    }).lean();
    for (const p of progresses) {
      progressMap.set(String(p.cardId), {
        repetitions: p.repetitions,
        intervalDays: p.intervalDays,
        easeFactor: p.easeFactor,
        lapses: p.lapses,
        dueAt: p.dueAt,
        starred: p.starred,
        totalReviews: p.totalReviews,
      });
    }
  }

  const now = new Date();
  return {
    deck: {
      id: String(deck._id),
      slug: deck.slug,
      title: deck.title,
      titleVi: deck.titleVi,
      description: deck.description,
      category: deck.category,
      cefrLevel: deck.cefrLevel,
      goalType: deck.goalType,
      isSystem: deck.isSystem,
      sourceName: deck.sourceName,
      sourceUrl: deck.sourceUrl,
      cardsCount: cards.length,
    },
    cards: cards.map((c) => {
      const prog = progressMap.get(String(c._id));
      const state = {
        repetitions: prog?.repetitions ?? 0,
        intervalDays: prog?.intervalDays ?? 0,
        easeFactor: prog?.easeFactor ?? 2.5,
        lapses: prog?.lapses ?? 0,
      };
      return {
        id: String(c._id),
        deckId: String(c.deckId),
        term: c.term,
        ipa: c.ipa,
        partOfSpeech: c.partOfSpeech,
        meaningVi: c.meaningVi,
        definitionEn: c.definitionEn,
        exampleEn: c.exampleEn,
        audioUrl: c.audioUrl,
        contextNote: c.contextNote,
        cefrLevel: c.cefrLevel,
        starred: prog?.starred ?? false,
        repetitions: state.repetitions,
        intervalDays: state.intervalDays,
        dueAt: prog?.dueAt ?? now,
        isDue: !prog || prog.dueAt <= now,
        intervalPreviews: previewSrsIntervals(state, now),
      };
    }),
  };
}

export async function getSrsQueue(studentId: string, deckId?: string) {
  const deckFilter: Record<string, unknown> = deckId
    ? { _id: deckId, $or: [{ isSystem: true }, { ownerStudentId: studentId }] }
    : { $or: [{ isSystem: true }, { ownerStudentId: studentId }] };

  const decks = await VocabDeck.find(deckFilter).select('_id').lean();
  const allowedDeckIds = decks.map((d) => d._id);
  if (allowedDeckIds.length === 0) {
    return { dueCount: 0, newCount: 0, items: [] };
  }

  const cards = await VocabCard.find({ deckId: { $in: allowedDeckIds } }).limit(200).lean();
  const progresses = await UserVocabProgress.find({
    studentId,
    deckId: { $in: allowedDeckIds },
  }).lean();
  const progMap = new Map(progresses.map((p) => [String(p.cardId), p]));

  const now = new Date();
  let dueCount = 0;
  let newCount = 0;

  const items = cards
    .filter((c) => {
      const prog = progMap.get(String(c._id));
      if (!prog) {
        newCount += 1;
        return true;
      }
      if (prog.dueAt <= now) {
        dueCount += 1;
        return true;
      }
      return false;
    })
    .slice(0, 30)
    .map((c) => {
      const prog = progMap.get(String(c._id));
      const state = {
        repetitions: prog?.repetitions ?? 0,
        intervalDays: prog?.intervalDays ?? 0,
        easeFactor: prog?.easeFactor ?? 2.5,
        lapses: prog?.lapses ?? 0,
      };
      return {
        id: String(c._id),
        deckId: String(c.deckId),
        term: c.term,
        ipa: c.ipa,
        partOfSpeech: c.partOfSpeech,
        meaningVi: c.meaningVi,
        definitionEn: c.definitionEn,
        exampleEn: c.exampleEn,
        audioUrl: c.audioUrl,
        contextNote: c.contextNote,
        cefrLevel: c.cefrLevel,
        starred: prog?.starred ?? false,
        isNew: !prog,
        intervalPreviews: previewSrsIntervals(state, now),
      };
    });

  return { dueCount, newCount, items };
}

export async function reviewSrsCard(studentId: string, cardId: string, rating: SrsRating) {
  const card = await VocabCard.findById(cardId).lean();
  if (!card) {
    throw new AppError(404, 'NOT_FOUND', 'Vocabulary card not found');
  }
  const deck = await VocabDeck.findById(card.deckId).lean();
  if (!deck || (!deck.isSystem && String(deck.ownerStudentId) !== studentId)) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot review card from inaccessible deck');
  }

  const existing = await UserVocabProgress.findOne({ studentId, cardId });
  const now = new Date();
  const next = computeNextSrsState(
    {
      repetitions: existing?.repetitions ?? 0,
      intervalDays: existing?.intervalDays ?? 0,
      easeFactor: existing?.easeFactor ?? 2.5,
      lapses: existing?.lapses ?? 0,
    },
    rating,
    now,
  );

  const isSuccess = rating === 'good' || rating === 'easy';
  const updated = await UserVocabProgress.findOneAndUpdate(
    { studentId, cardId },
    {
      $set: {
        deckId: card.deckId,
        repetitions: next.repetitions,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
        lapses: next.lapses,
        dueAt: next.dueAt,
        lastReviewedAt: now,
        lastRating: rating,
      },
      $inc: {
        totalReviews: 1,
        correctReviews: isSuccess ? 1 : 0,
      },
    },
    { new: true, upsert: true },
  ).lean();

  return {
    cardId,
    rating,
    intervalDays: updated.intervalDays,
    easeFactor: updated.easeFactor,
    repetitions: updated.repetitions,
    dueAt: updated.dueAt,
    nextLabelVi: next.labelVi,
  };
}

export async function toggleStarCard(studentId: string, cardId: string, starred: boolean) {
  const card = await VocabCard.findById(cardId).lean();
  if (!card) {
    throw new AppError(404, 'NOT_FOUND', 'Vocabulary card not found');
  }
  const deck = await VocabDeck.findById(card.deckId).lean();
  if (!deck || (!deck.isSystem && String(deck.ownerStudentId) !== studentId)) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot modify card from inaccessible deck');
  }

  const updated = await UserVocabProgress.findOneAndUpdate(
    { studentId, cardId },
    {
      $set: { starred, deckId: card.deckId },
      $setOnInsert: { dueAt: new Date() },
    },
    { new: true, upsert: true },
  ).lean();

  return { cardId, starred: updated.starred };
}

async function ensureStudentPersonalDeck(studentId: string) {
  const slug = `session-notes-${studentId}`;
  return VocabDeck.findOneAndUpdate(
    { slug },
    {
      $setOnInsert: {
        slug,
        title: '1-on-1 Session Vocabulary & Corrections',
        titleVi: 'Từ vựng & Lỗi sai từ buổi học 1-1',
        description:
          'Bộ thẻ cá nhân hoá được đồng bộ tự động từ Quick Notes trong phòng học và Báo cáo sau buổi học.',
        category: 'session_notes',
        cefrLevel: 'B1',
        goalType: 'communication',
        isSystem: false,
        ownerStudentId: studentId,
        sourceName: 'WebEnglish 1-1 Live Sessions',
      },
    },
    { new: true, upsert: true },
  );
}

export async function createCustomCard(studentId: string, input: CreateCustomVocabCardInput) {
  let targetDeck = input.deckId ? await VocabDeck.findById(input.deckId) : null;
  if (targetDeck) {
    if (targetDeck.isSystem || String(targetDeck.ownerStudentId) !== studentId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only add cards to your personal deck');
    }
  } else {
    targetDeck = await ensureStudentPersonalDeck(studentId);
  }

  const card = await VocabCard.findOneAndUpdate(
    { deckId: targetDeck._id, term: input.term.trim() },
    {
      $set: {
        ipa: input.ipa ?? '',
        partOfSpeech: input.partOfSpeech ?? 'phrase',
        meaningVi: input.meaningVi.trim(),
        definitionEn: input.definitionEn,
        exampleEn: input.exampleEn,
        contextNote: input.contextNote,
        cefrLevel: input.cefrLevel ?? 'B1',
      },
    },
    { new: true, upsert: true },
  );

  const count = await VocabCard.countDocuments({ deckId: targetDeck._id });
  targetDeck.cardsCount = count;
  await targetDeck.save();

  await UserVocabProgress.findOneAndUpdate(
    { studentId, cardId: card._id },
    { $setOnInsert: { deckId: targetDeck._id, dueAt: new Date() } },
    { upsert: true },
  );

  return {
    id: String(card._id),
    deckId: String(targetDeck._id),
    term: card.term,
    ipa: card.ipa,
    meaningVi: card.meaningVi,
  };
}

export async function syncSessionVocabForStudent(studentId: string) {
  const deck = await ensureStudentPersonalDeck(studentId);
  const [reports, sessions] = await Promise.all([
    SessionReport.find({ studentId }).select('sessionId vocabItems').lean(),
    Session.find({ studentId }).select('_id quickNotes').lean(),
  ]);

  const candidates = new Map<
    string,
    { term: string; meaningVi: string; contextNote?: string; sessionId?: string }
  >();

  for (const r of reports) {
    for (const v of r.vocabItems) {
      if (!v.term?.trim()) continue;
      candidates.set(v.term.trim().toLowerCase(), {
        term: v.term.trim(),
        meaningVi: v.correction.trim(),
        contextNote: v.contextNote,
        sessionId: String(r.sessionId),
      });
    }
  }

  for (const s of sessions) {
    for (const q of s.quickNotes) {
      if (!q.term?.trim()) continue;
      const key = q.term.trim().toLowerCase();
      if (!candidates.has(key)) {
        candidates.set(key, {
          term: q.term.trim(),
          meaningVi: q.correction.trim(),
          contextNote: q.contextNote,
          sessionId: String(s._id),
        });
      }
    }
  }

  let syncedCount = 0;
  for (const item of candidates.values()) {
    const card = await VocabCard.findOneAndUpdate(
      { deckId: deck._id, term: item.term },
      {
        $setOnInsert: {
          deckId: deck._id,
          term: item.term,
          ipa: '',
          partOfSpeech: '1-1 note',
          meaningVi: item.meaningVi,
          contextNote: item.contextNote ?? 'Ghi chú trực tiếp từ buổi học 1-1',
          cefrLevel: 'B1',
          sourceSessionId: item.sessionId,
        },
      },
      { new: true, upsert: true },
    );
    await UserVocabProgress.findOneAndUpdate(
      { studentId, cardId: card._id },
      { $setOnInsert: { deckId: deck._id, dueAt: new Date() } },
      { upsert: true },
    );
    syncedCount += 1;
  }

  const totalCards = await VocabCard.countDocuments({ deckId: deck._id });
  deck.cardsCount = totalCards;
  await deck.save();

  return {
    deckId: String(deck._id),
    syncedCount,
    totalCards,
  };
}

export async function listIpaSymbols() {
  const symbols = await IpaSymbol.find().sort({ number: 1 }).lean();
  return symbols.map((s) => ({
    id: String(s._id),
    number: s.number,
    symbol: s.symbol,
    category: s.category,
    voicing: s.voicing,
    nameVi: s.nameVi,
    articulationTipVi: s.articulationTipVi,
    vietnamesePitfallVi: s.vietnamesePitfallVi,
    spellingPatterns: s.spellingPatterns,
    confusingPairSymbol: s.confusingPairSymbol,
    examples: s.examples,
    sampleSentence: s.sampleSentence,
  }));
}

function extractYoutubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function buildFallbackStudyGuide(
  titleVi: string,
  segments: { index: number; textEn: string; textVi: string; keyPhrase?: string }[],
) {
  const keyPhrases = segments
    .map((s) => s.keyPhrase)
    .filter((k): k is string => Boolean(k))
    .slice(0, 6);
  const firstSeg = segments[0];
  const secondSeg = segments[1] ?? firstSeg;
  return {
    summaryVi: `Bài luyện "${titleVi}" gồm ${segments.length} câu thoại thực tế giúp rèn nghe nối âm (Dictation), phản xạ nói đuổi (Shadowing) và mẫu câu dùng ngay trong buổi học 1-1.`,
    patterns: [
      {
        formula: keyPhrases[0] ?? 'Subject + Verb + Key Phrase',
        meaningVi: firstSeg?.textVi ?? 'Cấu trúc mở đầu giao tiếp tự nhiên',
        exampleEn: firstSeg?.textEn ?? 'Let us practice this sentence together.',
      },
      {
        formula: keyPhrases[1] ?? 'Polite response / follow-up',
        meaningVi: secondSeg?.textVi ?? 'Cách phản hồi lịch sự trong ngữ cảnh',
        exampleEn: secondSeg?.textEn ?? 'Could you clarify that point?',
      },
    ],
    usefulPhrases:
      keyPhrases.length > 0
        ? keyPhrases
        : segments.slice(0, 4).map((s) => s.textEn.split(/\s+/).slice(0, 4).join(' ')),
    mindmapBranches: [
      {
        label: 'Mở đầu & Ngữ cảnh',
        items: segments.slice(0, 2).map((s) => s.textEn),
      },
      {
        label: 'Triển khai ý chính',
        items: segments.slice(2, 4).map((s) => s.textEn),
      },
      {
        label: 'Cụm từ & Phản xạ 1-1',
        items: keyPhrases.length > 0 ? keyPhrases : ['Lặp tốc độ 0.75x → 1.0x', 'Ghi chú nối âm'],
      },
    ],
    quizItems: segments.slice(0, 3).map((s, idx) => {
      const distractors = segments
        .filter((o) => o.index !== s.index)
        .slice(0, 2)
        .map((o) => o.textVi);
      const opts = [s.textVi, ...distractors, 'Câu hỏi mở rộng tự do ngoài bài'];
      const shift = idx % opts.length;
      return {
        id: `q-guide-${idx + 1}`,
        question: `Ý nghĩa chính xác của câu "${s.textEn}" là gì?`,
        options: [...opts.slice(shift), ...opts.slice(0, shift)],
        answer: s.textVi,
      };
    }),
    speakingPromptVi: `Tóm tắt lại tình huống "${titleVi}" bằng 3–4 câu tiếng Anh và dùng ít nhất 2 cụm khóa trong bài để thảo luận với giáo viên ở buổi 1-1 tiếp theo.`,
  };
}

export async function listMediaLessons(
  query: { cefrLevel?: CefrLevel; topic?: string },
  actor?: { id: string; role: UserRole },
) {
  const filter: Record<string, unknown> = actor
    ? { isPublished: true, $or: [{ isSystem: true }, { ownerUserId: actor.id }] }
    : { isPublished: true, isSystem: true };
  if (query.cefrLevel) filter.cefrLevel = query.cefrLevel;
  if (query.topic) filter.topic = query.topic;

  const docs = await PracticeMediaLesson.find(filter).sort({ isSystem: 1, cefrLevel: 1, createdAt: 1 }).lean();
  return docs.map((d) => ({
    id: String(d._id),
    slug: d.slug,
    title: d.title,
    titleVi: d.titleVi,
    topic: d.topic,
    cefrLevel: d.cefrLevel,
    goalType: d.goalType,
    durationSec: d.durationSec,
    mediaType: d.mediaType,
    mediaUrl: d.mediaUrl,
    youtubeId: d.youtubeId,
    sourceName: d.sourceName,
    sourceUrl: d.sourceUrl,
    licenseNote: d.licenseNote,
    isSystem: d.isSystem,
    segments: d.segments,
    studyGuide:
      d.studyGuide && d.studyGuide.summaryVi
        ? d.studyGuide
        : buildFallbackStudyGuide(d.titleVi, d.segments),
  }));
}

export async function importYoutubeMediaLesson(
  actor: { id: string; role: UserRole },
  input: ImportYoutubeMediaInput,
) {
  const youtubeId = extractYoutubeVideoId(input.youtubeUrl);
  if (!youtubeId) {
    throw new AppError(400, 'INVALID_YOUTUBE_URL', 'Link YouTube không hợp lệ (cần dạng youtube.com/watch?v=... hoặc youtu.be/...)');
  }

  const rawLines = (input.transcriptText ?? '')
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3)
    .slice(0, 30);

  const effectiveLines =
    rawLines.length > 0
      ? rawLines
      : [
          'Welcome to this self-study YouTube practice lesson.',
          'Listen carefully and shadow each sentence at natural speed.',
          'Click any unfamiliar word to save it into your SRS flashcards.',
        ];

  const segments = effectiveLines.map((line, index) => ({
    index,
    speaker: 'Video',
    startSec: index * 5,
    endSec: index * 5 + 5,
    textEn: line,
    textVi: rawLines.length > 0 ? `Câu ${index + 1} (Tự nhập từ YouTube)` : 'Câu mẫu khởi động từ YouTube',
  }));

  const slug = `yt-${actor.id.slice(-6)}-${randomUUID().slice(0, 8)}`;
  const created = await PracticeMediaLesson.create({
    slug,
    title: input.title,
    titleVi: input.title,
    topic: input.topic || 'YouTube Tự Học',
    cefrLevel: input.cefrLevel,
    goalType: 'communication',
    durationSec: Math.max(30, segments.length * 5),
    mediaType: 'youtube',
    youtubeId,
    sourceName: 'YouTube (Học viên tự thêm)',
    sourceUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    licenseNote: 'Nhúng video công khai từ YouTube cho luyện tập cá nhân.',
    isSystem: false,
    ownerUserId: actor.id,
    segments,
    studyGuide: buildFallbackStudyGuide(input.title, segments),
    isPublished: true,
  });

  return {
    id: String(created._id),
    slug: created.slug,
    title: created.title,
    titleVi: created.titleVi,
    topic: created.topic,
    cefrLevel: created.cefrLevel,
    goalType: created.goalType,
    durationSec: created.durationSec,
    mediaType: created.mediaType,
    youtubeId: created.youtubeId,
    sourceName: created.sourceName,
    sourceUrl: created.sourceUrl,
    isSystem: created.isSystem,
    segments: created.segments,
    studyGuide: created.studyGuide,
  };
}

export async function lookupDictionaryWord(rawWord: string) {
  const clean = rawWord.replace(/[^a-zA-Z'-]/g, '').trim();
  if (!clean) {
    throw new AppError(400, 'INVALID_WORD', 'Word is required');
  }

  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const localCard = await VocabCard.findOne({
    term: { $regex: `^${escaped}$`, $options: 'i' },
  }).lean();

  let ipa = localCard?.ipa ?? '';
  let partOfSpeech = localCard?.partOfSpeech ?? 'word';
  let definitionEn = localCard?.definitionEn ?? '';
  let exampleEn = localCard?.exampleEn ?? '';
  let audioUsUrl = localCard?.audioUrl ?? '';
  let audioUkUrl = '';

  if (!ipa || !definitionEn) {
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean.toLowerCase())}`,
        { signal: AbortSignal.timeout(2500) },
      );
      if (res.ok) {
        const json = (await res.json()) as Array<{
          phonetic?: string;
          phonetics?: Array<{ text?: string; audio?: string }>;
          meanings?: Array<{
            partOfSpeech?: string;
            definitions?: Array<{ definition?: string; example?: string }>;
          }>;
        }>;
        const first = json[0];
        if (first) {
          ipa = ipa || first.phonetic || first.phonetics?.find((p) => p.text)?.text || '';
          audioUsUrl =
            audioUsUrl ||
            first.phonetics?.find((p) => p.audio?.includes('-us.mp3'))?.audio ||
            first.phonetics?.find((p) => p.audio)?.audio ||
            '';
          audioUkUrl = first.phonetics?.find((p) => p.audio?.includes('-uk.mp3'))?.audio || '';
          partOfSpeech = first.meanings?.[0]?.partOfSpeech || partOfSpeech;
          definitionEn = first.meanings?.[0]?.definitions?.[0]?.definition || definitionEn;
          exampleEn = first.meanings?.[0]?.definitions?.[0]?.example || exampleEn;
        }
      }
    } catch {
      // Offline fallback cleanly preserved
    }
  }

  const encoded = encodeURIComponent(clean.toLowerCase());
  return {
    term: clean,
    ipa,
    partOfSpeech,
    meaningVi: localCard?.meaningVi ?? '',
    definitionEn: definitionEn || `English term "${clean}" captured for active vocabulary review.`,
    exampleEn,
    audioUsUrl: audioUsUrl || undefined,
    audioUkUrl: audioUkUrl || undefined,
    cambridgeUrl: `https://dictionary.cambridge.org/dictionary/english/${encoded}`,
    oxfordUrl: `https://www.oxfordlearnersdictionaries.com/definition/english/${encoded}`,
  };
}

export async function getPracticeStats(studentId: string) {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const start30d = new Date(now.getTime() - 29 * 86_400_000);
  start30d.setUTCHours(0, 0, 0, 0);

  const [progresses, attempts, completedSessions] = await Promise.all([
    UserVocabProgress.find({
      studentId,
      lastReviewedAt: { $gte: start30d },
    })
      .select('lastReviewedAt intervalDays')
      .lean(),
    PracticeAttempt.find({
      studentId,
      createdAt: { $gte: start30d },
    })
      .select('createdAt')
      .lean(),
    Session.find({
      studentId,
      status: 'completed',
      startAt: { $gte: start30d },
    })
      .select('startAt durationMinutes')
      .lean(),
  ]);

  const totalCardsLearned = await UserVocabProgress.countDocuments({
    studentId,
    totalReviews: { $gte: 1 },
  });
  const totalAttempts = await PracticeAttempt.countDocuments({ studentId });

  const dailyBuckets = new Map<string, { count: number; minutes: number }>();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    dailyBuckets.set(d, { count: 0, minutes: 0 });
  }

  for (const p of progresses) {
    if (!p.lastReviewedAt) continue;
    const key = p.lastReviewedAt.toISOString().slice(0, 10);
    const b = dailyBuckets.get(key);
    if (b) {
      b.count += 1;
      b.minutes += 1;
    }
  }
  for (const a of attempts as Array<{ createdAt?: Date }>) {
    if (!a.createdAt) continue;
    const key = a.createdAt.toISOString().slice(0, 10);
    const b = dailyBuckets.get(key);
    if (b) {
      b.count += 1;
      b.minutes += 2;
    }
  }
  for (const s of completedSessions) {
    const key = s.startAt.toISOString().slice(0, 10);
    const b = dailyBuckets.get(key);
    if (b) {
      b.count += 1;
      b.minutes += s.durationMinutes ?? 45;
    }
  }

  const heatmap30Days = Array.from(dailyBuckets.entries()).map(([dateIso, val]) => ({
    dateIso,
    count: val.count,
    minutes: val.minutes,
  }));

  let streakDays = 0;
  for (let i = heatmap30Days.length - 1; i >= 0; i -= 1) {
    if (heatmap30Days[i].count > 0) {
      streakDays += 1;
    } else if (i < heatmap30Days.length - 1) {
      break;
    }
  }

  const todayMinutes = dailyBuckets.get(todayIso)?.minutes ?? 0;

  return {
    streakDays,
    todayMinutes,
    dailyGoalMinutes: 30,
    totalCardsLearned,
    totalAttempts,
    heatmap30Days,
  };
}

export async function submitDictationAttempt(
  studentId: string,
  input: SubmitDictationAttemptInput,
) {
  const lesson = await PracticeMediaLesson.findById(input.lessonId).lean();
  if (!lesson || !lesson.isPublished) {
    throw new AppError(404, 'NOT_FOUND', 'Practice media lesson not found');
  }
  if (!lesson.isSystem && String(lesson.ownerUserId) !== studentId) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot submit to another student private video lesson');
  }
  if (!lesson.isSystem && String(lesson.ownerUserId) !== studentId) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot submit to another student private video lesson');
  }
  const seg = lesson.segments.find((s) => s.index === input.segmentIndex);
  if (!seg) {
    throw new AppError(404, 'NOT_FOUND', 'Segment not found in lesson');
  }

  const evalRes = evaluateWordSequence(seg.textEn, input.typedText);
  const created = await PracticeAttempt.create({
    studentId,
    lessonId: lesson._id,
    segmentIndex: input.segmentIndex,
    mode: 'dictation',
    typedText: input.typedText,
    autoScore: evalRes.autoScore,
    accuracyPct: evalRes.accuracyPct,
    completenessPct: evalRes.completenessPct,
    wordDiffs: evalRes.wordDiffs,
    proposedStatus: 'approved',
  });

  return {
    id: String(created._id),
    mode: created.mode,
    segmentIndex: created.segmentIndex,
    expectedText: seg.textEn,
    ...evalRes,
    proposedStatus: created.proposedStatus,
  };
}

export async function submitShadowingAttempt(
  studentId: string,
  input: SubmitShadowingAttemptInput,
) {
  const lesson = await PracticeMediaLesson.findById(input.lessonId).lean();
  if (!lesson || !lesson.isPublished) {
    throw new AppError(404, 'NOT_FOUND', 'Practice media lesson not found');
  }
  if (!lesson.isSystem && String(lesson.ownerUserId) !== studentId) {
    throw new AppError(403, 'FORBIDDEN', 'Cannot submit to another student private video lesson');
  }
  const seg = lesson.segments.find((s) => s.index === input.segmentIndex);
  if (!seg) {
    throw new AppError(404, 'NOT_FOUND', 'Segment not found in lesson');
  }

  const evalRes = evaluateWordSequence(seg.textEn, input.spokenTranscript, input.durationSec);
  const created = await PracticeAttempt.create({
    studentId,
    lessonId: lesson._id,
    segmentIndex: input.segmentIndex,
    mode: 'shadowing',
    spokenTranscript: input.spokenTranscript,
    audioUrl: input.audioUrl,
    autoScore: evalRes.autoScore,
    accuracyPct: evalRes.accuracyPct,
    fluencyPct: evalRes.fluencyPct,
    completenessPct: evalRes.completenessPct,
    wordDiffs: evalRes.wordDiffs,
    // Human-in-the-loop: Shadowing scores remain proposed until teacher review
    proposedStatus: 'proposed',
  });

  return {
    id: String(created._id),
    mode: created.mode,
    segmentIndex: created.segmentIndex,
    expectedText: seg.textEn,
    ...evalRes,
    proposedStatus: created.proposedStatus,
  };
}

export async function listAttemptsForActor(
  actor: { id: string; role: UserRole },
  query: { studentId?: string; lessonId?: string; proposedStatus?: string },
) {
  const filter: Record<string, unknown> = {};
  if (actor.role === 'student') {
    filter.studentId = actor.id;
  } else if (actor.role === 'teacher') {
    if (query.studentId) {
      filter.studentId = query.studentId;
    } else {
      const taughtIds = await Session.distinct('studentId', { teacherId: actor.id });
      filter.studentId = { $in: taughtIds };
    }
  } else if (query.studentId) {
    filter.studentId = query.studentId;
  }

  if (query.lessonId) filter.lessonId = query.lessonId;
  if (query.proposedStatus) filter.proposedStatus = query.proposedStatus;

  const docs = await PracticeAttempt.find(filter)
    .populate('lessonId', 'title titleVi cefrLevel')
    .populate('studentId', 'fullName email')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return docs.map((d) => {
    const lessonObj = d.lessonId as unknown as {
      _id?: unknown;
      title?: string;
      titleVi?: string;
      cefrLevel?: string;
    };
    const studentObj = d.studentId as unknown as {
      _id?: unknown;
      fullName?: string;
      email?: string;
    };
    return {
      id: String(d._id),
      studentId: String(studentObj?._id ?? d.studentId),
      studentName: studentObj?.fullName,
      lessonId: String(lessonObj?._id ?? d.lessonId),
      lessonTitle: lessonObj?.titleVi ?? lessonObj?.title,
      segmentIndex: d.segmentIndex,
      mode: d.mode,
      typedText: d.typedText,
      spokenTranscript: d.spokenTranscript,
      autoScore: d.autoScore,
      accuracyPct: d.accuracyPct,
      fluencyPct: d.fluencyPct,
      completenessPct: d.completenessPct,
      wordDiffs: d.wordDiffs,
      proposedStatus: d.proposedStatus,
      teacherFeedback: d.teacherFeedback,
      verifiedScore: d.verifiedScore,
      reviewedAt: d.reviewedAt,
    };
  });
}

export async function reviewPracticeAttempt(
  attemptId: string,
  input: ReviewPracticeAttemptInput,
  actor: { id: string; role: UserRole; ip?: string },
) {
  if (actor.role === 'student') {
    throw new AppError(403, 'FORBIDDEN', 'Students cannot self-approve shadowing attempts');
  }

  const attempt = await PracticeAttempt.findById(attemptId);
  if (!attempt) {
    throw new AppError(404, 'NOT_FOUND', 'Practice attempt not found');
  }

  if (actor.role === 'teacher') {
    const teaches = await Session.exists({
      teacherId: actor.id,
      studentId: attempt.studentId,
    });
    if (!teaches) {
      throw new AppError(403, 'FORBIDDEN', 'You can only review attempts of your assigned students');
    }
  }

  attempt.proposedStatus = input.decision;
  if (input.teacherFeedback !== undefined) attempt.teacherFeedback = input.teacherFeedback;
  if (input.verifiedScore !== undefined) attempt.verifiedScore = input.verifiedScore;
  attempt.reviewedBy = actor.id as unknown as typeof attempt.reviewedBy;
  attempt.reviewedAt = new Date();
  await attempt.save();

  await AuditLog.create({
    actorId: actor.id,
    action: `practice_attempt.${input.decision}`,
    entity: 'PracticeAttempt',
    entityId: String(attempt._id),
    after: {
      proposedStatus: attempt.proposedStatus,
      verifiedScore: attempt.verifiedScore,
    },
    ip: actor.ip,
  });

  await notifyUser({
    userId: String(attempt.studentId),
    type: 'system',
    title:
      input.decision === 'approved'
        ? 'Giáo viên đã xác nhận bài Shadowing của bạn'
        : 'Giáo viên gợi ý luyện lại câu Shadowing',
    body: input.teacherFeedback ?? `Điểm xác nhận: ${attempt.verifiedScore ?? attempt.autoScore}/100.`,
    dedupeKey: `practice_review:${String(attempt._id)}:${input.decision}`,
    referenceType: 'PracticeAttempt',
    referenceId: String(attempt._id),
  });

  return {
    id: String(attempt._id),
    proposedStatus: attempt.proposedStatus,
    verifiedScore: attempt.verifiedScore,
    teacherFeedback: attempt.teacherFeedback,
    reviewedAt: attempt.reviewedAt,
  };
}
