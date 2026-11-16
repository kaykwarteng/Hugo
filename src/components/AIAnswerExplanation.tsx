import type { AIError } from '../services/ai/types'
import type { AIExplanation } from '../types/ai'
import type { QuizQuestion } from '../types/quiz'
import { AI_DISCLAIMER, AI_UNCERTAIN_NOTE } from './aiDisclaimer'
import { Spinner } from './Spinner'
import { MathText } from './MathText'
import { IconBot } from './icons/Icons'

interface AIAnswerExplanationProps {
  question: QuizQuestion
  ready: boolean
  busy: boolean
  /** True when the in-flight request is this question's. */
  pending: boolean
  explanation?: AIExplanation
  error: AIError | null
  onAsk: () => void
  onCancel: () => void
  onDismiss: () => void
}

/**
 * "Ask AI" for one already-answered question, on the results screen.
 *
 * This lives here and not on `QuizCard` on purpose: an independent AI
 * evaluation reveals whether the answer was right, and correctness is never
 * disclosed mid-quiz.
 */
export function AIAnswerExplanation({
  question,
  ready,
  busy,
  pending,
  explanation,
  error,
  onAsk,
  onCancel,
  onDismiss,
}: AIAnswerExplanationProps) {
  if (!ready) return null

  if (explanation === undefined) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={pending ? onCancel : onAsk}
          // Disabled while some *other* request is running, so a second click
          // can never fan out into two billable calls.
          disabled={busy && !pending}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
        >
          {pending ? (
            <>
              <Spinner label={null} />
              Asking AI… (cancel)
            </>
          ) : (
            <>
              <IconBot size={16} />
              Ask AI
            </>
          )}
        </button>
        {pending && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            This uses one request against your own API key.
          </span>
        )}
        {error !== null && (
          <span role="alert" className="text-xs text-red-700 dark:text-red-400">
            {error.message}
            {error.retryable && ' Try again.'}
          </span>
        )}
      </div>
    )
  }

  const uncertain = explanation.confidence === 'low'

  return (
    <div className="animate-fade-slide-in mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/50">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <IconBot size={16} />
            AI evaluation
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              explanation.agreesWithSource
                ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
            }`}
          >
            {explanation.agreesWithSource
              ? '✓ Agrees with the source answer'
              : '⚠ Disagrees with the source answer'}
          </span>
          {uncertain && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              {AI_UNCERTAIN_NOTE}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Dismiss
        </button>
      </div>

      {!explanation.agreesWithSource && (
        <dl className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/50">
            <dt className="font-medium text-slate-500 dark:text-slate-400">Source answer</dt>
            <dd>
              <MathText>{question.correctAnswers.join(', ') || '—'}</MathText>
            </dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/50">
            <dt className="font-medium text-slate-500 dark:text-slate-400">AI answer</dt>
            <dd>
              <MathText>{explanation.aiCorrectOptions.join(', ')}</MathText>
            </dd>
          </div>
        </dl>
      )}

      <p className="leading-relaxed whitespace-pre-line"><MathText as="span">{explanation.explanation}</MathText></p>

      {explanation.optionNotes.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs">
          {explanation.optionNotes.map((note) => (
            <li key={note.option}>
              <span className="font-medium"><MathText as="span">{note.option}</MathText>:</span>{' '}
              <MathText as="span">{note.note}</MathText>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 border-t border-indigo-200 pt-2 text-xs text-slate-500 dark:border-indigo-900 dark:text-slate-400">
        {AI_DISCLAIMER}
      </p>
    </div>
  )
}
