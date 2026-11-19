import { useMemo, useState } from 'react'
import type { QuizQuestion, SavedQuiz } from '../types/quiz'
import { parseQuizJson } from '../utils/quiz'
import { ConfirmDialog } from './ConfirmDialog'
import { MathText } from './MathText'
import { Modal } from './Modal'
import { QuestionFormModal } from './QuestionFormModal'
import { IconArrowLeft, IconChevronDown, IconChevronUp, IconCopy, IconEdit, IconPlay, IconPlus, IconSearch, IconTrash } from './icons/Icons'

interface SavedQuizDetailProps {
  quiz: SavedQuiz
  onBack: () => void
  onStart: () => void
  onReplaceQuestions: (questions: QuizQuestion[]) => void
  nextQuestionId: number
}

export function SavedQuizDetail({
  quiz,
  onBack,
  onStart,
  onReplaceQuestions,
  nextQuestionId,
}: SavedQuizDetailProps) {
  const [editor, setEditor] = useState<QuizQuestion | null | 'new'>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<QuizQuestion | null>(null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return quiz.questions.map((question, index) => ({ question, index }))
    return quiz.questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => {
        const hay = [question.question, question.explanation ?? '', question.category ?? '', ...(question.options || [])].join(' ').toLowerCase()
        return hay.includes(q)
      })
  }, [quiz.questions, query])

  const removeAt = (index: number) => {
    onReplaceQuestions(quiz.questions.filter((_, i) => i !== index))
  }

  const duplicateAt = (index: number) => {
    const base = quiz.questions[index]
    if (!base) return
    const maxId = Math.max(nextQuestionId - 1, ...quiz.questions.map((q) => q.id))
    const copy: QuizQuestion = { ...base, id: maxId + 1 }
    const next = [...quiz.questions]
    next.splice(index + 1, 0, copy)
    onReplaceQuestions(next)
  }

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir
    if (to < 0 || to >= quiz.questions.length) return
    const next = [...quiz.questions]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    onReplaceQuestions(next)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
            <IconArrowLeft size={16} />Quiz Library
          </button>
          <h2 className="break-words text-xl font-semibold text-slate-900 dark:text-slate-100">{quiz.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quiz.questions.length > 0 && (
            <button type="button" onClick={onStart} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              <IconPlay size={16} />Start quiz
            </button>
          )}
          <button type="button" onClick={() => setEditor('new')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
            <IconPlus size={16} />Add question
          </button>
          <button type="button" onClick={() => { setBulkText(''); setBulkError(null); setBulkOpen(true) }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
            <IconPlus size={16} />Add questions
          </button>
        </div>
      </div>

      {quiz.questions.length > 0 && (
        <div className="relative max-w-md">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions, options, explanations…" className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
        </div>
      )}

      {quiz.questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="font-medium text-slate-700 dark:text-slate-300">No questions yet</p>
          <p className="mt-1 text-sm text-slate-500">Add your first question to this quiz.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">No questions match your search.</p>
      ) : (
        <ul className="space-y-4">
          {filtered.map(({ question: q, index: idx }) => (
            <li key={`${q.id}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-start justify-between gap-3">
                <span className="text-xs font-medium text-slate-400">Q{idx + 1}</span>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" title="Move up"><IconChevronUp size={16} /></button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === quiz.questions.length - 1} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" title="Move down"><IconChevronDown size={16} /></button>
                  <button type="button" onClick={() => duplicateAt(idx)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" title="Duplicate"><IconCopy size={16} /></button>
                  <button type="button" onClick={() => setEditor(q)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" title="Edit"><IconEdit size={16} /></button>
                  <button type="button" onClick={() => setDeleteTarget(q)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" title="Delete"><IconTrash size={16} /></button>
                </div>
              </div>
              <div className="mb-3 text-sm font-medium leading-snug"><MathText>{q.question}</MathText></div>
              {q.imageUrl && <img src={q.imageUrl} alt="" className="mb-3 max-h-64 rounded-lg border border-slate-200 object-contain dark:border-slate-800" loading="lazy" />}
              {q.audioUrl && <audio controls src={q.audioUrl} className="mb-3 w-full" />}
              <ul className="mb-2 space-y-1">
                {q.options.map((opt, i) => {
                  const isCorrect = q.correctAnswers.includes(opt)
                  return (
                    <li key={i} className={`flex gap-2 rounded-md px-2 py-1 text-sm ${isCorrect ? 'bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300' : 'text-slate-600 dark:text-slate-400'}`}>
                      <span className="w-5 shrink-0 font-semibold">{String.fromCharCode(65 + i)}.</span>
                      <span className="min-w-0"><MathText>{opt}</MathText>{isCorrect && <span className="ml-1 text-xs font-medium">(correct)</span>}</span>
                    </li>
                  )
                })}
              </ul>
              {q.explanation && <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"><MathText as="div">{q.explanation}</MathText></div>}
              {q.note && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Note: {q.note}</p>}
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
            if (editor === 'new') onReplaceQuestions([...quiz.questions, q])
            else onReplaceQuestions(quiz.questions.map((x) => (x.id === (editor as QuizQuestion).id ? q : x)))
            setEditor(null)
          }}
        />
      )}

      {bulkOpen && (
        <Modal labelledBy="bulk-json-title" onClose={() => setBulkOpen(false)} panelClassName="max-w-lg">
          <h2 id="bulk-json-title" className="text-lg font-semibold">Add questions from JSON</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Paste an array of question objects. They will be validated and added to this quiz.</p>
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={12} spellCheck={false} placeholder={'[\n  {\n    "question": "...",\n    "options": ["A", "B", "C", "D"],\n    "correctAnswers": ["A"]\n  }\n]'} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950" />
          {bulkError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{bulkError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setBulkOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Cancel</button>
            <button type="button" disabled={bulkBusy || !bulkText.trim()} onClick={async () => {
              setBulkError(null)
              const result = parseQuizJson(bulkText)
              if (!result.ok) { setBulkError(result.error); return }
              if (result.questions.length === 0) { setBulkError('No questions found in the JSON.'); return }
              setBulkBusy(true)
              try {
                let nextId = nextQuestionId
                const withIds = result.questions.map((q) => ({ ...q, id: nextId++ }))
                await Promise.resolve(onReplaceQuestions([...quiz.questions, ...withIds]))
                setBulkOpen(false); setBulkText('')
              } catch (e) {
                setBulkError(e instanceof Error ? e.message : 'Failed to add questions')
              } finally { setBulkBusy(false) }
            }} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
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
            const idx = quiz.questions.findIndex((q) => q.id === deleteTarget.id)
            if (idx >= 0) removeAt(idx)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
