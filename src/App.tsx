import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AIAnswerExplanation } from './components/AIAnswerExplanation'
import { MasteryDashboard } from './components/MasteryDashboard'
import { FlashcardSession } from './components/FlashcardSession'
import { useMastery } from './hooks/useMastery'
import { AIBusyOverlay } from './components/AIBusyOverlay'
import { AISettings } from './components/AISettings'
import { AIVerificationPanel } from './components/AIVerificationPanel'
import { AppNav } from './components/AppNav'
import { ConfirmDialog } from './components/ConfirmDialog'
import { HomeDashboard } from './components/HomeDashboard'
import { QuizCard } from './components/QuizCard'
import { QuizHistory } from './components/QuizHistory'
import { QuizImporter } from './components/QuizImporter'
import { QuizSetup } from './components/QuizSetup'
import { QuizTopBar } from './components/QuizTopBar'
import { RecentResults } from './components/RecentResults'
import { ResultScreen, type ResultScreenExtras } from './components/ResultScreen'
import { CourseLibrary } from './components/CourseLibrary'
import { SavedQuizDetail } from './components/SavedQuizDetail'
import { SavedQuizList } from './components/SavedQuizList'
import { SaveQuizPanel } from './components/SaveQuizPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { StepIndicator } from './components/StepIndicator'
import { useAI } from './hooks/useAI'
import { useAppearance } from './hooks/useAppearance'
import { useQuiz } from './hooks/useQuiz'
import { useQuizHistory } from './hooks/useQuizHistory'
import { useCourses } from './hooks/useCourses'
import { useSavedQuizzes } from './hooks/useSavedQuizzes'
import { useSound } from './hooks/useSound'
import { useTheme } from './hooks/useTheme'
import { useTimer } from './hooks/useTimer'
import { PROVIDERS } from './services/ai/models'
import { isSoundSupported, playSound } from './services/sound'
import { masteryKey } from './utils/mastery'
import { apiDeleteAttempt, apiDeleteSession, apiListSessions, apiRecordMastery, apiUpsertSession, type ActiveSessionRecord } from './services/api'
import type { AIRequestKind } from './types/ai'
import type { View } from './types/navigation'
import type { QuizAttempt, QuizQuestion, QuizSession, SavedQuiz } from './types/quiz'
import {
  attemptToSession,
  findResumable,
  formatDateTime,
  progressToSession,
  sortAttemptsByRecency,
} from './utils/library'
import { isAnswerCorrect as checkAnswerCorrect, isMultiAnswer, isQuestionLocked, isRevealed } from './utils/quiz'

/** How many entries the home dashboard's "recent results" strip shows. */
const RECENT_RESULTS_LIMIT = 5

/**
 * AI workflows that block the screen while they run.
 *
 * These three are started from the import and setup screens, where the pasted
 * text and the pending questions live in component state — navigating away or
 * switching importer tab mid-request would throw both away. An `explanation` is
 * deliberately absent: it can't lose anything, so the results screen stays usable.
 */
