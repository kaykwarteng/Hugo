import type { AIErrorKind, AIProvider, AIRequest, AIResponse } from '../types'
import { chatCompletionsUrl, type OpenAICompatiblePreset } from '../providerRegistry'
import { withSchemaInstruction } from '../../../utils/ai/schemaInstruction'
import { extractJson } from '../../../utils/ai/validateAIResponse'
import { aiError, httpErrorKind, postJson, readPath } from './http'

/**
 * One client for every provider that speaks the OpenAI chat-completions shape
 * (DeepSeek, Mistral, xAI), configured by a preset from `providerRegistry`.
 *
 * `openai.ts` is deliberately not built on this. It sends a strict
 * `json_schema` the others don't all accept and judges a connection test by
 * the reply text; folding it in would change both, for no gain.
 *
 * Differences from the native OpenAI client, each because the docs require it:
 * - the schema is written into the system prompt, since JSON mode (where it
 *   exists) promises well-formed JSON but not the right keys;
 * - the output-length parameter is whichever the preset documents;
 * - errors are classified from the body as well as the status, since one
 *   provider's "out of credit" is another's 402, 403 or 429.
 *
 * Like every provider module, nothing here logs: a logged request is a logged
 * key.
 */

const PROBE_PROMPT = 'Reply with the single word: ok'

/** Longest provider error text worth echoing. Some return whole stack-ish blobs. */
const MAX_DETAIL_CHARS = 300

/** Pull a human-readable error out of the several shapes these providers use. */
export function readErrorDetail(payload: unknown): string | null {
  const candidates = [
    readPath(payload, ['error', 'message']), // OpenAI / DeepSeek
    readPath(payload, ['error']), //            xAI: { code, error: "…" }
    readPath(payload, ['message']), //          Mistral: { object: "error", message }
    readPath(payload, ['detail']), //           Mistral: { detail: "Invalid API Key" }
    readPath(payload, ['detail', 0, 'msg']), // FastAPI-style validation errors
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      const text = candidate.trim()
      return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS)}…` : text
    }
  }
  return null
}

/** Also matched against `error.code` / `error.type`, e.g. OpenAI's `insufficient_quota`. */
const QUOTA_RE = /insufficient[ _-]?(balance|quota|funds|credits?)|quota|credits?|balance|billing|payment|spending limit/i
/**
 * An unknown-model complaint under a 400/422. Kept tight — "invalid" and
 * "model" both turn up in unrelated errors ("invalid max_tokens for this
 * model"), and telling someone to change a model that is fine is worse than
 * passing the provider's own wording through.
 */
const MODEL_MISSING_RE =
  /model_not_found|invalid_model|\b(invalid|unknown|unsupported|nonexistent) model\b|\bmodel\b[^.]{0,80}\b(not found|does not exist|doesn't exist|is not available|no such)/i

function errorText(payload: unknown): string {
  return [
    readErrorDetail(payload),
    readPath(payload, ['error', 'code']),
    readPath(payload, ['error', 'type']),
    readPath(payload, ['code']),
    readPath(payload, ['type']),
  ]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
}

/**
 * Decide what kind of failure an error response is. Exported for tests.
 *
 * Status alone is not enough: DeepSeek documents 402 for an empty balance,
 * xAI rejects requests once prepaid credit is spent, and OpenAI-style APIs say
 * `insufficient_quota` under a 429. A 404 against a fixed endpoint can only
 * be the model id.
 */
export function classifyCompatibleError(payload: unknown, status: number): AIErrorKind {
  const text = errorText(payload)

  if (status === 402) return 'quota'
  if ((status === 400 || status === 403 || status === 429) && QUOTA_RE.test(text)) return 'quota'
  if (status === 404) return 'model'
  if ((status === 400 || status === 422) && MODEL_MISSING_RE.test(text)) return 'model'
  return httpErrorKind(status)
}

/** A user-facing sentence for each kind. Exported for tests. */
export function describeCompatibleError(
  preset: OpenAICompatiblePreset,
  model: string,
  payload: unknown,
  status: number,
): string {
  const { label } = preset
  const detail = readErrorDetail(payload)

  switch (classifyCompatibleError(payload, status)) {
    case 'auth':
      return `${label} rejected the API key. Check that it was copied in full and is still active.`
    case 'quota':
      return (
        `${label} says your account has run out of balance or quota. ` +
        `Add credit in your ${label} account, then try again.`
      )
    case 'model':
      return (
        `${label} doesn't recognise the model "${model}". Model names change often — ` +
        `check the exact ID in the ${label} docs, or pick another model.`
      )
    case 'rate-limit':
      return `${label} is rate-limiting requests right now. Wait a moment, then try again.`
    case 'server':
      return `${label} is unavailable right now (HTTP ${status}). Try again in a little while.`
    default:
      return detail !== null
        ? `${label} rejected the request: ${detail}`
        : `${label} rejected the request (HTTP ${status}).`
  }
}

