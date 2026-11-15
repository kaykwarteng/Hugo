import { describe, expect, it } from 'vitest'
import { defaultModelFor, isCatalogModel, PROVIDER_LIST, PROVIDERS } from './models'
import {
  chatCompletionsUrl,
  isOpenAICompatibleId,
  OPENAI_COMPATIBLE_IDS,
  OPENAI_COMPATIBLE_PRESETS,
} from './providerRegistry'

const presets = Object.entries(OPENAI_COMPATIBLE_PRESETS)

describe('provider registry', () => {
  it('holds exactly DeepSeek, Mistral and xAI', () => {
    expect([...OPENAI_COMPATIBLE_IDS].sort()).toEqual(['deepseek', 'mistral', 'xai'])
  })

  it.each(presets)('%s has every required field', (key, preset) => {
    expect(preset.id).toBe(key)
    expect(preset.label.trim()).not.toBe('')
    expect(preset.keyPlaceholder.trim()).not.toBe('')
    expect(typeof preset.supportsJsonMode).toBe('boolean')
    expect(['max_tokens', 'max_completion_tokens']).toContain(preset.maxTokensParam)
    expect(['works', 'unverified', 'blocked']).toContain(preset.browserSupport)
  })

  it.each(presets)('%s points only at an https origin with no trailing slash', (_key, preset) => {
    const url = new URL(preset.baseUrl)
    expect(url.protocol).toBe('https:')
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
    expect(preset.baseUrl.endsWith('/')).toBe(false)
    expect(chatCompletionsUrl(preset)).toBe(`${preset.baseUrl}/chat/completions`)
  })

  it.each(presets)('%s links to https pages for keys and docs', (_key, preset) => {
    expect(new URL(preset.keysUrl).protocol).toBe('https:')
    expect(new URL(preset.docsUrl).protocol).toBe('https:')
  })

  it.each(presets)('%s has a short, unique suggestion list containing its default', (_key, preset) => {
    const ids = preset.defaultModels.map((model) => model.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.length).toBeLessThanOrEqual(4)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(preset.defaultModel)
    for (const model of preset.defaultModels) {
      expect(model.id.trim()).toBe(model.id)
      expect(model.label.trim()).not.toBe('')
    }
  })

  it('cannot be edited at runtime — the endpoint is the only place a key goes', () => {
    const preset = OPENAI_COMPATIBLE_PRESETS.deepseek
    expect(Object.isFrozen(OPENAI_COMPATIBLE_PRESETS)).toBe(true)
    expect(Object.isFrozen(preset)).toBe(true)
    expect(Object.isFrozen(preset.defaultModels)).toBe(true)
    expect(() => {
      ;(preset as { baseUrl: string }).baseUrl = 'https://evil.example'
    }).toThrow()
    expect(preset.baseUrl).toBe('https://api.deepseek.com')
  })

  it('does not claim browser support it has not confirmed', () => {
    // Flip a preset to 'works' only alongside a confirmed browser test or an
    // official statement, and update this expectation in the same change.
    for (const [, preset] of presets) expect(preset.browserSupport).toBe('unverified')
  })

  it('recognises its own ids and nothing else', () => {
    expect(isOpenAICompatibleId('mistral')).toBe(true)
    expect(isOpenAICompatibleId('openai')).toBe(false)
    expect(isOpenAICompatibleId('toString')).toBe(false)
  })
})

describe('settings catalog', () => {
  it('lists every provider once, the original three first', () => {
    const ids = PROVIDER_LIST.map((provider) => provider.id)
    expect(ids).toEqual(['openai', 'gemini', 'anthropic', 'deepseek', 'mistral', 'xai'])
  })

  it.each(OPENAI_COMPATIBLE_IDS)('%s settings metadata is derived from the registry', (id) => {
    const preset = OPENAI_COMPATIBLE_PRESETS[id]
    const meta = PROVIDERS[id]
    expect(meta.label).toBe(preset.label)
    expect(meta.models).toBe(preset.defaultModels)
    expect(meta.browserSupport).toBe(preset.browserSupport)
    expect(meta.apiHost).toBe(new URL(preset.baseUrl).host)
    expect(defaultModelFor(id)).toBe(preset.defaultModel)
    expect(isCatalogModel(id, preset.defaultModel)).toBe(true)
    expect(isCatalogModel(id, 'my-custom-model')).toBe(false)
  })

  it('leaves the original providers without a browser-support label', () => {
    expect(PROVIDERS.openai.browserSupport).toBeUndefined()
    expect(PROVIDERS.gemini.browserSupport).toBeUndefined()
    expect(PROVIDERS.anthropic.browserSupport).toBeUndefined()
  })
})
