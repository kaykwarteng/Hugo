import { useEffect, useState } from 'react'
import type { QuizQuestion } from '../types/quiz'
import { MathText } from './MathText'
import { Modal } from './Modal'
import { IconPlus, IconTrash, IconX } from './icons/Icons'

interface QuestionFormModalProps {
  /** null = add mode; otherwise edit existing */
  initial: QuizQuestion | null
  onSave: (question: QuizQuestion) => void
  onCancel: () => void
  /** Suggested next id when adding */
  nextId?: number
}

/**
 * Shared Add / Edit question modal for chapter question management.
 * Supports multi-correct answers, LaTeX preview, and option CRUD.
 */
export function QuestionFormModal({ initial, onSave, onCancel, nextId = 1 }: QuestionFormModalProps) {
  const isEdit = initial !== null
  const [statement, setStatement] = useState(initial?.question ?? '')
  const [options, setOptions] = useState<string[]>(
    initial?.options?.length ? [...initial.options] : ['', '', '', ''],
  )
  const [correct, setCorrect] = useState<Set<string>>(
    new Set(initial?.correctAnswers ?? []),
  )
  const [explanation, setExplanation] = useState(initial?.explanation ?? '')
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '')
  const [audioUrl, setAudioUrl] = useState(initial?.audioUrl ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [flagged, setFlagged] = useState(initial?.flagged === true)
  const [bookmarked, setBookmarked] = useState(initial?.bookmarked === true)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    // Keep correct set in sync when option text changes (match by index when possible)
  }, [options])

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => {
      const next = [...prev]
      const old = next[index]
      next[index] = value
      // Migrate correct flag if the text changed
      if (old && correct.has(old) && value !== old) {
        setCorrect((c) => {
          const s = new Set(c)
          s.delete(old)
          if (value.trim()) s.add(value)
          return s
        })
      }
      return next
    })
  }

  const toggleCorrect = (option: string) => {
    if (!option.trim()) return
    setCorrect((prev) => {
      const next = new Set(prev)
      if (next.has(option)) next.delete(option)
      else next.add(option)
      return next
    })
  }

  const addOption = () => {
    if (options.length >= 8) return
    setOptions((prev) => [...prev, ''])
  }

  const removeOption = (index: number) => {
    if (options.length <= 2) return
    const removed = options[index]
    setOptions((prev) => prev.filter((_, i) => i !== index))
    if (removed) {
      setCorrect((c) => {
        const s = new Set(c)
        s.delete(removed)
        return s
      })
    }
  }

  const handleSave = () => {
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean)
    if (!statement.trim()) {
      setError('Question statement is required.')
      return
    }
    if (trimmedOptions.length < 2) {
      setError('Provide at least two answer options.')
      return
    }
    // Rebuild correct from current option texts that were marked
    const marked = trimmedOptions.filter((o) => {
      // find original index
      const idx = options.findIndex((x) => x.trim() === o)
      const original = idx >= 0 ? options[idx] : o
      return correct.has(original) || correct.has(o)
    })
    if (marked.length === 0) {
      setError('Mark at least one correct answer.')
      return
    }
    const question: QuizQuestion = {
      id: initial?.id ?? nextId,
      question: statement.trim(),
      options: trimmedOptions,
      correctAnswers: marked,
      explanation: explanation.trim() || undefined,
      difficulty: difficulty.trim() || undefined,
      category: category.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      audioUrl: audioUrl.trim() || undefined,
      note: note.trim() || undefined,
      flagged: flagged || undefined,
      bookmarked: bookmarked || undefined,
    }
    onSave(question)
  }

  return (
    <Modal labelledBy="question-form-title" onClose={onCancel} panelClassName="max-w-lg">
      <div className="flex items-start justify-between gap-3">
        <h2 id="question-form-title" className="text-lg font-semibold">
          {isEdit ? 'Edit question' : 'Add question'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          aria-label="Close"
        >
          <IconX size={18} />
        </button>
      </div>

      <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div>
          <label className="mb-1 block text-sm font-medium">Question statement</label>
          <textarea
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            rows={4}
            placeholder="Enter the question. Use $...$ or $$...$$ for math."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">Answer options</label>
            <button
              type="button"
              onClick={addOption}
              disabled={options.length >= 8}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-40"
            >
              <IconPlus size={14} /> Add option
            </button>
          </div>
          <ul className="space-y-2">
            {options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i)
              const isCorrect = correct.has(opt)
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-center text-xs font-semibold text-slate-500">
                    {letter}
                  </span>
                  <input
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${letter}`}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                  <label className="mt-2 flex shrink-0 items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={isCorrect}
                      onChange={() => toggleCorrect(opt)}
                      disabled={!opt.trim()}
                      className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Correct
                  </label>
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= 2}
                    className="mt-1.5 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950/40"
                    aria-label="Remove option"
                  >
                    <IconTrash size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-1 text-xs text-slate-500">
            Tick one or more options as correct. Multi-select questions are supported.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Explanation (optional)</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={3}
            placeholder="Explain the correct answer. Math supported."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Difficulty</label>
            <input value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="e.g. medium" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Category / tag</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="optional" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Image URL (optional)</label>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Audio URL (optional)</label>
            <input value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="https://..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Personal note (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Your note for this question" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} className="size-4 rounded border-slate-300 text-indigo-600" />Flagged</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bookmarked} onChange={(e) => setBookmarked(e.target.checked)} className="size-4 rounded border-slate-300 text-indigo-600" />Bookmarked</label>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
          {showPreview && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950/50">
              <div className="mb-3 font-medium">
                <MathText>{statement || '(empty question)'}</MathText>
              </div>
              <ul className="space-y-1">
                {options.filter((o) => o.trim()).map((o, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-semibold text-slate-500">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <span className={correct.has(o) ? 'font-medium text-green-700 dark:text-green-400' : ''}>
                      <MathText>{o}</MathText>
                      {correct.has(o) ? ' ✓' : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {imageUrl.trim() && <img src={imageUrl.trim()} alt="" className="mt-3 max-h-48 rounded-lg border border-slate-200 object-contain dark:border-slate-800" />}
              {audioUrl.trim() && <audio controls src={audioUrl.trim()} className="mt-3 w-full" />}
              {explanation.trim() && (
                <div className="mt-3 border-t border-slate-200 pt-2 text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <MathText as="div">{explanation}</MathText>
                </div>
              )}
              {note.trim() && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Note: {note.trim()}</p>}
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {isEdit ? 'Save changes' : 'Save question'}
        </button>
      </div>
    </Modal>
  )
}
