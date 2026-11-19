import { useMemo, useState } from 'react'
import type { Course, QuizSettings } from '../types/quiz'
import { IconArrowLeft, IconPlay } from './icons/Icons'
import { toCourseScopedQuestions } from '../utils/mastery'

interface CourseQuizConfigProps {
  course: Course
  /** Pre-selected chapter ids (e.g. single chapter study). */
  initialChapterIds?: string[]
  onBack: () => void
  onStart: (
    questions: import('../types/quiz').QuizQuestion[],
    settings: QuizSettings,
    meta: { courseId: string; courseName: string; chapterIds: string[]; chapterTitles: string[]; allChaptersSelected: boolean },
  ) => void
}

/**
 * Chapter multi-select + quiz configuration for a course.
 * Only questions from selected chapters are included.
 */
export function CourseQuizConfig({
  course,
  initialChapterIds,
  onBack,
  onStart,
}: CourseQuizConfigProps) {
  const chapters = useMemo(
    () => course.chapters.slice().sort((a, b) => a.order - b.order),
    [course.chapters],
  )

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (initialChapterIds?.length) return new Set(initialChapterIds)
    // Default: all chapters that have questions
    return new Set(chapters.filter((ch) => ch.questions.length > 0).map((ch) => ch.id))
  })

  const [questionCount, setQuestionCount] = useState<number | ''>('')
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [shuffleOptions, setShuffleOptions] = useState(true)
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timerMinutes, setTimerMinutes] = useState(30)
  const [passPercentage, setPassPercentage] = useState(60)

  const selectedChapters = chapters.filter((ch) => selected.has(ch.id))
  const availableQuestions = selectedChapters.flatMap((ch) => toCourseScopedQuestions(ch.id, ch.questions))
  const availableCount = availableQuestions.length

  const selectableChapters = chapters.filter((ch) => ch.questions.length > 0)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(selectableChapters.map((ch) => ch.id)))
  }

  const clearSelection = () => setSelected(new Set())

  const effectiveCount =
    questionCount === '' || questionCount <= 0
      ? availableCount
      : Math.min(Number(questionCount), availableCount)

  const canStart = selected.size > 0 && availableCount > 0

  const handleStart = () => {
    if (!canStart) return
    const settings: QuizSettings = {
      shuffleQuestions,
      shuffleOptions,
      timerMinutes: timerEnabled ? Math.max(1, Number(timerMinutes) || 30) : 0,
      categories: [],
      passPercentage: Math.min(100, Math.max(0, Number(passPercentage) || 60)),
      questionCount: effectiveCount < availableCount ? effectiveCount : undefined,
    }
    const allChaptersSelected =
      selectableChapters.length > 0 && selectedChapters.length === selectableChapters.length
    onStart([...availableQuestions], settings, {
      courseId: course.id,
      courseName: course.name,
      chapterIds: selectedChapters.map((ch) => ch.id),
      chapterTitles: selectedChapters.map((ch) => ch.title),
      allChaptersSelected,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <IconArrowLeft size={16} />
          Back
        </button>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Study course — {course.name}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose chapters (or all) and configure the quiz.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Chapters</h3>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Select all
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={clearSelection}
              className="font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Clear
            </button>
          </div>
        </div>

        {chapters.length === 0 ? (
          <p className="text-sm text-slate-500">This course has no chapters yet.</p>
        ) : (
          <ul className="space-y-1">
            {chapters.map((ch) => {
              const empty = ch.questions.length === 0
              return (
                <li key={ch.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                      empty ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(ch.id)}
                      onChange={() => toggle(ch.id)}
                      disabled={empty}
                      className="size-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{ch.title}</span>
                    <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {ch.questions.length} question{ch.questions.length === 1 ? '' : 's'}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
          <strong key={`chapters-${selected.size}`} className="inline-block animate-count">
            {selected.size}
          </strong>{' '}
          chapter{selected.size === 1 ? '' : 's'} selected ·{' '}
          <strong key={`questions-${availableCount}`} className="inline-block animate-count">
            {availableCount}
          </strong>{' '}
          question{availableCount === 1 ? '' : 's'} available
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 font-medium">Quiz settings</h3>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Number of questions</label>
            <input
              type="number"
              min={1}
              value={questionCount}
              onChange={(e) =>
                setQuestionCount(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))
              }
              max={availableCount || 1}
              placeholder={`All (${availableCount})`}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <p className="mt-1 text-xs text-slate-500">
              Leave blank to include all selected questions.
            </p>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">Timer</span>
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
                  <label htmlFor="quiz-timer-minutes" className="sr-only">
                    Timer minutes
                  </label>
                  <input
                    id="quiz-timer-minutes"
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
            <label className="mb-1 block text-sm font-medium">Pass percentage</label>
            <input
              type="number"
              min={0}
              max={100}
              value={passPercentage}
              onChange={(e) => setPassPercentage(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="size-4 rounded border-slate-300 text-indigo-600"
              />
              Randomize question order
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="size-4 rounded border-slate-300 text-indigo-600"
              />
              Shuffle answer options
            </label>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canStart}
          onClick={handleStart}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconPlay size={16} />
          {'Begin quiz ('}
          <span key={`begin-${effectiveCount}`} className="inline-block animate-count">
            {effectiveCount}
          </span>
          {` question${effectiveCount === 1 ? '' : 's'})`}
        </button>
      </div>
    </div>
  )
}
