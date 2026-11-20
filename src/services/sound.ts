import type { SoundName } from '../types/sound'
import { MASTER_GAIN, SOUND_SPECS, shouldPlay } from '../utils/sound'

/**
 * Web Audio sound engine (singleton).
 *
 * `playSound(name)` is the only trigger API. Calls are safe anywhere and never
 * throw. A shared AudioContext is unlocked on user gestures so sounds work for
 * both standalone and course quiz flows.
 */

let enabled = true
let audioCtx: AudioContext | null = null
let unlockInstalled = false
const lastPlayed = new Map<SoundName, number>()

type AudioContextCtor = typeof AudioContext

function getCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function isSoundSupported(): boolean {
  return getCtor() !== null
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const Ctor = getCtor()
    if (!Ctor) return null
    if (audioCtx && (audioCtx.state as string) === 'closed') audioCtx = null
    if (!audioCtx) audioCtx = new Ctor()
    return audioCtx
  } catch {
    return null
  }
}

function resume(ctx: AudioContext): void {
  try {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  } catch {
    /* ignore */
  }
}

function unlock(): void {
  if (!enabled) return
  const ctx = getContext()
  if (ctx) resume(ctx)
}

function installUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true
  const handler = () => unlock()
  const opts: AddEventListenerOptions = { capture: true, passive: true }
  window.addEventListener('pointerdown', handler, opts)
  window.addEventListener('touchstart', handler, opts)
  window.addEventListener('mousedown', handler, opts)
  window.addEventListener('click', handler, opts)
  window.addEventListener('keydown', handler, { capture: true })
  window.addEventListener('focus', handler)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlock()
  })
}

export function primeSound(): void {
  unlock()
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
  if (on) {
    installUnlock()
    unlock()
  }
}

export function isSoundEnabled(): boolean {
  return enabled
}

function playTones(ctx: AudioContext, name: SoundName): void {
  const spec = SOUND_SPECS[name]
  const base = ctx.currentTime + 0.01
  for (const tone of spec) {
    try {
      const start = base + tone.at / 1000
      const duration = Math.max(tone.duration, 20) / 1000
      const attack = Math.min(0.01, duration * 0.35)
      const stop = start + duration
      const sustainEnd = Math.max(start + attack, stop - 0.005)
      const peak = Math.max(0.0005, tone.gain * MASTER_GAIN)

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone.type
      osc.frequency.setValueAtTime(tone.freq, start)

      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(peak, start + attack)
      gain.gain.setValueAtTime(peak, sustainEnd)
      gain.gain.linearRampToValueAtTime(0.0001, stop)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.onended = () => {
        try {
          osc.disconnect()
          gain.disconnect()
        } catch {
          /* ignore */
        }
      }
      osc.start(start)
      osc.stop(stop + 0.03)
    } catch {
      /* skip tone */
    }
  }
}

export function playSound(name: SoundName): void {
  try {
    if (!enabled || typeof window === 'undefined') return

    const now = Date.now()
    if (!shouldPlay(lastPlayed.get(name) ?? null, now)) return

    const ctx = getContext()
    if (!ctx) return
    resume(ctx)

    lastPlayed.set(name, now)
    playTones(ctx, name)
  } catch {
    try {
      lastPlayed.delete(name)
    } catch {
      /* ignore */
    }
  }
}

/** Test seam — resets cached context and state. */
export function resetSoundForTests(): void {
  try {
    const c = audioCtx
    audioCtx = null
    if (c && (c.state as string) !== 'closed') void c.close().catch(() => {})
  } catch {
    /* ignore */
  }
  enabled = true
  lastPlayed.clear()
  unlockInstalled = false
}

if (typeof window !== 'undefined') {
  installUnlock()
}
