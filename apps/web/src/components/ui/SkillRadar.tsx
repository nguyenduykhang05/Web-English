import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useUIStore } from '@/stores/useUIStore';
import { SKILL_LABELS } from '@/lib/utils';
import type { SkillKey, SkillRatings } from '@/types/domain';

interface SkillRadarProps {
  current: SkillRatings;
  target: SkillRatings;
  height?: number;
}

const ORDERED_SKILLS: SkillKey[] = [
  'speaking',
  'pronunciation',
  'listening',
  'vocabulary',
  'grammar',
  'reading',
  'writing',
];

export function SkillRadar({ current, target, height = 270 }: SkillRadarProps) {
  const lang = useUIStore((s) => s.lang);

  const chartData = ORDERED_SKILLS.map((key) => ({
    key,
    subject: lang === 'vi' ? SKILL_LABELS[key].vi.split(' (')[0] : SKILL_LABELS[key].en,
    current: current[key],
    target: target[key],
  }));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="72%" data={chartData}>
          <PolarGrid stroke="var(--border-hairline)" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 9]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name={lang === 'vi' ? 'Mục tiêu' : 'Target'}
            dataKey="target"
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
            fill="var(--bg-subtle)"
            fillOpacity={0.35}
          />
          <Radar
            name={lang === 'vi' ? 'Hiện tại' : 'Current'}
            dataKey="current"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="var(--accent)"
            fillOpacity={0.18}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-hairline)',
              borderRadius: '10px',
              fontSize: '12px',
              color: 'var(--text-primary)',
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
