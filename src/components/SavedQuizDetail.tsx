import { useState } from 'react'
import type { QuizQuestion, SavedQuiz } from '../types/quiz'
import { parseQuizJson } from '../utils/quiz'
import { ConfirmDialog } from './ConfirmDialog'
import { MathText } from './MathText'
import { Modal } from './Modal'
import { QuestionFormModal } from './QuestionFormModal'
import { IconArrowLeft, IconEdit, IconPlay, IconPlus, IconTrash } from './icons/Icons'

interface SavedQuizDetailProps {
  quiz: SavedQuiz
  onBack: () => void
  onStart: () => void
  onAddQuestion: (q: QuizQuestion) => void
  onAddQuestions: (questions: QuizQuestion[]) => void
  onUpdateQuestion: (q: QuizQuestion) => void
  onDeleteQuestion: (questionId: number) => void
  nextQuestionId: number
}

/** Question management for a standalone saved quiz, mirroring chapter detail. */
export function SavedQuizDetail({
  quiz,
  onBack,
  onStart,
  onAddQuestion,
  onAddQuestions,
  onUpdateQuestion,
  onDeleteQuestion,
  nextQuestionId,
}: SavedQuizDetailProps) {
  const [editor, setEditor] = useState<QuizQuestion | null | 'new'>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<QuizQuestion | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <IconArrowLeft size={16} />
            Quiz Library
          </button>
          <h2 className="break-words text-xl font-semibold text-slate-900 dark:text-slate-100">
            {quiz.name}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quiz.questions.length > 0 && (
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <IconPlay size={16} />
              Start quiz
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditor('new')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <IconPlus size={16} />
            Add question
          </button>
          <button
            type="button"
            onClick={() => {
              setBulkText('')
              setBulkError(null)
              setBulkOpen(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <IconPlus size={16} />
            Add questions
          </button>
        </div>
      </div>

      {quiz.questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="font-medium text-slate-700 dark:text-slate-300">No questions yet</p>
          <p className="mt-1 text-sm text-slate-500">Add your first question to this quiz.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setEditor('new')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <IconPlus size={16} />
              Add question
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkText('')
                setBulkError(null)
                setBulkOpen(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
            >
              <IconPlus size={16} />
              Add questions (JSON)
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-4">
          {quiz.questions.map((q, idx) => (
            <li
              key={q.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <span className="text-xs font-medium text-slate-400">Q{idx + 1}</span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditor(q)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    title="Edit"
                  >
                    <IconEdit size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(q)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    title="Delete"
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
              <div className="mb-3 text-sm font-medium leading-snug">
                <MathText>{q.question}</MathText>
              </div>
              <ul className="mb-2 space-y-1">
                {q.options.map((opt, i) => {
                  const isCorrect = q.correctAnswers.includes(opt)
                  return (
                    <li
                      key={i}
                      className={`flex gap-2 rounded-md px-2 py-1 text-sm ${
                        isCorrect
                          ? 'bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="w-5 shrink-0 font-semibold">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      <span className="min-w-0">
                        <MathText>{opt}</MathText>
                        {isCorrect && <span className="ml-1 text-xs font-medium">(correct)</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {q.explanation && (
                <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <MathText as="div">{q.explanation}</MathText>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editor !== null && (
        <QuestionFormModal
          initial={editor === 'new' ? null : editor}
          nextId={nextQuestionId}
          onCancel={() => setEditor(null)}
          onSave={(q) => {
            if (editor === 'new') onAddQuestion(q)
            else onUpdateQuestion(q)
            setEditor(null)
          }}
        />
      )}

      {bulkOpen && (
        <Modal labelledBy="bulk-json-title" onClose={() => setBulkOpen(false)} panelClassName="max-w-lg">
          <h2 id="bulk-json-title" className="text-lg font-semibold">
            Add questions from JSON
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Paste an array of question objects. They will be validated and added to this quiz.
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder={'[\n  {\n    "question": "...",\n    "options": ["A", "B", "C", "D"],\n    "correctAnswers": ["A"],\n    "explanation": "..."\n  }\n]'}
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          {bulkError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {bulkError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={bulkBusy || !bulkText.trim()}
              onClick={async () => {
                setBulkError(null)
                const result = parseQuizJson(bulkText)
                if (!result.ok) {
                  setBulkError(result.error)
                  return
                }
                if (result.questions.length === 0) {
                  setBulkError('No questions found in the JSON.')
                  return
                }
                setBulkBusy(true)
                try {
                  let nextId = nextQuestionId
                  const withIds = result.questions.map((q) => ({ ...q, id: nextId++ }))
                  await Promise.resolve(onAddQuestions(withIds))
                  setBulkOpen(false)
                  setBulkText('')
                } catch (e) {
                  setBulkError(e instanceof Error ? e.message : 'Failed to add questions')
                } finally {
                  setBulkBusy(false)
                }
              }}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {bulkBusy ? 'Saving…' : 'Parse and add to quiz'}
            </button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this question?"
          message="This permanently removes the question from this quiz. This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            onDeleteQuestion(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
