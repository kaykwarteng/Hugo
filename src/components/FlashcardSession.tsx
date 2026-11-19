import { useMemo, useState } from 'react'
import { apiRecordMastery } from '../services/api'
import { masteryKey } from '../utils/mastery'
import type { QuizQuestion } from '../types/quiz'
import { MathText } from './MathText'
import { getOptionKey, getOptionMedia, getOptionText } from '../utils/quiz'
import { IconArrowLeft } from './icons/Icons'

interface FlashcardSessionProps {
  questions: QuizQuestion[]
  scopeId: string
  title: string
  onExit: () => void
  onProgress?: () => void
}

type Grade = 'again' | 'hard' | 'good'

export function FlashcardSession({ questions, scopeId, title, onExit, onProgress }: FlashcardSessionProps) {
  const deck = useMemo(() => questions, [questions])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState({ again: 0, hard: 0, good: 0 })
  const [done, setDone] = useState(deck.length === 0)

  const card = deck[index]

  const [error, setError] = useState<string | null>(null)

  const rate = async (grade: Grade) => {
    if (!card || busy) return
    setBusy(true)
    setError(null)
    try {
      await apiRecordMastery(masteryKey(scopeId, card.id), card.id, grade)
      onProgress?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save rating')
    } finally {
      setCounts((c) => ({ ...c, [grade]: c[grade] + 1 }))
      const next = index + 1
      if (next >= deck.length) setDone(true)
      else {
        setIndex(next)
        setFlipped(false)
      }
      setBusy(false)
    }
  }

  if (done) {
    const total = counts.again + counts.hard + counts.good
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <main className="mx-auto max-w-2xl px-4 py-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h1 className="text-2xl font-bold">Session complete</h1>
            <p className="mt-1 break-words text-slate-600 dark:text-slate-400">{title}</p>
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30"><div className="text-2xl font-bold text-red-700 dark:text-red-400">{counts.again}</div><div className="text-sm font-medium text-red-700/80 dark:text-red-400/80">Again</div></div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{counts.hard}</div><div className="text-sm font-medium text-amber-700/80 dark:text-amber-400/80">Hard</div></div>
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30"><div className="text-2xl font-bold text-green-700 dark:text-green-400">{counts.good}</div><div className="text-sm font-medium text-green-700/80 dark:text-green-400/80">Good</div></div>
            </div>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{total} card{total === 1 ? '' : 's'} reviewed.</p>
            {error && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Some ratings may not have been saved: {error}</p>}
            <button type="button" onClick={onExit} className="mt-6 min-h-11 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700">Back to library</button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={onExit} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
            <IconArrowLeft size={16} /> Exit
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Card {index + 1} of {deck.length}</p>
          </div>
          <div className="w-16 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{Math.round(((index) / deck.length) * 100)}%</div>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${((index) / deck.length) * 100}%` }} /></div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-40">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {card.category && <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{card.category}</span>}
            {card.difficulty && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-400">{card.difficulty}</span>}
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${flipped ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>{flipped ? 'Answer shown' : 'Question'}</span>
          </div>

          <h2 className="text-xl font-semibold leading-snug sm:text-2xl"><MathText as="span">{card.question}</MathText></h2>
          {card.imageUrl && <img src={card.imageUrl} alt="" className="mt-4 max-h-80 w-full rounded-xl border border-slate-200 object-contain dark:border-slate-800" loading="lazy" />}
          {card.audioUrl && <audio controls src={card.audioUrl} className="mt-4 w-full" />}

          {!flipped ? (
            <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800/40">
              <p className="text-sm text-slate-600 dark:text-slate-400">Think of the answer, then reveal it and rate yourself.</p>
              <button type="button" onClick={() => setFlipped(true)} className="mt-4 min-h-12 w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 sm:w-auto">
                Show answer
              </button>
            </div>
          ) : (
            <div className="animate-fade-slide-in mt-6 space-y-4">
              <div className="rounded-xl border border-green-300 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                <p className="text-sm font-semibold text-green-800 dark:text-green-400">Correct answer{card.correctAnswers.length > 1 ? 's' : ''}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-200">
                  {card.correctAnswers.map((a) => {
                    const idx = card.options.findIndex((o, i) => getOptionKey(o, i) === a)
                    const label = idx >= 0 ? (getOptionText(card.options[idx]).trim() || a) : a
                    return <li key={a}><MathText as="span">{label}</MathText></li>
                  })}
                </ul>
              </div>
              {card.options?.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">All options</p>
                  <ul className="space-y-1 text-sm">
                    {card.options.map((opt, idx) => {
                      const key = getOptionKey(opt, idx)
                      const ok = card.correctAnswers.includes(key)
                      const text = getOptionText(opt)
                      const { imageUrl, audioUrl } = getOptionMedia(opt)
                      return (
                        <li key={key} className={`rounded-lg px-3 py-2 ${ok ? 'bg-green-50 font-medium text-green-800 dark:bg-green-950/30 dark:text-green-300' : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400'}`}>
                          <div className="flex flex-col gap-1">
                            <span>{ok ? '✓ ' : ''}{text ? <MathText as="span">{text}</MathText> : `Option ${idx + 1}`}</span>
                            {imageUrl ? <img src={imageUrl} alt="" className="max-h-40 rounded border border-slate-200 object-contain dark:border-slate-700" loading="lazy" /> : null}
                            {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              {card.explanation && (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  <p className="mb-1 font-medium">Explanation</p>
                  <MathText>{card.explanation}</MathText>
                </div>
              )}
              {card.note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"><strong>Note:</strong> {card.note}</p>}
            </div>
          )}
        </div>
      </main>

      {flipped && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto max-w-3xl px-4 py-3">
            <p className="mb-2 text-center text-sm font-medium text-slate-700 dark:text-slate-300">Rate to continue</p>
            {error && <p className="mb-2 text-center text-xs text-amber-700 dark:text-amber-400">Save failed, but you can continue: {error}</p>}
            <div className="grid grid-cols-3 gap-3">
              <button type="button" disabled={busy} onClick={() => void rate('again')} className="min-h-12 rounded-xl border border-red-300 bg-red-50 px-3 py-3 font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70">
                {busy ? 'Saving…' : 'Again'}
                <span className="block text-xs font-normal opacity-80">Review soon</span>
              </button>
              <button type="button" disabled={busy} onClick={() => void rate('hard')} className="min-h-12 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70">
                {busy ? 'Saving…' : 'Hard'}
                <span className="block text-xs font-normal opacity-80">Needs work</span>
              </button>
              <button type="button" disabled={busy} onClick={() => void rate('good')} className="min-h-12 rounded-xl border border-green-300 bg-green-50 px-3 py-3 font-semibold text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/70">
                {busy ? 'Saving…' : 'Good'}
                <span className="block text-xs font-normal opacity-80">Got it</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
