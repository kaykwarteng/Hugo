import { useEffect, useState } from 'react'
import type { SaveAttemptResult } from '../hooks/useSavedQuizzes'
import { playSound } from '../services/sound'
import type { QuizAttempt } from '../types/quiz'
import { formatDateTime, formatRelativeDay, isIncorrectOnlyAttempt, splitQuizLabel } from '../utils/library'
import { ConfirmDialog } from './ConfirmDialog'
import type { MenuAction } from './OverflowMenu'
import { OverflowMenu } from './OverflowMenu'
import { IconBook, IconLibrary, IconTrash } from './icons/Icons'

/** How long the "Saved to Quiz Library" confirmation stays up. */
const FEEDBACK_MS = 5000

interface RecentResultsProps {
  /** Newest first; the caller decides how many to pass. */
  attempts: QuizAttempt[]
  onReview: (attempt: QuizAttempt) => void
  onDelete: (attempt: QuizAttempt) => void
  /** Batch delete (used by selection mode). Falls back to per-attempt deletes if omitted. */
  onDeleteMany?: (attempts: QuizAttempt[]) => void | Promise<void>
  /**
   * Files the attempt's questions in the Quiz Library. Omitted only if a caller
   * wants a read-only list; when omitted the menu item isn't offered at all.
   */
  onSaveToLibrary?: (attempt: QuizAttempt) => Promise<SaveAttemptResult> | SaveAttemptResult
  /** Whether this attempt's questions are already in the library. */
  isInLibrary?: (attempt: QuizAttempt) => boolean
  heading?: string
  subheading?: string
  /**
   * Shown instead of the list when there are no attempts. Omitted on the home
   * strip, where the section simply disappears rather than taking up room.
   */
  emptyState?: React.ReactNode
  /** Adds a "See all" link beside the heading. */
  onSeeAll?: () => void
  /** Enables batch select/delete controls (typically on the Results tab). */
  selectable?: boolean
}

/**
 * The results list, spanning every quiz — including attempts at quizzes that
 * were never saved to the library, which have no other home.
 *
 * One component serves both the short home strip and the full Results screen;
 * the caller decides how many attempts to pass and what an empty list means.
 */
