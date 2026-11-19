import type { AIConfig, AIProviderId } from '../types/ai'
import type { AppearancePrefs, BackgroundChoice, FontChoice } from '../types/appearance'
import type {
  Chapter,
  Course,
  QuestionMastery,
  QuizAttempt,
  QuizQuestion,
  QuizSession,
  QuizSettings,
  SavedQuiz,
  SavedQuizProgress,
} from '../types/quiz'
import type { SoundPrefs } from '../types/sound'
import { clampFontScale } from '../utils/appearance'
import { normalizePassPercentage, normalizeQuestion } from '../utils/quiz'
import { defaultSoundPrefs } from '../utils/sound'
import {
  apiDeleteState,
  apiGetState,
  apiSetState,
} from './api'

/**
 * DB-backed persistence and pure helpers (SQLite via local API).
 * No browser storage is used.
 */

export const STATE_KEYS = {
  theme: 'ui.theme',
  appearance: 'ui.appearance',
  sound: 'ui.sound',
  aiPrefs: 'ai.prefs',
  aiKey: 'ai.key',
  activeSession: 'quiz.active_session',
} as const

export type Theme = 'light' | 'dark'

// ---------------------------------------------------------------------------
// Helpers / normalization
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isQuestion(value: unknown): boolean {
  if (!isRecord(value)) return false
  const hasAnswer =
    typeof value.correctAnswer === 'string' ||
    (Array.isArray(value.correctAnswers) &&
      value.correctAnswers.length > 0 &&
      value.correctAnswers.every((a) => typeof a === 'string'))
  return (
    typeof value.id === 'number' &&
    typeof value.question === 'string' &&
    Array.isArray(value.options) &&
    value.options.every((o) => typeof o === 'string') &&
    hasAnswer
  )
}

function isQuestionList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isQuestion)
}

export function normalizeQuestionList(value: unknown): QuizQuestion[] {
  return (value as QuizQuestion[]).map(normalizeQuestion)
}

function normalizeAnswerMap(value: unknown): Record<number, string[]> {
  if (!isRecord(value)) return {}
  const out: Record<number, string[]> = {}
  for (const [key, raw] of Object.entries(value)) {
    const id = Number(key)
    if (!Number.isFinite(id)) continue
    if (typeof raw === 'string') out[id] = [raw]
    else if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) out[id] = raw
  }
  return out
}

function normalizeIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item) && !out.includes(item)) out.push(item)
  }
  return out
}

export function normalizeSettings(value: unknown): QuizSettings {
  const raw = isRecord(value) ? value : {}
  const questionCount =
    typeof raw.questionCount === 'number' && Number.isFinite(raw.questionCount) && raw.questionCount > 0
      ? Math.round(raw.questionCount)
      : undefined
  return {
    shuffleQuestions: raw.shuffleQuestions === true,
    shuffleOptions: raw.shuffleOptions === true,
    timerMinutes: typeof raw.timerMinutes === 'number' && raw.timerMinutes > 0 ? raw.timerMinutes : 0,
    categories:
      Array.isArray(raw.categories) && raw.categories.every((c) => typeof c === 'string')
        ? (raw.categories as string[])
        : [],
    passPercentage: normalizePassPercentage(raw.passPercentage),
    questionCount,
  }
}

export function normalizeSession(value: unknown): QuizSession | null {
  if (!isRecord(value)) return null
  if (!isQuestionList(value.questions)) return null

  const questions = normalizeQuestionList(value.questions)
  const answers = normalizeAnswerMap(value.answers)
  const timerMinutes =
    typeof value.timerMinutes === 'number' && value.timerMinutes > 0 ? value.timerMinutes : 0
  const settings = normalizeSettings(value.settings)

  return {
    questions,
    answers,
    drafts: normalizeAnswerMap(value.drafts),
    revealed: normalizeIdList(value.revealed),
    currentIndex:
      typeof value.currentIndex === 'number' && value.currentIndex >= 0
        ? Math.min(value.currentIndex, questions.length - 1)
        : 0,
    status: value.status === 'finished' ? 'finished' : 'active',
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : Date.now(),
    timerMinutes,
    attemptId: typeof value.attemptId === 'string' ? value.attemptId : createId('attempt'),
    settings: { ...settings, timerMinutes: settings.timerMinutes || timerMinutes },
    quizId: typeof value.quizId === 'string' ? value.quizId : undefined,
    quizName: typeof value.quizName === 'string' ? value.quizName : undefined,
    incorrectOnly: value.incorrectOnly === true || undefined,
    finishedAt: typeof value.finishedAt === 'number' ? value.finishedAt : undefined,
  }
}

