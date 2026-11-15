/**
 * SQLite persistence for Hugo.
 * Database file: <project>/data/drillmcq.sqlite
 *
 * Schema mirrors the in-app model:
 *   Course → Chapter → Question
 * plus attempts and mastery.
 */

import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../data')
const DB_PATH = path.join(DATA_DIR, 'drillmcq.sqlite')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id          TEXT PRIMARY KEY,
    course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS questions (
    id               INTEGER NOT NULL,
    chapter_id       TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    question         TEXT NOT NULL,
    options_json     TEXT NOT NULL,
    correct_json     TEXT NOT NULL,
    explanation      TEXT,
    category         TEXT,
    difficulty       TEXT,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (chapter_id, id)
  );

  CREATE TABLE IF NOT EXISTS attempts (
    id              TEXT PRIMARY KEY,
    quiz_id         TEXT,
    quiz_name       TEXT NOT NULL,
    started_at      INTEGER NOT NULL,
    completed_at    INTEGER NOT NULL,
    time_taken_sec  INTEGER NOT NULL,
    correct         INTEGER NOT NULL,
    incorrect       INTEGER NOT NULL,
    unanswered      INTEGER NOT NULL,
    total           INTEGER NOT NULL,
    percentage      REAL NOT NULL,
    settings_json   TEXT NOT NULL,
    questions_json  TEXT NOT NULL,
    answers_json    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mastery (
    scope_key        TEXT PRIMARY KEY,
    question_id      INTEGER NOT NULL,
    correct_count    INTEGER NOT NULL DEFAULT 0,
    incorrect_count  INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at INTEGER,
    interval_days    REAL NOT NULL DEFAULT 1,
    ease_factor      REAL NOT NULL DEFAULT 2.5
  );

  CREATE TABLE IF NOT EXISTS active_sessions (
    id               TEXT PRIMARY KEY,
    course_id        TEXT,
    chapter_ids_json TEXT,
    quiz_name        TEXT,
    session_json     TEXT NOT NULL,
    updated_at       INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chapters_course ON chapters(course_id);
  CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter_id);
`)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function rowToQuestion(row) {
  return {
    id: row.id,
    question: row.question,
    options: parseJson(row.options_json, []),
    correctAnswers: parseJson(row.correct_json, []),
    explanation: row.explanation || undefined,
    category: row.category || undefined,
    difficulty: row.difficulty || undefined,
  }
}

function loadChapters(courseId) {
  const chapters = db
    .prepare(
      `SELECT id, title, description, sort_order AS "order"
       FROM chapters WHERE course_id = ? ORDER BY sort_order ASC`,
    )
    .all(courseId)

  const qStmt = db.prepare(
    `SELECT id, question, options_json, correct_json, explanation, category, difficulty
     FROM questions WHERE chapter_id = ? ORDER BY sort_order ASC, id ASC`,
  )

  return chapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    description: ch.description || undefined,
    order: ch.order,
    questions: qStmt.all(ch.id).map(rowToQuestion),
  }))
}

export function getDbPath() {
  return DB_PATH
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export function listCourses() {
  const courses = db
    .prepare(
      `SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt
       FROM courses ORDER BY name COLLATE NOCASE ASC`,
    )
    .all()

  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description || undefined,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    chapters: loadChapters(c.id),
  }))
}

export function getCourse(id) {
  const c = db
    .prepare(
      `SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt
       FROM courses WHERE id = ?`,
    )
    .get(id)
  if (!c) return null
  return {
    id: c.id,
    name: c.name,
    description: c.description || undefined,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    chapters: loadChapters(c.id),
  }
}

export function upsertCourse(course) {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO courses (id, name, description, created_at, updated_at)
       VALUES (@id, @name, @description, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         updated_at = excluded.updated_at`,
    ).run({
      id: course.id,
      name: course.name,
      description: course.description ?? null,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    })

    // Replace chapters + questions for this course (full document write)
    const existingChapterIds = db
      .prepare(`SELECT id FROM chapters WHERE course_id = ?`)
      .all(course.id)
      .map((r) => r.id)

    const keep = new Set((course.chapters || []).map((ch) => ch.id))
    for (const cid of existingChapterIds) {
      if (!keep.has(cid)) {
        db.prepare(`DELETE FROM chapters WHERE id = ?`).run(cid)
      }
    }

    const upsertChapter = db.prepare(
      `INSERT INTO chapters (id, course_id, title, description, sort_order)
       VALUES (@id, @courseId, @title, @description, @order)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         sort_order = excluded.sort_order,
         course_id = excluded.course_id`,
    )

    const deleteQuestions = db.prepare(`DELETE FROM questions WHERE chapter_id = ?`)
    const insertQuestion = db.prepare(
      `INSERT INTO questions
         (id, chapter_id, question, options_json, correct_json, explanation, category, difficulty, sort_order)
       VALUES
         (@id, @chapterId, @question, @optionsJson, @correctJson, @explanation, @category, @difficulty, @sortOrder)`,
    )

    for (const ch of course.chapters || []) {
      upsertChapter.run({
        id: ch.id,
        courseId: course.id,
        title: ch.title,
        description: ch.description ?? null,
        order: ch.order ?? 0,
      })
      deleteQuestions.run(ch.id)
      ;(ch.questions || []).forEach((q, i) => {
        insertQuestion.run({
          id: q.id,
          chapterId: ch.id,
          question: q.question,
          optionsJson: JSON.stringify(q.options ?? []),
          correctJson: JSON.stringify(q.correctAnswers ?? []),
          explanation: q.explanation ?? null,
          category: q.category ?? null,
          difficulty: q.difficulty ?? null,
          sortOrder: i,
        })
      })
    }
  })

  tx()
  return getCourse(course.id)
}

