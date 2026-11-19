import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Chapter, Course, HistoryStats, QuizQuestion, QuizSettings } from '../types/quiz'
import type { ActiveSessionRecord } from '../services/api'
import { ChapterDetail } from './ChapterDetail'
import { ConfirmDialog } from './ConfirmDialog'
import { CourseQuizConfig } from './CourseQuizConfig'
import {
  IconChart,
  IconChevronRight,
  IconEdit,
  IconFileQuestion,
  IconFolder,
  IconFolderOpen,
  IconGraduationCap,
  IconLayers,
  IconMoreVertical,
  IconPlay,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from './icons/Icons'

interface CourseLibraryProps {
  courses: Course[]
  onAddCourse: (name: string, description?: string) => void
  onRenameCourse: (id: string, name: string, description?: string) => void
  onRemoveCourse: (id: string) => void
  onAddChapter: (courseId: string, title: string, description?: string) => Chapter | null | Promise<Chapter | null>
  onRenameChapter: (courseId: string, chapterId: string, title: string, description?: string) => void
  onRemoveChapter: (courseId: string, chapterId: string) => void
  onSetChapterQuestions: (courseId: string, chapterId: string, questions: QuizQuestion[]) => void
  onMoveQuestion: (
    fromCourseId: string,
    fromChapterId: string,
    toCourseId: string,
    toChapterId: string,
    questionId: number,
  ) => void
  nextQuestionId: (courseId: string, chapterId: string) => number
  /** Start a quiz with the given questions and settings (from course config). */
  onStartQuiz: (
    questions: QuizQuestion[],
    settings: QuizSettings,
    meta?: { courseId: string; courseName: string; chapterIds: string[]; chapterTitles: string[] },
  ) => void
  onImportToChapter: (courseId: string, chapterId: string) => void
  activeSessions?: ActiveSessionRecord[]
  onResumeSession?: (record: ActiveSessionRecord) => void
  onDiscardSession?: (id: string) => void
  /** Attempt stats for a course (keyed by course id). */
  statsForCourse?: (courseId: string) => HistoryStats
  onViewCourseResults?: (courseScopeId: string) => void
  isMasteryEnabled?: (scopeId: string) => boolean
  onToggleMastery?: (scopeId: string, enabled: boolean) => void
  /** When set, opens quiz config for this course (then cleared by consumer). */
  openQuizConfigCourseId?: string | null
  onOpenQuizConfigConsumed?: () => void
  standaloneSlot?: React.ReactNode
}

type SubView =
  | { kind: 'list' }
  | { kind: 'course'; courseId: string }
  | { kind: 'quiz-config'; courseId: string; initialChapterIds?: string[] }
  | { kind: 'chapter'; courseId: string; chapterId: string }

type CourseSort = 'recent' | 'alpha' | 'questions' | 'chapters'
type ChapterSort = 'order' | 'alpha' | 'questions'

interface CardMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
}

const COURSE_SORT_OPTIONS: { value: CourseSort; label: string }[] = [
  { value: 'recent', label: 'Recently created' },
  { value: 'alpha', label: 'Name (A–Z)' },
  { value: 'questions', label: 'Most questions' },
  { value: 'chapters', label: 'Most chapters' },
]

const CHAPTER_SORT_OPTIONS: { value: ChapterSort; label: string }[] = [
  { value: 'order', label: 'Course order' },
  { value: 'alpha', label: 'Name (A–Z)' },
  { value: 'questions', label: 'Most questions' },
]

const STATUS_LABEL = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
} as const

const STATUS_CLASS = {
  'not-started': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  'in-progress': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
} as const

