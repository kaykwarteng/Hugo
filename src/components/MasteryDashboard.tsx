import { useMemo, useState } from 'react'
import type { Course, QuestionMastery, QuizQuestion, SavedQuiz } from '../types/quiz'
import { getMasterySummary, selectQuestionsByMastery, flattenCourseQuestions } from '../utils/mastery'
import { ConfirmDialog } from './ConfirmDialog'

interface ReviewTarget {
  questions: QuizQuestion[]
  quizId?: string
  quizName: string
  scopeId: string
}

interface MasteryDashboardProps {
  mastery: Record<string, QuestionMastery>
  enabledScopes: string[]
  quizzes: SavedQuiz[]
  courses: Course[]
  onStartReview: (target: ReviewTarget) => void
  onStartFlashcards?: (target: ReviewTarget) => void
  onResetScope?: (scopeId: string) => void | Promise<void>
  compact?: boolean
}

function ScopeCard({
  title,
  subtitle,
  scopeId,
  questions,
  mastery,
  onStartReview,
  onStartFlashcards,
  onResetScope,
}: {
  title: string
  subtitle?: string
  scopeId: string
  questions: QuizQuestion[]
  mastery: Record<string, QuestionMastery>
  onStartReview: MasteryDashboardProps['onStartReview']
  onStartFlashcards?: MasteryDashboardProps['onStartFlashcards']
  onResetScope?: MasteryDashboardProps['onResetScope']
}) {
  const summary = useMemo(() => getMasterySummary(questions, scopeId, mastery), [questions, scopeId, mastery])
  const due = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'due'), [questions, scopeId, mastery])
  const weak = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'weak'), [questions, scopeId, mastery])
  const adaptive = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'adaptive', 20), [questions, scopeId, mastery])
  const flagged = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'flagged'), [questions, scopeId, mastery])
  const bookmarked = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'bookmarked'), [questions, scopeId, mastery])

  const recordCount = useMemo(() => scopeRecordCount(scopeId, mastery), [scopeId, mastery])
  // show enabled scopes even without questions/progress yet

  const start = (mode: 'due' | 'weak' | 'adaptive' | 'flagged' | 'bookmarked') => {
    const qs = mode === 'due' ? due : mode === 'weak' ? weak : mode === 'adaptive' ? adaptive : mode === 'flagged' ? flagged : bookmarked
    if (qs.length === 0) return
    const suffix = mode === 'due' ? 'Due review' : mode === 'weak' ? 'Weak areas' : mode === 'adaptive' ? 'Adaptive drill' : mode === 'flagged' ? 'Flagged' : 'Bookmarked'
    onStartReview({ questions: qs, quizId: scopeId, quizName: `${title} · ${suffix}`, scopeId })
  }

  const flashcards = adaptive.length > 0 ? adaptive : questions
  const startFlashcards = () => {
    if (!onStartFlashcards || flashcards.length === 0) return
    onStartFlashcards({ questions: flashcards, quizId: scopeId, quizName: `${title} · Flashcards`, scopeId })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex flex-wrap justify-end gap-1 text-xs">
            {summary.due > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">{summary.due} due</span>}
            {summary.weak > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-400">{summary.weak} weak</span>}
          </div>
          {onResetScope && (
            <button
              type="button"
              onClick={() => onResetScope(scopeId)}
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Reset mastery/review progress for this scope"
            >
              Reset progress
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {questions.length === 0
          ? `${recordCount} saved mastery record${recordCount === 1 ? '' : 's'} · no current questions`
          : `${summary.tracked}/${summary.total} tracked · ${summary.fresh} new`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={due.length === 0} onClick={() => start('due')} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Review due ({due.length})
        </button>
        <button type="button" disabled={weak.length === 0} onClick={() => start('weak')} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Weak areas ({weak.length})
        </button>
        <button type="button" disabled={flagged.length === 0} onClick={() => start('flagged')} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Flagged ({flagged.length})
        </button>
        <button type="button" disabled={bookmarked.length === 0} onClick={() => start('bookmarked')} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Bookmarked ({bookmarked.length})
        </button>
        <button type="button" disabled={adaptive.length === 0} onClick={() => start('adaptive')} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
          Adaptive drill ({adaptive.length})
        </button>
        {onStartFlashcards && (
          <button type="button" disabled={flashcards.length === 0} onClick={startFlashcards} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
            Flashcards ({flashcards.length})
          </button>
        )}
      </div>
    </div>
  )
}

function scopeRecordCount(scopeId: string, mastery: Record<string, QuestionMastery>): number {
  let n = 0
  for (const k of Object.keys(mastery)) {
    const m = /^(.+):(-?\d+)$/.exec(k)
    if (m && m[1] === scopeId) n++
  }
  return n
}

export function MasteryDashboard({ mastery, enabledScopes, quizzes, courses, onStartReview, onStartFlashcards, onResetScope, compact = false }: MasteryDashboardProps) {
  const [pendingReset, setPendingReset] = useState<{ id: string; title: string } | null>(null)
  const scopes = useMemo(() => {
    const enabled = new Set(enabledScopes)
    if (enabled.size === 0) return []
    const items: { id: string; title: string; subtitle?: string; questions: QuizQuestion[] }[] = []
    const known = new Set<string>()
    for (const q of quizzes) {
      if (!enabled.has(q.id)) continue
      items.push({ id: q.id, title: q.name, subtitle: 'Standalone quiz', questions: q.questions })
      known.add(q.id)
    }
    for (const c of courses) {
      const id = `course:${c.id}`
      if (!enabled.has(id)) continue
      const qs = flattenCourseQuestions(c)
      items.push({ id, title: c.name, subtitle: 'Course', questions: qs })
      known.add(id)
    }
    for (const id of enabledScopes) {
      if (known.has(id)) continue
      items.push({
        id,
        title: id.startsWith('course:') ? 'Course' : 'Quiz',
        subtitle: 'Mastery enabled',
        questions: [],
      })
    }
    return items
  }, [quizzes, courses, mastery, enabledScopes])

  const totals = useMemo(() => {
    let due = 0, weak = 0, tracked = 0, total = 0
    for (const s of scopes) {
      const sum = getMasterySummary(s.questions, s.id, mastery)
      due += sum.due; weak += sum.weak; tracked += sum.tracked; total += sum.total
    }
    return { due, weak, tracked, total }
  }, [scopes, mastery])

  if (scopes.length === 0) return null

  const visibleScopes = compact ? scopes.slice(0, 4) : scopes

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Mastery & review</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {totals.tracked} tracked across {totals.total} questions · {totals.due} due · {totals.weak} weak
          </p>
        </div>
      </div>
      <div className={`grid gap-4 ${compact ? 'sm:grid-cols-2' : 'lg:grid-cols-2'}`}>
        {visibleScopes.map((s) => (
          <ScopeCard
            key={s.id}
            title={s.title}
            subtitle={s.subtitle}
            scopeId={s.id}
            questions={s.questions}
            mastery={mastery}
            onStartReview={onStartReview}
            onStartFlashcards={onStartFlashcards}
            onResetScope={onResetScope ? () => setPendingReset({ id: s.id, title: s.title }) : undefined}
          />
        ))}
      </div>
      {compact && scopes.length > 4 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">+{scopes.length - 4} more in Library.</p>
      )}
      {pendingReset && onResetScope && (
        <ConfirmDialog
          title={`Reset progress for “${pendingReset.title}”?`}
          message="This clears saved mastery/review progress for this scope. This cannot be undone."
          confirmLabel="Reset progress"
          danger
          onConfirm={() => {
            const id = pendingReset.id
            setPendingReset(null)
            void Promise.resolve(onResetScope(id)).catch(() => {})
          }}
          onCancel={() => setPendingReset(null)}
        />
      )}
    </section>
  )
}
