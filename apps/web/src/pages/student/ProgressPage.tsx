import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  SAMPLE_STUDENT,
  STUDENT_TARGET_SKILLS,
  WEEKLY_PROGRESS_SERIES,
} from '@/data/mockPlatformData';
import {
  apiJson,
  getAccessToken,
  type ApiStudentProgressDto,
} from '@/lib/apiClient';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useUIStore } from '@/stores/useUIStore';
import type { SkillRatings } from '@/types/domain';
import { Badge } from '@/components/ui/Badge';
import { Panel } from '@/components/ui/Panel';
import { SkillRadar } from '@/components/ui/SkillRadar';

function toBandScale(scores: ApiStudentProgressDto['skillScores']): SkillRatings {
  const scale = (v: number) => Number(((v / 100) * 9).toFixed(1));
  return {
    listening: scale(scores.listening),
    speaking: scale(scores.speaking),
    reading: scale(scores.reading),
    writing: scale(scores.writing),
    vocabulary: scale(scores.vocabulary),
    grammar: scale(scores.grammar),
    pronunciation: scale(scores.pronunciation),
  };
}

export default function ProgressPage() {
  const lang = useUIStore((s) => s.lang);
  const { skills, mistakesVocab } = usePlatformStore();
  const [liveProgress, setLiveProgress] = useState<ApiStudentProgressDto | null>(null);

  useEffect(() => {
    const loadProgress = async () => {
      if (!getAccessToken()) return;
      const res = await apiJson<ApiStudentProgressDto>('/api/v1/reports/students/me/progress');
      if (res.ok) setLiveProgress(res.data);
    };
    void loadProgress();
  }, []);

  const displayedSkills = liveProgress ? toBandScale(liveProgress.skillScores) : skills;
  const displayedCefr = liveProgress?.currentCefr ?? SAMPLE_STUDENT.currentCefr;
  const trajectoryData =
    liveProgress && liveProgress.snapshots.length > 0
      ? liveProgress.snapshots.map((sp, idx) => ({
          month: `${idx + 1}. ${sp.capturedAt.slice(5, 10)}`,
          overall: Number(((sp.overallScore / 100) * 9).toFixed(1)),
          speaking: displayedSkills.speaking,
          writing: displayedSkills.writing,
        }))
      : WEEKLY_PROGRESS_SERIES;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">
          {lang === 'vi' ? 'Hồ sơ năng lực & Tiến bộ 7 kỹ năng' : '7-Skill Profile & Growth'}
        </h1>
        <p className="text-sm text-ink-secondary mt-0.5">
          {SAMPLE_STUDENT.name} · Trình độ{' '}
          <span className="font-mono font-bold text-ink">{displayedCefr}</span> (
          <span className="font-mono font-bold text-ink">{SAMPLE_STUDENT.currentBand}</span>) / Mục
          tiêu <span className="font-mono font-bold text-accent">{SAMPLE_STUDENT.targetBand}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel>
          <h2 className="text-base font-bold text-ink mb-1">
            {lang === 'vi' ? 'Biểu đồ 7 kỹ năng hiện tại vs Mục tiêu' : 'Current vs Target 7 Skills'}
          </h2>
          <p className="text-xs text-ink-muted mb-3">
            {lang === 'vi'
              ? 'Cập nhật tự động sau từng buổi đánh giá và báo cáo của giáo viên.'
              : 'Updated from checkpoint evaluations and post-class teacher reports.'}
          </p>
          <SkillRadar current={displayedSkills} target={STUDENT_TARGET_SKILLS} height={300} />
        </Panel>

        <Panel>
          <h2 className="text-base font-bold text-ink mb-1">
            {lang === 'vi' ? 'Xu hướng tăng band qua 4 tháng' : 'Monthly Band Trajectory'}
          </h2>
          <p className="text-xs text-ink-muted mb-4">
            {lang === 'vi' ? 'Overall, Speaking và Writing' : 'Overall, Speaking & Writing growth'}
          </p>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trajectoryData}>
                <CartesianGrid stroke="var(--border-hairline)" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} />
                <YAxis domain={[4, 8]} stroke="var(--text-muted)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="overall"
                  name="Overall"
                  stroke="var(--text-primary)"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="speaking"
                  name="Speaking"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="writing"
                  name="Writing"
                  stroke="var(--status-completed-text)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Synced Mistake & Vocabulary Notebook */}
      <Panel>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-bold text-ink">
              {lang === 'vi'
                ? 'Sổ tay Từ vựng & Lỗi cần sửa (Đồng bộ từ Phòng học 1-1)'
                : 'Synced Vocab & Mistake Log (From 1-on-1 Classroom)'}
            </h2>
            <p className="text-xs text-ink-muted">
              {lang === 'vi'
                ? 'Thử thêm thẻ mới ngay trong Phòng học mẫu 1-1 để thấy dữ liệu cập nhật tại đây.'
                : 'Add items inside the 1-on-1 Classroom to watch this list update immediately.'}
            </p>
          </div>
          <Badge tone="neutral" className="font-mono">
            {mistakesVocab.length} mục
          </Badge>
        </div>

        <div className="divide-y divide-hairline">
          {mistakesVocab.map((item) => (
            <div key={item.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      item.kind === 'vocab'
                        ? 'confirmed'
                        : item.kind === 'grammar'
                          ? 'proposed'
                          : 'alert'
                    }
                  >
                    {item.kind === 'vocab'
                      ? 'Từ vựng'
                      : item.kind === 'grammar'
                        ? 'Ngữ pháp'
                        : 'Phát âm'}
                  </Badge>
                  <span className="font-mono text-sm font-bold text-ink">{item.term}</span>
                </div>
                <p className="text-xs text-ink-secondary">{item.contextNote}</p>
              </div>
              <span className="text-xs font-medium text-[var(--status-completed-text)]">
                → {item.correction}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
