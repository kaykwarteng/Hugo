import { describe, expect, it } from "vitest"
import {
  createId,
  defaultAIConfig,
  defaultAppearance,
  fingerprintQuestions,
  masteryKey,
  normalizeAttempt,
  normalizeSavedQuiz,
  normalizeSession,
} from "./storage"

describe("storage helpers (db-backed, no browser storage)", () => {
  it("creates prefixed ids", () => {
    expect(createId("quiz")).toMatch(/^quiz_/)
  })

  it("fingerprints question banks deterministically", () => {
    const qs = [
      { id: 1, question: "Q", options: ["A", "B"], correctAnswers: ["A"] },
    ]
    expect(fingerprintQuestions(qs)).toBe(fingerprintQuestions([...qs]))
  })

  it("builds mastery keys", () => {
    expect(masteryKey("quiz_1", 2)).toBe("quiz_1:2")
  })

  it("provides defaults for appearance/ai config", () => {
    expect(defaultAppearance().font).toBe("sans")
    expect(defaultAIConfig().enabled).toBe(false)
  })

  it("normalizes saved quizzes, attempts, and sessions", () => {
    const quiz = normalizeSavedQuiz({
      id: "q1",
      name: "Quiz",
      questions: [{ id: 1, question: "Q", options: ["A"], correctAnswers: ["A"] }],
      createdAt: 1,
      updatedAt: 2,
    })
    expect(quiz?.fingerprint).toBeTruthy()

    const attempt = normalizeAttempt({
      id: "a1",
      quizName: "Quiz",
      completedAt: 10,
      questions: [{ id: 1, question: "Q", options: ["A"], correctAnswers: ["A"] }],
      correct: 1,
      total: 1,
      percentage: 100,
      settings: {},
      answers: {},
    })
    expect(attempt?.startedAt).toBe(10)

    const session = normalizeSession({
      questions: [{ id: 1, question: "Q", options: ["A"], correctAnswers: ["A"] }],
      answers: {},
      currentIndex: 0,
      status: "active",
      startedAt: 1,
      timerMinutes: 0,
      attemptId: "att",
      settings: {},
    })
    expect(session?.questions).toHaveLength(1)
  })
})
