import type { OpenAICompatibleProviderId } from '../../types/ai'
import type { ModelOption } from './models'

/**
 * Presets for the providers served by `providers/openaiCompatible.ts`.
 *
 * Data only: one shared client, one entry per provider. Adding a provider of
 * this kind means adding an entry here and its id to
 * `OpenAICompatibleProviderId` — never a new provider module.
 *
 * Every endpoint, auth scheme, parameter name and model id below was checked
 * against the provider's own documentation (the `docsUrl` of each entry, as
 * of 2026-10). Model names change often, so `defaultModels` is a short
 * suggestion list and the settings screen always offers a custom model id.
 */

/**
 * Whether the provider is known to accept requests made straight from a web
 * page. DrillMCQ has no backend, so this decides whether it can work at all.
 *
 * - `works`: confirmed from official documentation or a completed real call.
 * - `unverified`: not confirmed either way — a CORS failure is reported with
 *   its own message (see `networkErrorMessage` in `openaiCompatible.ts`).
 * - `blocked`: confirmed not to work from a browser.
 */
export type BrowserSupport = 'works' | 'unverified' | 'blocked'

export interface OpenAICompatiblePreset {
  readonly id: OpenAICompatibleProviderId
  readonly label: string
  /**
   * Fixed, and deliberately not user-editable: this is the only host the key
   * is ever sent to. `/chat/completions` is appended by `chatCompletionsUrl`.
   */
  readonly baseUrl: string
  /** Suggestions only. The custom model field is the real escape hatch. */
  readonly defaultModels: readonly ModelOption[]
  readonly defaultModel: string
  /**
   * True only where the docs confirm `response_format: { type: 'json_object' }`.
   * None of these get a schema enforced the way OpenAI's `json_schema` does,
   * so the schema is spelled out in the prompt (`withSchemaInstruction`).
   */
  readonly supportsJsonMode: boolean
  /** The output-length parameter the provider documents. They differ. */
  readonly maxTokensParam: 'max_tokens' | 'max_completion_tokens'
  readonly browserSupport: BrowserSupport
  /** Shape hint for the key input. Never a real key. */
  readonly keyPlaceholder: string
  /** Where the user gets a key. */
  readonly keysUrl: string
  /** The documentation the values above were verified against. */
  readonly docsUrl: string
}

/*
 * Browser support: a key-free probe of each endpoint (an OPTIONS preflight
 * asking for `authorization, content-type`, and an unauthenticated POST) came
 * back with `access-control-allow-origin` on both, for all three. That is
 * encouraging but is not a completed authenticated call, and none of the three
 * documents browser use — so all three stay `unverified` until one is
 * confirmed with a real key.
 */
export const OPENAI_COMPATIBLE_PRESETS: Readonly<
  Record<OpenAICompatibleProviderId, OpenAICompatiblePreset>
> = Object.freeze({
  deepseek: Object.freeze({
    id: 'deepseek',
    label: 'DeepSeek',
    // https://api-docs.deepseek.com/ — base_url and `Authorization: Bearer`.
    baseUrl: 'https://api.deepseek.com',
    // https://api-docs.deepseek.com/quick_start/pricing
    defaultModels: Object.freeze([
      { id: 'deepseek-flash', label: 'DeepSeek Flash', note: 'Fast and cheap' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    ]),
    defaultModel: 'deepseek-flash',
    // https://api-docs.deepseek.com/guides/json_mode
    supportsJsonMode: true,
    // https://api-docs.deepseek.com/api/create-chat-completion
    maxTokensParam: 'max_tokens',
    browserSupport: 'unverified',
    keyPlaceholder: 'Your DeepSeek API key',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
  }),
  mistral: Object.freeze({
    id: 'mistral',
    label: 'Mistral',
    // https://docs.mistral.ai/api/ — `POST /v1/chat/completions`, Bearer auth.
    baseUrl: 'https://api.mistral.ai/v1',
    // Aliases from the model cards (docs.mistral.ai/models/model-cards/…).
    defaultModels: Object.freeze([
      { id: 'mistral-small-latest', label: 'Mistral Small', note: 'Fast and cheap' },
      { id: 'mistral-medium-latest', label: 'Mistral Medium' },
    ]),
    defaultModel: 'mistral-small-latest',
    // https://docs.mistral.ai/capabilities/structured_output/json_mode
    supportsJsonMode: true,
    maxTokensParam: 'max_tokens',
    browserSupport: 'unverified',
    keyPlaceholder: 'Your Mistral API key',
    keysUrl: 'https://console.mistral.ai',
    docsUrl: 'https://docs.mistral.ai/api/',
  }),
  xai: Object.freeze({
    id: 'xai',
    label: 'xAI Grok',
    // https://docs.x.ai/developers/model-capabilities/legacy/chat-completions —
    // offered as a legacy endpoint (new features land on /v1/responses), but
    // documented and current, and it is the shape this client speaks.
    baseUrl: 'https://api.x.ai/v1',
    // https://docs.x.ai/docs/models
    defaultModels: Object.freeze([
      { id: 'grok-4.3', label: 'Grok 4.3', note: 'Cheaper' },
      { id: 'grok-4.7', label: 'Grok 4.7', note: 'Most capable' },
    ]),
    defaultModel: 'grok-4.3',
    // https://docs.x.ai/docs/guides/structured-outputs — `json_object` is
    // accepted "for backward compatibility".
    supportsJsonMode: true,
    // https://docs.x.ai/developers/rest-api-reference/inference/chat-completions
    // — `max_tokens` is marked deprecated in favour of this.
    maxTokensParam: 'max_completion_tokens',
    browserSupport: 'unverified',
    keyPlaceholder: 'Your xAI API key',
    keysUrl: 'https://console.x.ai/team/default/api-keys',
    docsUrl: 'https://docs.x.ai/docs/api-reference',
  }),
})

export const OPENAI_COMPATIBLE_IDS = Object.keys(
  OPENAI_COMPATIBLE_PRESETS,
) as OpenAICompatibleProviderId[]

export function isOpenAICompatibleId(id: string): id is OpenAICompatibleProviderId {
  return Object.prototype.hasOwnProperty.call(OPENAI_COMPATIBLE_PRESETS, id)
}

export function chatCompletionsUrl(preset: OpenAICompatiblePreset): string {
  return `${preset.baseUrl}/chat/completions`
}
