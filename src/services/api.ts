/**
 * HTTP client for the local Hugo API (SQLite-backed).
 * In dev, Vite proxies /api → http://localhost:8787.
 */

import type { Course, QuestionMastery, QuizAttempt, QuizSession, SavedQuiz } from '../types/quiz'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message || `Request failed (${res.status})`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function apiHealth(): Promise<{ ok: boolean; db: string }> {
  return request('/health')
}

export async function apiListCourses(): Promise<Course[]> {
  return request('/courses')
}

export async function apiGetCourse(id: string): Promise<Course> {
  return request(`/courses/${encodeURIComponent(id)}`)
}

export async function apiUpsertCourse(course: Course): Promise<Course> {
  return request(`/courses/${encodeURIComponent(course.id)}`, {
    method: 'PUT',
    body: JSON.stringify(course),
  })
}

export async function apiCreateCourse(course: Course): Promise<Course> {
  return request('/courses', {
    method: 'POST',
    body: JSON.stringify(course),
  })
}

export async function apiDeleteCourse(id: string): Promise<Course[]> {
  return request(`/courses/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiListQuizzes(): Promise<SavedQuiz[]> {
  return request('/quizzes')
}

export async function apiGetQuiz(id: string): Promise<SavedQuiz> {
  return request(`/quizzes/${encodeURIComponent(id)}`)
}

export async function apiUpsertQuiz(quiz: SavedQuiz): Promise<SavedQuiz> {
  return request(`/quizzes/${encodeURIComponent(quiz.id)}`, {
    method: 'PUT',
    body: JSON.stringify(quiz),
  })
}

export async function apiCreateQuiz(quiz: SavedQuiz): Promise<SavedQuiz> {
  return request('/quizzes', { method: 'POST', body: JSON.stringify(quiz) })
}

export async function apiDeleteQuiz(id: string): Promise<SavedQuiz[]> {
  return request(`/quizzes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiBulkUpsertQuizzes(quizzes: SavedQuiz[]): Promise<SavedQuiz[]> {
  return request('/quizzes/bulk', { method: 'POST', body: JSON.stringify({ quizzes }) })
}

export async function apiListAttempts(): Promise<QuizAttempt[]> {
  return request('/attempts')
}

export async function apiAppendAttempt(attempt: QuizAttempt): Promise<QuizAttempt[]> {
  return request('/attempts', { method: 'POST', body: JSON.stringify(attempt) })
}

export async function apiBulkUpsertAttempts(attempts: QuizAttempt[]): Promise<QuizAttempt[]> {
  return request('/attempts/bulk', { method: 'POST', body: JSON.stringify({ attempts }) })
}

export async function apiDeleteAttempt(id: string): Promise<QuizAttempt[]> {
  return request(`/attempts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiLoadMastery(): Promise<Record<string, QuestionMastery>> {
  return request('/mastery')
}

export async function apiSaveMastery(
  map: Record<string, QuestionMastery>,
): Promise<Record<string, QuestionMastery>> {
  return request('/mastery', { method: 'PUT', body: JSON.stringify(map) })
}

export async function apiRecordMastery(
  scopeKey: string,
  questionId: number,
  outcome: boolean | number | 'again' | 'hard' | 'good',
): Promise<QuestionMastery> {
  const body: Record<string, unknown> = { scopeKey, questionId }
  if (typeof outcome === 'boolean') body.correct = outcome
  else body.quality = outcome
  return request('/mastery/record', { method: 'POST', body: JSON.stringify(body) })
}

export async function apiClearMasteryScope(scopeId: string): Promise<Record<string, QuestionMastery>> {
  return request(`/mastery/scope/${encodeURIComponent(scopeId)}`, { method: 'DELETE' })
}

export interface ActiveSessionRecord {
  id: string
  courseId?: string
  chapterIds?: string[]
  quizName?: string
  session: QuizSession
  updatedAt: number
}

export async function apiListSessions(): Promise<ActiveSessionRecord[]> {
  return request('/sessions')
}

export async function apiUpsertSession(record: {
  id: string
  courseId?: string
  chapterIds?: string[]
  quizName?: string
  session: QuizSession
}): Promise<ActiveSessionRecord> {
  return request(`/sessions/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    body: JSON.stringify(record),
  })
}

export async function apiDeleteSession(id: string): Promise<ActiveSessionRecord[]> {
  return request(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiGetAllState(): Promise<Record<string, unknown>> {
  return request('/state')
}

export async function apiGetState<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const body = await request<{ key: string; value: T }>(`/state/${encodeURIComponent(key)}`)
    return body.value
  } catch (e) {
    if (e instanceof Error && /not found/i.test(e.message)) return undefined
    throw e
  }
}

export async function apiSetState<T = unknown>(key: string, value: T): Promise<void> {
  await request(`/state/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
}

export async function apiDeleteState(key: string): Promise<void> {
  await request(`/state/${encodeURIComponent(key)}`, { method: 'DELETE' })
}
