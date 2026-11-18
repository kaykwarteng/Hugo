import { useCallback, useEffect, useState } from 'react'
import type { QuizAttempt, QuizQuestion, QuizSession, SavedQuiz } from '../types/quiz'
import { apiDeleteQuiz, apiListQuizzes, apiUpsertQuiz } from '../services/api'
import { fingerprintQuestions } from '../utils/library'
import {
  attemptToQuestionBank,
  createSavedQuiz,
  findDuplicate,
  findQuizForAttempt,
  sessionToProgress,
} from '../utils/library'

export interface SaveAttemptResult {
  status: 'saved' | 'already-saved'
  quiz: SavedQuiz
}

export function useSavedQuizzes() {
  const [quizzes, setQuizzes] = useState<SavedQuiz[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      setQuizzes(await apiListQuizzes())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quizzes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const upsertLocal = useCallback((saved: SavedQuiz) => {
    setQuizzes((prev) => {
      const idx = prev.findIndex((q) => q.id === saved.id)
      if (idx < 0) return [saved, ...prev]
      const next = [...prev]
      next[idx] = saved
      return next
    })
  }, [])

  const saveQuiz = useCallback(
    async (name: string, questions: QuizQuestion[]): Promise<SavedQuiz> => {
      const quiz = createSavedQuiz(name, questions)
      const saved = await apiUpsertQuiz(quiz)
      upsertLocal(saved)
      return saved
    },
    [upsertLocal],
  )

  const updateQuiz = useCallback(
    async (id: string, questions: QuizQuestion[], name?: string): Promise<SavedQuiz | null> => {
      const current = quizzes.find((q) => q.id === id)
      if (!current) return null
      const next: SavedQuiz = {
        ...current,
        name: name?.trim() ? name.trim() : current.name,
        questions,
        fingerprint: fingerprintQuestions(questions),
        updatedAt: Date.now(),
        progress: undefined,
      }
      const saved = await apiUpsertQuiz(next)
      upsertLocal(saved)
      return saved
    },
    [quizzes, upsertLocal],
  )

  const renameQuiz = useCallback(
    async (id: string, name: string): Promise<void> => {
      if (name.trim() === '') return
      const current = quizzes.find((q) => q.id === id)
      if (!current) return
      const saved = await apiUpsertQuiz({ ...current, name: name.trim(), updatedAt: Date.now() })
      upsertLocal(saved)
    },
    [quizzes, upsertLocal],
  )

  const removeQuiz = useCallback(async (id: string): Promise<void> => {
    const list = await apiDeleteQuiz(id)
    setQuizzes(list)
  }, [])

  const saveProgress = useCallback(
    async (session: QuizSession): Promise<void> => {
      if (!session.quizId) return
      const current = quizzes.find((q) => q.id === session.quizId)
      if (!current) return
      const saved = await apiUpsertQuiz({ ...current, progress: sessionToProgress(session), updatedAt: Date.now() })
      upsertLocal(saved)
    },
    [quizzes, upsertLocal],
  )

  const completeProgress = useCallback(
    async (quizId: string, attemptId: string): Promise<void> => {
      const current = quizzes.find((q) => q.id === quizId)
      if (!current) return
      const saved = await apiUpsertQuiz({
        ...current,
        progress: undefined,
        lastAttemptId: attemptId,
        updatedAt: Date.now(),
      })
      upsertLocal(saved)
    },
    [quizzes, upsertLocal],
  )

  const clearProgress = useCallback(
    async (quizId: string): Promise<void> => {
      const current = quizzes.find((q) => q.id === quizId)
      if (!current) return
      const saved = await apiUpsertQuiz({ ...current, progress: undefined, updatedAt: Date.now() })
      upsertLocal(saved)
    },
    [quizzes, upsertLocal],
  )

  const findSavedDuplicate = useCallback(
    (questions: QuizQuestion[]): SavedQuiz | null => findDuplicate(quizzes, questions),
    [quizzes],
  )

  const findQuizForPastAttempt = useCallback(
    (attempt: QuizAttempt): SavedQuiz | null => findQuizForAttempt(quizzes, attempt),
    [quizzes],
  )

  const saveAttemptToLibrary = useCallback(
    async (attempt: QuizAttempt): Promise<SaveAttemptResult> => {
      const existing = findQuizForAttempt(quizzes, attempt)
      if (existing) return { status: 'already-saved', quiz: existing }
      const quiz = createSavedQuiz(attempt.quizName, attemptToQuestionBank(attempt))
      const saved = await apiUpsertQuiz(quiz)
      upsertLocal(saved)
      return { status: 'saved', quiz: saved }
    },
    [quizzes, upsertLocal],
  )

  return {
    quizzes,
    loading,
    error,
    refresh,
    saveQuiz,
    updateQuiz,
    renameQuiz,
    removeQuiz,
    saveProgress,
    completeProgress,
    clearProgress,
    findSavedDuplicate,
    findQuizForPastAttempt,
    saveAttemptToLibrary,
  }
}
