import type { AIFeature, AiProvider as AiProviderKind } from '@webenglish/shared';
import { AppError } from '../../middleware/errorHandler.js';

export interface AiGenerateRequest {
  feature: AIFeature;
  anonymizedPrompt: string;
  context: Record<string, unknown>;
}

export interface AiGenerateResult {
  summary: string;
  structured: Record<string, unknown>;
  model: string;
  tokenEstimate: number;
}

export interface AIProvider {
  readonly name: AiProviderKind;
  generateFeature(input: AiGenerateRequest): Promise<AiGenerateResult>;
}

export interface RealProviderAdapterOptions {
  apiKey: string;
  model?: string;
  fetchFn?: typeof fetch;
}

export interface AiProviderResolutionOptions {
  provider?: string;
  model?: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  requireKey?: boolean;
}

const SYSTEM_PROMPT =
  'You are an IELTS/English 1-on-1 pedagogy assistant. Return strictly valid JSON with keys: "summary" (string in Vietnamese) and "structured" (JSON object). Never invent PII.';

function estimateTokens(text: string): number {
  return Math.max(40, Math.ceil(text.length / 4) + 120);
}

function isUsableKey(key?: string): key is string {
  return typeof key === 'string' && key.trim().length > 0 && key.trim().toLowerCase() !== 'mock';
}

export function parseAiJsonPayload(rawText: string): {
  summary: string;
  structured: Record<string, unknown>;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'AI upstream returned an empty completion');
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'AI upstream did not return valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'AI JSON response must be an object');
  }

  const record = parsed as Record<string, unknown>;
  const summary =
    typeof record.summary === 'string' && record.summary.trim().length > 0
      ? record.summary.trim()
      : candidate.slice(0, 240);
  const structured =
    record.structured && typeof record.structured === 'object' && !Array.isArray(record.structured)
      ? (record.structured as Record<string, unknown>)
      : {};

  return { summary, structured };
}

export class MockAIProvider implements AIProvider {
  readonly name = 'mock' as const;

