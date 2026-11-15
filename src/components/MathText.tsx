import { useMemo } from 'react'

/**
 * Renders text that may contain LaTeX math using KaTeX.
 * Supports $...$, $$...$$, \(...\), \[...\].
 * Falls back to plain text if KaTeX is unavailable or parsing fails.
 * Reusable across questions, options, explanations.
 */

declare global {
  interface Window {
    katex?: {
      renderToString: (
        tex: string,
        options?: {
          displayMode?: boolean
          throwOnError?: boolean
          strict?: boolean | string
          trust?: boolean
        },
      ) => string
    }
  }
}

const INLINE_RE = /\$((?:\\.|[^$\\])+)\$|\\\((.+?)\\\)/g
const DISPLAY_RE = /\$\$((?:\\.|[^$\\])+)\$\$|\\\[(.+?)\\\]/g

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderKatex(tex: string, displayMode: boolean): string {
  if (typeof window === 'undefined' || !window.katex) {
    return escapeHtml(tex)
  }
  try {
    return window.katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    })
  } catch {
    return escapeHtml(tex)
  }
}

/**
 * Split text into segments of plain text and math, then render.
 * Processes display math first, then inline, to avoid conflicts.
 */
function processMath(text: string): string {
  if (!text) return ''

  // Protect display math first
  const displayParts: string[] = []
  let s = text.replace(DISPLAY_RE, (_m, g1, g2) => {
    const tex = (g1 ?? g2 ?? '').trim()
    const html = renderKatex(tex, true)
    const idx = displayParts.length
    displayParts.push(
      `<span class="math-display katex-display-wrapper">${html}</span>`,
    )
    return `\u0000DISPLAY${idx}\u0000`
  })

  // Then inline
  const inlineParts: string[] = []
  s = s.replace(INLINE_RE, (_m, g1, g2) => {
    const tex = (g1 ?? g2 ?? '').trim()
    const html = renderKatex(tex, false)
    const idx = inlineParts.length
    inlineParts.push(`<span class="math-inline">${html}</span>`)
    return `\u0000INLINE${idx}\u0000`
  })

  // Escape remaining plain text, then restore math
  s = escapeHtml(s)
  s = s.replace(/\u0000DISPLAY(\d+)\u0000/g, (_m, i) => displayParts[Number(i)] ?? '')
  s = s.replace(/\u0000INLINE(\d+)\u0000/g, (_m, i) => inlineParts[Number(i)] ?? '')

  // Preserve newlines as <br> for readability in multi-line content
  s = s.replace(/\n/g, '<br />')

  return s
}

interface MathTextProps {
  children: string
  className?: string
  as?: 'span' | 'div' | 'p' | 'h2' | 'h3'
}

export function MathText({ children, className = '', as: Tag = 'span' }: MathTextProps) {
  const html = useMemo(() => processMath(children ?? ''), [children])

  return (
    <Tag
      className={`math-text ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
