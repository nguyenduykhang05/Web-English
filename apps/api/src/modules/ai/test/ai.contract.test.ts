import { afterEach, describe, expect, it } from 'vitest';
import {
  AnthropicProvider,
  GeminiProvider,
  getAIProvider,
  MockAIProvider,
  OpenAIProvider,
  parseAiJsonPayload,
} from '../ai.provider.js';

const ORIGINAL_ENV = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_MODEL: process.env.AI_MODEL,
  AI_API_KEY: process.env.AI_API_KEY,
  AI_STRICT_PROVIDER: process.env.AI_STRICT_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe('Phase 7 — AI Provider Adapter Selection & Fixture Contract Tests', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('defaults to MockAIProvider when no real API keys are present', () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.AI_STRICT_PROVIDER;

    expect(getAIProvider()).toBeInstanceOf(MockAIProvider);

    // Even when AI_PROVIDER=openai is requested without a key (non-strict), safe default is MockAIProvider
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_API_KEY = 'mock';
    expect(getAIProvider()).toBeInstanceOf(MockAIProvider);
  });

  it('throws AI_KEY_MISSING only when AI_STRICT_PROVIDER=true and key is absent', () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.AI_API_KEY = 'mock';
    process.env.AI_STRICT_PROVIDER = 'true';

    expect(() => getAIProvider()).toThrow(/requires an API key/i);
  });

  it('selects real provider adapter dynamically by AI_PROVIDER / AI_MODEL and available keys', () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_MODEL = 'gpt-4.1-mini';
    process.env.AI_API_KEY = 'sk-contract-test-openai';
    expect(getAIProvider()).toBeInstanceOf(OpenAIProvider);

    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
    process.env.GEMINI_API_KEY = 'AIza-contract-gemini';
    process.env.AI_MODEL = 'gemini-2.0-flash';
    expect(getAIProvider()).toBeInstanceOf(GeminiProvider);

    delete process.env.GEMINI_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-contract';
    process.env.AI_MODEL = 'claude-3-5-sonnet-latest';
    expect(getAIProvider()).toBeInstanceOf(AnthropicProvider);
  });

  it('executes OpenAIProvider HTTP contract against recorded fixture including markdown JSON fences', async () => {
    let capturedUrl = '';
    let capturedAuth = '';
    let capturedBody: Record<string, unknown> = {};

    const fixtureResponse = {
      id: 'chatcmpl-fixture-1',
      model: 'gpt-4.1-mini',
      choices: [
        {
          message: {
            content:
              '```json\n{"summary":"Đề xuất Writing Band 6.5 (chờ giáo viên duyệt)","structured":{"suggestedBand":6.5,"strengths":["Clear position"]}}\n```',
          },
        },
      ],
      usage: { total_tokens: 412 },
    };

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      const headers = new Headers(init?.headers);
      capturedAuth = headers.get('authorization') ?? '';
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify(fixtureResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new OpenAIProvider({
      apiKey: 'sk-fixture-key',
      model: 'gpt-4.1-mini',
      fetchFn: mockFetch,
    });

    const out = await provider.generateFeature({
      feature: 'writing_assessment',
      anonymizedPrompt: 'LearnerRef=LEARNER-ABCD1234\nPublic transport essay sample.',
      context: { targetBand: '7.0' },
    });

    expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(capturedAuth).toBe('Bearer sk-fixture-key');
    expect(capturedBody.model).toBe('gpt-4.1-mini');
    expect(capturedBody.response_format).toEqual({ type: 'json_object' });
    expect(out.model).toBe('gpt-4.1-mini');
    expect(out.tokenEstimate).toBe(412);
    expect(out.summary).toContain('Band 6.5');
    expect(out.structured).toEqual({ suggestedBand: 6.5, strengths: ['Clear position'] });
  });

  it('executes GeminiProvider & AnthropicProvider HTTP contracts against recorded fixtures', async () => {
    let geminiUrl = '';
    const geminiFetch: typeof fetch = async (input) => {
      geminiUrl = String(input);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      summary: 'Đề xuất phân tích điểm yếu phát âm /s/ và /z/',
                      structured: { weakestSkill: 'pronunciation', priorityDrills: 3 },
                    }),
                  },
                ],
              },
            },
          ],
          usageMetadata: { totalTokenCount: 295 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const gemini = new GeminiProvider({
      apiKey: 'gem-fixture-key',
      model: 'gemini-2.0-flash',
      fetchFn: geminiFetch,
    });
    const gemResult = await gemini.generateFeature({
      feature: 'weakness_analysis',
      anonymizedPrompt: 'LearnerRef=LEARNER-999',
      context: {},
    });

    expect(geminiUrl).toContain('gemini-2.0-flash:generateContent');
    expect(gemResult.tokenEstimate).toBe(295);
    expect(gemResult.structured).toEqual({ weakestSkill: 'pronunciation', priorityDrills: 3 });

    const anthropicFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          content: [
            {
              text: JSON.stringify({
                summary: 'Giải thích ghép giáo viên 92/100',
                structured: { matchScore: 92 },
              }),
            },
          ],
          usage: { input_tokens: 120, output_tokens: 80 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const anthropic = new AnthropicProvider({
      apiKey: 'ant-fixture-key',
      model: 'claude-3-5-haiku-latest',
      fetchFn: anthropicFetch,
    });
    const antResult = await anthropic.generateFeature({
      feature: 'matching_explanation',
      anonymizedPrompt: 'LearnerRef=LEARNER-XYZ',
      context: {},
    });
    expect(antResult.tokenEstimate).toBe(200);
    expect(antResult.structured).toEqual({ matchScore: 92 });
  });

  it('normalizes HTTP upstream failures and invalid JSON responses safely', async () => {
    const failFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 });

    const provider = new OpenAIProvider({
      apiKey: 'sk-err',
      fetchFn: failFetch,
    });

    await expect(
      provider.generateFeature({
        feature: 'session_summary',
        anonymizedPrompt: 'Notes test',
        context: {},
      }),
    ).rejects.toThrow(/HTTP 429/);

    expect(() => parseAiJsonPayload('not valid json at all')).toThrow(/not return valid JSON/i);
  });
});
