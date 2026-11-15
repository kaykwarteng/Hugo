/**
 * HTTP client for the local Hugo API (SQLite-backed).
 * In dev, Vite proxies /api → http://localhost:8787.
 */

import type { Course, QuestionMastery, QuizAttempt } from '../types/quiz'

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

export async function apiListAttempts(): Promise<QuizAttempt[]> {
  return request('/attempts')
}

export async function apiAppendAttempt(attempt: QuizAttempt): Promise<QuizAttempt[]> {
  return request('/attempts', { method: 'POST', body: JSON.stringify(attempt) })
}

export async function apiDeleteAttempt(id: string): Promise<QuizAttempt[]> {
  return request(`/attempts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function apiLoadMastery(): Promise<Record<string, QuestionMastery>> {
  return request('/mastery')
}

export async function apiRecordMastery(
  scopeKey: string,
  questionId: number,
  correct: boolean,
): Promise<QuestionMastery> {
  return request('/mastery/record', {
    method: 'POST',
    body: JSON.stringify({ scopeKey, questionId, correct }),
  })
}

export interface ActiveSessionRecord {
  id: string
  courseId?: string
  chapterIds: string[]
  quizName?: string
  session: import('../types/quiz').QuizSession
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
  session: import('../types/quiz').QuizSession
}): Promise<ActiveSessionRecord> {
  return request(`/sessions/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    body: JSON.stringify(record),
  })
}

export async function apiDeleteSession(id: string): Promise<ActiveSessionRecord[]> {
  return request(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