function courseQuestionCount(course: Course) {
  return course.chapters.reduce((total, chapter) => total + chapter.questions.length, 0)
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/**
 * Folder-style library: courses and chapters are cards, each opening a
 * dedicated view. Questions themselves stay in the existing chapter detail
 * screen, so the underlying data model is untouched.
 */
export function CourseLibrary({
  courses,
  onAddCourse,
  onRenameCourse,
  onRemoveCourse,
  onAddChapter,
  onRenameChapter,
  onRemoveChapter,
  onSetChapterQuestions,
  onMoveQuestion,
  nextQuestionId,
  onStartQuiz,
  onImportToChapter,
  activeSessions = [],
  onResumeSession,
  onDiscardSession,
  statsForCourse,
  onViewCourseResults,
  isMasteryEnabled,
  onToggleMastery,
  openQuizConfigCourseId,
  onOpenQuizConfigConsumed,
  standaloneSlot,
}: CourseLibraryProps) {
  const [view, setView] = useState<SubView>({ kind: 'list' })
  const [creatingCourse, setCreatingCourse] = useState(false)
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseDesc, setNewCourseDesc] = useState('')
  const [addingChapterTo, setAddingChapterTo] = useState<string | null>(null)
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [newChapterDesc, setNewChapterDesc] = useState('')
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [editingChapter, setEditingChapter] = useState<{ courseId: string; chapter: Chapter } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'course'; course: Course }
    | { type: 'chapter'; courseId: string; chapter: Chapter }
    | null
  >(null)

  const [courseSearch, setCourseSearch] = useState('')
  const [courseSort, setCourseSort] = useState<CourseSort>('recent')
  const [chapterSearch, setChapterSearch] = useState('')
  const [chapterSort, setChapterSort] = useState<ChapterSort>('order')

  const findCourse = (id: string) => courses.find((course) => course.id === id) ?? null
  const findChapter = (courseId: string, chapterId: string) =>
    findCourse(courseId)?.chapters.find((chapter) => chapter.id === chapterId) ?? null

  /** Change library view and record it so browser back/forward stay in sync. */
  const navigate = useCallback((next: SubView) => {
    setView(next)
    const current = window.history.state as Record<string, unknown> | null
    window.history.pushState({ ...(current ?? {}), drillmcqLibrary: next }, '')
  }, [])

  useEffect(() => {
    const current = window.history.state as Record<string, unknown> | null
    window.history.replaceState({ ...(current ?? {}), drillmcqLibrary: { kind: 'list' } }, '')
    const handlePopState = (event: PopStateEvent) => {
      const next = (event.state as { drillmcqLibrary?: SubView } | null)?.drillmcqLibrary
      if (next) setView(next)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const viewCourse = view.kind === 'course' ? findCourse(view.courseId) : null
  const activeCourseId = view.kind === 'list' ? null : view.courseId

  useEffect(() => {
    setChapterSearch('')
  }, [activeCourseId])

  const totalQuestions = useMemo(
    () => courses.reduce((total, course) => total + courseQuestionCount(course), 0),
    [courses],
  )

  const sortedCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase()
    const filtered = query
      ? courses.filter((course) => course.name.toLowerCase().includes(query))
      : courses
    const list = [...filtered]
    switch (courseSort) {
      case 'alpha':
        list.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'questions':
        list.sort(
          (a, b) => courseQuestionCount(b) - courseQuestionCount(a) || a.name.localeCompare(b.name),
        )
        break
      case 'chapters':
        list.sort(
          (a, b) => b.chapters.length - a.chapters.length || a.name.localeCompare(b.name),
        )
        break
      default:
        list.sort((a, b) => b.createdAt - a.createdAt)
    }
    return list
  }, [courses, courseSearch, courseSort])

  const sortedChapters = useMemo(() => {
    if (!viewCourse) return []
    const query = chapterSearch.trim().toLowerCase()
    const filtered = query
      ? viewCourse.chapters.filter((chapter) => chapter.title.toLowerCase().includes(query))
      : viewCourse.chapters
    const list = [...filtered]
    switch (chapterSort) {
      case 'alpha':
        list.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'questions':
        list.sort(
          (a, b) => b.questions.length - a.questions.length || a.title.localeCompare(b.title),
        )
        break
      default:
        list.sort((a, b) => a.order - b.order)
    }
    return list
  }, [viewCourse, chapterSearch, chapterSort])

  const handleCreateCourse = () => {
    if (!newCourseName.trim()) return
    onAddCourse(newCourseName.trim(), newCourseDesc.trim() || undefined)
    setNewCourseName('')
    setNewCourseDesc('')
    setCreatingCourse(false)
  }

  const handleCreateChapter = (courseId: string) => {
    if (!newChapterTitle.trim()) return
    onAddChapter(courseId, newChapterTitle.trim(), newChapterDesc.trim() || undefined)
    setNewChapterTitle('')
    setNewChapterDesc('')
    setAddingChapterTo(null)
  }

  const openCourse = (courseId: string) => {
    setAddingChapterTo(null)
    navigate({ kind: 'course', courseId })
  }

  useEffect(() => {
    if (!openQuizConfigCourseId) return
    if (findCourse(openQuizConfigCourseId)) {
      navigate({ kind: 'quiz-config', courseId: openQuizConfigCourseId })
    }
    onOpenQuizConfigConsumed?.()
  }, [openQuizConfigCourseId, onOpenQuizConfigConsumed, findCourse, navigate])

  // ---- Quiz configuration ----
  if (view.kind === 'quiz-config') {
    const course = findCourse(view.courseId)
    if (!course) {
      return (
        <NotFound
          message="Course not found."
          onBack={() => navigate({ kind: 'list' })}
        />
      )
    }
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Courses Library', onClick: () => navigate({ kind: 'list' }) },
            { label: course.name, onClick: () => navigate({ kind: 'course', courseId: course.id }) },
            { label: 'Quiz setup' },
          ]}
        />
        <CourseQuizConfig
          course={course}
          initialChapterIds={view.initialChapterIds}
          onBack={() => navigate({ kind: 'course', courseId: course.id })}
          onStart={(questions, settings, meta) => {
            onStartQuiz(questions, settings, meta)
          }}
        />
      </div>
    )
  }

  // ---- Chapter (question management) ----
  if (view.kind === 'chapter') {
    const course = findCourse(view.courseId)
    const chapter = findChapter(view.courseId, view.chapterId)
    if (!course || !chapter) {
      return (
        <NotFound
          message="Chapter not found."
          onBack={() =>
            course
              ? navigate({ kind: 'course', courseId: course.id })
              : navigate({ kind: 'list' })
          }
        />
      )
    }
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Courses Library', onClick: () => navigate({ kind: 'list' }) },
            { label: course.name, onClick: () => navigate({ kind: 'course', courseId: course.id }) },
            { label: chapter.title },
          ]}
        />
        <ChapterDetail
          course={course}
          chapter={chapter}
          allCourses={courses}
          onBack={() => navigate({ kind: 'course', courseId: course.id })}
          onStudy={() =>
            navigate({
              kind: 'quiz-config',
              courseId: course.id,
              initialChapterIds: [chapter.id],
            })
          }
          onSetQuestions={(questions) => onSetChapterQuestions(course.id, chapter.id, questions)}
          onMoveQuestion={(questionId, toCourseId, toChapterId) =>
            onMoveQuestion(course.id, chapter.id, toCourseId, toChapterId, questionId)
          }
          nextQuestionId={nextQuestionId(course.id, chapter.id)}
        />
      </div>
    )
  }

  // ---- Single course: chapter cards ----
  if (view.kind === 'course') {
    const course = viewCourse
    if (!course) {
      return <NotFound message="Course not found." onBack={() => navigate({ kind: 'list' })} />
    }
    const questionCount = courseQuestionCount(course)
    return (
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: 'Courses Library', onClick: () => navigate({ kind: 'list' }) },
            { label: course.name },
          ]}
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                <IconFolder size={18} />
              </span>
              <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
                {course.name}
              </h1>
            </div>
            {course.description && (
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                {course.description}
              </p>
            )}
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {plural(course.chapters.length, 'Chapter')} · {plural(questionCount, 'Question')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setNewChapterTitle('')
                setNewChapterDesc('')
                setAddingChapterTo(course.id)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <IconPlus size={16} />
              Add Chapter
            </button>
            <button
              type="button"
              onClick={() => navigate({ kind: 'quiz-config', courseId: course.id })}
              disabled={questionCount === 0}
              title={
                questionCount === 0
                  ? 'Add questions to chapters before starting a quiz'
                  : 'Start a quiz from this course'
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconPlay size={16} />
              Start Quiz
            </button>
            {(() => {
              const scopeId = `course:${course.id}`
              const enabled = isMasteryEnabled?.(scopeId) ?? false
              const menuItems: CardMenuItem[] = []
              if (onViewCourseResults) {
                menuItems.push({ label: 'View results', icon: <IconChart size={14} />, onClick: () => onViewCourseResults(scopeId) })
              }
              if (onToggleMastery) {
                menuItems.push({ label: enabled ? 'Disable mastery mode' : 'Enable mastery mode', icon: <IconGraduationCap size={14} />, onClick: () => onToggleMastery(scopeId, !enabled) })
              }
              menuItems.push({ label: 'Edit course', icon: <IconEdit size={14} />, onClick: () => setEditingCourse(course) })
              menuItems.push({ label: 'Delete course', icon: <IconTrash size={14} />, danger: true, onClick: () => setConfirmDelete({ type: 'course', course }) })
              return <CardMenu label={`Actions for ${course.name}`} items={menuItems} />
            })()}
          </div>
        </div>

        {addingChapterTo === course.id && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleCreateChapter(course.id)
            }}
            className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="new-chapter-title">
                  Chapter title
                </label>
                <input
                  id="new-chapter-title"
                  value={newChapterTitle}
                  onChange={(event) => setNewChapterTitle(event.target.value)}
                  placeholder="e.g. Numerical Integration"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="new-chapter-desc">
                  Description (optional)
                </label>
                <input
                  id="new-chapter-desc"
                  value={newChapterDesc}
                  onChange={(event) => setNewChapterDesc(event.target.value)}
                  placeholder="Short description"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={!newChapterTitle.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Add chapter
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingChapterTo(null)
                  setNewChapterTitle('')
                  setNewChapterDesc('')
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Chapters</h2>
          </div>

          {course.chapters.length > 0 && (
            <LibraryToolbar
              search={chapterSearch}
              onSearchChange={setChapterSearch}
              searchPlaceholder="Search chapters…"
              searchLabel="Search chapters"
              sort={chapterSort}
              onSortChange={(value) => setChapterSort(value as ChapterSort)}
              sortLabel="Sort chapters"
              sortOptions={CHAPTER_SORT_OPTIONS}
            />
          )}

          {course.chapters.length === 0 ? (
            <EmptyState
              icon={<IconFolderOpen size={32} />}
              title="No chapters yet"
              message="Add a chapter to start organising questions for this course."
            />
          ) : sortedChapters.length === 0 ? (
            <EmptyState
              icon={<IconSearch size={32} />}
              title="No chapters found"
              message={`No chapters match “${chapterSearch.trim()}”.`}
              action={
                <button
                  type="button"
                  onClick={() => setChapterSearch('')}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  Clear search
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {sortedChapters.map((chapter) => {
                const active = activeSessions.find(
                  (session) =>
                    session.courseId === course.id &&
                    session.chapterIds?.length === 1 &&
                    session.chapterIds[0] === chapter.id,
                )
                const progress = active
                  ? (() => {
                      const total = active.session.questions.length
                      const answered = Object.keys(active.session.answers).length
                      return {
                        answered,
                        total,
                        percent: total === 0 ? 0 : Math.round((answered / total) * 100),
                      }
                    })()
                  : null
                const menuItems: CardMenuItem[] = []
                if (active && onResumeSession) {
                  menuItems.push({
                    label: 'Continue quiz',
                    icon: <IconPlay size={14} />,
                    onClick: () => onResumeSession(active),
                  })
                } else if (chapter.questions.length > 0) {
                  menuItems.push({
                    label: 'Take quiz',
                    icon: <IconPlay size={14} />,
                    onClick: () =>
                      navigate({
                        kind: 'quiz-config',
                        courseId: course.id,
                        initialChapterIds: [chapter.id],
                      }),
                  })
                }
                menuItems.push({
                  label: 'Edit chapter',
                  icon: <IconEdit size={14} />,
                  onClick: () => setEditingChapter({ courseId: course.id, chapter }),
                })
                menuItems.push({
                  label: 'Import questions',
                  icon: <IconPlus size={14} />,
                  onClick: () => onImportToChapter(course.id, chapter.id),
                })
                if (active && onDiscardSession) {
                  menuItems.push({
                    label: 'Discard in-progress quiz',
                    icon: <IconX size={14} />,
                    onClick: () => onDiscardSession(active.id),
                  })
                }
                menuItems.push({
                  label: 'Delete chapter',
                  icon: <IconTrash size={14} />,
                  danger: true,
                  onClick: () =>
                    setConfirmDelete({ type: 'chapter', courseId: course.id, chapter }),
                })

                return (
                  <article
                    key={chapter.id}
                    className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
                  >
                    <button
                      type="button"
                      onClick={() => navigate({ kind: 'chapter', courseId: course.id, chapterId: chapter.id })}
                      aria-label={`Open chapter ${chapter.title}`}
                      className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <IconFolderOpen size={18} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="break-words font-semibold leading-snug text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                            {chapter.title}
                          </h3>
                          {chapter.description && (
                            <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                              {chapter.description}
                            </p>
                          )}
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <IconFileQuestion size={14} />
                              {plural(chapter.questions.length, 'question')}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditingChapter({ courseId: course.id, chapter })}
                          aria-label={`Edit chapter ${chapter.title}`}
                          title="Edit chapter"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <IconEdit size={15} />
                        </button>
                        <CardMenu label={`Actions for ${chapter.title}`} items={menuItems} />
                      </div>
                    </div>

                    {active && progress && (
                      <>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-400">
                            In progress
                          </span>
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            {progress.percent}% · {progress.answered}/{progress.total} answered
                          </span>
                        </div>
                        <div className="mt-3">
                          <div
                            role="progressbar"
                            aria-valuenow={progress.percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${chapter.title} progress`}
                            className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                          >
                            <div
                              className="h-full rounded-full bg-amber-500"
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="relative z-10 mt-auto pt-4">
                      {active ? (
                        <button
                          type="button"
                          onClick={() => onResumeSession?.(active)}
                          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                        >
                          <IconPlay size={15} />
                          Continue quiz
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            navigate({ kind: 'quiz-config', courseId: course.id, initialChapterIds: [chapter.id] })
                          }
                          disabled={chapter.questions.length === 0}
                          title={
                            chapter.questions.length === 0
                              ? 'Add questions before taking a quiz'
                              : `Take a quiz from ${chapter.title}`
                          }
                          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                        >
                          <IconPlay size={15} />
                          Take quiz
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {editingChapter && (
          <EditDialog
            title="Edit chapter"
            name={editingChapter.chapter.title}
            description={editingChapter.chapter.description ?? ''}
            onSave={(name, description) => {
              onRenameChapter(editingChapter.courseId, editingChapter.chapter.id, name, description)
              setEditingChapter(null)
            }}
            onCancel={() => setEditingChapter(null)}
          />
        )}

        {confirmDelete && (
          <DeleteDialog
            target={confirmDelete}
            onConfirm={() => {
              if (confirmDelete.type === 'course') onRemoveCourse(confirmDelete.course.id)
              else onRemoveChapter(confirmDelete.courseId, confirmDelete.chapter.id)
              setConfirmDelete(null)
            }}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </div>
    )
  }

  // ---- Main library: course cards ----
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Courses Library
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {courses.length === 0
              ? 'Organise your questions into courses and chapters.'
              : `${plural(courses.length, 'course')} · ${plural(totalQuestions, 'question')}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreatingCourse(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          <IconPlus size={16} />
          Create Course
        </button>
      </div>

      {creatingCourse && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleCreateCourse()
          }}
          className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="new-course-name">
                Course name
              </label>
              <input
                id="new-course-name"
                value={newCourseName}
                onChange={(event) => setNewCourseName(event.target.value)}
                placeholder="e.g. Computational Methods"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="new-course-desc">
                Description (optional)
              </label>
              <input
                id="new-course-desc"
                value={newCourseDesc}
                onChange={(event) => setNewCourseDesc(event.target.value)}
                placeholder="Short description"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={!newCourseName.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingCourse(false)
                setNewCourseName('')
                setNewCourseDesc('')
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {courses.length > 0 && (
        <LibraryToolbar
          search={courseSearch}
          onSearchChange={setCourseSearch}
          searchPlaceholder="Search courses…"
          searchLabel="Search courses"
          sort={courseSort}
          onSortChange={(value) => setCourseSort(value as CourseSort)}
          sortLabel="Sort courses"
          sortOptions={COURSE_SORT_OPTIONS}
        />
      )}

      {courses.length === 0 ? (
        <EmptyState
          icon={<IconLayers size={32} />}
          title="No courses yet"
          message="Create a course to organise questions by subject and chapter."
        />
      ) : sortedCourses.length === 0 ? (
        <EmptyState
          icon={<IconSearch size={32} />}
          title="No courses found"
          message={`No courses match “${courseSearch.trim()}”.`}
          action={
            <button
              type="button"
              onClick={() => setCourseSearch('')}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              Clear search
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sortedCourses.map((course) => {
            const questionCount = courseQuestionCount(course)
            const active = activeSessions.find((session) => session.courseId === course.id)
            const progress = active
              ? (() => {
                  const total = active.session.questions.length
                  const answered = Object.keys(active.session.answers).length
                  return {
                    answered,
                    total,
                    percent: total === 0 ? 0 : Math.round((answered / total) * 100),
                  }
                })()
              : null
            const stats = statsForCourse?.(course.id)
            const status = active
              ? 'in-progress'
              : stats && (stats.attempts > 0 || stats.latest !== null)
                ? 'completed'
                : 'not-started'
            const menuItems: CardMenuItem[] = []
            if (active && onResumeSession) {
              menuItems.push({
                label: 'Continue quiz',
                icon: <IconPlay size={14} />,
                onClick: () => onResumeSession(active),
              })
            } else if (questionCount > 0) {
              menuItems.push({
                label: 'Study course',
                icon: <IconPlay size={14} />,
                onClick: () => navigate({ kind: 'quiz-config', courseId: course.id }),
              })
            }
            menuItems.push({
              label: 'Add chapter',
              icon: <IconPlus size={14} />,
              onClick: () => {
                setNewChapterTitle('')
                setNewChapterDesc('')
                setAddingChapterTo(course.id)
                navigate({ kind: 'course', courseId: course.id })
              },
            })
            if (onViewCourseResults) {
              menuItems.push({
                label: 'View results',
                icon: <IconChart size={14} />,
                onClick: () => onViewCourseResults(`course:${course.id}`),
              })
            }
            menuItems.push({
              label: 'Edit course',
              icon: <IconEdit size={14} />,
              onClick: () => setEditingCourse(course),
            })
            if (onToggleMastery) {
              const scopeId = `course:${course.id}`
              const enabled = isMasteryEnabled?.(scopeId) ?? false
              menuItems.push({
                label: enabled ? 'Disable mastery mode' : 'Enable mastery mode',
                icon: <IconGraduationCap size={14} />,
                onClick: () => onToggleMastery(scopeId, !enabled),
              })
            }
            if (active && onDiscardSession) {
              menuItems.push({
                label: 'Discard in-progress quiz',
                icon: <IconX size={14} />,
                onClick: () => onDiscardSession(active.id),
              })
            }
            menuItems.push({
              label: 'Delete course',
              icon: <IconTrash size={14} />,
              danger: true,
              onClick: () => setConfirmDelete({ type: 'course', course }),
            })

            return (
              <article
                key={course.id}
                className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                <button
                  type="button"
                  onClick={() => openCourse(course.id)}
                  aria-label={`Open course ${course.name}`}
                  className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                      <IconFolder size={20} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="break-words font-semibold leading-snug text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                        {course.name}
                      </h2>
                      {course.description && (
                        <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                          {course.description}
                        </p>
                      )}
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <IconLayers size={14} />
                          {plural(course.chapters.length, 'chapter')}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <IconFileQuestion size={14} />
                          {plural(questionCount, 'question')}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="relative z-10 flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setEditingCourse(course)}
                      aria-label={`Edit course ${course.name}`}
                      title="Edit course"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <IconEdit size={15} />
                    </button>
                    <CardMenu label={`Actions for ${course.name}`} items={menuItems} />
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>
                    {STATUS_LABEL[status]}
                  </span>
                  {isMasteryEnabled?.(`course:${course.id}`) && (
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      Mastery
                    </span>
                  )}
                  {active && progress && (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      {progress.percent}% · {progress.answered}/{progress.total} answered
                    </span>
                  )}
                </div>

                {active && progress && (
                  <div className="mt-3">
                    <div
                      role="progressbar"
                      aria-valuenow={progress.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${course.name} progress`}
                      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                    >
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {stats && stats.attempts > 0 && (
                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    {stats.latest !== null && (
                      <div className="flex gap-1.5">
                        <dt className="text-slate-500 dark:text-slate-400">Last score</dt>
                        <dd className="font-semibold text-indigo-600 dark:text-indigo-400">
                          {stats.latest}%
                        </dd>
                      </div>
                    )}
                    {stats.best !== null && (
                      <div className="flex gap-1.5">
                        <dt className="text-slate-500 dark:text-slate-400">Best</dt>
                        <dd className="font-semibold">{stats.best}%</dd>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <dt className="text-slate-500 dark:text-slate-400">Attempts</dt>
                      <dd className="font-semibold">{stats.attempts}</dd>
                    </div>
                  </dl>
                )}

                <div className="relative z-10 mt-auto pt-4">
                  {active ? (
                    <button
                      type="button"
                      onClick={() => onResumeSession?.(active)}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                    >
                      <IconPlay size={15} />
                      Continue quiz
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate({ kind: 'quiz-config', courseId: course.id })}
                      disabled={questionCount === 0}
                      title={
                        questionCount === 0
                          ? 'Add questions to chapters before studying'
                          : `Study ${course.name}`
                      }
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                    >
                      <IconPlay size={15} />
                      Study course
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editingCourse && (
        <EditDialog
          title="Edit course"
          name={editingCourse.name}
          description={editingCourse.description ?? ''}
          onSave={(name, description) => {
            onRenameCourse(editingCourse.id, name, description)
            setEditingCourse(null)
          }}
          onCancel={() => setEditingCourse(null)}
        />
      )}

      {editingChapter && (
        <EditDialog
          title="Edit chapter"
          name={editingChapter.chapter.title}
          description={editingChapter.chapter.description ?? ''}
          onSave={(name, description) => {
            onRenameChapter(editingChapter.courseId, editingChapter.chapter.id, name, description)
            setEditingChapter(null)
          }}
          onCancel={() => setEditingChapter(null)}
        />
      )}

      {confirmDelete && (
        <DeleteDialog
          target={confirmDelete}
          onConfirm={() => {
            if (confirmDelete.type === 'course') onRemoveCourse(confirmDelete.course.id)
            else onRemoveChapter(confirmDelete.courseId, confirmDelete.chapter.id)
            setConfirmDelete(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {standaloneSlot}
    </div>
  )
}

function Breadcrumbs({
  items,
}: {
  items: { label: string; onClick?: () => void }[]
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && (
                <IconChevronRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600" />
              )}
              {isLast || !item.onClick ? (
                <span
                  className="font-medium text-slate-700 dark:text-slate-200"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="rounded text-slate-500 underline-offset-2 hover:text-indigo-600 hover:underline dark:text-slate-400 dark:hover:text-indigo-400"
                >
                  {item.label}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function LibraryToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  sort,
  onSortChange,
  sortLabel,
  sortOptions,
}: {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  searchLabel: string
  sort: string
  onSortChange: (value: string) => void
  sortLabel: string
  sortOptions: { value: string; label: string }[]
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <IconSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>
      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value)}
        aria-label={sortLabel}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function CardMenu({ label, items }: { label: string; items: CardMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const naturalHeightRef = useRef(0)

  const close = useCallback((refocus = false) => {
    setOpen(false)
    setPlacement(null)
    naturalHeightRef.current = 0
    if (refocus) triggerRef.current?.focus()
  }, [])

  const reposition = useCallback(() => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    const anchor = trigger.getBoundingClientRect()
    const rect = menu.getBoundingClientRect()
    if (naturalHeightRef.current === 0) naturalHeightRef.current = rect.height
    const height = naturalHeightRef.current
    const width = rect.width
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth
    const GAP = 4
    const EDGE = 8
    const spaceBelow = viewportH - anchor.bottom - GAP - EDGE
    const spaceAbove = anchor.top - GAP - EDGE
    const openUp = height > spaceBelow && spaceAbove > spaceBelow
    const maxHeight = Math.max(96, openUp ? spaceAbove : spaceBelow)
    const shownHeight = Math.min(height, maxHeight)
    const top = openUp ? Math.max(EDGE, anchor.top - GAP - shownHeight) : anchor.bottom + GAP
    const left = Math.min(
      Math.max(EDGE, anchor.right - width),
      Math.max(EDGE, viewportW - width - EDGE),
    )
    setPlacement((prev) =>
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight },
    )
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close(true)
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      close()
    }
    const onReflow = () => reposition()
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [open, close, reposition])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          if (open) close()
          else setOpen(true)
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title="More actions"
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <IconMoreVertical size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={
              placement === null
                ? { top: 0, left: 0, visibility: 'hidden' }
                : { top: placement.top, left: placement.left, maxHeight: placement.maxHeight }
            }
            className="fixed z-[100] w-52 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  close()
                  item.onClick()
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  item.danger
                    ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode
  title: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
      <div className="mx-auto mb-3 flex justify-center text-slate-400">{icon}</div>
      <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

function NotFound({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="py-8 text-center text-sm text-slate-500">
      {message}{' '}
      <button type="button" className="text-indigo-600 dark:text-indigo-400" onClick={onBack}>
        Back to library
      </button>
    </div>
  )
}

function DeleteDialog({
  target,
  onConfirm,
  onCancel,
}: {
  target:
    | { type: 'course'; course: Course }
    | { type: 'chapter'; courseId: string; chapter: Chapter }
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      title={
        target.type === 'course'
          ? `Delete course “${target.course.name}”?`
          : `Delete chapter “${target.chapter.title}”?`
      }
      message={
        target.type === 'course'
          ? `This will permanently delete the course and all ${plural(
              target.course.chapters.length,
              'chapter',
            )} and their questions. Standalone quizzes are not affected.`
          : `This will permanently delete the chapter and its ${plural(
              target.chapter.questions.length,
              'question',
            )}.`
      }
      confirmLabel="Delete"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

function EditDialog({
  title,
  name: initialName,
  description: initialDesc,
  onSave,
  onCancel,
}: {
  title: string
  name: string
  description: string
  onSave: (name: string, description: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [desc, setDesc] = useState(initialDesc)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        <label className="mb-1 block text-sm font-medium">Name</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          autoFocus
        />
        <label className="mb-1 block text-sm font-medium">Description</label>
        <input
          value={desc}
          onChange={(event) => setDesc(event.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(name.trim(), desc.trim())}
            disabled={!name.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
