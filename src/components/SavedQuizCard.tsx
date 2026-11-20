import type { AttemptStatus, HistoryStats, SavedQuiz } from '../types/quiz'
import { formatRelativeDay, progressSummary } from '../utils/library'
import { getCategories } from '../utils/quiz'
import type { MenuAction } from './OverflowMenu'
import { OverflowMenu } from './OverflowMenu'
import { IconChart, IconEdit, IconPlay, IconRefresh, IconTrash, IconTrendingUp, IconX } from './icons/Icons'

interface SavedQuizCardProps {
  quiz: SavedQuiz
  status: AttemptStatus
  stats: HistoryStats
  /** The one visible action: Start, Continue, or Start again. */
  onPrimary: () => void
  /** Restart from question 1, discarding an unfinished run. */
  onStartOver: () => void
  /** Discard an unfinished run without starting over. */
  onDiscardProgress: () => void
  /** Open the quiz to view and edit its questions. */
  onOpen: () => void
  onViewResults: () => void
  onRename: () => void
  onDelete: () => void
  masteryEnabled?: boolean
  onToggleMastery?: (enabled: boolean) => void
}

const STATUS_LABEL: Record<AttemptStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
}

const STATUS_CLASS: Record<AttemptStatus, string> = {
  'not-started': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  'in-progress': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
}

const PRIMARY_LABEL: Record<AttemptStatus, string> = {
  'not-started': 'Start quiz',
  'in-progress': 'Continue quiz',
  completed: 'Start again',
}

/**
 * One quiz in the library, styled consistently with course/chapter cards.
 */
export function SavedQuizCard({
  quiz,
  status,
  stats,
  onPrimary,
  onStartOver,
  onDiscardProgress,
  onOpen,
  onViewResults,
  onRename,
  onDelete,
  masteryEnabled,
  onToggleMastery,
}: SavedQuizCardProps) {
  const categories = getCategories(quiz.questions)
  const shownCategories = categories.slice(0, 3)
  const progress = quiz.progress ? progressSummary(quiz.progress) : null

  const actions: MenuAction[] = [
    ...(status === 'in-progress'
      ? [
          { label: 'Start again', icon: <IconRefresh size={14} />, onSelect: onStartOver },
          { label: 'Discard in-progress quiz', icon: <IconX size={14} />, onSelect: onDiscardProgress },
        ]
      : []),
    {
      label: 'View results',
      icon: <IconChart size={14} />,
      onSelect: onViewResults,
      disabled: stats.attempts === 0,
      title: stats.attempts === 0 ? 'No attempts yet' : undefined,
    },
    ...(onToggleMastery
      ? [{
          label: masteryEnabled ? 'Stop tracking progress' : 'Track progress',
          icon: <IconTrendingUp size={14} />,
          onSelect: () => onToggleMastery(!masteryEnabled),
        }]
      : []),
    { label: 'Rename', icon: <IconEdit size={14} />, onSelect: onRename },
    { label: 'Delete', icon: <IconTrash size={14} />, onSelect: onDelete, danger: true },
  ]

  return (
    <li className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open quiz ${quiz.name}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug break-words group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
            {quiz.name}
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'} · Updated{' '}
            {formatRelativeDay(quiz.updatedAt)}
          </p>
        </div>
        <div className="relative z-10 flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Edit quiz ${quiz.name}`}
            title="View and edit questions"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <IconEdit size={15} />
          </button>
          <OverflowMenu label={`More actions for ${quiz.name}`} actions={actions} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        {masteryEnabled && (
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            Tracking
          </span>
        )}
        {progress !== null && (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {progress.percent}% · {progress.answered}/{progress.total} answered
          </span>
        )}
      </div>

      {shownCategories.length > 0 && (
        <ul aria-label="Categories" className="mt-3 flex flex-wrap gap-1.5">
          {shownCategories.map((category) => (
            <li
              key={category}
              className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400"
            >
              {category}
            </li>
          ))}
          {categories.length > shownCategories.length && (
            <li className="px-1 py-0.5 text-xs text-slate-500 dark:text-slate-500">
              +{categories.length - shownCategories.length} more
            </li>
          )}
        </ul>
      )}

      {progress !== null && (
        <div className="mt-3">
          <div
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${quiz.name} progress`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          >
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {stats.latest !== null && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Last score</dt>
            <dd className="font-semibold text-indigo-600 dark:text-indigo-400">{stats.latest}%</dd>
          </div>
        )}
        {stats.best !== null && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Best</dt>
            <dd className="font-semibold">{stats.best}%</dd>
          </div>
        )}
        {stats.attempts > 0 && (
          <div className="flex gap-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Attempts</dt>
            <dd className="font-semibold">{stats.attempts}</dd>
          </div>
        )}
      </dl>

      <div className="relative z-10 mt-auto pt-4">
        <button
          type="button"
          onClick={onPrimary}
          disabled={quiz.questions.length === 0}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
        >
          <IconPlay size={15} />
          {PRIMARY_LABEL[status]}
        </button>
      </div>
    </li>
  )
}
