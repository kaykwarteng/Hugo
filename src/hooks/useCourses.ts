import { useCallback, useEffect, useState } from 'react'
import type { Chapter, Course, QuizQuestion } from '../types/quiz'
import {
  apiCreateCourse,
  apiDeleteCourse,
  apiListCourses,
  apiUpsertCourse,
} from '../services/api'
import { createChapter, createCourse } from '../services/storage'

/**
 * Hierarchical course library backed by the local SQLite API.
 * Keeps an in-memory cache; every mutation writes through to disk via the API.
 */
export function useCourses() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const list = await apiListCourses()
      setCourses(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load courses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const persist = useCallback(async (course: Course) => {
    const saved = await apiUpsertCourse({ ...course, updatedAt: Date.now() })
    setCourses((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id)
      if (idx < 0) return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
      const next = [...prev]
      next[idx] = saved
      return next
    })
    return saved
  }, [])

  const addCourse = useCallback(async (name: string, description?: string): Promise<Course> => {
    const course = createCourse(name, description)
    const saved = await apiCreateCourse(course)
    setCourses((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)))
    return saved
  }, [])

  const renameCourse = useCallback(
    async (id: string, name: string, description?: string) => {
      if (!name.trim()) return
      const current = courses.find((c) => c.id === id)
      if (!current) return
      await persist({
        ...current,
        name: name.trim(),
        description:
          description !== undefined ? description.trim() || undefined : current.description,
      })
    },
    [courses, persist],
  )

  const removeCourse = useCallback(async (id: string) => {
    const list = await apiDeleteCourse(id)
    setCourses(list)
  }, [])

  const addChapter = useCallback(
    async (courseId: string, title: string, description?: string): Promise<Chapter | null> => {
      const current = courses.find((c) => c.id === courseId)
      if (!current) return null
      const order =
        current.chapters.length > 0 ? Math.max(...current.chapters.map((ch) => ch.order)) + 1 : 0
      const chapter = createChapter(title, order, description)
      await persist({
        ...current,
        chapters: [...current.chapters, chapter],
      })
      return chapter
    },
    [courses, persist],
  )

  const renameChapter = useCallback(
    async (courseId: string, chapterId: string, title: string, description?: string) => {
      if (!title.trim()) return
      const current = courses.find((c) => c.id === courseId)
      if (!current) return
      await persist({
        ...current,
        chapters: current.chapters.map((ch) =>
          ch.id === chapterId
            ? {
                ...ch,
                title: title.trim(),
                description:
                  description !== undefined ? description.trim() || undefined : ch.description,
              }
            : ch,
        ),
      })
    },
    [courses, persist],
  )

  const removeChapter = useCallback(
    async (courseId: string, chapterId: string) => {
      const current = courses.find((c) => c.id === courseId)
      if (!current) return
      await persist({
        ...current,
        chapters: current.chapters.filter((ch) => ch.id !== chapterId),
      })
    },
    [courses, persist],
  )

  const reorderChapters = useCallback(
    async (courseId: string, chapterIds: string[]) => {
      const current = courses.find((c) => c.id === courseId)
      if (!current) return
      const byId = new Map(current.chapters.map((ch) => [ch.id, ch]))
      const reordered = chapterIds
        .map((id, i) => {
          const ch = byId.get(id)
          return ch ? { ...ch, order: i } : null
        })
        .filter((ch): ch is Chapter => ch !== null)
      for (const ch of current.chapters) {
        if (!chapterIds.includes(ch.id)) reordered.push({ ...ch, order: reordered.length })
      }
      await persist({ ...current, chapters: reordered })
    },
    [courses, persist],
  )

  const setChapterQuestions = useCallback(
    async (courseId: string, chapterId: string, questions: QuizQuestion[]) => {
      const current = courses.find((c) => c.id === courseId)
      if (!current) return
      await persist({
        ...current,
        chapters: current.chapters.map((ch) =>
          ch.id === chapterId ? { ...ch, questions } : ch,
        ),
      })
    },
    [courses, persist],
  )

  const addQuestionsToChapter = useCallback(
    async (courseId: string, chapterId: string, questions: QuizQuestion[]) => {
      const current = courses.find((c) => c.id === courseId)
      if (!current) return
      await persist({
        ...current,
        chapters: current.chapters.map((ch) =>
          ch.id === chapterId ? { ...ch, questions: [...ch.questions, ...questions] } : ch,
        ),
      })
    },
    [courses, persist],
  )

  const nextQuestionId = useCallback(
    (courseId: string, chapterId: string): number => {
      const course = courses.find((c) => c.id === courseId)
      const chapter = course?.chapters.find((ch) => ch.id === chapterId)
      if (!chapter || chapter.questions.length === 0) return 1
      return Math.max(...chapter.questions.map((q) => q.id)) + 1
    },
    [courses],
  )

  const updateQuestion = useCallback(
    async (courseId: string, chapterId: string, question: QuizQuestion) => {
      const current = courses.find((c) => c.id === courseId)
      if (!current) return
      await persist({
        ...current,
        chapters: current.chapters.map((ch) =>
          ch.id === chapterId
            ? {
                ...ch,
                questions: ch.questions.map((q) => (q.id === question.id ? question : q)),
              }
            : ch,
        ),
      })
    },
    [courses, persist],
  )

  const deleteQuestion = useCallback(
    async (courseId: string, chapterId: string, questionId: number) => {
      const current = courses.find((c) => c.id === courseId)
      if (!current) return
      await persist({
        ...current,
        chapters: current.chapters.map((ch) =>
          ch.id === chapterId
            ? { ...ch, questions: ch.questions.filter((q) => q.id !== questionId) }
            : ch,
        ),
      })
    },
    [courses, persist],
  )

  const moveQuestion = useCallback(
    async (
      fromCourseId: string,
      fromChapterId: string,
      toCourseId: string,
      toChapterId: string,
      questionId: number,
    ) => {
      if (fromCourseId === toCourseId && fromChapterId === toChapterId) return

      if (fromCourseId === toCourseId) {
        const current = courses.find((c) => c.id === fromCourseId)
        if (!current) return
        let moved: QuizQuestion | undefined
        const chapters = current.chapters.map((ch) => {
          if (ch.id === fromChapterId) {
            moved = ch.questions.find((q) => q.id === questionId)
            return { ...ch, questions: ch.questions.filter((q) => q.id !== questionId) }
          }
          return ch
        })
        if (!moved) return
        await persist({
          ...current,
          chapters: chapters.map((ch) =>
            ch.id === toChapterId ? { ...ch, questions: [...ch.questions, moved!] } : ch,
          ),
        })
        return
      }

      const from = courses.find((c) => c.id === fromCourseId)
      const to = courses.find((c) => c.id === toCourseId)
      if (!from || !to) return
      let moved: QuizQuestion | undefined
      const fromChapters = from.chapters.map((ch) => {
        if (ch.id !== fromChapterId) return ch
        moved = ch.questions.find((q) => q.id === questionId)
        return { ...ch, questions: ch.questions.filter((q) => q.id !== questionId) }
      })
      if (!moved) return
      await persist({ ...from, chapters: fromChapters })
      await persist({
        ...to,
        chapters: to.chapters.map((ch) =>
          ch.id === toChapterId ? { ...ch, questions: [...ch.questions, moved!] } : ch,
        ),
      })
    },
    [courses, persist],
  )

  const getCourseQuestions = useCallback(
    (courseId: string): QuizQuestion[] => {
      const course = courses.find((c) => c.id === courseId)
      if (!course) return []
      return course.chapters
        .slice()
        .sort((a, b) => a.order - b.order)
        .flatMap((ch) => ch.questions)
    },
    [courses],
  )

  const getChapterQuestions = useCallback(
    (courseId: string, chapterIds: string[]): QuizQuestion[] => {
      const course = courses.find((c) => c.id === courseId)
      if (!course) return []
      return course.chapters
        .filter((ch) => chapterIds.includes(ch.id))
        .sort((a, b) => a.order - b.order)
        .flatMap((ch) => ch.questions)
    },
    [courses],
  )

  const findCourse = useCallback(
    (courseId: string) => courses.find((c) => c.id === courseId) ?? null,
    [courses],
  )

  const findChapter = useCallback(
    (courseId: string, chapterId: string) => {
      const course = courses.find((c) => c.id === courseId)
      return course?.chapters.find((ch) => ch.id === chapterId) ?? null
    },
    [courses],
  )

  return {
    courses,
    loading,
    error,
    refresh,
    addCourse,
    renameCourse,
    removeCourse,
    addChapter,
    renameChapter,
    removeChapter,
    reorderChapters,
    setChapterQuestions,
    addQuestionsToChapter,
    nextQuestionId,
    updateQuestion,
    deleteQuestion,
    moveQuestion,
    getCourseQuestions,
    getChapterQuestions,
    findCourse,
    findChapter,
  }
}