/**
 * The visible text of the first choice. A few models (Mistral's reasoning
 * ones) return `content` as an array of typed chunks instead of a string, so
 * that shape is flattened to its text chunks; thinking chunks are dropped.
 */
export function readMessageContent(payload: unknown): string {
  const content = readPath(payload, ['choices', 0, 'message', 'content'])
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((chunk) =>
      typeof chunk === 'object' &&
      chunk !== null &&
      (chunk as { type?: unknown }).type === 'text' &&
      typeof (chunk as { text?: unknown }).text === 'string'
        ? (chunk as { text: string }).text
        : '',
    )
    .join('')
}

export function createOpenAICompatibleProvider(
  preset: OpenAICompatiblePreset,
  model: string,
  apiKey: string,
): AIProvider {
  const url = chatCompletionsUrl(preset)
  const headers = { Authorization: `Bearer ${apiKey}` }

  async function call(
    body: Record<string, unknown>,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<unknown> {
    return postJson({
      url,
      headers,
      body,
      signal,
      timeoutMs,
      classifyError: classifyCompatibleError,
      describeError: (payload, status) => describeCompatibleError(preset, model, payload, status),
      // fetch reports a refused CORS preflight and a dropped connection as the
      // same bare TypeError, so the message has to cover both.
      networkErrorKind: 'cors',
      networkErrorMessage:
        `The browser blocked this request, or the connection failed. ${preset.label} may not ` +
        'allow direct browser access — try another provider. If it worked before, check your ' +
        'internet connection and any ad blocker or privacy extension.',
    })
  }

  return {
    id: preset.id,

    async generate(request: AIRequest): Promise<AIResponse> {
      const payload = await call(
        {
          model,
          // No `temperature` / `top_p`, matching every other provider here.
          [preset.maxTokensParam]: request.maxOutputTokens,
          messages: [
            { role: 'system', content: withSchemaInstruction(request.system, request.schema) },
            { role: 'user', content: request.user },
          ],
          ...(preset.supportsJsonMode ? { response_format: { type: 'json_object' } } : {}),
        },
        request.signal,
        request.timeoutMs,
      )

      const finishReason = readPath(payload, ['choices', 0, 'finish_reason'])
      if (finishReason === 'content_filter') {
        throw aiError('bad-request', `${preset.label} declined to answer this request.`)
      }

      const content = readMessageContent(payload)
      if (content.trim() === '') {
        if (finishReason === 'length') {
          throw aiError(
            'malformed',
            `${preset.label} ran out of room before answering. Try a smaller batch.`,
          )
        }
        throw aiError('malformed', `${preset.label} returned an empty response. Try again.`)
      }

      const parsed = extractJson(content)
      if (!parsed.ok) {
        throw aiError(
          'malformed',
          finishReason === 'length'
            ? `${preset.label} ran out of room before finishing. Try a smaller batch.`
            : `${parsed.error} Try again, or pick a different model.`,
        )
      }

      const usage = readPath(payload, ['usage'])
      return {
        data: parsed.value,
        raw: content,
        model,
        provider: preset.id,
        usage: {
          inputTokens: numberOrUndefined(readPath(usage, ['prompt_tokens'])),
          outputTokens: numberOrUndefined(readPath(usage, ['completion_tokens'])),
        },
      }
    },

    async testConnection(signal?: AbortSignal): Promise<boolean> {
      // A real, tiny request: it exercises the key, the model id and the
      // browser's CORS check in one go. Success is judged by the response's
      // shape, not its text — a thinking model can spend 16 tokens reasoning
      // and return empty content, which still proves the connection works.
      const payload = await call(
        {
          model,
          [preset.maxTokensParam]: 16,
          messages: [{ role: 'user', content: PROBE_PROMPT }],
        },
        signal,
      )
      return Array.isArray(readPath(payload, ['choices']))
    },
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}
