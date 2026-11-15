/**
 * Local API server for Hugo.
 * Serves REST endpoints backed by SQLite (data/drillmcq.sqlite).
 *
 * Start:  npm run server
 * Dev UI proxies /api → this process (see vite.config.ts).
 */

import cors from 'cors'
import express from 'express'
import {
  appendAttempt,
  deleteActiveSession,
  deleteAttempt,
  deleteCourse,
  getActiveSession,
  getCourse,
  getDbPath,
  listActiveSessions,
  listAttempts,
  listCourses,
  loadMastery,
  recordMasteryOutcome,
  saveMasteryMap,
  upsertActiveSession,
  upsertCourse,
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
  const { scopeKey, questionId, correct } = req.body || {}
  if (!scopeKey || typeof questionId !== 'number' || typeof correct !== 'boolean') {
    return res.status(400).json({ error: 'scopeKey, questionId, correct required' })
  }
  res.json(recordMasteryOutcome(scopeKey, questionId, correct))
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

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Server error' })
})

app.listen(PORT, () => {
  console.log(`Hugo API listening on http://localhost:${PORT}`)
  console.log(`SQLite database: ${getDbPath()}`)
})
