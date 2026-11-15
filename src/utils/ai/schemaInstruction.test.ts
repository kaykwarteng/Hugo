import { describe, expect, it } from 'vitest'
import { AI_EXPLANATION_SCHEMA, AI_EXPLANATION_SYSTEM } from './buildAIExplanationPrompt'
import { withSchemaInstruction } from './schemaInstruction'

describe('withSchemaInstruction', () => {
  const schema = AI_EXPLANATION_SCHEMA as unknown as Record<string, unknown>
  const prompt = withSchemaInstruction(AI_EXPLANATION_SYSTEM, schema)

  it('keeps the original system prompt first and intact', () => {
    expect(prompt.startsWith(AI_EXPLANATION_SYSTEM)).toBe(true)
  })

  it('embeds the schema verbatim, so every property name reaches the model', () => {
    expect(prompt).toContain(JSON.stringify(schema))
    for (const key of ['correctOptionIndexes', 'explanation', 'optionNotes', 'confidence']) {
      expect(prompt).toContain(key)
    }
  })

  it('asks for JSON in so many words — JSON mode requires it', () => {
    expect(prompt.toLowerCase()).toContain('json')
    expect(prompt).toMatch(/single JSON object/)
  })
})
