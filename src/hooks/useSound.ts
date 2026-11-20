import { useCallback, useEffect, useRef, useState } from 'react'
import { loadSoundPrefs, saveSoundPrefs } from '../services/storage'
import { playSound, primeSound, setSoundEnabled } from '../services/sound'
import { defaultSoundPrefs } from '../utils/sound'
import type { SoundPrefs } from '../types/sound'

export function useSound() {
  const [sound, setSound] = useState<SoundPrefs>(defaultSoundPrefs())
  const soundRef = useRef(sound)
  soundRef.current = sound

  useEffect(() => {
    let cancelled = false
    void loadSoundPrefs()
      .then((prefs) => {
        if (!cancelled) setSound(prefs)
      })
      .catch(() => {
        /* keep defaults */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSoundEnabled(sound.enabled)
    if (sound.enabled) primeSound()
    void saveSoundPrefs(sound).catch(() => {})
  }, [sound])

  const updateSound = useCallback((patch: Partial<SoundPrefs>) => {
    const current = soundRef.current
    const next: SoundPrefs = { ...current, ...patch }
    setSoundEnabled(next.enabled)
    if (next.enabled) {
      primeSound()
      if (!current.enabled) playSound('select')
    }
    setSound(next)
  }, [])

  return { sound, updateSound }
}