const BLOCKING_AI_KINDS = new Set<AIRequestKind>(['formatting', 'json-repair', 'verification'])

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const { appearance, updateAppearance, resetAppearance } = useAppearance()
  const { sound, updateSound } = useSound()
  const quiz = useQuiz()
  const library = useSavedQuizzes()
  const coursesApi = useCourses()
  const history = useQuizHistory()
  const masteryApi = useMastery()
  // The AI assistant owns its own state so this component doesn't grow one
  // branch per workflow; everything below just reads `ai.ready`.
  const ai = useAI()

  // Which of the four destinations is showing. Everything else on screen is a
  // sub-state layered over one of them — see `types/navigation.ts`.
  const [view, setView] = useState<View>('home')
  // Questions loaded from an import (or picked from the library) but not yet
  // started — the setup phase of the Create Quiz flow.
  const [pendingQuestions, setPendingQuestions] = useState<QuizQuestion[] | null>(null)
  // Set when the pending questions belong to a saved quiz, so the resulting
  // attempt is filed against it.
  const [pendingQuiz, setPendingQuiz] = useState<SavedQuiz | null>(null)
  /** When set, the next successful import is written into this chapter (SQLite). */
  const [importTarget, setImportTarget] = useState<{ courseId: string; chapterId: string } | null>(null)
  const [courseSessions, setCourseSessions] = useState<ActiveSessionRecord[]>([])
  const courseSessionMetaRef = useRef<Record<string, { courseId: string; chapterIds: string[] }>>({})
  const refreshCourseSessions = useCallback(() => {
    void apiListSessions()
      .then(setCourseSessions)
      .catch(() => setCourseSessions([]))
  }, [])
  useEffect(() => {
    refreshCourseSessions()
  }, [refreshCourseSessions, view])
  // Which saved quiz's history/detail is open, and which attempt is being reviewed.
  const [historyQuizId, setHistoryQuizId] = useState<string | null>(null)
  const [courseQuizConfigRequest, setCourseQuizConfigRequest] = useState<string | null>(null)
  const [openQuizId, setOpenQuizId] = useState<string | null>(null)
  const [reviewAttempt, setReviewAttempt] = useState<QuizAttempt | null>(null)
  const [flashcards, setFlashcards] = useState<{ questions: QuizQuestion[]; scopeId: string; title: string } | null>(null)
  // Checks for the constructor only — asking never creates an AudioContext.
  const [soundSupported] = useState(isSoundSupported)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)

  const { session } = quiz
  const { resetQuiz } = quiz
  const { saveProgress, completeProgress, refresh: refreshLibrary } = library
  const { recordSession, refresh: refreshHistory } = history

  // Mirror an in-progress run onto its saved quiz so the library can show it
  // as "In progress" and resume it later (debounced).
  useEffect(() => {
    if (!session || session.status !== 'active' || !session.quizId) return
    const timer = window.setTimeout(() => {
      void saveProgress(session).catch(() => {})
    }, 400)
    return () => window.clearTimeout(timer)
  }, [session, saveProgress])

  // Persist in-progress course/chapter runs to SQLite so they can be resumed (debounced).
  useEffect(() => {
    if (!session || session.status !== 'active' || !session.quizId?.startsWith('course:')) return
    const meta = courseSessionMetaRef.current[session.quizId] ?? {
      courseId: session.quizId.slice('course:'.length).split(':')[0],
      chapterIds: [],
    }
    const timer = window.setTimeout(() => {
      void apiUpsertSession({
        id: session.quizId!,
        courseId: meta.courseId,
        chapterIds: meta.chapterIds,
        quizName: session.quizName,
        session,
      })
        .then(() => refreshCourseSessions())
        .catch(() => {
          /* API offline */
        })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [session, refreshCourseSessions])

  // Convert a submitted session into a permanent result, exactly once per attempt.
  const recordedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!session || session.status !== 'finished') return
    if (recordedRef.current.has(session.attemptId)) return
    recordedRef.current.add(session.attemptId)
    void (async () => {
      try {
        const attempt = await recordSession(session)
        if (session.quizId) await completeProgress(session.quizId, attempt.id)
        if (session.quizId?.startsWith('course:')) {
          await apiDeleteSession(session.quizId).then(setCourseSessions).catch(() => {})
        }
        const scope = session.quizId ?? session.attemptId
        if (masteryApi.isScopeEnabled(scope)) {
          let changed = false
          for (const q of session.questions) {
            const ans = session.answers[q.id]
            if (ans === undefined) continue
            const correct = checkAnswerCorrect(q, ans)
            await apiRecordMastery(masteryKey(scope, q.id), q.id, correct).then(() => { changed = true }).catch(() => {})
          }
          if (changed) void masteryApi.refresh()
        }
      } catch {
        recordedRef.current.delete(session.attemptId)
      }
    })()
  }, [session, recordSession, completeProgress, masteryApi])

  // Every screen change starts at the top. Without this a tall screen (a long
  // paste, a finished result) leaves the next one scrolled halfway down, which
  // reads as a broken navigation.
  const screenKey = [
    view,
    pendingQuestions === null ? 'import' : 'setup',
    historyQuizId ?? '',
    openQuizId ?? '',
    reviewAttempt?.id ?? '',
    session?.status ?? 'none',
  ].join('|')
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [screenKey])

  const clearSetup = useCallback(() => {
    setPendingQuestions(null)
    setPendingQuiz(null)
    // Verdicts belong to the bank that just went away.
    ai.clearVerifications()
  }, [ai])

  /**
   * Go to a top-level destination, dropping the sub-states layered over it.
   *
   * A finished result is dropped too — the attempt is already recorded in the
   * history, so nothing is lost. A pending import is deliberately *kept*, so
   * checking the library mid-import doesn't throw away a paste.
   */
  const navigate = useCallback(
    (next: View) => {
      setView(next)
      setHistoryQuizId(null)
      setOpenQuizId(null)
      setReviewAttempt(null)
      if (session?.status === 'finished') resetQuiz()
    },
    [session, resetQuiz],
  )

  const startMasteryReview = useCallback((target: { questions: QuizQuestion[]; quizId?: string; quizName: string; scopeId?: string }) => {
    if (target.questions.length === 0) return
    quiz.startQuiz(target.questions, { shuffleQuestions: true, shuffleOptions: false, timerMinutes: 0, categories: [], passPercentage: 70 }, {
      quizId: target.quizId ?? target.scopeId,
      quizName: target.quizName,
    })
  }, [quiz])

  const startFlashcards = useCallback((target: { questions: QuizQuestion[]; scopeId: string; quizName: string }) => {
    if (target.questions.length === 0) return
    setFlashcards({ questions: target.questions, scopeId: target.scopeId, title: target.quizName })
  }, [])

  const resetMasteryScope = useCallback(async (scopeId: string) => {
    await masteryApi.resetScopeMastery(scopeId)
    // Also clear scope-related stored progress/details (attempt history, resumable session, saved-quiz progress).
    const scopeAttempts = history.attempts.filter((a) => a.quizId === scopeId)
    if (scopeAttempts.length > 0) {
      await Promise.all(scopeAttempts.map((a) => apiDeleteAttempt(a.id).catch(() => {})))
    }
    if (scopeId.startsWith('course:')) {
      await apiDeleteSession(scopeId).catch(() => {})
    } else {
      await apiDeleteSession(scopeId).catch(() => {})
      await library.clearProgress(scopeId).catch(() => {})
    }
    await Promise.allSettled([
      masteryApi.refresh(),
      history.refresh(),
      refreshCourseSessions(),
      library.refresh(),
    ])
  }, [masteryApi, history, library, refreshCourseSessions])

  /** Send a question bank to the setup screen, optionally tied to a saved quiz. */
  const openSetup = useCallback((questions: QuizQuestion[], saved: SavedQuiz | null) => {
    setPendingQuestions(questions)
    setPendingQuiz(saved)
    setHistoryQuizId(null)
    setOpenQuizId(null)
    setReviewAttempt(null)
    setView('create')
  }, [])

  const handleResume = useCallback(
    (saved: SavedQuiz) => {
      if (!saved.progress) return
      setHistoryQuizId(null)
      setOpenQuizId(null)
      setReviewAttempt(null)
      quiz.resumeSession(progressToSession(saved, saved.progress))
    },
    [quiz],
  )

  /** Throw away an unfinished run and configure a fresh one. */
  const handleStartOver = useCallback(
    (saved: SavedQuiz) => {
      void library.clearProgress(saved.id).catch(() => {})
      openSetup(saved.questions, saved)
    },
    [library, openSetup],
  )

  const handleRename = useCallback(
    (saved: SavedQuiz, name: string) => {
      void library.renameQuiz(saved.id, name).then(() => {
        if (pendingQuiz?.id === saved.id) setPendingQuiz((current) => (current?.id === saved.id ? { ...current, name: name.trim() } : current))
      }).catch(() => {})
    },
    [library, pendingQuiz],
  )

  const handleDeleteQuiz = useCallback(
    (saved: SavedQuiz) => {
      void library.removeQuiz(saved.id).then(() => {
        void masteryApi.setScopeEnabled(saved.id, false).catch(() => {})
        void masteryApi.refresh().catch(() => {})
        void refreshHistory()
        if (historyQuizId === saved.id) setHistoryQuizId(null)
        if (openQuizId === saved.id) setOpenQuizId(null)
        if (reviewAttempt?.quizId === saved.id) setReviewAttempt(null)
        if (session?.quizId === saved.id) resetQuiz()
        if (pendingQuiz?.id === saved.id) clearSetup()
      }).catch(() => {})
    },
    [library, refreshHistory, historyQuizId, openQuizId, reviewAttempt, session, resetQuiz, pendingQuiz, clearSetup, masteryApi],
  )

  const handleDeleteAttempt = useCallback(
    (attempt: QuizAttempt) => {
      void history.removeAttempt(attempt.id).then(() => {
        if (reviewAttempt?.id === attempt.id) setReviewAttempt(null)
        void refreshLibrary()
      }).catch(() => {})
    },
    [history, reviewAttempt, refreshLibrary],
  )

  /** Leave the finished-result screen for the quiz's history view. */
  const openHistoryFor = useCallback(
    (quizId: string) => {
      resetQuiz()
      clearSetup()
      setOpenQuizId(null)
      setReviewAttempt(null)
      setHistoryQuizId(quizId)
    },
    [resetQuiz, clearSetup],
  )

  /**
   * Leave an active run. A saved quiz keeps its progress (the mirroring effect
   * above already wrote it), so the library is where the user picks it back
   * up; an unsaved one has nowhere to go but home.
   */
  const handleExitQuiz = useCallback(() => {
    const wasSaved = session?.quizId !== undefined
    resetQuiz()
    setView(wasSaved ? 'library' : 'home')
  }, [session, resetQuiz])

  const historyTarget = useMemo(() => {
    if (!historyQuizId) return null
    const saved = library.quizzes.find((q) => q.id === historyQuizId)
    if (saved) return { kind: 'saved' as const, id: saved.id, name: saved.name, quiz: saved }
    if (historyQuizId.startsWith('course:')) {
      const courseId = historyQuizId.slice('course:'.length)
      const course = coursesApi.courses.find((c) => c.id === courseId)
      if (course) return { kind: 'course' as const, id: historyQuizId, name: course.name, courseId }
    }
    // fallback for orphan/unknown scopes with attempts
    return { kind: 'scope' as const, id: historyQuizId, name: historyQuizId }
  }, [historyQuizId, library.quizzes, coursesApi.courses])
  const openQuiz = openQuizId ? library.quizzes.find((q) => q.id === openQuizId) ?? null : null
  const activeSession =
    reviewAttempt === null && historyTarget === null && openQuiz === null && session !== null && session.status === 'active'
      ? session
      : null
  const finishedSession =
    reviewAttempt === null && historyTarget === null && openQuiz === null && session !== null && session.status === 'finished'
      ? session
      : null

  const resumable = findResumable(library.quizzes)
  const allAttempts = sortAttemptsByRecency(history.attempts)

  /**
   * The optional AI panel under each answer-review block. Passed to both
   * `ResultScreen` call sites, so reviewing a stored attempt gets it too.
   * Renders nothing when the assistant is off.
   */
  const renderQuestionExtras = useCallback(
    (question: QuizQuestion, selected: string[] | undefined) => (
      <AIAnswerExplanation
        question={question}
        ready={ai.ready}
        busy={ai.busy}
        pending={ai.active?.kind === 'explanation' && ai.active.questionId === question.id}
        explanation={ai.explanations[question.id]}
        error={ai.errorQuestionId === question.id ? ai.error : null}
        onAsk={() => void ai.askAboutQuestion(question, selected)}
        onCancel={ai.cancel}
        onDismiss={() => ai.clearExplanation(question.id)}
      />
    ),
    [ai],
  )

  // The library and results screens use their width; reading screens stay
  // narrow so long questions don't run across the whole monitor.
  const wide = reviewAttempt === null && historyTarget === null && openQuiz === null && finishedSession === null && view !== 'create'

  const dialogs = (
    <>
      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          onToggleTheme={toggleTheme}
          appearance={appearance}
          onAppearanceChange={updateAppearance}
          onResetAppearance={resetAppearance}
          sound={sound}
          onSoundChange={updateSound}
          soundSupported={soundSupported}
          aiStatus={
            ai.ready
              ? `On · ${PROVIDERS[ai.config.provider].label} · ${ai.requestCount} request(s) this session.`
              : 'Off. Optional — bring your own API key to check and explain answers.'
          }
          onOpenAI={() => {
            setSettingsOpen(false)
            setAiSettingsOpen(true)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {aiSettingsOpen && <AISettings ai={ai} onClose={() => setAiSettingsOpen(false)} />}
      {/* Last, so it covers the settings dialogs too — an AI request started
          from one of them must not be interrupted by closing it. */}
      {ai.active !== null && BLOCKING_AI_KINDS.has(ai.active.kind) && (
        <AIBusyOverlay active={ai.active} onCancel={ai.cancel} />
      )}
    </>
  )

  if (flashcards !== null) {
    return (
      <FlashcardSession
        questions={flashcards.questions}
        scopeId={flashcards.scopeId}
        title={flashcards.title}
        onExit={() => setFlashcards(null)}
        onProgress={() => void masteryApi.refresh()}
      />
    )
  }

  // While a quiz is being answered the app navigation is replaced by the
  // quiz's own compact bar, so nothing invites an accidental exit.
  if (activeSession !== null) {
    return (
      <div className="min-h-screen">
        <ActiveQuiz session={activeSession} quiz={quiz} onExit={handleExitQuiz} />
        {dialogs}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AppNav
        view={view}
        onNavigate={navigate}
        onOpenSettings={() => setSettingsOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        aiReady={ai.ready}
        aiBusy={ai.busy}
      />

      <main className={`mx-auto px-4 pt-6 pb-24 md:pb-16 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        {/* 1. Reviewing a stored attempt — reuses the live result screen. */}
        {reviewAttempt !== null && (
          <ResultScreen
            session={attemptToSession(reviewAttempt)}
            onNewQuiz={() => setReviewAttempt(null)}
            onRetryIncorrect={() => {
              const incorrect = reviewAttempt.questions.filter((q) => !checkAnswerCorrect(q, reviewAttempt.answers[q.id]))
              if (incorrect.length === 0) return
              quiz.startQuiz(incorrect, { ...reviewAttempt.settings, questionCount: undefined }, {
                quizId: reviewAttempt.quizId,
                quizName: `${reviewAttempt.quizName} (incorrect only)`,
              })
              setReviewAttempt(null)
            }}
            newQuizLabel={
              historyQuizId !== null
                ? 'Back to history'
                : view === 'home'
                  ? 'Back to Home'
                  : 'Back to Results'
            }
            onHome={() => navigate('home')}
            subtitle={`${reviewAttempt.quizName} · ${formatDateTime(reviewAttempt.completedAt)}`}
            renderQuestionExtras={renderQuestionExtras}
          />
        )}

        {/* 2. Results history for a saved quiz or course scope. */}
        {reviewAttempt === null && historyTarget !== null && (
          <QuizHistory
            quiz={{ id: historyTarget.id, name: historyTarget.name }}
            attempts={history.forQuiz(historyTarget.id)}
            onBack={() => setHistoryQuizId(null)}
            backLabel={view === 'results' ? 'Results' : 'Quiz Library'}
            onRetake={() => {
              if (historyTarget.kind === 'saved') {
                openSetup(historyTarget.quiz.questions, historyTarget.quiz)
                return
              }
              if (historyTarget.kind === 'course') {
                setHistoryQuizId(null)
                setView('library')
                setCourseQuizConfigRequest(historyTarget.courseId)
              }
            }}
            onReview={setReviewAttempt}
            onDeleteAttempt={handleDeleteAttempt}
          />
        )}

        {/* 2b. Standalone quiz question management. */}
        {reviewAttempt === null && historyTarget === null && openQuiz !== null && (
          <SavedQuizDetail
            quiz={openQuiz}
            onBack={() => setOpenQuizId(null)}
            onStart={() => openSetup(openQuiz.questions, openQuiz)}
            onReplaceQuestions={(qs) => { void library.updateQuiz(openQuiz.id, qs).catch(() => {}) }}
            nextQuestionId={openQuiz.questions.reduce((max, q) => Math.max(max, q.id), 0) + 1}
          />
        )}

        {/* 3. The result of the run just submitted. */}
        {finishedSession !== null && (
          <FinishedQuiz
            session={finishedSession}
            onRetry={quiz.retryQuiz}
            onRetryIncorrect={() => {
              const incorrect = finishedSession.questions.filter((q) => !checkAnswerCorrect(q, finishedSession.answers[q.id]))
              if (incorrect.length === 0) return
              quiz.startQuiz(incorrect, { ...finishedSession.settings, questionCount: undefined }, {
                quizId: finishedSession.quizId,
                quizName: finishedSession.quizName ? `${finishedSession.quizName} (incorrect only)` : 'Incorrect only',
              })
            }}
            onCreateQuiz={() => navigate('create')}
            onLibrary={() => navigate('library')}
            onHome={() => navigate('home')}
            onViewHistory={openHistoryFor}
            renderQuestionExtras={renderQuestionExtras}
          />
        )}

        {/* 4. Create Quiz — paste, then review and configure. */}
        {reviewAttempt === null && historyTarget === null && openQuiz === null && finishedSession === null && view === 'create' && (
          <div className="space-y-5">
            <div className="space-y-3">
              <h1 className="text-2xl font-bold tracking-tight">Create Quiz</h1>
              <StepIndicator current={pendingQuestions === null ? 1 : 2} />
            </div>

            {pendingQuestions === null ? (
              <div className="animate-fade-slide-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
                <QuizImporter
                  ai={ai}
                  onLoad={async (questions) => {
                    if (importTarget) {
                      const { courseId, chapterId } = importTarget
                      // Assign fresh ids within the chapter to avoid collisions
                      let nextId = coursesApi.nextQuestionId(courseId, chapterId)
                      const withIds = questions.map((q) => ({ ...q, id: nextId++ }))
                      await coursesApi.addQuestionsToChapter(courseId, chapterId, withIds)
                      setImportTarget(null)
                      setPendingQuestions(null)
                      setPendingQuiz(null)
                      setView('library')
                      return
                    }
                    openSetup(questions, null)
                  }}
                />
                {importTarget && (
                  <p className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                    Importing into a course chapter. Questions will be saved to the database, not as a standalone quiz.
                    <button
                      type="button"
                      className="ml-2 font-medium underline"
                      onClick={() => setImportTarget(null)}
                    >
                      Cancel target
                    </button>
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <SaveQuizPanel
                  questionCount={pendingQuestions.length}
                  duplicate={pendingQuiz ?? library.findSavedDuplicate(pendingQuestions)}
                  savedName={pendingQuiz?.name ?? null}
                  disabled={library.loading}
                  onSave={async (name) => {
                    const saved = await library.saveQuiz(name, pendingQuestions)
                    playSound('save')
                    setPendingQuiz(saved)
                  }}
                  onUpdate={async (quizId) => {
                    const saved = await library.updateQuiz(quizId, pendingQuestions)
                    if (saved) setPendingQuiz(saved)
                  }}
                />
                <AIVerificationPanel
                  questions={pendingQuestions}
                  ai={ai}
                  onApply={setPendingQuestions}
                />
                <QuizSetup
                  questions={pendingQuestions}
                  onStart={(settings) => {
                    quiz.startQuiz(pendingQuestions, settings, {
                      quizId: pendingQuiz?.id,
                      quizName: pendingQuiz?.name,
                    })
                    clearSetup()
                  }}
                  onDiscard={clearSetup}
                />
              </div>
            )}
          </div>
        )}

        {/* 5. Quiz Library — hierarchical courses + standalone quizzes. */}
        {reviewAttempt === null && historyTarget === null && openQuiz === null && finishedSession === null && view === 'library' && (
          <div className="space-y-10">
            {(coursesApi.error || library.error || history.error) && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <strong>Database offline.</strong> {coursesApi.error ?? library.error ?? history.error}
                <span className="mt-1 block text-xs opacity-80">
                  Start the API with <code className="rounded bg-black/5 px-1">npm run server</code> (SQLite at data/hugo.sqlite), then refresh.
                </span>
              </div>
            )}
            {(coursesApi.loading || library.loading || history.loading) && !(coursesApi.error || library.error || history.error) && (
              <p className="text-sm text-slate-500">Loading library from database…</p>
            )}
            <MasteryDashboard
              mastery={masteryApi.mastery}
              enabledScopes={masteryApi.enabledScopes}
              quizzes={library.quizzes}
              courses={coursesApi.courses}
              onStartReview={startMasteryReview}
              onStartFlashcards={startFlashcards}
              onResetScope={resetMasteryScope}
            />
            <CourseLibrary
              courses={coursesApi.courses}
              onAddCourse={coursesApi.addCourse}
              onRenameCourse={coursesApi.renameCourse}
              onRemoveCourse={async (id) => {
                await coursesApi.removeCourse(id)
                await masteryApi.setScopeEnabled(`course:${id}`, false).catch(() => {})
                await masteryApi.resetScopeMastery(`course:${id}`).catch(() => {})
              }}
              onAddChapter={coursesApi.addChapter}
              onRenameChapter={coursesApi.renameChapter}
              onRemoveChapter={coursesApi.removeChapter}
              onSetChapterQuestions={coursesApi.setChapterQuestions}
              onMoveQuestion={coursesApi.moveQuestion}
              nextQuestionId={coursesApi.nextQuestionId}
              onStartQuiz={(questions, settings, meta) => {
                const quizId = meta?.courseId ? `course:${meta.courseId}` : undefined
                if (quizId && meta) {
                  courseSessionMetaRef.current[quizId] = {
                    courseId: meta.courseId,
                    chapterIds: meta.chapterIds ?? [],
                  }
                }
                quiz.startQuiz(questions, settings, {
                  quizId,
                  quizName: meta
                    ? `${meta.courseName}${meta.chapterTitles.length ? ' · ' + meta.chapterTitles.join(', ') : ''}`
                    : undefined,
                })
                refreshCourseSessions()
              }}
              activeSessions={courseSessions}
              onResumeSession={(record) => {
                if (record.courseId) {
                  courseSessionMetaRef.current[record.id] = {
                    courseId: record.courseId,
                    chapterIds: record.chapterIds ?? [],
                  }
                }
                quiz.resumeSession(record.session)
              }}
              onDiscardSession={(id) => {
                void apiDeleteSession(id).then(setCourseSessions).catch(() => {})
              }}
              onImportToChapter={(courseId, chapterId) => {
                setImportTarget({ courseId, chapterId })
                setPendingQuestions(null)
                setPendingQuiz(null)
                navigate('create')
              }}
              statsForCourse={(courseId) => history.statsFor(`course:${courseId}`)}
              onViewCourseResults={(scopeId) => setHistoryQuizId(scopeId)}
              isMasteryEnabled={masteryApi.isScopeEnabled}
              onToggleMastery={(scopeId, enabled) => { void masteryApi.setScopeEnabled(scopeId, enabled) }}
              openQuizConfigCourseId={courseQuizConfigRequest}
              onOpenQuizConfigConsumed={() => setCourseQuizConfigRequest(null)}
              standaloneSlot={
                library.quizzes.length > 0 ? (
                  <div className="mt-10 border-t border-slate-200 pt-8 dark:border-slate-800">
                    <SavedQuizList
                      quizzes={library.quizzes}
                      statsFor={history.statsFor}
                      onStart={(saved) => openSetup(saved.questions, saved)}
                      onResume={handleResume}
                      onStartOver={handleStartOver}
                      onDiscardProgress={(saved) => { void library.clearProgress(saved.id).catch(() => {}) }}
                      onOpen={(saved) => setOpenQuizId(saved.id)}
                      onViewResults={(saved) => setHistoryQuizId(saved.id)}
                      onRename={handleRename}
                      onDelete={handleDeleteQuiz}
                      onCreate={() => navigate('create')}
                      isMasteryEnabled={masteryApi.isScopeEnabled}
                      onToggleMastery={(quizId, enabled) => { void masteryApi.setScopeEnabled(quizId, enabled) }}
                    />
                  </div>
                ) : null
              }
            />
          </div>
        )}

        {/* 6. Results — every attempt, across every quiz. */}
        {reviewAttempt === null && historyTarget === null && openQuiz === null && finishedSession === null && view === 'results' && (
          <RecentResults
            attempts={allAttempts}
            heading="Results"
            subheading="Your attempts, newest first"
            onReview={setReviewAttempt}
            onDelete={handleDeleteAttempt}
            onSaveToLibrary={library.saveAttemptToLibrary}
            isInLibrary={(attempt) => library.findQuizForPastAttempt(attempt) !== null}
            emptyState={
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
                <div aria-hidden className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                </div>
                <p className="mt-2 font-semibold">No quiz results yet</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Complete a quiz and your results will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('library')}
                  className="mt-4 min-h-11 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  Browse Quiz Library
                </button>
              </div>
            }
          />
        )}

        {/* 7. Home. */}
        {reviewAttempt === null && historyTarget === null && openQuiz === null && finishedSession === null && view === 'home' && (
          <HomeDashboard
            onNavigate={navigate}
            resumable={resumable}
            onResume={handleResume}
            savedCount={library.quizzes.length}
            attemptCount={history.attempts.length}
          >
            <MasteryDashboard
              mastery={masteryApi.mastery}
              enabledScopes={masteryApi.enabledScopes}
              quizzes={library.quizzes}
              courses={coursesApi.courses}
              onStartReview={startMasteryReview}
              onStartFlashcards={startFlashcards}
              onResetScope={resetMasteryScope}
              compact
            />
            <RecentResults
              attempts={history.recent(RECENT_RESULTS_LIMIT)}
              onReview={setReviewAttempt}
              onDelete={handleDeleteAttempt}
              onSaveToLibrary={library.saveAttemptToLibrary}
              isInLibrary={(attempt) => library.findQuizForPastAttempt(attempt) !== null}
              onSeeAll={() => navigate('results')}
            />
          </HomeDashboard>
        )}
      </main>

      {dialogs}
    </div>
  )
}

interface FinishedQuizProps {
  session: QuizSession
  onRetry: () => void
  onRetryIncorrect: () => void
  onCreateQuiz: () => void
  onLibrary: () => void
  onHome: () => void
  onViewHistory: (quizId: string) => void
  renderQuestionExtras?: ResultScreenExtras
}

/** Result of the run just submitted, with a jump into its history if saved. */
function FinishedQuiz({
  session,
  onRetry,
  onRetryIncorrect,
  onCreateQuiz,
  onLibrary,
  onHome,
  onViewHistory,
  renderQuestionExtras,
}: FinishedQuizProps) {
  const quizId = session.quizId
  return (
    <ResultScreen
      session={session}
      onRetry={onRetry}
      onRetryIncorrect={onRetryIncorrect}
      onNewQuiz={onCreateQuiz}
      newQuizLabel="Create Quiz"
      onLibrary={onLibrary}
      onHome={onHome}
      onViewHistory={quizId === undefined ? undefined : () => onViewHistory(quizId)}
      renderQuestionExtras={renderQuestionExtras}
      // Only the run just submitted celebrates; reviewing it again from the
      // history (call site 1 above) does not.
      celebrateOnPass
    />
  )
}

interface ActiveQuizProps {
  session: QuizSession
  quiz: ReturnType<typeof useQuiz>
  onExit: () => void
}

/** The in-progress quiz view: compact bar, current question, fixed navigation. */
function ActiveQuiz({ session, quiz, onExit }: ActiveQuizProps) {
  const { questions, currentIndex, answers, drafts } = session
  const question = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const answeredCount = Object.keys(answers).length
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)

  const multi = isMultiAnswer(question)
  const revealed = isRevealed(session, question.id)
  const locked = isQuestionLocked(session, question)
  // What "Check Answer" would judge right now: a single pick is already an
  // answer, a multi-answer selection is still a draft.
  const hasSelection = multi
    ? (answers[question.id] ?? drafts[question.id] ?? []).length > 0
    : answers[question.id] !== undefined

  const remaining = useTimer(session.startedAt, session.timerMinutes, true, quiz.finishQuiz)

  /*
   * Picking and paging each have two entry points — the buttons below and the
   * `keydown` listener further down — so the handlers live here, where both
   * paths meet, rather than in `QuizCard`. A view-only trigger would leave
   * keyboard users in silence, and duplicating one in each path would let them
   * drift apart.
   *
   * The guards are the other half: `useQuiz`'s mutators no-op silently when a
   * question is locked or you're at the ends of the list, and a sound on a
   * click that changed nothing is a lie. The buttons are `disabled` in those
   * states but the keyboard is not, so the check belongs here too.
   */
  const handlePick = useCallback(
    (option: string) => {
      if (locked) return
      playSound('select')
      if (multi) quiz.toggleDraft(question.id, option)
      else quiz.selectAnswer(question.id, option)
    },
    [quiz, question.id, multi, locked],
  )

  const handleNext = useCallback(() => {
    if (currentIndex >= questions.length - 1) return
    playSound('navigate')
    quiz.next()
  }, [quiz, currentIndex, questions.length])

  const handlePrevious = useCallback(() => {
    if (currentIndex <= 0) return
    playSound('navigate')
    quiz.previous()
  }, [quiz, currentIndex])

  // A long question can leave the next one scrolled past its own heading.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [currentIndex])

  // Keyboard navigation: ←/→ move between questions, 1–8 or A–H pick an option.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Don't hijack keys while the user is typing in an input.
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (event.key === 'ArrowRight') handleNext()
      else if (event.key === 'ArrowLeft') handlePrevious()
      else if (event.key === 'Enter') {
        // Enter mirrors the "Check Answer" button, on either kind of question.
        // Deliberately silent: the verdict tone follows a tick later, and a
        // click stacked in front of it would muddy the app's most important
        // sound.
        if (!locked && hasSelection) quiz.checkAnswer(question.id)
      } else if (!locked) {
        // Number keys 1-8
        const num = Number(event.key)
        let optionIndex = Number.isInteger(num) && num >= 1 ? num - 1 : -1
        // Letter keys a-h
        if (optionIndex === -1 && /^[a-h]$/i.test(event.key)) {
          optionIndex = event.key.toLowerCase().charCodeAt(0) - 97
        }
        if (optionIndex >= 0 && optionIndex < question.options.length) {
          // `handlePick` makes the multi/single decision, so the keyboard and
          // the buttons can't disagree about it.
          handlePick(question.options[optionIndex])
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [quiz, question, locked, hasSelection, handlePick, handleNext, handlePrevious])

  const handleFinish = () => {
    // Ask for confirmation when questions are still unanswered, so a stray
    // tap can't throw the attempt away.
    if (answeredCount < questions.length) {
      setConfirmFinish(true)
      return
    }
    quiz.finishQuiz()
  }

  const navButton =
    'min-h-12 flex-1 rounded-xl px-5 py-2.5 font-semibold shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <>
      <QuizTopBar
        title={session.quizName ?? 'Quiz'}
        current={currentIndex + 1}
        total={questions.length}
        answered={answeredCount}
        remaining={remaining}
        onExit={() => setConfirmExit(true)}
      />

      <main className="mx-auto max-w-3xl px-4 pt-5 pb-36">
        <QuizCard
          question={question}
          selectedAnswers={answers[question.id]}
          draft={drafts[question.id]}
          revealed={revealed}
          // Both route through the same handler: QuizCard already decides
          // single vs multi at the click, and `handlePick` decides which
          // mutator that means.
          onSelect={handlePick}
          onToggle={handlePick}
          onCheck={() => quiz.checkAnswer(question.id)}
        />

        <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-600">
          Tip: use ← → to navigate, 1–{Math.min(question.options.length, 8)} or A–
          {String.fromCharCode(64 + Math.min(question.options.length, 8))} to{' '}
          {multi ? 'tick options' : 'answer'}, Enter to check
        </p>
      </main>

      {/* Fixed, so Previous/Next are always a thumb away no matter how long
          the question runs. */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className={`${navButton} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`}
          >
            ← Previous
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={handleFinish}
              className={`${navButton} bg-green-600 text-white hover:bg-green-700 focus-visible:outline-green-600`}
            >
              Finish ✓
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className={`${navButton} bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-500`}
            >
              Next →
            </button>
          )}
        </div>
      </div>

      {confirmExit && (
        <ConfirmDialog
          title="Leave this quiz?"
          message={
            session.quizId !== undefined ? (
              <p>
                Your progress is saved. You can pick this quiz back up from your Quiz Library or
                from Home.
              </p>
            ) : (
              <p>
                This quiz isn't saved in your library, so this attempt will be discarded and won't
                appear in Results.
              </p>
            )
          }
          confirmLabel="Leave quiz"
          cancelLabel="Keep going"
          danger={session.quizId === undefined}
          onConfirm={onExit}
          onCancel={() => setConfirmExit(false)}
        />
      )}

      {confirmFinish && (
        <ConfirmDialog
          title="Finish with unanswered questions?"
          message={
            <p>
              {questions.length - answeredCount} of {questions.length} questions are still
              unanswered. They'll be marked as skipped.
            </p>
          }
          confirmLabel="Finish quiz"
          cancelLabel="Keep answering"
          onConfirm={() => {
            setConfirmFinish(false)
            quiz.finishQuiz()
          }}
          onCancel={() => setConfirmFinish(false)}
        />
      )}
    </>
  )
}
