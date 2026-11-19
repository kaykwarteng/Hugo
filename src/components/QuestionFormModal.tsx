import { useMemo, useState } from 'react'
import type { QuizOption, QuizQuestion } from '../types/quiz'
import { getOptionKey, getOptionMedia, getOptionText } from '../utils/quiz'
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

interface OptRow {
  key: string
  text: string
  imageUrl: string
  audioUrl: string
  explicitId?: string
}

function uid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `opt_${crypto.randomUUID()}`
  } catch { /* ignore */ }
  return `opt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function rowsFromQuestion(q: QuizQuestion | null): { rows: OptRow[]; correct: Set<string> } {
  if (!q) {
    const rows = [0, 1, 2, 3].map(() => ({ key: uid(), text: '', imageUrl: '', audioUrl: '' }))
    return { rows, correct: new Set() }
  }
  const rows = q.options.map((opt, i) => {
    const key = getOptionKey(opt, i) || uid()
    const text = getOptionText(opt)
    const media = getOptionMedia(opt)
    const explicitId = typeof opt === 'string' ? undefined : opt.id
    return { key, text, imageUrl: media.imageUrl ?? '', audioUrl: media.audioUrl ?? '', explicitId }
  })
  return { rows: rows.length ? rows : [{ key: uid(), text: '', imageUrl: '', audioUrl: '' }], correct: new Set(q.correctAnswers) }
}

/**
 * Shared Add / Edit question modal for chapter question management.
 * Supports multi-correct answers, LaTeX preview, and text/image/audio options.
 */
export function QuestionFormModal({ initial, onSave, onCancel, nextId = 1 }: QuestionFormModalProps) {
  const isEdit = initial !== null
  const init = useMemo(() => rowsFromQuestion(initial), [initial])
  const [statement, setStatement] = useState(initial?.question ?? '')
  const [rows, setRows] = useState<OptRow[]>(init.rows)
  const [correct, setCorrect] = useState<Set<string>>(init.correct)
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

  const updateRow = (index: number, patch: Partial<OptRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const toggleCorrect = (key: string) => {
    setCorrect((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const addOption = () => {
    if (rows.length >= 8) return
    setRows((prev) => [...prev, { key: uid(), text: '', imageUrl: '', audioUrl: '' }])
  }

  const removeOption = (index: number) => {
    if (rows.length <= 2) return
    const removed = rows[index]
    setRows((prev) => prev.filter((_, i) => i !== index))
    if (removed) {
      setCorrect((c) => {
        const s = new Set(c)
        s.delete(removed.key)
        return s
      })
    }
  }

  const handleSave = () => {
    setError(null)
    if (!statement.trim()) {
      setError('Question statement is required.')
      return
    }

    const built: { option: QuizOption; key: string; rowKey: string }[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const text = r.text.trim()
      const img = r.imageUrl.trim()
      const aud = r.audioUrl.trim()
      if (!text && !img && !aud) continue
      const hasMedia = !!img || !!aud
      if (hasMedia || r.explicitId) {
        const option: { id: string; text?: string; imageUrl?: string; audioUrl?: string } = { id: r.key }
        if (text) option.text = text
        if (img) option.imageUrl = img
        if (aud) option.audioUrl = aud
        built.push({ option, key: r.key, rowKey: r.key })
      } else {
        built.push({ option: text, key: text, rowKey: r.key })
      }
    }

    if (built.length < 2) {
      setError('Provide at least two answer options (text, image URL, or audio URL).')
      return
    }
    const keys = built.map((b) => b.key)
    const dup = keys.find((k, idx) => keys.indexOf(k) !== idx)
    if (dup !== undefined) {
      setError('Each option must be unique. Two options resolve to the same answer key.')
      return
    }

    const marked = built.filter((b) => correct.has(b.rowKey)).map((b) => b.key)
    if (marked.length === 0) {
      setError('Mark at least one correct answer.')
      return
    }

    const question: QuizQuestion = {
      id: initial?.id ?? nextId,
      question: statement.trim(),
      options: built.map((b) => b.option),
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

  const previewOptions = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.text.trim() || r.imageUrl.trim() || r.audioUrl.trim())

  return (
    <Modal labelledBy="question-form-title" onClose={onCancel} panelClassName="max-w-2xl">
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
              disabled={rows.length >= 8}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-40"
            >
              <IconPlus size={14} /> Add option
            </button>
          </div>
          <ul className="space-y-3">
            {rows.map((row, i) => {
              const letter = String.fromCharCode(65 + i)
              const isCorrect = correct.has(row.key)
              const hasContent = !!row.text.trim() || !!row.imageUrl.trim() || !!row.audioUrl.trim()
              return (
                <li key={row.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 w-5 shrink-0 text-center text-xs font-semibold text-slate-500">
                      {letter}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        value={row.text}
                        onChange={(e) => updateRow(i, { text: e.target.value })}
                        placeholder={`Option ${letter} text (optional if media provided)`}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          value={row.imageUrl}
                          onChange={(e) => updateRow(i, { imageUrl: e.target.value })}
                          placeholder="Image URL (optional)"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                        <input
                          value={row.audioUrl}
                          onChange={(e) => updateRow(i, { audioUrl: e.target.value })}
                          placeholder="Audio URL (optional)"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </div>
                    </div>
                    <label className="mt-2 flex shrink-0 items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={isCorrect}
                        onChange={() => toggleCorrect(row.key)}
                        disabled={!hasContent}
                        className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Correct
                    </label>
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      disabled={rows.length <= 2}
                      className="mt-1.5 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950/40"
                      aria-label="Remove option"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-1 text-xs text-slate-500">
            Each option can be text, an image/audio URL, or both. Tick one or more correct answers.
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
            <label className="mb-1 block text-sm font-medium">Question image URL (optional)</label>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Question audio URL (optional)</label>
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
              <ul className="space-y-2">
                {previewOptions.map(({ r, i }) => (
                  <li key={r.key} className="flex gap-2">
                    <span className="font-semibold text-slate-500">{String.fromCharCode(65 + i)}.</span>
                    <span className={correct.has(r.key) ? 'font-medium text-green-700 dark:text-green-400' : ''}>
                      {r.text.trim() ? <MathText as="span">{r.text}</MathText> : <span>(media option)</span>}
                      {r.imageUrl.trim() ? <img src={r.imageUrl.trim()} alt="" className="mt-1 max-h-32 rounded border border-slate-200 object-contain dark:border-slate-700" /> : null}
                      {r.audioUrl.trim() ? <audio controls src={r.audioUrl.trim()} className="mt-1 w-full" /> : null}
                      {correct.has(r.key) ? ' ✓' : ''}
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
