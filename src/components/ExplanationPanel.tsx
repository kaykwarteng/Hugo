import { useState } from 'react'
import { MathText } from './MathText'

interface ExplanationPanelProps {
  explanation?: string
  /** Render expanded from the start (used on the review screen). */
  defaultOpen?: boolean
}

/**
 * Expandable explanation. Renders nothing when the question has no
 * explanation, per the schema where `explanation` is optional.
 */
export function ExplanationPanel({ explanation, defaultOpen = false }: ExplanationPanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (!explanation) return null

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
      >
        <svg
          aria-hidden
          className="size-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        {open ? 'Hide explanation' : 'Show explanation'}
      </button>
      {open && (
        <div className="animate-fade-slide-in mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-relaxed text-slate-700 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-slate-300">
          <MathText as="div">{explanation}</MathText>
        </div>
      )}
    </div>
  )
}
