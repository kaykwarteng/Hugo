import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig, OpenAICompatibleProviderId } from '../../../types/ai'
import { sendAIRequest, testAIConnection } from '../aiService'
import { OPENAI_COMPATIBLE_PRESETS } from '../providerRegistry'
import type { AIRequest } from '../types'
import {
  classifyCompatibleError,
  describeCompatibleError,
  readErrorDetail,
  readMessageContent,
} from './openaiCompatible'

// A fake key. Every call below goes to a mocked fetch — nothing reaches a network.
const KEY = 'test-key-NOT-A-REAL-KEY-0000'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer'],
  properties: { answer: { type: 'string' } },
}

const PAYLOAD = '{"answer":"yes"}'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeConfig(provider: OpenAICompatibleProviderId, overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    enabled: true,
    provider,
    model: OPENAI_COMPATIBLE_PRESETS[provider].defaultModel,
    customModel: false,
    rememberKey: false,
    maxBatchQuestions: 50,
    ...overrides,
  }
}

function makeRequest(overrides: Partial<AIRequest> = {}): AIRequest {
  return {
    kind: 'verification',
    system: 'SYSTEM-PROMPT-MARKER',
    user: 'USER-PROMPT-MARKER',
    schema: SCHEMA,
    schemaName: 'answer_schema',
    maxOutputTokens: 1024,
    ...overrides,
  }
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function failure(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

function completion(content: unknown, extra: Record<string, unknown> = {}) {
  return {
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 11, completion_tokens: 13, total_tokens: 24 },
    ...extra,
  }
}

function lastCall(): { url: string; init: RequestInit; headers: Record<string, string>; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return {
    url,
    init,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  }
}

async function send(provider: OpenAICompatibleProviderId, overrides: Partial<AIConfig> = {}) {
  return sendAIRequest(makeRequest(), { config: makeConfig(provider, overrides), apiKey: KEY })
}

const PROVIDERS: OpenAICompatibleProviderId[] = ['deepseek', 'mistral', 'xai']

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

describe('request building', () => {
  beforeEach(() => fetchMock.mockResolvedValue(ok(completion(PAYLOAD))))

  it.each<[OpenAICompatibleProviderId, string]>([
    ['deepseek', 'https://api.deepseek.com/chat/completions'],
    ['mistral', 'https://api.mistral.ai/v1/chat/completions'],
    ['xai', 'https://api.x.ai/v1/chat/completions'],
  ])('%s posts to its fixed official endpoint', async (provider, url) => {
    await send(provider)
    const call = lastCall()
    expect(call.url).toBe(url)
    expect(call.init.method).toBe('POST')
  })

  it.each(PROVIDERS)('%s sends the key only as a bearer token', async (provider) => {
    await send(provider)
    const call = lastCall()
    expect(call.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(call.headers['content-type']).toBe('application/json')
    // Never in the URL or the body, where it would leak into logs and errors.
    expect(call.url).not.toContain(KEY)
    expect(JSON.stringify(call.body)).not.toContain(KEY)
  })

  it.each(PROVIDERS)('%s sends the chosen model, including a custom one', async (provider) => {
    await send(provider, { model: 'some-custom-model-id', customModel: true })
    expect(lastCall().body.model).toBe('some-custom-model-id')
  })

  it.each<[OpenAICompatibleProviderId, string, string]>([
    ['deepseek', 'max_tokens', 'max_completion_tokens'],
    ['mistral', 'max_tokens', 'max_completion_tokens'],
    ['xai', 'max_completion_tokens', 'max_tokens'],
  ])('%s uses its documented output-length parameter', async (provider, used, unused) => {
    await send(provider)
    const body = lastCall().body
    expect(body[used]).toBe(1024)
    expect(body).not.toHaveProperty(unused)
  })

  it.each(PROVIDERS)('%s asks for JSON mode where the preset supports it', async (provider) => {
    await send(provider)
    const body = lastCall().body
    if (OPENAI_COMPATIBLE_PRESETS[provider].supportsJsonMode) {
      expect(body.response_format).toEqual({ type: 'json_object' })
    } else {
      expect(body).not.toHaveProperty('response_format')
    }
  })

  it.each(PROVIDERS)('%s spells the schema out in the system prompt', async (provider) => {
    await send(provider)
    const messages = lastCall().body.messages as { role: string; content: string }[]
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('SYSTEM-PROMPT-MARKER')
    expect(messages[0].content).toContain('JSON')
    expect(messages[0].content).toContain(JSON.stringify(SCHEMA))
    expect(messages[1]).toEqual({ role: 'user', content: 'USER-PROMPT-MARKER' })
  })

  it.each(PROVIDERS)('%s sends no sampling parameters', async (provider) => {
    await send(provider)
    const serialized = JSON.stringify(lastCall().body)
    for (const param of ['temperature', 'top_p', 'top_k']) expect(serialized).not.toContain(param)
  })

  it('never sends a schema-strict response format the presets were not verified for', async () => {
    await send('mistral')
    expect(JSON.stringify(lastCall().body)).not.toContain('json_schema')
  })
})

// ---------------------------------------------------------------------------
// Response normalization
// ---------------------------------------------------------------------------

describe('response normalization', () => {
  it.each(PROVIDERS)('%s returns parsed data, raw text, model, provider and usage', async (provider) => {
    fetchMock.mockResolvedValue(ok(completion(PAYLOAD)))
    const result = await send(provider)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      data: { answer: 'yes' },
      raw: PAYLOAD,
      model: OPENAI_COMPATIBLE_PRESETS[provider].defaultModel,
      provider,
      usage: { inputTokens: 11, outputTokens: 13 },
    })
  })

  it('recovers JSON wrapped in a fence and prose', async () => {
    fetchMock.mockResolvedValue(ok(completion('Here you go:\n```json\n{"answer":"yes"}\n```\nHope that helps!')))
    const result = await send('deepseek')
    expect(result.ok && result.value.data).toEqual({ answer: 'yes' })
  })

  it('flattens chunked content and drops thinking chunks', async () => {
    fetchMock.mockResolvedValue(
      ok(
        completion([
          { type: 'thinking', thinking: [{ type: 'text', text: '{"answer":"no"}' }] },
          { type: 'text', text: '{"answer":' },
          { type: 'text', text: '"yes"}' },
        ]),
      ),
    )
    const result = await send('mistral')
    expect(result.ok && result.value.data).toEqual({ answer: 'yes' })
  })

  it('tolerates a response with no usage block', async () => {
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: PAYLOAD } }] }))
    const result = await send('xai')
    expect(result.ok && result.value.usage).toEqual({ inputTokens: undefined, outputTokens: undefined })
  })

  it('reports non-JSON content as a retryable malformed error, not a crash', async () => {
    fetchMock.mockResolvedValue(ok(completion('I think the answer is B.')))
    const result = await send('deepseek')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('malformed')
    expect(result.error.retryable).toBe(true)
    expect(result.error.message).toMatch(/no JSON/)
  })

  it('reports null content (DeepSeek documents occasional empty replies)', async () => {
    fetchMock.mockResolvedValue(ok(completion(null)))
    const result = await send('deepseek')
    expect(!result.ok && result.error.kind).toBe('malformed')
    expect(!result.ok && result.error.message).toMatch(/empty response/)
  })

  it('reports a reply cut off at the token limit', async () => {
    fetchMock.mockResolvedValue(
      ok({ choices: [{ message: { content: '{"answer":"ye' }, finish_reason: 'length' }] }),
    )
    const result = await send('mistral')
    expect(!result.ok && result.error.kind).toBe('malformed')
    expect(!result.ok && result.error.message).toMatch(/ran out of room/)
  })

  it('reports a content filter as a refusal', async () => {
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] }))
    const result = await send('xai')
    expect(!result.ok && result.error.kind).toBe('bad-request')
    expect(!result.ok && result.error.message).toMatch(/declined/)
  })

  it('reports a success body that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>gateway</html>', { status: 200 }))
    const result = await send('deepseek')
    expect(!result.ok && result.error.kind).toBe('malformed')
  })
})

