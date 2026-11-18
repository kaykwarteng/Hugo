import { useId, useState } from 'react'
import type { SavedQuiz } from '../types/quiz'

interface SaveQuizPanelProps {
  questionCount: number
  duplicate: SavedQuiz | null
  savedName: string | null
  onSave: (name: string) => void | Promise<void>
  onUpdate: (quizId: string) => void | Promise<void>
  disabled?: boolean
}

/**
 * Save imported questions to the Quiz Library (SQLite via local API).
 */
export function SaveQuizPanel({
  questionCount,
  duplicate,
  savedName,
  onSave,
  onUpdate,
  disabled = false,
}: SaveQuizPanelProps) {
  const inputId = useId()
  const [name, setName] = useState(duplicate?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => void | Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save quiz')
    } finally {
      setBusy(false)
    }
  }

  const handleSave = () => {
    if (name.trim() === '') {
      setError('Give the quiz a name so you can find it later.')
      return
    }
    setError(null)
    void run(() => onSave(name))
  }

  if (savedName !== null) {
    return (
      <div
        role="status"
        className="animate-fade-slide-in rounded-2xl border border-green-300 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400"
      >
        <strong>{savedName}</strong> is saved in your Quiz Library. Configure and start it below.
      </div>
    )
  }

  return (
    <div className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-base font-semibold">Save to your Quiz Library</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Keep these {questionCount} questions in this browser so you can retake them later.
      </p>

      {duplicate !== null && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300">
          <p>
            These questions are already saved as <strong>{duplicate.name}</strong>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => void run(() => onUpdate(duplicate.id))}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : `Update “${duplicate.name}”`}
            </button>
          </div>
          <p className="mt-2 text-xs">
            Updating replaces the saved questions and clears any unfinished attempt. Past results are
            kept. Or save a separate copy under a new name below.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
            Quiz name
          </label>
          <input
            id={inputId}
            type="text"
            value={name}
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
            placeholder="e.g. Pharmacology — Unit 3"
            aria-invalid={error !== null}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || disabled}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-medium shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          {busy ? 'Saving…' : duplicate !== null ? 'Save as new copy' : 'Save quiz'}
        </button>
      </div>

      {error !== null && (
        <p id={`${inputId}-error`} role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
