/**
 * Spell the response schema out in the system prompt. Pure — no React, no I/O.
 *
 * OpenAI, Gemini and Anthropic receive the schema natively and enforce it, so
 * the prompts in this folder only say "matching the provided schema" and never
 * name a field. The OpenAI-compatible providers (DeepSeek, Mistral, xAI) are
 * called with plain JSON mode at most, which guarantees *some* JSON but not
 * which keys — without this they would have to guess `correctOptionIndexes`.
 * Their JSON mode also requires the prompt itself to ask for JSON, which this
 * does in so many words.
 *
 * It is guidance, not a guarantee: whatever comes back still goes through
 * `extractJson` and the matching `validate*Response`.
 */
export function withSchemaInstruction(system: string, schema: Record<string, unknown>): string {
  return (
    `${system}\n\n` +
    'Respond with a single JSON object and nothing else — no markdown fences, no ' +
    'text before or after it. The JSON object must conform to this JSON Schema, ' +
    'using exactly these property names:\n' +
    JSON.stringify(schema)
  )
}
