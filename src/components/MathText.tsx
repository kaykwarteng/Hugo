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

/**
 * Recover LaTeX commands mangled into control characters by JSON/string escaping
 * (e.g. "\\frac" -> form-feed + "rac", "\\nabla" -> newline + "abla").
 * Only applied for control-char + known command continuation to avoid altering real whitespace.
 */
function normalizeMathText(text: string): string {
  return text
    .replace(/[\u0008\u2408](?=egin\b|eta\b|ar\b|ig|inom|oldsymbol\b|oldsym\b|ullet\b)/g, '\\b') // \begin,\beta,\bar,\big,\binom,\boldsymbol,\bullet
    .replace(/\f(?=rac\b|orall\b|box\b)/g, '\\f') // \frac,\forall,\fbox
    .replace(/\n(?=abla\b|eq\b|u\b|ot\b|eg\b|ewline\b)/g, '\\n') // \nabla,\neq,\nu,\not,\neg,\newline
    .replace(/\r(?=ho\b|ight|angle\b|Vert\b|vert\b)/g, '\\r') // \rho,\rightarrow,\rangle,\rVert,\rvert
    .replace(/\t(?=au\b|heta\b|imes\b|ext\b|an\b|o\b|ilde\b|riangle)/g, '\\t') // \tau,\theta,\times,\text,\tan,\to,\tilde,\triangle
    .replace(/\v(?=ert\b|ar|ec\b|arepsilon\b)/g, '\\v') // \vert,\var*,\vec,\varepsilon
    .replace(/\\boldsym\b/g, '\\boldsymbol') // repair double-mangled \boldsymbol
    .replace(/\\boldsymbol\{\\boldsymbol\{/g, '\\boldsymbol{') // collapse double-wrap
    .replace(/\\boldsymbol\{varepsilon\}/g, '\\boldsymbol{\\varepsilon}')
    .replace(/\\bvarepsilon\b/g, '\\varepsilon') // repair \bvarepsilon -> \varepsilon
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
