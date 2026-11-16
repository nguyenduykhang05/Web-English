import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import {
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  ExternalLink,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Plus,
  Send,
  Video,
  VideoOff,
} from 'lucide-react';
import { CURATED_LESSONS } from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  type ApiSessionDto,
} from '@/lib/apiClient';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import type { MistakeVocabEntry } from '@/types/domain';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';

type DeckTab = 'plan' | 'notes' | 'vocab' | 'chat';

export default function ClassroomPage() {
  const { sessionId } = useParams();
  const { lang, pushToast } = useUIStore();
  const {
    sessions,
    sharedNotes,
    updateSharedNotes,
    mistakesVocab,
    addMistakeVocab,
  } = usePlatformStore();

  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0];

  const isLiveObjectId = typeof sessionId === 'string' && /^[a-f0-9]{24}$/i.test(sessionId);
  const socketRef = useRef<Socket | null>(null);
  const [liveSession, setLiveSession] = useState<ApiSessionDto | null>(null);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const [liveQuickNotes, setLiveQuickNotes] = useState<MistakeVocabEntry[] | null>(null);
  const [liveSharedNotes, setLiveSharedNotes] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const [providerMode, setProviderMode] = useState<'jitsi' | 'manual_link'>(
    session.meetingProvider,
  );
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [activeTab, setActiveTab] = useState<DeckTab>('vocab');

  const [kind, setKind] = useState<MistakeVocabEntry['kind']>('vocab');
  const [term, setTerm] = useState('');
  const [correction, setCorrection] = useState('');
  const [contextNote, setContextNote] = useState('');

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 'c1',
      sender: 'Ms. Sarah Jenkins',
      time: '19:31',
      text: 'Hi Minh Anh! Today we will focus on IELTS Speaking Part 3 contrast structures.',
    },
    {
      id: 'c2',
      sender: 'Nguyễn Minh Anh',
      time: '19:32',
      text: 'Yes, I prepared three urban sustainability examples from yesterday.',
    },
  ]);

  useEffect(() => {
    const token = getAccessToken();
    if (!isLiveObjectId || !sessionId || !token) return;

    let cancelled = false;

    const initLiveClassroom = async () => {
      const sesRes = await apiJson<ApiSessionDto>(`/api/v1/sessions/${sessionId}`);
      if (!cancelled && sesRes.ok) {
        setLiveSession(sesRes.data);
        setProviderMode(sesRes.data.meetingProvider);
        setLiveSharedNotes(sesRes.data.sharedNotes);
        setLiveQuickNotes(
          sesRes.data.quickNotes.map((q) => ({
            id: q.id,
            kind: q.kind,
            term: q.term,
            correction: q.correction,
            contextNote: q.contextNote ?? '',
          })),
        );
        if (sesRes.data.chatMessages && sesRes.data.chatMessages.length > 0) {
          setMessages(
            sesRes.data.chatMessages.map((m) => ({
              id: m.id,
              sender: m.senderName,
              time: m.sentAt.slice(11, 16),
              text: m.text,
            })),
          );
        }
      }

      const socket = io('/', {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('classroom:join', { sessionId }, (ack: { ok?: boolean; message?: string }) => {
          if (cancelled) return;
          if (ack?.ok) {
            setSocketConnected(true);
            setClassroomError(null);
          } else {
            setClassroomError(ack?.message ?? 'Phòng học chưa mở hoặc bạn không thuộc lớp này.');
          }
        });
      });

      socket.on('classroom:notes:updated', (evt: { sharedNotes: string }) => {
        if (!cancelled) setLiveSharedNotes(evt.sharedNotes);
      });

      socket.on(
        'classroom:quick-note:added',
        (evt: { note: { id: string; kind: MistakeVocabEntry['kind']; term: string; correction: string; contextNote?: string } }) => {
          if (cancelled) return;
          setLiveQuickNotes((prev) => [
            {
              id: evt.note.id,
              kind: evt.note.kind,
              term: evt.note.term,
              correction: evt.note.correction,
              contextNote: evt.note.contextNote ?? '',
            },
            ...(prev ?? []),
          ]);
        },
      );

      socket.on(
        'classroom:chat:message',
        (evt: { message: { id: string; senderName: string; sentAt: string; text: string } }) => {
          if (cancelled) return;
          setMessages((prev) => [
            ...prev,
            {
              id: evt.message.id,
              sender: evt.message.senderName,
              time: String(evt.message.sentAt).slice(11, 16),
              text: evt.message.text,
            },
          ]);
        },
      );
    };

    void initLiveClassroom();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [isLiveObjectId, sessionId]);

  const activeTitle = liveSession?.title ?? session.title;
  const activeRoomCode = liveSession?.roomCode ?? session.roomCode;
  const activeJoinUrl = liveSession?.joinUrl ?? `https://meet.google.com/we-${session.id}`;
  const displayedQuickNotes = liveQuickNotes ?? mistakesVocab;
  const displayedSharedNotes = liveSharedNotes ?? sharedNotes;

  const handleAddEntry = async (e: FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !correction.trim()) return;

    if (liveSession && sessionId) {
      const notePayload = {
        sessionId,
        kind,
        term: term.trim(),
        correction: correction.trim(),
        contextNote: contextNote.trim() || 'Ghi chú trực tiếp trong buổi học 1-1',
      };
      if (socketRef.current?.connected) {
        socketRef.current.emit('classroom:quick-note:add', notePayload);
      } else {
        await apiJson(`/api/v1/sessions/${sessionId}/quick-notes`, {
          method: 'POST',
          body: JSON.stringify(notePayload),
        });
      }
    } else {
      addMistakeVocab({
        kind,
        term: term.trim(),
        correction: correction.trim(),
        contextNote: contextNote.trim() || 'Ghi chú trực tiếp trong buổi học 1-1',
      });
    }

    setTerm('');
    setCorrection('');
    setContextNote('');
    pushToast({
      tone: 'success',
      title: lang === 'vi' ? 'Đã lưu vào thẻ buổi học' : 'Captured to lesson log',
      description:
        lang === 'vi'
          ? 'Tự động đồng bộ qua Socket.IO & Sổ ghi chú buổi học.'
          : 'Synced via Socket.IO & session log.',
    });
  };

  const handleSharedNotesChange = (nextText: string) => {
    if (liveSession && sessionId) {
      setLiveSharedNotes(nextText);
      if (socketRef.current?.connected) {
        socketRef.current.emit('classroom:notes:update', { sessionId, content: nextText });
      }
    } else {
      updateSharedNotes(nextText);
    }
  };

  const handleSendChat = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    if (liveSession && sessionId && socketRef.current?.connected) {
      socketRef.current.emit('classroom:chat:send', { sessionId, text: chatInput.trim() });
      setChatInput('');
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        sender: 'Bạn',
        time: '19:45',
        text: chatInput.trim(),
      },
    ]);
    setChatInput('');
  };

  const handleCompleteLiveSession = async () => {
    if (!liveSession || !sessionId) return;
    const res = await apiJson<{ status: string }>(`/api/v1/sessions/${sessionId}/end`, {
      method: 'POST',
    });
    if (res.ok) {
      setLiveSession((prev) => (prev ? { ...prev, status: 'completed', isActive: false } : prev));
      pushToast({
        tone: 'success',
        title: 'Đã hoàn tất buổi học (completed)',
      });
    } else {
      pushToast({
        tone: 'danger',
        title: 'Không thể kết thúc buổi học',
        description: res.message,
      });
    }
  };

  return (
    <div className="min-h-dvh bg-canvas text-ink flex flex-col">
      {/* Top Classroom Header */}
      <header className="h-14 border-b border-hairline bg-surface px-4 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/student"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-secondary hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>{lang === 'vi' ? 'Thoát phòng' : 'Leave room'}</span>
          </Link>
          <span className="h-4 w-px bg-hairline" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-ink truncate">{activeTitle}</p>
            <p className="text-xs font-mono text-ink-muted truncate">
              {session.teacherName} ↔ {session.studentName} · {activeRoomCode}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:inline-flex p-0.5 rounded-[var(--radius-sm)] bg-subtle border border-hairline text-xs">
            <button
              type="button"
              onClick={() => setProviderMode('jitsi')}
              className={`px-2 py-0.5 rounded cursor-pointer ${
                providerMode === 'jitsi' ? 'bg-surface font-semibold text-ink' : 'text-ink-muted'
              }`}
            >
              Jitsi Embedded
            </button>
            <button
              type="button"
              onClick={() => setProviderMode('manual_link')}
              className={`px-2 py-0.5 rounded cursor-pointer ${
                providerMode === 'manual_link'
                  ? 'bg-surface font-semibold text-ink'
                  : 'text-ink-muted'
              }`}
            >
              Meet/Zoom Fallback
            </button>
          </div>

          <Badge tone={socketConnected ? 'completed' : 'confirmed'} className="font-mono">
            {socketConnected ? 'Realtime Live' : '38:12 / 50:00'}
          </Badge>
        </div>
      </header>

      {classroomError && (
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-5 pt-3">
          <div className="p-3 rounded-[var(--radius-md)] border border-[var(--status-alert-border)] bg-[var(--status-alert-bg)] text-xs text-[var(--status-alert-text)]">
            {classroomError}
          </div>
        </div>
      )}

      {/* Split Workspace */}
      <div className="flex-1 mx-auto w-full max-w-7xl p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)] gap-4 items-stretch">
        {/* Left: Video Stage */}
        <Panel padded={false} className="overflow-hidden flex flex-col bg-[#141517] text-[#F2F1EC] border-hairline-strong">
          <div className="flex-1 min-h-[320px] sm:min-h-[440px] p-5 flex flex-col justify-between relative">
            <div className="flex items-center justify-between gap-2">
              <span className="px-2.5 py-1 rounded-[var(--radius-full)] bg-white/10 text-xs font-mono">
                MeetingProvider: {providerMode}
              </span>
              <span className="px-2.5 py-1 rounded-[var(--radius-full)] bg-emerald-500/20 text-emerald-300 text-xs font-medium">
                ● Kết nối ổn định · 24ms
              </span>
            </div>

            {providerMode === 'jitsi' ? (
              <div className="my-auto flex flex-col items-center justify-center text-center py-8 space-y-4">
                <div className="h-20 w-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center font-mono text-2xl font-bold">
                  SJ
                </div>
                <div>
                  <p className="text-base font-bold">{session.teacherName}</p>
                  <p className="text-xs text-white/70 mt-0.5">
                    Phòng Jitsi iFrame API ({activeRoomCode}) · Sẵn sàng tương tác 1-1
                  </p>
                </div>

                {/* Self PIP */}
                <div className="px-3.5 py-2 rounded-[var(--radius-md)] bg-white/10 border border-white/15 text-xs flex items-center gap-2">
                  <span className="font-mono font-bold">MA</span>
                  <span>
                    {camOn ? 'Camera đang bật' : 'Camera đang tắt'} ·{' '}
                    {micOn ? 'Mic hoạt động' : 'Đang tắt mic'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="my-auto max-w-md mx-auto p-5 rounded-[var(--radius-lg)] bg-white/10 border border-white/15 text-center space-y-3">
                <p className="text-sm font-bold">Chế độ dự phòng: Manual Meet/Zoom Link</p>
                <p className="text-xs text-white/75">
                  Khi giáo viên chọn liên kết ngoài (Google Meet / Zoom), học viên mở lớp tại tab riêng nhưng vẫn giữ toàn bộ Ghi chú &amp; Từ vựng ở khung bên phải.
                </p>
                <div className="font-mono text-xs px-3 py-2 rounded bg-black/30 truncate">
                  {activeJoinUrl}
                </div>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() =>
                    pushToast({
                      tone: 'neutral',
                      title: 'Đã mở mô phỏng liên kết Google Meet',
                    })
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Mở phòng họp ngoài</span>
                </Button>
              </div>
            )}

            {/* Video Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/10">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMicOn((v) => !v)}
                  aria-label={micOn ? 'Tắt micro' : 'Bật micro'}
                  className={`h-9 px-3 rounded-[var(--radius-md)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer ui-transition ${
                    micOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500/80 text-white'
                  }`}
                >
                  {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  <span>{micOn ? 'Mic' : 'Muted'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCamOn((v) => !v)}
                  aria-label={camOn ? 'Tắt camera' : 'Bật camera'}
                  className={`h-9 px-3 rounded-[var(--radius-md)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer ui-transition ${
                    camOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500/80 text-white'
                  }`}
                >
                  {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  <span>{camOn ? 'Cam' : 'Cam Off'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    pushToast({
                      tone: 'neutral',
                      title: 'Sẵn sàng chia sẻ màn hình giáo trình',
                    })
                  }
                  className="h-9 px-3 rounded-[var(--radius-md)] bg-white/15 hover:bg-white/25 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <MonitorUp className="h-4 w-4" />
                  <span>Share</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {liveSession && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={liveSession.status === 'completed'}
                    onClick={() => void handleCompleteLiveSession()}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>
                      {liveSession.status === 'completed'
                        ? 'Buổi học đã hoàn tất'
                        : 'Kết thúc buổi học'}
                    </span>
                  </Button>
                )}
                <Link to="/teacher/reports">
                  <Button variant="secondary" size="sm">
                    {lang === 'vi' ? 'Chuyển sang Báo cáo giáo viên →' : 'Open Teacher Report →'}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Panel>

        {/* Right: Tabbed Study & Capture Deck */}
        <Panel padded={false} className="flex flex-col overflow-hidden">
          <div className="flex border-b border-hairline bg-rail px-2 py-1.5 gap-1 overflow-x-auto">
            {(
              [
                { id: 'vocab', label: 'Lỗi & Từ vựng' },
                { id: 'notes', label: 'Ghi chú chung' },
                { id: 'plan', label: 'Mục tiêu buổi' },
                { id: 'chat', label: 'Chat' },
              ] as const
            ).map((tItem) => (
              <button
                key={tItem.id}
                type="button"
                onClick={() => setActiveTab(tItem.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-sm)] whitespace-nowrap cursor-pointer ui-transition ${
                  activeTab === tItem.id
                    ? 'bg-surface text-ink border border-hairline'
                    : 'text-ink-muted hover:text-ink border border-transparent'
                }`}
              >
                {tItem.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {activeTab === 'vocab' && (
              <>
                <form onSubmit={handleAddEntry} className="p-3 rounded-[var(--radius-md)] bg-subtle space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-ink">Gắn thẻ nhanh trong buổi học</span>
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as MistakeVocabEntry['kind'])}
                      aria-label="Loại thẻ"
                      className="h-7 px-2 rounded bg-surface border border-hairline text-xs text-ink"
                    >
                      <option value="vocab">Từ vựng mới</option>
                      <option value="grammar">Lỗi ngữ pháp</option>
                      <option value="pronunciation">Lỗi phát âm</option>
                    </select>
                  </div>

                  <input
                    type="text"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Cụm từ / Lỗi học viên vừa nói..."
                    className="w-full h-8 px-2.5 rounded bg-surface border border-hairline text-xs text-ink"
                  />
                  <input
                    type="text"
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                    placeholder="Nghĩa chuẩn / Cách sửa đúng..."
                    className="w-full h-8 px-2.5 rounded bg-surface border border-hairline text-xs text-ink"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={contextNote}
                      onChange={(e) => setContextNote(e.target.value)}
                      placeholder="Câu ví dụ ngữ cảnh (tuỳ chọn)"
                      className="flex-1 h-8 px-2.5 rounded bg-surface border border-hairline text-xs text-ink"
                    />
                    <Button type="submit" variant="primary" size="sm">
                      <Plus className="h-3.5 w-3.5" />
                      <span>Lưu</span>
                    </Button>
                  </div>
                </form>

                <div className="divide-y divide-hairline">
                  {displayedQuickNotes.map((entry) => (
                    <div key={entry.id} className="py-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-ink">{entry.term}</span>
                        <Badge
                          tone={
                            entry.kind === 'vocab'
                              ? 'confirmed'
                              : entry.kind === 'grammar'
                                ? 'proposed'
                                : 'alert'
                          }
                        >
                          {entry.kind}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium text-[var(--status-completed-text)]">
                        → {entry.correction}
                      </p>
                      <p className="text-xs text-ink-muted">{entry.contextNote}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-2 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">
                    Ghi chú đồng bộ thời gian thực (Socket.IO ready)
                  </span>
                  <span className="text-xs font-mono text-ink-muted">Đã đồng bộ</span>
                </div>
                <textarea
                  rows={12}
                  value={displayedSharedNotes}
                  onChange={(e) => handleSharedNotesChange(e.target.value)}
                  className="w-full flex-1 p-3 rounded-[var(--radius-md)] bg-subtle border border-hairline text-xs font-sans text-ink leading-relaxed"
                />
              </div>
            )}

            {activeTab === 'plan' && (
              <div className="space-y-4 text-xs">
                <p className="font-bold text-ink text-sm">{session.milestoneTitle}</p>
                <div className="space-y-2">
                  {[
                    'Khởi động 5 phút: Review 3 lỗi âm cuối buổi #06',
                    'Thực hành 20 phút: IELTS Speaking Part 3 Topic Environment',
                    'Sửa trực tiếp 15 phút: Nâng cấp từ vựng Band 5.5 → 7.0',
                    'Chốt 10 phút: Giao bài tập ghi âm 2 phút',
                  ].map((step) => (
                    <div
                      key={step}
                      className="p-2.5 rounded-[var(--radius-sm)] bg-subtle flex items-center gap-2 text-ink-secondary"
                    >
                      <CheckSquare className="h-3.5 w-3.5 text-accent shrink-0" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-hairline space-y-2">
                  <p className="font-semibold text-ink">
                    Tài liệu thảo luận đính kèm ({CURATED_LESSONS[2].cefr})
                  </p>
                  <div className="p-3 rounded-[var(--radius-md)] bg-subtle space-y-1.5">
                    <p className="font-bold text-ink">{CURATED_LESSONS[2].title}</p>
                    <p className="text-ink-secondary">{CURATED_LESSONS[2].summary}</p>
                    <p className="text-ink-muted">{CURATED_LESSONS[2].discussionPrompt}</p>
                    <a
                      href={CURATED_LESSONS[2].sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      <span>Nguồn: {CURATED_LESSONS[2].sourceName}</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex flex-col h-full justify-between gap-3">
                <div className="space-y-2.5">
                  {messages.map((m) => (
                    <div key={m.id} className="p-2.5 rounded-[var(--radius-md)] bg-subtle text-xs">
                      <div className="flex items-center justify-between text-xs text-ink-muted">
                        <span className="font-semibold text-ink">{m.sender}</span>
                        <span className="font-mono">{m.time}</span>
                      </div>
                      <p className="mt-1 text-ink-secondary">{m.text}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendChat} className="flex gap-2 pt-2 border-t border-hairline">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Nhắn tin trong lớp học..."
                    className="flex-1 h-9 px-3 rounded-[var(--radius-md)] bg-surface border border-hairline text-xs text-ink"
                  />
                  <Button type="submit" variant="primary" size="sm" aria-label="Gửi tin nhắn">
                    <Send className="h-3.5 w-3.5" />
                    <MessageSquare className="sr-only" />
                  </Button>
                </form>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