function normalizeProgress(value: unknown): SavedQuizProgress | null {
  if (!isRecord(value)) return null
  if (!isQuestionList(value.questions)) return null
  const questions = normalizeQuestionList(value.questions)
  return {
    attemptId: typeof value.attemptId === 'string' ? value.attemptId : createId('attempt'),
    questions,
    answers: normalizeAnswerMap(value.answers),
    drafts: normalizeAnswerMap(value.drafts),
    revealed: normalizeIdList(value.revealed),
    currentIndex:
      typeof value.currentIndex === 'number' && value.currentIndex >= 0
        ? Math.min(value.currentIndex, questions.length - 1)
        : 0,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : Date.now(),
    timerMinutes: typeof value.timerMinutes === 'number' && value.timerMinutes > 0 ? value.timerMinutes : 0,
    settings: normalizeSettings(value.settings),
    incorrectOnly: value.incorrectOnly === true || undefined,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
  }
}

export function normalizeSavedQuiz(value: unknown): SavedQuiz | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id === '') return null
  if (!isQuestionList(value.questions)) return null

  const createdAt = typeof value.createdAt === 'number' ? value.createdAt : Date.now()
  const questions = normalizeQuestionList(value.questions)
  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name.trim() !== '' ? value.name : 'Untitled quiz',
    questions,
    createdAt,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : createdAt,
    lastAttemptId: typeof value.lastAttemptId === 'string' ? value.lastAttemptId : undefined,
    progress: normalizeProgress(value.progress) ?? undefined,
    fingerprint:
      typeof value.fingerprint === 'string' && value.fingerprint !== ''
        ? value.fingerprint
        : fingerprintQuestions(questions),
  }
}

export function normalizeAttempt(value: unknown): QuizAttempt | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id === '') return null
  if (!isQuestionList(value.questions)) return null

  const questions = normalizeQuestionList(value.questions)
  const total = typeof value.total === 'number' ? value.total : questions.length
  const correct = typeof value.correct === 'number' ? value.correct : 0
  const completedAt = typeof value.completedAt === 'number' ? value.completedAt : Date.now()
  return {
    id: value.id,
    quizId: typeof value.quizId === 'string' ? value.quizId : undefined,
    quizName: typeof value.quizName === 'string' ? value.quizName : 'Untitled quiz',
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : completedAt,
    completedAt,
    timeTakenSeconds: typeof value.timeTakenSeconds === 'number' ? value.timeTakenSeconds : 0,
    correct,
    incorrect: typeof value.incorrect === 'number' ? value.incorrect : 0,
    unanswered: typeof value.unanswered === 'number' ? value.unanswered : 0,
    total,
    percentage:
      typeof value.percentage === 'number'
        ? value.percentage
        : total === 0
          ? 0
          : Math.round((correct / total) * 100),
    settings: normalizeSettings(value.settings),
    questions,
    answers: normalizeAnswerMap(value.answers),
    incorrectOnly: value.incorrectOnly === true || undefined,
  }
}



const AI_PROVIDER_IDS: AIProviderId[] = [
  'openai',
  'gemini',
  'anthropic',
  'deepseek',
  'mistral',
  'xai',
]

export function defaultAIConfig(): AIConfig {
  return {
    enabled: false,
    provider: 'openai',
    model: '',
    customModel: false,
    rememberKey: false,
    maxBatchQuestions: 50,
  }
}

function normalizeAIConfig(value: unknown): AIConfig {
  const raw = isRecord(value) ? value : {}
  const defaults = defaultAIConfig()
  const provider =
    typeof raw.provider === 'string' && (AI_PROVIDER_IDS as string[]).includes(raw.provider)
      ? (raw.provider as AIProviderId)
      : defaults.provider
  return {
    enabled: raw.enabled === true,
    provider,
    model: typeof raw.model === 'string' ? raw.model : defaults.model,
    customModel: raw.customModel === true,
    rememberKey: raw.rememberKey === true,
    maxBatchQuestions:
      typeof raw.maxBatchQuestions === 'number' && Number.isFinite(raw.maxBatchQuestions)
        ? Math.min(200, Math.max(1, Math.round(raw.maxBatchQuestions)))
        : defaults.maxBatchQuestions,
  }
}

const FONT_CHOICES: FontChoice[] = ['sans', 'serif', 'mono', 'readable']
const BACKGROUND_CHOICES: BackgroundChoice[] = ['default', 'warm', 'cool', 'contrast']

export function defaultAppearance(): AppearancePrefs {
  return { font: 'sans', fontScale: 1, background: 'default' }
}

