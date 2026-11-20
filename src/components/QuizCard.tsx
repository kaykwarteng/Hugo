import type { QuizQuestion } from '../types/quiz'
import { getOptionKey, getOptionMedia, getOptionText, isAnswerCorrect, isMultiAnswer } from '../utils/quiz'
import { ExplanationPanel } from './ExplanationPanel'
import { MathText } from './MathText'

interface QuizCardProps {
  question: QuizQuestion
  /** Submitted/selected answer keys. */
  selectedAnswers?: string[]
  /** Options ticked on a multi-answer question but not yet checked (legacy). */
  draft?: string[]
  /** True once "Check Answer" has revealed the result for this question. */
  revealed: boolean
  /** Single-answer questions only (option key). */
  onSelect: (optionKey: string) => void
  /** Multi-answer questions only: tick/untick an option key. */
  onToggle: (optionKey: string) => void
  /** Submit the current selection and reveal whether it was right. */
  onCheck: () => void
}

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** One question with its options, rendered as a card. */
export function QuizCard({
  question,
  selectedAnswers,
  draft,
  revealed,
  onSelect,
  onToggle,
  onCheck,
}: QuizCardProps) {
  const multi = isMultiAnswer(question)
  // Frozen only after reveal/check so the verdict stays stable; selections are
  // saved automatically and count for scoring without checking.
  const locked = revealed
  const ticked = revealed
    ? (selectedAnswers ?? [])
    : multi
      ? (selectedAnswers ?? draft ?? [])
      : (selectedAnswers ?? [])
  const hasSelection = ticked.length > 0
  const correct = revealed && isAnswerCorrect(question, selectedAnswers)

  const labelFor = (key: string) => {
    const idx = question.options.findIndex((o, i) => getOptionKey(o, i) === key)
    if (idx === -1) return key
    const opt = question.options[idx]
    const text = getOptionText(opt).trim()
    if (text) return text
    const media = getOptionMedia(opt)
    if (media.imageUrl && media.audioUrl) return 'Image & audio'
    if (media.imageUrl) return 'Image'
    if (media.audioUrl) return 'Audio'
    return key
  }
  const joinLabels = (keys: string[]) => keys.map(labelFor).join(' · ')

  return (
    <div
      key={question.id}
      className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {question.category && (
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {question.category}
          </span>
        )}
        {question.difficulty && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {question.difficulty}
          </span>
        )}
        {multi && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Select all that apply · {question.correctAnswers.length} correct
          </span>
        )}
      </div>

      <h2 className="mb-4 text-lg font-semibold leading-snug sm:text-xl">
        <MathText as="span">{question.question}</MathText>
      </h2>
      {question.imageUrl && (
        <img src={question.imageUrl} alt="" className="mb-4 max-h-80 w-full rounded-xl border border-slate-200 object-contain dark:border-slate-800" loading="lazy" />
      )}
      {question.audioUrl && <audio controls src={question.audioUrl} className="mb-4 w-full" />}

      <div
        role={multi ? 'group' : 'radiogroup'}
        aria-label="Answer options"
        className="space-y-3"
      >
        {question.options.map((option, index) => {
          const optionKey = getOptionKey(option, index)
          const selected = ticked.includes(optionKey)
          const isCorrectOption = question.correctAnswers.includes(optionKey)
          const { imageUrl, audioUrl } = getOptionMedia(option)
          const text = getOptionText(option)
          // Before the reveal an option only shows "you picked this". After it,
          // colour carries the verdict: green marks every correct option, red
          // marks a pick that wasn't one.
          const tone = !revealed
            ? selected
              ? 'chosen'
              : 'plain'
            : isCorrectOption
              ? 'right'
              : selected
                ? 'wrong'
                : 'plain'

          return (
            <button
              key={optionKey}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={selected}
              disabled={locked}
              onClick={() => (multi ? onToggle(optionKey) : onSelect(optionKey))}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                tone === 'chosen'
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30 dark:bg-indigo-950/50'
                  : tone === 'right'
                    ? 'border-green-500 bg-green-50 ring-2 ring-green-500/30 dark:border-green-700 dark:bg-green-950/50'
                    : tone === 'wrong'
                      ? 'border-red-500 bg-red-50 ring-2 ring-red-500/30 dark:border-red-800 dark:bg-red-950/50'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
              } ${
                locked
                  ? revealed
                    ? 'cursor-default'
                    : 'cursor-not-allowed opacity-70'
                  : selected
                    ? ''
                    : 'hover:border-indigo-300 hover:bg-slate-50 dark:hover:border-indigo-700 dark:hover:bg-slate-800'
              }`}
            >
              <span
                aria-hidden
                className={`flex size-7 shrink-0 items-center justify-center text-sm font-semibold ${
                  multi ? 'rounded-md' : 'rounded-full'
                } ${
                  tone === 'chosen'
                    ? 'bg-indigo-600 text-white'
                    : tone === 'right'
                      ? 'bg-green-600 text-white'
                      : tone === 'wrong'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {revealed
                  ? tone === 'right'
                    ? '✓'
                    : tone === 'wrong'
                      ? '✗'
                      : (OPTION_KEYS[index] ?? index + 1)
                  : multi && selected
                    ? '✓'
                    : (OPTION_KEYS[index] ?? index + 1)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-2 text-sm sm:text-base">
                {text ? <MathText as="span">{text}</MathText> : null}
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="max-h-48 w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700" loading="lazy" />
                ) : null}
                {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : null}
                {!text && !imageUrl && !audioUrl ? <span className="text-slate-500">Option {index + 1}</span> : null}
              </span>
              {revealed && (tone === 'right' || tone === 'wrong') && (
                <span
                  className={`shrink-0 text-xs font-semibold ${
                    tone === 'right'
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {tone === 'right'
                    ? selected
                      ? 'Correct'
                      : multi
                        ? 'Missed'
                        : 'Answer'
                    : 'Your pick'}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* The verdict. Announced politely so it reaches a screen reader that
          never sees the colour change. */}
      {revealed && (
        <div
          aria-live="polite"
          className={`animate-fade-slide-in mt-5 rounded-xl border p-4 ${
            correct
              ? 'border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/50'
              : 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/50'
          }`}
        >
          <p
            className={`text-sm font-semibold sm:text-base ${
              correct ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'
            }`}
          >
            {correct
              ? '✓ Correct'
              : selectedAnswers === undefined || selectedAnswers.length === 0
                ? '✗ Not answered'
                : multi
                  ? '✗ Not quite — your selection is incomplete or has an extra option'
                  : '✗ Incorrect'}
          </p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="font-medium">
              {multi ? `Correct answers (${question.correctAnswers.length}):` : 'Correct answer:'}
            </span>{' '}
            {joinLabels(question.correctAnswers)}
          </p>
          {!correct && selectedAnswers !== undefined && selectedAnswers.length > 0 && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">You chose:</span> {joinLabels(selectedAnswers)}
            </p>
          )}
        </div>
      )}

      {/* Selections are saved automatically; checking is optional feedback that
          reveals the verdict and locks the question. */}
      <div className="mt-5">
        {revealed ? (
          <p className="inline-flex min-h-11 items-center rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            ✓ Answer checked — review it above, then continue when you're ready.
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={onCheck}
              disabled={!hasSelection}
              className="min-h-12 w-full rounded-xl bg-amber-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Check Answer{multi && hasSelection ? ` (${ticked.length} selected)` : ''}
            </button>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {hasSelection
                ? multi
                  ? 'Selection saved. You can change it, or check to see if you’re right (locks this question).'
                  : 'Answer saved. You can change it, or check to see if you’re right (locks this question).'
                : multi
                  ? 'Tick the options you think are correct. Your selection is saved automatically.'
                  : 'Pick an option. Your answer is saved automatically.'}
            </p>
          </>
        )}
      </div>

      {/* Remounted on reveal so the explanation opens itself alongside the
          verdict, and collapses back for the next unchecked question. */}
      <ExplanationPanel
        key={revealed ? 'revealed' : 'hidden'}
        explanation={question.explanation}
        defaultOpen={revealed}
      />
    </div>
  )
}
