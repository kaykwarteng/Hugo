import { useCallback, useEffect, useState } from 'react'
import type { QuizQuestion, QuizSession, QuizSettings } from '../types/quiz'
import { clearSession, createId, loadSession, saveSession } from '../services/storage'
import { buildSession } from '../utils/library'
import { isMultiAnswer, toggleOption } from '../utils/quiz'

interface StartOptions {
  quizId?: string
  quizName?: string
  incorrectOnly?: boolean
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
      if (!s || s.status !== 'active' || s.revealed.includes(questionId)) return s
      const prev = s.answers[questionId] ?? s.drafts[questionId] ?? []
      const next = toggleOption(prev, option)
      const answers = { ...s.answers }
      if (next.length === 0) delete answers[questionId]
      else answers[questionId] = next
      const drafts = { ...s.drafts }
      delete drafts[questionId]
      return { ...s, answers, drafts }
    })
  }, [])

  const checkAnswer = useCallback((questionId: number) => {
    setSession((s) => {
      if (!s || s.status !== 'active' || s.revealed.includes(questionId)) return s
      const question = s.questions.find((q) => q.id === questionId)
      if (question === undefined) return s

      const revealed = [...s.revealed, questionId]
      // Commit any legacy unsubmitted multi-select draft before revealing.
      if (isMultiAnswer(question) && s.answers[questionId] === undefined) {
        const draft = s.drafts[questionId]
        if (draft && draft.length > 0) {
          const drafts = { ...s.drafts }
          delete drafts[questionId]
          return { ...s, answers: { ...s.answers, [questionId]: draft }, drafts, revealed }
        }
      }
      if (s.drafts[questionId] !== undefined) {
        const drafts = { ...s.drafts }
        delete drafts[questionId]
        return { ...s, drafts, revealed }
      }
      return { ...s, revealed }
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
    setSession((s) => {
      if (!s || s.status === 'finished') return s
      let answers = s.answers
      let drafts = s.drafts
      let changed = false
      for (const q of s.questions) {
        const draft = drafts[q.id]
        if (answers[q.id] === undefined && draft && draft.length > 0) {
          if (!changed) {
            answers = { ...answers }
            drafts = { ...drafts }
            changed = true
          }
          answers[q.id] = draft
          delete drafts[q.id]
        }
      }
      return {
        ...s,
        ...(changed ? { answers, drafts } : {}),
        status: 'finished',
        finishedAt: Date.now(),
      }
    })
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