export function RecentResults({
  attempts,
  onReview,
  onDelete,
  onDeleteMany,
  onSaveToLibrary,
  isInLibrary,
  heading = 'Recent results',
  subheading,
  emptyState,
  onSeeAll,
  selectable = false,
}: RecentResultsProps) {
  const [pendingDelete, setPendingDelete] = useState<QuizAttempt | null>(null)
  const [feedback, setFeedback] = useState<SaveAttemptResult | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  // The confirmation clears itself so it can't linger over an unrelated action
  // later in the session. Re-saving restarts the timer, because `feedback` is
  // a new object each time.
  useEffect(() => {
    if (feedback === null) return
    const timer = window.setTimeout(() => setFeedback(null), FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    if (!selectable || !selectMode) return
    const valid = new Set(attempts.map((a) => a.id))
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [attempts, selectable, selectMode])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectedAttempts = attempts.filter((a) => selectedIds.has(a.id))
  const allSelected = attempts.length > 0 && selectedAttempts.length === attempts.length
  const deleteSelected = async () => {
    if (selectedAttempts.length === 0) return
    try {
      if (onDeleteMany) await Promise.resolve(onDeleteMany(selectedAttempts))
      else await Promise.all(selectedAttempts.map((a) => Promise.resolve(onDelete(a))))
    } catch { /* parent surfaces */ }
    setSelectedIds(new Set())
    setSelectMode(false)
    setConfirmBulkDelete(false)
  }

  const handleSave = (attempt: QuizAttempt) => {
    if (onSaveToLibrary === undefined) return
    void Promise.resolve(onSaveToLibrary(attempt))
      .then((outcome) => {
        if (outcome.status === 'saved') playSound('save')
        setFeedback(outcome)
      })
      .catch(() => {
        /* ignore; parent surfaces DB errors */
      })
  }

  /**
   * "Save to Quiz Library" turns into a disabled "Already saved" rather than
   * disappearing, so the row's actions don't move around and the state is
   * visible instead of merely implied.
   */
  const buildActions = (attempt: QuizAttempt): MenuAction[] => {
    const actions: MenuAction[] = [{ label: 'Review answers', icon: <IconBook size={14} />, onSelect: () => onReview(attempt) }]

    if (onSaveToLibrary !== undefined) {
      const saved = isInLibrary?.(attempt) ?? false
      actions.push({
        label: saved ? 'Already saved' : 'Save to Quiz Library',
        icon: <IconLibrary size={14} />,
        onSelect: () => handleSave(attempt),
        disabled: saved,
        title: saved
          ? 'These questions are already in your Quiz Library.'
          : 'Keep these questions in your library so you can retake them.',
      })
    }

    if (selectable) {
      actions.push({
        label: selectedIds.has(attempt.id) ? 'Unselect' : 'Select',
        icon: <IconBook size={14} />,
        onSelect: () => {
          setSelectMode(true)
          toggleSelect(attempt.id)
        },
      })
    }

    actions.push({ label: 'Delete', icon: <IconTrash size={14} />, onSelect: () => setPendingDelete(attempt), danger: true })
    return actions
  }

  if (attempts.length === 0 && emptyState === undefined) return null

  return (
    <section aria-labelledby="recent-results-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="recent-results-heading" className="text-xl font-bold tracking-tight">
            {heading}
          </h2>
          {subheading !== undefined && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{subheading}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectable && attempts.length > 0 && (
            selectMode ? (
              <>
                <span className="text-sm text-slate-600 dark:text-slate-400">{selectedIds.size} selected</span>
                <button type="button" onClick={() => setSelectedIds(allSelected ? new Set() : new Set(attempts.map((a) => a.id)))} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                  {allSelected ? 'Select none' : 'Select all'}
                </button>
                <button type="button" onClick={() => setConfirmBulkDelete(true)} disabled={selectedIds.size === 0} className="min-h-9 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                  Delete selected
                </button>
                <button type="button" onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }} className="min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setSelectMode(true)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                Select
              </button>
            )
          )}
          {onSeeAll !== undefined && attempts.length > 0 && (
            <button
              type="button"
              onClick={onSeeAll}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
            >
              See all →
            </button>
          )}
        </div>
      </div>

      {feedback !== null && (
        <p
          role="status"
          className="animate-fade-slide-in break-words rounded-2xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400"
        >
          {feedback.status === 'saved' ? (
            <>
              Saved to Quiz Library as <strong>{feedback.quiz.name}</strong>.
            </>
          ) : (
            <>
              Already in your Quiz Library as <strong>{feedback.quiz.name}</strong> — nothing was
              duplicated.
            </>
          )}
        </p>
      )}

      {attempts.length === 0 ? (
        emptyState
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {attempts.map((attempt) => {
            const { primary, secondary } = splitQuizLabel(attempt.quizName)
            const incorrectOnly = isIncorrectOnlyAttempt(attempt)
            const selected = selectedIds.has(attempt.id)
            return (
            <li key={attempt.id} className={`group flex items-center pr-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70 ${selected ? 'bg-indigo-50/70 dark:bg-indigo-950/20' : ''}`}>
              {selectable && selectMode && (
                <div className="pl-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(attempt.id)}
                    aria-label={`Select attempt ${attempt.quizName} from ${formatDateTime(attempt.completedAt)}`}
                    className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => (selectable && selectMode ? toggleSelect(attempt.id) : onReview(attempt))}
                aria-label={`Review ${attempt.quizName} attempt from ${formatDateTime(attempt.completedAt)}`}
                className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold leading-snug">{primary}</span>
                  {(secondary || incorrectOnly) && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {secondary && (
                        <span className="inline-flex max-w-full rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <span className="truncate">{secondary}</span>
                        </span>
                      )}
                      {incorrectOnly && (
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Incorrect only
                        </span>
                      )}
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {attempt.correct}/{attempt.total} correct · {formatRelativeDay(attempt.completedAt)}
                  </span>
                </span>
                <span className="shrink-0 text-lg font-bold text-indigo-600 tabular-nums dark:text-indigo-400">
                  {attempt.percentage}%
                </span>
              </button>
              <div className="shrink-0">
                <OverflowMenu
                  label={`More actions for the ${attempt.quizName} attempt from ${formatDateTime(attempt.completedAt)}`}
                  actions={buildActions(attempt)}
                />
              </div>
            </li>
            )
          })}
        </ul>
      )}

      {pendingDelete !== null && (
        <ConfirmDialog
          title="Delete this attempt?"
          message={
            <p>
              The <strong>{splitQuizLabel(pendingDelete.quizName).primary}</strong> attempt from{' '}
              {formatDateTime(pendingDelete.completedAt)} ({pendingDelete.percentage}%) will be removed
              from your history.
            </p>
          }
          confirmLabel="Delete attempt"
          danger
          onConfirm={() => {
            onDelete(pendingDelete)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {confirmBulkDelete && selectedAttempts.length > 0 && (
        <ConfirmDialog
          title={`Delete ${selectedAttempts.length} selected attempt${selectedAttempts.length === 1 ? '' : 's'}?`}
          message={
            <p>
              {selectedAttempts.length} result{selectedAttempts.length === 1 ? '' : 's'} will be removed
              from your history. This cannot be undone.
            </p>
          }
          confirmLabel={`Delete ${selectedAttempts.length}`}
          danger
          onConfirm={() => { void deleteSelected() }}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
    </section>
  )
}
