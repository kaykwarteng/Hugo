import { useState } from 'react'
import { useBusyAction } from '../hooks/useBusyAction'
import type { QuizQuestion, QuizSettings } from '../types/quiz'
import {
  DEFAULT_PASS_PERCENTAGE,
  getCategories,
  normalizePassPercentage,
  questionsNeededToPass,
} from '../utils/quiz'
import { Spinner } from './Spinner'

const numberField =
  'w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900'

interface QuizSetupProps {
  questions: QuizQuestion[]
  onStart: (settings: QuizSettings) => void
  onDiscard: () => void
}

/**
 * Shown after a quiz is loaded but before it starts: pick shuffle options,
 * an optional timer, and which categories to include.
 */
export function QuizSetup({ questions, onStart, onDiscard }: QuizSetupProps) {
  const categories = getCategories(questions)
  const [shuffleQuestions, setShuffleQuestions] = useState(false)
  const [shuffleOptions, setShuffleOptions] = useState(false)
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timerMinutes, setTimerMinutes] = useState(30)
  const [passPercentage, setPassPercentage] = useState(DEFAULT_PASS_PERCENTAGE)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [questionCount, setQuestionCount] = useState<number | ''>('')

  // Filtering, shuffling and persisting the session is synchronous; yield a
  // frame first so the spinner is visible while it happens.
  const [starting, start] = useBusyAction()

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    )
  }

  const availableCount = selectedCategories.length
    ? questions.filter((q) => q.category && selectedCategories.includes(q.category)).length
    : questions.length
  const effectiveCount =
    questionCount === '' || questionCount <= 0 ? availableCount : Math.min(Number(questionCount), availableCount)

  return (
    <div className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Configure your quiz</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {questions.length} questions ready. Choose how you want to take them.
          </p>
        </div>
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-medium text-slate-500 transition-colors hover:text-red-600 dark:text-slate-400"
        >
          Start over
        </button>
      </div>

      <div className="space-y-5">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(e) => setShuffleQuestions(e.target.checked)}
              className="size-4 accent-indigo-600"
            />
            Shuffle questions
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shuffleOptions}
              onChange={(e) => setShuffleOptions(e.target.checked)}
              className="size-4 accent-indigo-600"
            />
            Shuffle options
          </label>
        </div>

        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-sm font-medium">Timer</span>
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Timer mode"
                className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-950"
              >
                <button
                  type="button"
                  aria-pressed={!timerEnabled}
                  onClick={() => setTimerEnabled(false)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    !timerEnabled
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Untimed
                </button>
                <button
                  type="button"
                  aria-pressed={timerEnabled}
                  onClick={() => setTimerEnabled(true)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    timerEnabled
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Timed
                </button>
              </div>
              {timerEnabled && (
                <div className="animate-fade-slide-in flex items-center gap-1.5">
                  <label htmlFor="timer" className="sr-only">
                    Timer minutes
                  </label>
                  <input
                    id="timer"
                    type="number"
                    min={1}
                    max={480}
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">min</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="question-count" className="mb-1.5 block text-sm font-medium">
              Number of questions
            </label>
            <input
              id="question-count"
              type="number"
              min={1}
              max={availableCount || 1}
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
              placeholder={`All (${availableCount})`}
              className={numberField}
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Leave blank to include all matching questions.
            </p>
          </div>

          <div>
            <label htmlFor="pass-mark" className="mb-1.5 block text-sm font-medium">
              Pass mark (%)
            </label>
            <input
              id="pass-mark"
              type="number"
              min={0}
              max={100}
              step={1}
              value={passPercentage}
              onChange={(e) => setPassPercentage(normalizePassPercentage(Number(e.target.value)))}
              aria-describedby="pass-mark-hint"
              className={numberField}
            />
            <p id="pass-mark-hint" className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {effectiveCount === 0
                ? 'Score at or above this to pass.'
                : `At least ${questionsNeededToPass(effectiveCount, passPercentage)} of ${effectiveCount} correct to pass.`}
            </p>
          </div>
        </div>

        {categories.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">
              Categories <span className="font-normal text-slate-500">(none selected = all)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const active = selectedCategories.includes(category)
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    aria-pressed={active}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {category}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            start(() =>
              onStart({
                shuffleQuestions,
                shuffleOptions,
                timerMinutes: timerEnabled ? Math.max(1, Number(timerMinutes) || 30) : 0,
                categories: selectedCategories,
                passPercentage,
                questionCount: questionCount === '' ? undefined : Math.min(Number(questionCount), availableCount),
              }),
            )
          }
          disabled={effectiveCount === 0 || starting}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {starting && <Spinner label={null} />}
          {starting ? (
            'Starting…'
          ) : (
            <>
              {'Start quiz ('}
              <span key={`start-${effectiveCount}`} className="inline-block animate-count">
                {effectiveCount}
              </span>
              {' questions)'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