function normalizeAppearance(value: unknown): AppearancePrefs {
  const raw = isRecord(value) ? value : {}
  const defaults = defaultAppearance()
  return {
    font:
      typeof raw.font === 'string' && (FONT_CHOICES as string[]).includes(raw.font)
        ? (raw.font as FontChoice)
        : defaults.font,
    background:
      typeof raw.background === 'string' && (BACKGROUND_CHOICES as string[]).includes(raw.background)
        ? (raw.background as BackgroundChoice)
        : defaults.background,
    fontScale:
      typeof raw.fontScale === 'number' && Number.isFinite(raw.fontScale)
        ? clampFontScale(raw.fontScale)
        : defaults.fontScale,
  }
}

function normalizeSoundPrefs(value: unknown): SoundPrefs {
  const raw = isRecord(value) ? value : {}
  const defaults = defaultSoundPrefs()
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled,
  }
}

function normalizeMastery(value: unknown): QuestionMastery | null {
  if (!isRecord(value)) return null
  if (typeof value.questionId !== 'number') return null
  return {
    questionId: value.questionId,
    correctCount: typeof value.correctCount === 'number' ? value.correctCount : 0,
    incorrectCount: typeof value.incorrectCount === 'number' ? value.incorrectCount : 0,
    lastReviewedAt: typeof value.lastReviewedAt === 'number' ? value.lastReviewedAt : undefined,
    intervalDays: typeof value.intervalDays === 'number' ? value.intervalDays : 1,
    easeFactor: typeof value.easeFactor === 'number' ? value.easeFactor : 2.5,
  }
}

function normalizeMasteryMap(value: unknown): Record<string, QuestionMastery> {
  if (!isRecord(value)) return {}
  const out: Record<string, QuestionMastery> = {}
  for (const [key, raw] of Object.entries(value)) {
    const m = normalizeMastery(raw)
    if (m) out[key] = m
  }
  return out
}

export function createId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`
    }
  } catch {
    // fall through
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function fingerprintQuestions(questions: QuizQuestion[]): string {
  const source = questions.map((q) => `${q.id}|${q.question}|${q.options.join('~')}`).join('\n')
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${questions.length}-${(hash >>> 0).toString(36)}`
}

export function masteryKey(scopeId: string, questionId: number): string {
  return `${scopeId}:${questionId}`
}


// ---------------------------------------------------------------------------
// App state (DB-backed)
// ---------------------------------------------------------------------------

export async function loadTheme(): Promise<Theme | null> {
  const value = await apiGetState<unknown>(STATE_KEYS.theme)
  return value === 'light' || value === 'dark' ? value : null
}

export async function saveTheme(theme: Theme): Promise<void> {
  await apiSetState(STATE_KEYS.theme, theme)
}

export async function loadAppearance(): Promise<AppearancePrefs> {
  const value = await apiGetState<unknown>(STATE_KEYS.appearance)
  return normalizeAppearance(value)
}

export async function saveAppearance(prefs: AppearancePrefs): Promise<void> {
  await apiSetState(STATE_KEYS.appearance, prefs)
}

export async function loadSoundPrefs(): Promise<SoundPrefs> {
  const value = await apiGetState<unknown>(STATE_KEYS.sound)
  return normalizeSoundPrefs(value)
}

export async function saveSoundPrefs(prefs: SoundPrefs): Promise<void> {
  await apiSetState(STATE_KEYS.sound, prefs)
}

export async function loadAIConfig(): Promise<AIConfig> {
  const value = await apiGetState<unknown>(STATE_KEYS.aiPrefs)
  return normalizeAIConfig(value)
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  await apiSetState(STATE_KEYS.aiPrefs, config)
}

export async function loadAIKey(): Promise<string | null> {
  const value = await apiGetState<unknown>(STATE_KEYS.aiKey)
  return typeof value === 'string' && value !== '' ? value : null
}

export async function saveAIKey(key: string): Promise<void> {
  await apiSetState(STATE_KEYS.aiKey, key)
}

export async function clearAIKey(): Promise<void> {
  await apiDeleteState(STATE_KEYS.aiKey)
}

export async function loadSession(): Promise<QuizSession | null> {
  const value = await apiGetState<unknown>(STATE_KEYS.activeSession)
  return normalizeSession(value)
}

export async function saveSession(session: QuizSession): Promise<void> {
  await apiSetState(STATE_KEYS.activeSession, session)
}

export async function clearSession(): Promise<void> {
  await apiDeleteState(STATE_KEYS.activeSession)
}

// ---------------------------------------------------------------------------
// Builders (pure helpers; persistence handled by API/hooks)
// ---------------------------------------------------------------------------

export function createCourse(name: string, description?: string): Course {
  return {
    id: createId('course'),
    name: name.trim() || 'Untitled course',
    description: description?.trim() || undefined,
    chapters: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function createChapter(title: string, order: number, description?: string): Chapter {
  return {
    id: createId('chapter'),
    title: title.trim() || 'Untitled chapter',
    description: description?.trim() || undefined,
    order,
    questions: [],
  }
}

export { normalizeMasteryMap }
