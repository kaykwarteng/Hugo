import { useId, useMemo, useState } from 'react'
import type { Course, QuestionMastery, QuizQuestion, SavedQuiz } from '../types/quiz'
import {
  getCategoryGroups,
  getChapterGroups,
  getMasterySummary,
  selectQuestionsByMastery,
  flattenCourseQuestions,
  type MasteryGroup,
  type MasterySummary,
} from '../utils/mastery'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'
import { OverflowMenu } from './OverflowMenu'
import { IconRefresh } from './icons/Icons'

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

type Mode = 'due' | 'weak' | 'adaptive' | 'flagged' | 'bookmarked'

function ScopeCard({
  title,
  subtitle,
  scopeId,
  questions,
  mastery,
  course,
  onStartReview,
  onStartFlashcards,
  onResetScope,
}: {
  title: string
  subtitle?: string
  scopeId: string
  questions: QuizQuestion[]
  mastery: Record<string, QuestionMastery>
  course?: Course
  onStartReview: MasteryDashboardProps['onStartReview']
  onStartFlashcards?: MasteryDashboardProps['onStartFlashcards']
  onResetScope?: MasteryDashboardProps['onResetScope']
}) {
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const breakdownTitleId = useId()
  const summary = useMemo(() => getMasterySummary(questions, scopeId, mastery), [questions, scopeId, mastery])
  const due = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'due'), [questions, scopeId, mastery])
  const weak = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'weak'), [questions, scopeId, mastery])
  const adaptive = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'adaptive', 20), [questions, scopeId, mastery])
  const flagged = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'flagged'), [questions, scopeId, mastery])
  const bookmarked = useMemo(() => selectQuestionsByMastery(questions, scopeId, mastery, 'bookmarked'), [questions, scopeId, mastery])

  const chapterGroups = useMemo(
    () => (course ? getChapterGroups(course, mastery) : []),
    [course, mastery],
  )
  const categoryGroups = useMemo(
    () => getCategoryGroups(questions, scopeId, mastery),
    [questions, scopeId, mastery],
  )
  const hasCategoryBreakdown =
    categoryGroups.length > 1 || (categoryGroups.length === 1 && categoryGroups[0].label !== 'Uncategorized')
  const hasBreakdown = (course && chapterGroups.length > 0) || hasCategoryBreakdown

  const recordCount = useMemo(() => scopeRecordCount(scopeId, mastery), [scopeId, mastery])

  const start = (mode: Mode) => {
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

  const primaryMode: Mode | null =
    due.length > 0 ? 'due' : adaptive.length > 0 ? 'adaptive' : weak.length > 0 ? 'weak' : null

  const extraModes: { mode: Mode; label: string; count: number }[] = []
  if (primaryMode !== 'weak' && weak.length > 0) extraModes.push({ mode: 'weak', label: 'Weak', count: weak.length })
  if (flagged.length > 0) extraModes.push({ mode: 'flagged', label: 'Flagged', count: flagged.length })
  if (bookmarked.length > 0) extraModes.push({ mode: 'bookmarked', label: 'Bookmarked', count: bookmarked.length })

  const primaryLabel =
    primaryMode === 'due'
      ? `Review due (${due.length})`
      : primaryMode === 'adaptive'
        ? `Adaptive drill (${adaptive.length})`
        : primaryMode === 'weak'
          ? `Practice weak (${weak.length})`
          : ''

  const meta =
    questions.length === 0
      ? `${recordCount} saved record${recordCount === 1 ? '' : 's'}`
      : `${summary.tracked}/${summary.total} tracked`

  return (
    <>
      <div
        className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${hasBreakdown ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}`}
        onClick={(e) => {
          if (!hasBreakdown) return
          const target = e.target as HTMLElement
          if (target.closest('button, a, input, select, textarea, [role="menu"], [role="menuitem"]')) return
          setBreakdownOpen(true)
        }}
        title={hasBreakdown ? 'Click for chapter/category breakdown' : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {subtitle ? `${subtitle} · ` : ''}
              {meta}
            </p>
          </div>
          {onResetScope && (
            <div className="shrink-0">
              <OverflowMenu
                label={`Actions for ${title}`}
                actions={[
                  {
                    label: 'Reset progress',
                    icon: <IconRefresh size={14} />,
                    onSelect: () => onResetScope(scopeId),
                    danger: true,
                  },
                ]}
              />
            </div>
          )}
        </div>

        {questions.length > 0 && (
          <div className="mt-2">
            <DistributionBar summary={summary} />
            <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
              <span className="font-medium text-green-700 dark:text-green-400">Strong {summary.strong}</span>
              <span className="font-medium text-blue-700 dark:text-blue-400">Learning {summary.learning}</span>
              <span className="font-medium text-amber-700 dark:text-amber-400">Due {summary.due}</span>
              <span className="font-medium text-red-700 dark:text-red-400">Weak {summary.weak}</span>
              <span className="text-slate-500 dark:text-slate-400">New {summary.fresh}</span>
            </p>
          </div>
        )}

        <div className="mt-3 flex flex-1 flex-col gap-2">
          {(primaryMode || (onStartFlashcards && flashcards.length > 0)) && (
            <div className="flex flex-wrap gap-2">
              {primaryMode && (
                <button
                  type="button"
                  onClick={() => start(primaryMode)}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                >
                  {primaryLabel}
                </button>
              )}
              {onStartFlashcards && flashcards.length > 0 && (
                <button
                  type="button"
                  onClick={startFlashcards}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                >
                  Flashcards
                </button>
              )}
            </div>
          )}

          {extraModes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {extraModes.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => start(m.mode)}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {m.label} ({m.count})
                </button>
              ))}
            </div>
          )}

          {!primaryMode && !(onStartFlashcards && flashcards.length > 0) && questions.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">No questions available yet.</p>
          )}
        </div>
      </div>

      {breakdownOpen && hasBreakdown && (
        <Modal labelledBy={breakdownTitleId} onClose={() => setBreakdownOpen(false)} panelClassName="max-w-2xl">
          <h2 id={breakdownTitleId} className="break-words text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title} · Breakdown
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {subtitle ? `${subtitle} · ` : ''}
            {summary.tracked}/{summary.total} tracked
          </p>
          {questions.length > 0 && (
            <div className="mt-3">
              <DistributionBar summary={summary} />
              <p className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
                <span className="font-medium text-green-700 dark:text-green-400">Strong {summary.strong}</span>
                <span className="font-medium text-blue-700 dark:text-blue-400">Learning {summary.learning}</span>
                <span className="font-medium text-amber-700 dark:text-amber-400">Due {summary.due}</span>
                <span className="font-medium text-red-700 dark:text-red-400">Weak {summary.weak}</span>
                <span className="text-slate-500 dark:text-slate-400">New {summary.fresh}</span>
              </p>
            </div>
          )}
          <div className="mt-4 space-y-4">
            {course && chapterGroups.length > 0 && (
              <BreakdownSection
                title="By chapter"
                groups={chapterGroups}
                scopeId={scopeId}
                baseTitle={title}
                mastery={mastery}
                onStartReview={onStartReview}
              />
            )}
            {hasCategoryBreakdown && (
              <BreakdownSection
                title="By category"
                groups={categoryGroups}
                scopeId={scopeId}
                baseTitle={title}
                mastery={mastery}
                onStartReview={onStartReview}
              />
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

function DistributionBar({ summary }: { summary: MasterySummary }) {
  const parts: { key: string; value: number; className: string; label: string }[] = [
    { key: 'strong', value: summary.strong, className: 'bg-green-500 dark:bg-green-600', label: 'Strong' },
    { key: 'learning', value: summary.learning, className: 'bg-blue-500 dark:bg-blue-600', label: 'Learning' },
    { key: 'due', value: summary.due, className: 'bg-amber-400 dark:bg-amber-500', label: 'Due' },
    { key: 'weak', value: summary.weak, className: 'bg-red-500 dark:bg-red-600', label: 'Weak' },
    { key: 'new', value: summary.fresh, className: 'bg-slate-200 dark:bg-slate-700', label: 'New' },
  ]
  const total = summary.total || 1
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      aria-label={`Strong ${summary.strong}, learning ${summary.learning}, due ${summary.due}, weak ${summary.weak}, new ${summary.fresh}`}
    >
      {parts.map((p) =>
        p.value > 0 ? (
          <div
            key={p.key}
            className={`${p.className} h-full`}
            style={{ width: `${(p.value / total) * 100}%` }}
            title={`${p.label}: ${p.value}`}
          />
        ) : null,
      )}
    </div>
  )
}

function BreakdownSection({
  title,
  groups,
  scopeId,
  baseTitle,
  mastery,
  onStartReview,
}: {
  title: string
  groups: MasteryGroup[]
  scopeId: string
  baseTitle: string
  mastery: Record<string, QuestionMastery>
  onStartReview: MasteryDashboardProps['onStartReview']
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
      <ul className="space-y-2">
        {groups.map((g) => (
          <BreakdownRow
            key={g.id}
            group={g}
            scopeId={scopeId}
            baseTitle={baseTitle}
            mastery={mastery}
            onStartReview={onStartReview}
          />
        ))}
      </ul>
    </div>
  )
}

function BreakdownRow({
  group,
  scopeId,
  baseTitle,
  mastery,
  onStartReview,
}: {
  group: MasteryGroup
  scopeId: string
  baseTitle: string
  mastery: Record<string, QuestionMastery>
  onStartReview: MasteryDashboardProps['onStartReview']
}) {
  const due = useMemo(() => selectQuestionsByMastery(group.questions, scopeId, mastery, 'due'), [group.questions, scopeId, mastery])
  const weak = useMemo(() => selectQuestionsByMastery(group.questions, scopeId, mastery, 'weak'), [group.questions, scopeId, mastery])
  const adaptive = useMemo(() => selectQuestionsByMastery(group.questions, scopeId, mastery, 'adaptive', 20), [group.questions, scopeId, mastery])
  const { summary } = group

  const start = (mode: Mode) => {
    const qs = mode === 'due' ? due : mode === 'weak' ? weak : adaptive
    if (qs.length === 0) return
    const suffix = mode === 'due' ? 'Due review' : mode === 'weak' ? 'Weak areas' : 'Adaptive drill'
    onStartReview({ questions: qs, quizId: scopeId, quizName: `${baseTitle} · ${group.label} · ${suffix}`, scopeId })
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-950/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200" title={group.label}>{group.label}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="text-green-700 dark:text-green-400">S {summary.strong}</span>
            {' · '}
            <span className="text-blue-700 dark:text-blue-400">L {summary.learning}</span>
            {' · '}
            <span className="text-amber-700 dark:text-amber-400">D {summary.due}</span>
            {' · '}
            <span className="text-red-700 dark:text-red-400">W {summary.weak}</span>
            {' · '}
            <span>N {summary.fresh}</span>
            <span className="text-slate-400"> ({summary.total})</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {due.length > 0 && (
            <button type="button" onClick={() => start('due')} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Due ({due.length})
            </button>
          )}
          {weak.length > 0 && (
            <button type="button" onClick={() => start('weak')} className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              Weak ({weak.length})
            </button>
          )}
          {due.length === 0 && weak.length === 0 && adaptive.length > 0 && (
            <button type="button" onClick={() => start('adaptive')} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
              Drill ({Math.min(adaptive.length, 20)})
            </button>
          )}
        </div>
      </div>
    </li>
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
    const items: { id: string; title: string; subtitle?: string; questions: QuizQuestion[]; course?: Course }[] = []
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
      items.push({ id, title: c.name, subtitle: 'Course', questions: qs, course: c })
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
    let due = 0, weak = 0, learning = 0, strong = 0, tracked = 0, total = 0
    for (const s of scopes) {
      const sum = getMasterySummary(s.questions, s.id, mastery)
      due += sum.due; weak += sum.weak; learning += sum.learning; strong += sum.strong; tracked += sum.tracked; total += sum.total
    }
    return { due, weak, learning, strong, tracked, total }
  }, [scopes, mastery])

  if (scopes.length === 0) return null

  const visibleScopes = compact ? scopes.slice(0, 4) : scopes

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Mastery & review</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {totals.tracked} tracked across {totals.total} questions · {totals.strong} strong · {totals.learning} learning · {totals.due} due · {totals.weak} weak
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
            course={s.course}
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