  async generateFeature(input: AiGenerateRequest): Promise<AiGenerateResult> {
    const wordCount = input.anonymizedPrompt.trim().split(/\s+/).length;
    const baseBand = wordCount >= 120 ? 6.5 : wordCount >= 60 ? 6.0 : 5.5;
    const ctx = input.context;

    switch (input.feature) {
      case 'writing_assessment':
        return {
          model: 'mock-ielts-evaluator-v1',
          tokenEstimate: estimateTokens(input.anonymizedPrompt),
          summary: `Đề xuất đánh giá Writing (Band ước tính ${baseBand}): bài viết đủ ý chính, nên đa dạng hoá liên từ học thuật và mệnh đề quan hệ.`,
          structured: {
            suggestedBand: baseBand,
            criteria: {
              taskResponse: baseBand,
              coherenceCohesion: baseBand,
              lexicalResource: Math.min(8.5, baseBand + 0.5),
              grammaticalRangeAccuracy: Math.max(5.0, baseBand - 0.5),
            },
            corrections: [
              {
                issue: 'Repetitive sentence openings',
                suggestion: 'Use "Notwithstanding...", "Conversely...", or participle clauses.',
              },
            ],
            teacherActionHint: 'Giáo viên duyệt điểm và gửi phản hồi cho học viên.',
          },
        };

      case 'speaking_assessment':
        return {
          model: 'mock-speech-coach-v1',
          tokenEstimate: estimateTokens(input.anonymizedPrompt),
          summary: `Đề xuất đánh giá Speaking (Band ${baseBand}): mạch nói rõ ràng; chú ý phát âm âm cuối /s/, /t/ và mở rộng ví dụ Part 3.`,
          structured: {
            suggestedBand: baseBand,
            fluency: baseBand,
            pronunciation: Math.max(5.0, baseBand - 0.5),
            lexicalResource: baseBand,
            grammarAccuracy: baseBand,
            drillSuggestions: [
              'Shadowing 10 câu nối âm cuối',
              'Luyện cấu trúc Point-Contrast-Example',
            ],
          },
        };

      case 'placement_explanation':
        return {
          model: 'mock-placement-advisor-v1',
          tokenEstimate: estimateTokens(input.anonymizedPrompt),
          summary: `Giải thích kết quả đầu vào (${String(ctx.cefrResult ?? 'B1')} · ${String(ctx.overallScore ?? 55)}đ): học viên đạt nền tảng giao tiếp ổn, cần ưu tiên củng cố phản xạ nói và độ chính xác ngữ pháp.`,
          structured: {
            cefrResult: ctx.cefrResult ?? 'B1',
            overallScore: ctx.overallScore ?? 55,
            prioritySkills: ['speaking', 'pronunciation', 'grammar'],
            recommendedWeeks: 12,
          },
        };

      case 'path_proposal':
        return {
          model: 'mock-curriculum-planner-v1',
          tokenEstimate: estimateTokens(input.anonymizedPrompt),
          summary: `Đề xuất bổ sung chặng rèn chuyên sâu cho kỹ năng ${String(ctx.weakestSkill ?? 'speaking')} để rút ngắn khoảng cách đạt mục tiêu.`,
          structured: {
            title: `AI Proposed: Tăng cường ${String(ctx.weakestSkill ?? 'Speaking')} theo ngữ cảnh thực tế`,
            description: `Chặng tăng cường tập trung sửa lỗi lặp lại và mở rộng từ vựng ${String(ctx.focusGoal ?? 'IELTS')}.`,
            cefrTarget: ctx.targetCefr ?? 'B2',
            skillFocus: ctx.weakestSkill ?? 'speaking',
            plannedSessions: 3,
          },
        };

      case 'exercise_generation':
        return {
          model: 'mock-exercise-builder-v1',
          tokenEstimate: estimateTokens(input.anonymizedPrompt),
          summary: `Đã sinh 2 câu hỏi luyện tập chủ đề "${String(ctx.topic ?? 'Everyday Fluency')}" (${String(ctx.cefrLevel ?? 'B1')}) ở trạng thái chờ duyệt.`,
          structured: {
            title: `[AI Đề xuất] Luyện tập ${String(ctx.topic ?? 'Speaking')} (${String(ctx.cefrLevel ?? 'B1')})`,
            prompt: `Hoàn thành các câu hỏi củng cố kỹ năng ${String(ctx.skillFocus ?? 'grammar')} dưới đây:`,
            questions: [
              {
                id: 'ai-q1',
                type: 'multiple_choice',
                prompt: `Choose the most natural B1/B2 phrase related to ${String(ctx.topic ?? 'communication')}:`,
                options: [
                  'mitigate the impact',
                  'make small the problem',
                  'do less heavy',
                  'take down bad',
                ],
                correctAnswer: 'mitigate the impact',
                maxPoints: 50,
              },
              {
                id: 'ai-q2',
                type: 'fill_blank',
                prompt: 'Despite the initial challenges, the team managed ___ the deadline.',
                correctAnswer: 'to meet',
                maxPoints: 50,
              },
            ],
          },
        };

      case 'session_summary':
        return {
          model: 'mock-session-summarizer-v1',
          tokenEstimate: estimateTokens(input.anonymizedPrompt),
          summary: `Tóm tắt buổi học (${String(ctx.quickNotesCount ?? 0)} ghi chú): Học viên tương tác tích cực, cần ôn tập lại các mẫu câu sửa lỗi từ buổi học trước khi vào buổi kế tiếp.`,
          structured: {
            draftSummary: input.anonymizedPrompt.slice(0, 260),
            strengths: ['Chủ động đặt câu hỏi', 'Phát triển ý rõ ràng'],
            weaknesses: ['Cần giữ nhịp phát âm âm cuối khi nói nhanh'],
            nextFocus: 'Ôn lại toàn bộ quick notes và thực hành 2 phút ghi âm phản xạ.',
          },
        };

      case 'weakness_analysis':
        return {
          model: 'mock-diagnostic-analyst-v1',
          tokenEstimate: estimateTokens(input.anonymizedPrompt),
          summary: `Phân tích điểm yếu hiện tại: kỹ năng ưu tiên cần bồi dưỡng nhất là ${String(ctx.weakestSkill ?? 'pronunciation')} và tính nhất quán ngữ pháp khi nói tự do.`,
          structured: {
            weakestSkill: ctx.weakestSkill ?? 'pronunciation',
            focusAreas: ['Final consonant clarity', 'Complex conditional transitions'],
            recommendedWeeklyPracticeMinutes: 90,
          },
        };

      case 'matching_explanation':
        return {
          model: 'mock-matching-narrator-v1',
          tokenEstimate: estimateTokens(input.anonymizedPrompt),
          summary: `Giáo viên phù hợp (${String(ctx.matchScore ?? 85)}/100 điểm khớp) nhờ đúng chuyên môn mục tiêu, trình độ CEFR tương thích và khung giờ rảnh khớp lịch học viên.`,
          structured: {
            matchScore: ctx.matchScore ?? 85,
            highlights: ctx.reasons ?? ['Đúng chuyên môn', 'Khớp khung giờ rảnh'],
          },
        };
    }
  }
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: RealProviderAdapterOptions) {
    if (!isUsableKey(options.apiKey)) {
      throw new AppError(503, 'AI_KEY_MISSING', 'OpenAI provider requires a valid API key');
    }
    this.apiKey = options.apiKey;
    this.model = options.model && options.model !== 'mock' ? options.model : 'gpt-4o-mini';
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generateFeature(input: AiGenerateRequest): Promise<AiGenerateResult> {
    const res = await this.fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Feature=${input.feature}\n\n${input.anonymizedPrompt}` },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new AppError(502, 'AI_UPSTREAM_ERROR', `OpenAI returned HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const parsed = parseAiJsonPayload(json.choices?.[0]?.message?.content ?? '');

    return {
      summary: parsed.summary,
      structured: parsed.structured,
      model: json.model ?? this.model,
      tokenEstimate: json.usage?.total_tokens ?? estimateTokens(input.anonymizedPrompt),
    };
  }
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: RealProviderAdapterOptions) {
    if (!isUsableKey(options.apiKey)) {
      throw new AppError(503, 'AI_KEY_MISSING', 'Anthropic provider requires a valid API key');
    }
    this.apiKey = options.apiKey;
    this.model =
      options.model && options.model !== 'mock' ? options.model : 'claude-3-5-haiku-latest';
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generateFeature(input: AiGenerateRequest): Promise<AiGenerateResult> {
    const res = await this.fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Feature=${input.feature}\n\n${input.anonymizedPrompt}` }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new AppError(502, 'AI_UPSTREAM_ERROR', `Anthropic returned HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      model?: string;
      content?: { text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const parsed = parseAiJsonPayload(json.content?.[0]?.text ?? '');
    const tokens =
      (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0) ||
      estimateTokens(input.anonymizedPrompt);

    return {
      summary: parsed.summary,
      structured: parsed.structured,
      model: json.model ?? this.model,
      tokenEstimate: tokens,
    };
  }
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: RealProviderAdapterOptions) {
    if (!isUsableKey(options.apiKey)) {
      throw new AppError(503, 'AI_KEY_MISSING', 'Gemini provider requires a valid API key');
    }
    this.apiKey = options.apiKey;
    this.model = options.model && options.model !== 'mock' ? options.model : 'gemini-2.0-flash';
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generateFeature(input: AiGenerateRequest): Promise<AiGenerateResult> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${SYSTEM_PROMPT}\nFeature=${input.feature}\n\n${input.anonymizedPrompt}` }],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new AppError(502, 'AI_UPSTREAM_ERROR', `Gemini returned HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { totalTokenCount?: number };
    };
    const parsed = parseAiJsonPayload(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '');

    return {
      summary: parsed.summary,
      structured: parsed.structured,
      model: this.model,
      tokenEstimate:
        json.usageMetadata?.totalTokenCount ?? estimateTokens(input.anonymizedPrompt),
    };
  }
}

