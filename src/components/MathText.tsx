import { useEffect, useMemo, useState } from 'react'

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

function normalizeMathText(text: string): string {
  let s = text
  // Recover LaTeX commands mangled into control chars by escaped transport strings
  // e.g. "\frac" -> form-feed + "rac", "\nabla" -> newline + "abla", "\rho" -> CR + "ho", "\theta" -> tab + "heta"
  s = s.replace(/\u0008([a-zA-Z])/g, '\\b$1') // \bar-like (\b)
  s = s.replace(/\f(?=rac|rac\{|orm|orall)/g, '\\f') // \frac, \forall (approx)
  s = s.replace(/\f/g, '\\f')
  s = s.replace(/\n(?=abla|u|eq|ot|eg)/g, '\\n')
  s = s.replace(/\r(?=ho|ightarrow|angle)/g, '\\r')
  s = s.replace(/\t(?=heta|au|imes|an|ext)/g, '\\t')
  // Common specific recoveries
  s = s.replace(/\\nabla/g, '\\nabla') // keep
  return s
}

function autoWrapBareMath(text: string): string {
  // Wrap likely undelimited TeX-ish segments so KaTeX can render them.
  // Runs that contain subscripts/superscripts or LaTeX commands, allowing =, operators, spaces, commas, parens.
  return text.replace(
    /(^|[\s(])((?:\\[a-zA-Z]+|[A-Za-z0-9]+)(?:[_^](?:\{[^}]+\}|[A-Za-z0-9]+)|\\[a-zA-Z]+|[A-Za-z0-9(),.=+\-/*<>|]|\s(?![A-Za-z]{3,}\s[A-Za-z])){1,})/g,
    (m, lead: string, expr: string) => {
      if (expr.startsWith('$') || expr.startsWith('\\(')) return m
      // require a strong math signal to avoid wrapping plain words
      if (!/[_^\\=]/.test(expr)) return m
      // trim trailing sentence punctuation/space
      const trimmed = expr.replace(/[.,;:]+$/g, '')
      const tail = expr.slice(trimmed.length)
      return `${lead}$${trimmed}$${tail}`
    },
  )
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

  let s = normalizeMathText(text)
  s = autoWrapBareMath(s)

  // Protect display math first
  const displayParts: string[] = []
  s = s.replace(DISPLAY_RE, (_m, g1, g2) => {
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
  const [katexReady, setKatexReady] = useState(
    () => typeof window !== 'undefined' && !!window.katex,
  )

  useEffect(() => {
    if (katexReady) return
    let cancelled = false
    const check = () => {
      if (window.katex) {
        if (!cancelled) setKatexReady(true)
        return true
      }
      return false
    }
    if (check()) return
    const id = window.setInterval(() => {
      if (check()) window.clearInterval(id)
    }, 50)
    const timeout = window.setTimeout(() => window.clearInterval(id), 10000)
    return () => {
      cancelled = true
      window.clearInterval(id)
      window.clearTimeout(timeout)
    }
  }, [katexReady])

  const html = useMemo(
    () => processMath(children ?? ''),
    [children, katexReady],
  )

  return (
    <Tag
      className={`math-text ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
