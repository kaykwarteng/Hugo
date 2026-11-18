import { useCallback, useEffect, useState } from 'react'
import type { QuizQuestion, QuizSession, QuizSettings } from '../types/quiz'
import { clearSession, createId, loadSession, saveSession } from '../services/storage'
import { buildSession } from '../utils/library'
import { isMultiAnswer, toggleOption } from '../utils/quiz'

interface StartOptions {
  quizId?: string
  quizName?: string
}

export function useQuiz() {
  const [session, setSession] = useState<QuizSession | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadSession()
      .then((restored) => {
        if (!cancelled) setSession(restored)
      })
      .catch(() => {
        /* DB unavailable; start without restored session */
      })
      .finally(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (session) void saveSession(session).catch(() => {})
    else void clearSession().catch(() => {})
  }, [session, hydrated])

  const startQuiz = useCallback(
    (bank: QuizQuestion[], settings: QuizSettings, options: StartOptions = {}) => {
      setSession(buildSession(bank, settings, options))
    },
    [],
  )

  const resumeSession = useCallback((restored: QuizSession) => {
    setSession(restored)
  }, [])

  const selectAnswer = useCallback((questionId: number, option: string) => {
    setSession((s) => {
      if (!s || s.status !== 'active' || s.revealed.includes(questionId)) return s
      return { ...s, answers: { ...s.answers, [questionId]: [option] } }
    })
  }, [])

  const toggleDraft = useCallback((questionId: number, option: string) => {
    setSession((s) => {
      if (!s || s.status !== 'active' || s.answers[questionId] !== undefined) return s
      if (s.revealed.includes(questionId)) return s
      return {
        ...s,
        drafts: { ...s.drafts, [questionId]: toggleOption(s.drafts[questionId] ?? [], option) },
      }
    })
  }, [])

  const checkAnswer = useCallback((questionId: number) => {
    setSession((s) => {
      if (!s || s.status !== 'active' || s.revealed.includes(questionId)) return s
      const question = s.questions.find((q) => q.id === questionId)
      if (question === undefined) return s

      const revealed = [...s.revealed, questionId]
      if (s.answers[questionId] !== undefined) return { ...s, revealed }
      if (!isMultiAnswer(question)) return s

      const draft = s.drafts[questionId]
      if (draft === undefined || draft.length === 0) return s
      const drafts = { ...s.drafts }
      delete drafts[questionId]
      return { ...s, answers: { ...s.answers, [questionId]: draft }, drafts, revealed }
    })
  }, [])

  const goTo = useCallback((index: number) => {
    setSession((s) => {
      if (!s || s.status !== 'active') return s
      const clamped = Math.min(Math.max(index, 0), s.questions.length - 1)
      return { ...s, currentIndex: clamped }
    })
  }, [])

  const next = useCallback(() => {
    setSession((s) =>
      s && s.status === 'active' && s.currentIndex < s.questions.length - 1
        ? { ...s, currentIndex: s.currentIndex + 1 }
        : s,
    )
  }, [])

  const previous = useCallback(() => {
    setSession((s) =>
      s && s.status === 'active' && s.currentIndex > 0
        ? { ...s, currentIndex: s.currentIndex - 1 }
        : s,
    )
  }, [])

  const finishQuiz = useCallback(() => {
    setSession((s) =>
      s && s.status === 'active' ? { ...s, status: 'finished', finishedAt: Date.now() } : s,
    )
  }, [])

  const retryQuiz = useCallback(() => {
    setSession((s) =>
      s
        ? {
            ...s,
            answers: {},
            drafts: {},
            revealed: [],
            currentIndex: 0,
            status: 'active',
            startedAt: Date.now(),
            finishedAt: undefined,
            attemptId: createId('attempt'),
          }
        : s,
    )
  }, [])

  const resetQuiz = useCallback(() => {
    setSession(null)
  }, [])

  return {
    session,
    hydrated,
    startQuiz,
    resumeSession,
    selectAnswer,
    toggleDraft,
    checkAnswer,
    goTo,
    next,
    previous,
    finishQuiz,
    retryQuiz,
    resetQuiz,
  }
}