const mockAiProvider = new MockAIProvider();

function resolveKeyForProvider(
  provider: 'openai' | 'anthropic' | 'gemini',
  explicitKey?: string,
): string | undefined {
  if (isUsableKey(explicitKey)) return explicitKey.trim();
  if (isUsableKey(process.env.AI_API_KEY)) return process.env.AI_API_KEY!.trim();

  if (provider === 'openai' && isUsableKey(process.env.OPENAI_API_KEY)) {
    return process.env.OPENAI_API_KEY!.trim();
  }
  if (provider === 'anthropic' && isUsableKey(process.env.ANTHROPIC_API_KEY)) {
    return process.env.ANTHROPIC_API_KEY!.trim();
  }
  if (provider === 'gemini') {
    const gemKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (isUsableKey(gemKey)) return gemKey.trim();
  }
  return undefined;
}

/**
 * Selects the AIProvider dynamically via AI_PROVIDER / AI_MODEL env vars and available API keys.
 * Falls back safely to offline MockAIProvider whenever no real API key is configured.
 */
export function getAIProvider(override?: AiProviderResolutionOptions): AIProvider {
  const configured = (override?.provider ?? process.env.AI_PROVIDER ?? '').trim().toLowerCase();
  const model = override?.model ?? process.env.AI_MODEL;
  const requireKey = override?.requireKey ?? process.env.AI_STRICT_PROVIDER === 'true';

  if (configured === 'mock') {
    return mockAiProvider;
  }

  if (configured === 'openai' || configured === 'anthropic' || configured === 'gemini') {
    const key = resolveKeyForProvider(configured, override?.apiKey);
    if (!key) {
      if (requireKey) {
        throw new AppError(
          503,
          'AI_KEY_MISSING',
          `Real AI provider (${configured}) requires an API key`,
        );
      }
      return mockAiProvider;
    }
    if (configured === 'openai') {
      return new OpenAIProvider({ apiKey: key, model, fetchFn: override?.fetchFn });
    }
    if (configured === 'anthropic') {
      return new AnthropicProvider({ apiKey: key, model, fetchFn: override?.fetchFn });
    }
    return new GeminiProvider({ apiKey: key, model, fetchFn: override?.fetchFn });
  }

  // Auto-detect based on available real API keys if AI_PROVIDER is unset or 'auto'
  const openaiKey = resolveKeyForProvider('openai', override?.apiKey);
  if (openaiKey) {
    return new OpenAIProvider({ apiKey: openaiKey, model, fetchFn: override?.fetchFn });
  }
  const geminiKey = resolveKeyForProvider('gemini', override?.apiKey);
  if (geminiKey) {
    return new GeminiProvider({ apiKey: geminiKey, model, fetchFn: override?.fetchFn });
  }
  const anthropicKey = resolveKeyForProvider('anthropic', override?.apiKey);
  if (anthropicKey) {
    return new AnthropicProvider({ apiKey: anthropicKey, model, fetchFn: override?.fetchFn });
  }

  return mockAiProvider;
}
