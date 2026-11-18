import { useCallback, useEffect, useState } from 'react'
import type { HistoryStats, QuizAttempt, QuizSession } from '../types/quiz'
import { apiAppendAttempt, apiDeleteAttempt, apiListAttempts } from '../services/api'
import {
  attemptsForQuiz,
  computeHistoryStats,
  sessionToAttempt,
  sortAttemptsByRecency,
} from '../utils/library'

export function useQuizHistory() {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      setAttempts(await apiListAttempts())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attempts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const recordSession = useCallback(async (session: QuizSession): Promise<QuizAttempt> => {
    const attempt = sessionToAttempt(session, session.finishedAt ?? Date.now())
    const list = await apiAppendAttempt(attempt)
    setAttempts(list)
    return attempt
  }, [])

  const removeAttempt = useCallback(async (id: string): Promise<void> => {
    const list = await apiDeleteAttempt(id)
    setAttempts(list)
  }, [])

  const hasAttempt = useCallback((id: string): boolean => attempts.some((a) => a.id === id), [attempts])

  const forQuiz = useCallback(
    (quizId: string): QuizAttempt[] => attemptsForQuiz(attempts, quizId),
    [attempts],
  )

  const statsFor = useCallback(
    (quizId: string): HistoryStats => computeHistoryStats(attempts.filter((a) => a.quizId === quizId)),
    [attempts],
  )

  const recent = useCallback(
    (limit: number): QuizAttempt[] => sortAttemptsByRecency(attempts).slice(0, limit),
    [attempts],
  )

  return { attempts, loading, error, refresh, recordSession, removeAttempt, hasAttempt, forQuiz, statsFor, recent }
}
