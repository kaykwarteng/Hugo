import type { Course, QuizQuestion, QuestionMastery } from '../types/quiz'

export type MasteryBucket = 'new' | 'learning' | 'due' | 'weak' | 'strong'

export interface MasterySummary {
  total: number
  tracked: number
  due: number
  weak: number
  learning: number
  strong: number
  fresh: number
}

const DAY_MS = 86_400_000

export function masteryKey(scopeId: string, questionId: number): string {
  return `${scopeId}:${questionId}`
}

/** Stable numeric id for a course question so ids are unique across chapters within a course scope. */
export function courseScopedQuestionId(chapterId: string, questionId: number): number {
  let h = 0x811c9dc5
  const s = `${chapterId}:${questionId}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) || 1
}

export function toCourseScopedQuestion(chapterId: string, question: QuizQuestion): QuizQuestion {
  return { ...question, id: courseScopedQuestionId(chapterId, question.id) }
}

export function toCourseScopedQuestions(chapterId: string, questions: QuizQuestion[]): QuizQuestion[] {
  return questions.map((q) => toCourseScopedQuestion(chapterId, q))
}

export function isDue(m: QuestionMastery | undefined, now = Date.now()): boolean {
  if (!m) return false
  if (m.lastReviewedAt === undefined) return true
  return m.lastReviewedAt + Math.max(1, m.intervalDays) * DAY_MS <= now
}

export function isWeak(m: QuestionMastery | undefined): boolean {
  if (!m) return false
  if (m.incorrectCount > m.correctCount) return true
  if (m.easeFactor <= 2.0 && (m.incorrectCount > 0 || m.correctCount + m.incorrectCount < 3)) return true
  return false
}

export function bucket(m: QuestionMastery | undefined, now = Date.now()): MasteryBucket {
  if (!m || (m.correctCount === 0 && m.incorrectCount === 0 && m.lastReviewedAt === undefined)) return 'new'
  if (isWeak(m)) return 'weak'
  if (isDue(m, now)) return 'due'
  if (m.correctCount >= 3 && m.intervalDays >= 7 && m.easeFactor >= 2.4) return 'strong'
  return 'learning'
}

export function getMasteryForQuestion(
  scopeId: string,
  questionId: number,
  map: Record<string, QuestionMastery>,
): QuestionMastery | undefined {
  return map[masteryKey(scopeId, questionId)]
}

export function getMasterySummary(
  questions: QuizQuestion[],
  scopeId: string,
  map: Record<string, QuestionMastery>,
  now = Date.now(),
): MasterySummary {
  let tracked = 0
  let due = 0
  let weak = 0
  let learning = 0
  let strong = 0
  let fresh = 0
  for (const q of questions) {
    const m = getMasteryForQuestion(scopeId, q.id, map)
    const b = bucket(m, now)
    if (b === 'new') fresh++
    else tracked++
    if (b === 'due') due++
    if (b === 'weak') weak++
    if (b === 'learning') learning++
    if (b === 'strong') strong++
  }
  return { total: questions.length, tracked, due, weak, learning, strong, fresh }
}

export function selectQuestionsByMastery(
  questions: QuizQuestion[],
  scopeId: string,
  map: Record<string, QuestionMastery>,
  mode: 'due' | 'weak' | 'adaptive' | 'flagged' | 'bookmarked',
  limit?: number,
  now = Date.now(),
): QuizQuestion[] {
  let selected = questions.filter((q) => {
    const m = getMasteryForQuestion(scopeId, q.id, map)
    if (mode === 'due') return isDue(m, now)
    if (mode === 'weak') return isWeak(m)
    if (mode === 'adaptive') {
      const b = bucket(m, now)
      return b === 'due' || b === 'weak' || b === 'learning' || b === 'new'
    }
    if (mode === 'flagged') return q.flagged === true
    if (mode === 'bookmarked') return q.bookmarked === true
    return false
  })

  if (mode === 'adaptive') {
    const rank = (q: QuizQuestion) => {
      const b = bucket(getMasteryForQuestion(scopeId, q.id, map), now)
      return b === 'weak' ? 0 : b === 'due' ? 1 : b === 'learning' ? 2 : 3
    }
    selected = [...selected].sort((a, b) => rank(a) - rank(b))
  }

  if (limit && limit > 0) selected = selected.slice(0, limit)
  return selected
}

export function flattenCourseQuestions(course: Pick<Course, 'chapters'>): QuizQuestion[] {
  return course.chapters.flatMap((ch) => toCourseScopedQuestions(ch.id, ch.questions))
}