export function deleteCourse(id) {
  db.prepare(`DELETE FROM courses WHERE id = ?`).run(id)
  return listCourses()
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export function listAttempts() {
  const rows = db
    .prepare(`SELECT * FROM attempts ORDER BY completed_at DESC`)
    .all()
  return rows.map((r) => ({
    id: r.id,
    quizId: r.quiz_id || undefined,
    quizName: r.quiz_name,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    timeTakenSeconds: r.time_taken_sec,
    correct: r.correct,
    incorrect: r.incorrect,
    unanswered: r.unanswered,
    total: r.total,
    percentage: r.percentage,
    settings: parseJson(r.settings_json, {}),
    questions: parseJson(r.questions_json, []),
    answers: parseJson(r.answers_json, {}),
  }))
}

export function appendAttempt(attempt) {
  db.prepare(
    `INSERT OR REPLACE INTO attempts (
       id, quiz_id, quiz_name, started_at, completed_at, time_taken_sec,
       correct, incorrect, unanswered, total, percentage,
       settings_json, questions_json, answers_json
     ) VALUES (
       @id, @quizId, @quizName, @startedAt, @completedAt, @timeTaken,
       @correct, @incorrect, @unanswered, @total, @percentage,
       @settingsJson, @questionsJson, @answersJson
     )`,
  ).run({
    id: attempt.id,
    quizId: attempt.quizId ?? null,
    quizName: attempt.quizName,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    timeTaken: attempt.timeTakenSeconds,
    correct: attempt.correct,
    incorrect: attempt.incorrect,
    unanswered: attempt.unanswered,
    total: attempt.total,
    percentage: attempt.percentage,
    settingsJson: JSON.stringify(attempt.settings ?? {}),
    questionsJson: JSON.stringify(attempt.questions ?? []),
    answersJson: JSON.stringify(attempt.answers ?? {}),
  })
  return listAttempts()
}

export function deleteAttempt(id) {
  db.prepare(`DELETE FROM attempts WHERE id = ?`).run(id)
  return listAttempts()
}

// ---------------------------------------------------------------------------
// Mastery
// ---------------------------------------------------------------------------

export function loadMastery() {
  const rows = db.prepare(`SELECT * FROM mastery`).all()
  const map = {}
  for (const r of rows) {
    map[r.scope_key] = {
      questionId: r.question_id,
      correctCount: r.correct_count,
      incorrectCount: r.incorrect_count,
      lastReviewedAt: r.last_reviewed_at || undefined,
      intervalDays: r.interval_days,
      easeFactor: r.ease_factor,
    }
  }
  return map
}

export function saveMasteryMap(map) {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM mastery`).run()
    const ins = db.prepare(
      `INSERT INTO mastery
         (scope_key, question_id, correct_count, incorrect_count, last_reviewed_at, interval_days, ease_factor)
       VALUES
         (@scopeKey, @questionId, @correctCount, @incorrectCount, @lastReviewedAt, @intervalDays, @easeFactor)`,
    )
    for (const [scopeKey, m] of Object.entries(map || {})) {
      ins.run({
        scopeKey,
        questionId: m.questionId,
        correctCount: m.correctCount ?? 0,
        incorrectCount: m.incorrectCount ?? 0,
        lastReviewedAt: m.lastReviewedAt ?? null,
        intervalDays: m.intervalDays ?? 1,
        easeFactor: m.easeFactor ?? 2.5,
      })
    }
  })
  tx()
  return loadMastery()
}

export function recordMasteryOutcome(scopeKey, questionId, correct) {
  const prev = db.prepare(`SELECT * FROM mastery WHERE scope_key = ?`).get(scopeKey)
  let correctCount = prev?.correct_count ?? 0
  let incorrectCount = prev?.incorrect_count ?? 0
  let intervalDays = prev?.interval_days ?? 1
  let easeFactor = prev?.ease_factor ?? 2.5

  if (correct) {
    correctCount += 1
    easeFactor = Math.max(1.3, easeFactor + 0.1)
    intervalDays = Math.max(1, Math.round(intervalDays * easeFactor))
  } else {
    incorrectCount += 1
    easeFactor = Math.max(1.3, easeFactor - 0.2)
    intervalDays = 1
  }

  const next = {
    questionId,
    correctCount,
    incorrectCount,
    lastReviewedAt: Date.now(),
    intervalDays,
    easeFactor,
  }

  db.prepare(
    `INSERT INTO mastery
       (scope_key, question_id, correct_count, incorrect_count, last_reviewed_at, interval_days, ease_factor)
     VALUES
       (@scopeKey, @questionId, @correctCount, @incorrectCount, @lastReviewedAt, @intervalDays, @easeFactor)
     ON CONFLICT(scope_key) DO UPDATE SET
       question_id = excluded.question_id,
       correct_count = excluded.correct_count,
       incorrect_count = excluded.incorrect_count,
       last_reviewed_at = excluded.last_reviewed_at,
       interval_days = excluded.interval_days,
       ease_factor = excluded.ease_factor`,
  ).run({
    scopeKey,
    questionId: next.questionId,
    correctCount: next.correctCount,
    incorrectCount: next.incorrectCount,
    lastReviewedAt: next.lastReviewedAt,
    intervalDays: next.intervalDays,
    easeFactor: next.easeFactor,
  })

  return next
}


// ---------------------------------------------------------------------------
// Active / in-progress quiz sessions (resume support)
// ---------------------------------------------------------------------------

export function listActiveSessions() {
  const rows = db
    .prepare(`SELECT id, course_id, chapter_ids_json, quiz_name, session_json, updated_at FROM active_sessions ORDER BY updated_at DESC`)
    .all()
  return rows.map((r) => ({
    id: r.id,
    courseId: r.course_id || undefined,
    chapterIds: parseJson(r.chapter_ids_json, []),
    quizName: r.quiz_name || undefined,
    session: parseJson(r.session_json, null),
    updatedAt: r.updated_at,
  })).filter((s) => s.session && s.session.status === 'active')
}

export function getActiveSession(id) {
  const r = db.prepare(`SELECT * FROM active_sessions WHERE id = ?`).get(id)
  if (!r) return null
  const session = parseJson(r.session_json, null)
  if (!session) return null
  return {
    id: r.id,
    courseId: r.course_id || undefined,
    chapterIds: parseJson(r.chapter_ids_json, []),
    quizName: r.quiz_name || undefined,
    session,
    updatedAt: r.updated_at,
  }
}

export function upsertActiveSession(payload) {
  const { id, courseId, chapterIds, quizName, session } = payload
  if (!id || !session) throw new Error('id and session required')
  db.prepare(
    `INSERT INTO active_sessions (id, course_id, chapter_ids_json, quiz_name, session_json, updated_at)
     VALUES (@id, @courseId, @chapterIdsJson, @quizName, @sessionJson, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       course_id = excluded.course_id,
       chapter_ids_json = excluded.chapter_ids_json,
       quiz_name = excluded.quiz_name,
       session_json = excluded.session_json,
       updated_at = excluded.updated_at`,
  ).run({
    id,
    courseId: courseId ?? null,
    chapterIdsJson: JSON.stringify(chapterIds ?? []),
    quizName: quizName ?? null,
    sessionJson: JSON.stringify(session),
    updatedAt: Date.now(),
  })
  return getActiveSession(id)
}

export function deleteActiveSession(id) {
  db.prepare(`DELETE FROM active_sessions WHERE id = ?`).run(id)
  return listActiveSessions()
}

export default db
