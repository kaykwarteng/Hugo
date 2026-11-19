/**
 * Local API server for Hugo.
 * Serves REST endpoints backed by SQLite (data/hugo.sqlite).
 *
 * Start:  npm run server
 * Dev UI proxies /api → this process (see vite.config.ts).
 */

import cors from 'cors'
import express from 'express'
import {
  appendAttempt,
  bulkUpsertSavedQuizzes,
  deleteActiveSession,
  deleteAttempt,
  deleteCourse,
  deleteSavedQuiz,
  getActiveSession,
  getAllAppState,
  getAppState,
  getCourse,
  getDbPath,
  getSavedQuiz,
  listActiveSessions,
  listAttempts,
  listCourses,
  listSavedQuizzes,
  loadMastery,
  recordMasteryOutcome,
  saveMasteryMap,
  deleteMasteryForScope,
  setAppState,
  upsertActiveSession,
  upsertCourse,
  upsertSavedQuiz,
} from './db.js'

const PORT = Number(process.env.PORT) || 8787
const app = express()

app.use(cors())
app.use(express.json({ limit: '20mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: getDbPath() })
})

// ---- Courses (nested chapters + questions) ----

app.get('/api/courses', (_req, res) => {
  res.json(listCourses())
})

app.get('/api/courses/:id', (req, res) => {
  const course = getCourse(req.params.id)
  if (!course) return res.status(404).json({ error: 'Course not found' })
  res.json(course)
})

app.put('/api/courses/:id', (req, res) => {
  const body = req.body
  if (!body || body.id !== req.params.id) {
    return res.status(400).json({ error: 'Body must include matching id' })
  }
  if (!body.name || typeof body.name !== 'string') {
    return res.status(400).json({ error: 'name is required' })
  }
  const saved = upsertCourse({
    id: body.id,
    name: body.name,
    description: body.description,
    chapters: Array.isArray(body.chapters) ? body.chapters : [],
    createdAt: body.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  })
  res.json(saved)
})

app.post('/api/courses', (req, res) => {
  const body = req.body
  if (!body?.id || !body?.name) {
    return res.status(400).json({ error: 'id and name are required' })
  }
  const saved = upsertCourse({
    id: body.id,
    name: body.name,
    description: body.description,
    chapters: Array.isArray(body.chapters) ? body.chapters : [],
    createdAt: body.createdAt ?? Date.now(),
    updatedAt: body.updatedAt ?? Date.now(),
  })
  res.status(201).json(saved)
})

app.delete('/api/courses/:id', (req, res) => {
  res.json(deleteCourse(req.params.id))
})

// ---- Standalone saved quizzes ----

app.get('/api/quizzes', (_req, res) => {
  res.json(listSavedQuizzes())
})

app.post('/api/quizzes/bulk', (req, res) => {
  const quizzes = Array.isArray(req.body) ? req.body : req.body?.quizzes
  if (!Array.isArray(quizzes)) {
    return res.status(400).json({ error: 'quizzes array required' })
  }
  res.json(bulkUpsertSavedQuizzes(quizzes))
})

app.get('/api/quizzes/:id', (req, res) => {
  const quiz = getSavedQuiz(req.params.id)
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' })
  res.json(quiz)
})

app.put('/api/quizzes/:id', (req, res) => {
  const body = req.body
  if (!body || body.id !== req.params.id) {
    return res.status(400).json({ error: 'Body must include matching id' })
  }
  if (!body.name || typeof body.name !== 'string') {
    return res.status(400).json({ error: 'name is required' })
  }
  const saved = upsertSavedQuiz({
    id: body.id,
    name: body.name,
    fingerprint: body.fingerprint,
    questions: Array.isArray(body.questions) ? body.questions : [],
    createdAt: body.createdAt ?? Date.now(),
    updatedAt: body.updatedAt ?? Date.now(),
    lastAttemptId: body.lastAttemptId,
    progress: body.progress,
  })
  res.json(saved)
})

app.post('/api/quizzes', (req, res) => {
  const body = req.body
  if (!body?.id || !body?.name) {
    return res.status(400).json({ error: 'id and name are required' })
  }
  const saved = upsertSavedQuiz({
    id: body.id,
    name: body.name,
    fingerprint: body.fingerprint,
    questions: Array.isArray(body.questions) ? body.questions : [],
    createdAt: body.createdAt ?? Date.now(),
    updatedAt: body.updatedAt ?? Date.now(),
    lastAttemptId: body.lastAttemptId,
    progress: body.progress,
  })
  res.status(201).json(saved)
})

app.delete('/api/quizzes/:id', (req, res) => {
  res.json(deleteSavedQuiz(req.params.id))
})

// ---- Attempts ----

app.get('/api/attempts', (_req, res) => {
  res.json(listAttempts())
})

app.post('/api/attempts', (req, res) => {
  if (!req.body?.id || !req.body?.quizName) {
    return res.status(400).json({ error: 'Invalid attempt' })
  }
  res.status(201).json(appendAttempt(req.body))
})

app.post('/api/attempts/bulk', (req, res) => {
  const attempts = Array.isArray(req.body) ? req.body : req.body?.attempts
  if (!Array.isArray(attempts)) {
    return res.status(400).json({ error: 'attempts array required' })
  }
  let latest = listAttempts()
  for (const attempt of attempts) {
    if (attempt?.id && attempt?.quizName) latest = appendAttempt(attempt)
  }
  res.json(latest)
})

app.delete('/api/attempts/:id', (req, res) => {
  res.json(deleteAttempt(req.params.id))
})

// ---- Mastery ----

app.get('/api/mastery', (_req, res) => {
  res.json(loadMastery())
})

app.put('/api/mastery', (req, res) => {
  res.json(saveMasteryMap(req.body || {}))
})

app.post('/api/mastery/record', (req, res) => {
  const { scopeKey, questionId, correct, quality } = req.body || {}
  if (!scopeKey || typeof questionId !== 'number') {
    return res.status(400).json({ error: 'scopeKey and questionId required' })
  }
  const outcome = quality !== undefined ? quality : correct
  if (outcome === undefined) return res.status(400).json({ error: 'correct or quality required' })
  res.json(recordMasteryOutcome(scopeKey, questionId, outcome))
})

app.delete('/api/mastery/scope/:scopeId', (req, res) => {
  const scopeId = decodeURIComponent(req.params.scopeId)
  if (!scopeId) return res.status(400).json({ error: 'scopeId required' })
  res.json(deleteMasteryForScope(scopeId))
})


// ---- Active sessions (resume course/chapter quizzes) ----

app.get('/api/sessions', (_req, res) => {
  res.json(listActiveSessions())
})

app.get('/api/sessions/:id', (req, res) => {
  const row = getActiveSession(req.params.id)
  if (!row) return res.status(404).json({ error: 'Session not found' })
  res.json(row)
})

app.put('/api/sessions/:id', (req, res) => {
  try {
    const body = req.body || {}
    const saved = upsertActiveSession({
      id: req.params.id,
      courseId: body.courseId,
      chapterIds: body.chapterIds,
      quizName: body.quizName,
      session: body.session,
    })
    res.json(saved)
  } catch (e) {
    res.status(400).json({ error: e.message || 'Invalid session' })
  }
})

app.delete('/api/sessions/:id', (req, res) => {
  res.json(deleteActiveSession(req.params.id))
})

// ---- App state / settings ----

app.get('/api/state', (_req, res) => {
  res.json(getAllAppState())
})

app.get('/api/state/:key', (req, res) => {
  const value = getAppState(req.params.key)
  if (value === undefined) return res.status(404).json({ error: 'Not found' })
  res.json({ key: req.params.key, value })
})

app.put('/api/state/:key', (req, res) => {
  const body = req.body || {}
  const value = Object.prototype.hasOwnProperty.call(body, 'value') ? body.value : body
  setAppState(req.params.key, value)
  res.json({ key: req.params.key, value })
})

app.delete('/api/state/:key', (req, res) => {
  setAppState(req.params.key, undefined)
  res.status(204).end()
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Server error' })
})

app.listen(PORT, () => {
  console.log(`Hugo API listening on http://localhost:${PORT}`)
  console.log(`SQLite database: ${getDbPath()}`)
})