describe('readMessageContent', () => {
  it('returns an empty string for a missing or odd-shaped message', () => {
    expect(readMessageContent(null)).toBe('')
    expect(readMessageContent({ choices: [] })).toBe('')
    expect(readMessageContent({ choices: [{ message: { content: 42 } }] })).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Error normalization
// ---------------------------------------------------------------------------

describe('error normalization', () => {
  it.each<[string, number, unknown, string, RegExp]>([
    ['401 bad key', 401, { error: { message: 'Authentication Fails' } }, 'auth', /rejected the API key/],
    ['402 insufficient balance', 402, { error: { message: 'Insufficient Balance' } }, 'quota', /balance or quota/],
    ['403 out of credits', 403, { code: '403', error: 'Your team has run out of credits' }, 'quota', /balance or quota/],
    ['429 insufficient_quota', 429, { error: { message: 'Exceeded', code: 'insufficient_quota' } }, 'quota', /balance or quota/],
    ['404 invalid model', 404, { error: { message: 'The model does not exist' } }, 'model', /doesn't recognise the model "deepseek-flash"/],
    ['400 invalid model', 400, { message: 'Invalid model: deepseek-flash', type: 'invalid_request_error' }, 'model', /doesn't recognise the model/],
    ['429 rate limit', 429, { error: { message: 'Rate limit reached' } }, 'rate-limit', /rate-limiting/],
    ['500 server error', 500, { error: { message: 'Internal error' } }, 'server', /unavailable right now \(HTTP 500\)/],
    ['503 overloaded', 503, null, 'server', /unavailable right now \(HTTP 503\)/],
  ])('%s', async (_name, status, body, kind, message) => {
    fetchMock.mockResolvedValue(failure(status, body))
    const result = await send('deepseek')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe(kind)
    expect(result.error.status).toBe(status)
    expect(result.error.message).toMatch(message)
    expect(result.error.message).toMatch(/^DeepSeek /)
  })

  it('passes an ordinary 400 through with the provider wording', async () => {
    fetchMock.mockResolvedValue(failure(400, { code: '400', error: 'Bad data: Messages cannot be empty' }))
    const result = await send('xai')
    expect(!result.ok && result.error.kind).toBe('bad-request')
    expect(!result.ok && result.error.message).toBe('xAI Grok rejected the request: Bad data: Messages cannot be empty')
  })

  it('does not mistake an unrelated 400 that mentions the model for an unknown model', () => {
    const payload = { error: { message: 'Invalid max_tokens value for this model, the maximum is 8192' } }
    expect(classifyCompatibleError(payload, 400)).toBe('bad-request')
  })

  it('treats 401 and a plain 403 as an auth failure', () => {
    expect(classifyCompatibleError({ detail: 'Invalid API Key' }, 401)).toBe('auth')
    expect(classifyCompatibleError({ error: 'Forbidden' }, 403)).toBe('auth')
  })

  it.each(PROVIDERS)('%s reports a network/CORS failure with the browser-block message', async (provider) => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await send(provider)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('cors')
    expect(result.error.message).toContain('The browser blocked this request')
    expect(result.error.message).toContain(OPENAI_COMPATIBLE_PRESETS[provider].label)
    expect(result.error.message).toContain('try another provider')
  })

  it('reports a user cancel as aborted', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const pending = sendAIRequest(makeRequest(), {
      config: makeConfig('mistral'),
      apiKey: KEY,
      signal: controller.signal,
    })
    controller.abort()
    const result = await pending
    expect(!result.ok && result.error.kind).toBe('aborted')
  })

  it('redacts a key the provider echoes back in an error', async () => {
    fetchMock.mockResolvedValue(failure(400, { error: { message: `Bad key format: ${KEY}` } }))
    const result = await send('deepseek')
    expect(!result.ok && result.error.message).not.toContain(KEY)
    expect(!result.ok && result.error.message).toContain('[redacted]')
  })

  it('reads every error-body shape these providers use', () => {
    expect(readErrorDetail({ error: { message: 'a' } })).toBe('a')
    expect(readErrorDetail({ code: '400', error: 'b' })).toBe('b')
    expect(readErrorDetail({ object: 'error', message: 'c' })).toBe('c')
    expect(readErrorDetail({ detail: 'd' })).toBe('d')
    expect(readErrorDetail({ detail: [{ msg: 'e', loc: ['body'] }] })).toBe('e')
    expect(readErrorDetail(null)).toBeNull()
    expect(readErrorDetail({ error: { message: '   ' } })).toBeNull()
  })

  it('truncates a very long provider message', () => {
    const detail = readErrorDetail({ error: { message: 'x'.repeat(5000) } })
    expect(detail !== null && detail.length).toBeLessThan(400)
  })

  it('describes each kind in terms of the selected provider', () => {
    const preset = OPENAI_COMPATIBLE_PRESETS.xai
    expect(describeCompatibleError(preset, 'grok-x', null, 404)).toContain('xAI Grok doesn\'t recognise the model "grok-x"')
  })
})

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

describe('connection test', () => {
  it.each(PROVIDERS)('%s succeeds on a well-formed completion', async (provider) => {
    fetchMock.mockResolvedValue(ok(completion('ok')))
    const result = await testAIConnection({ config: makeConfig(provider), apiKey: KEY })
    expect(result.ok).toBe(true)
    const body = lastCall().body
    expect(body).not.toHaveProperty('response_format')
    expect(body[OPENAI_COMPATIBLE_PRESETS[provider].maxTokensParam]).toBe(16)
  })

  it('still succeeds when a thinking model spends the budget and returns no text', async () => {
    fetchMock.mockResolvedValue(
      ok({ choices: [{ message: { content: '', reasoning_content: 'Hmm' }, finish_reason: 'length' }] }),
    )
    const result = await testAIConnection({ config: makeConfig('deepseek'), apiKey: KEY })
    expect(result.ok).toBe(true)
  })

  it.each<[number, unknown, string]>([
    [401, { detail: 'Invalid API Key' }, 'auth'],
    [404, { error: { message: 'Model not found' } }, 'model'],
    [402, { error: { message: 'Insufficient Balance' } }, 'quota'],
    [429, { error: { message: 'Too many requests' } }, 'rate-limit'],
    [502, null, 'server'],
  ])('reports HTTP %i as %s', async (status, body, kind) => {
    fetchMock.mockResolvedValue(failure(status, body))
    const result = await testAIConnection({ config: makeConfig('mistral'), apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe(kind)
  })

  it('reports a browser block during the test', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await testAIConnection({ config: makeConfig('xai'), apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('cors')
  })

  it('reports a 200 that is not a completion', async () => {
    fetchMock.mockResolvedValue(ok({ unexpected: true }))
    const result = await testAIConnection({ config: makeConfig('deepseek'), apiKey: KEY })
    expect(!result.ok && result.error.kind).toBe('malformed')
  })
})
