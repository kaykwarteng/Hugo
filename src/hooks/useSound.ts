import { useCallback, useEffect, useState } from 'react'
import { loadSoundPrefs, saveSoundPrefs } from '../services/storage'
import { playSound, setSoundEnabled } from '../services/sound'
import { defaultSoundPrefs } from '../utils/sound'
import type { SoundPrefs } from '../types/sound'

export function useSound() {
  const [sound, setSound] = useState<SoundPrefs>(defaultSoundPrefs())

  useEffect(() => {
    let cancelled = false
    void loadSoundPrefs()
      .then((prefs) => {
        if (!cancelled) setSound(prefs)
      })
      .catch(() => {
        /* keep defaults when DB unavailable */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setSoundEnabled(sound.enabled)
    void saveSoundPrefs(sound).catch(() => {
      /* DB unavailable; UI still reflects chosen sound setting */
    })
  }, [sound])

  const updateSound = useCallback((patch: Partial<SoundPrefs>) => {
    setSound((current) => {
      const next = { ...current, ...patch }
      setSoundEnabled(next.enabled)
      if (next.enabled && !current.enabled) playSound('select')
      return next
    })
  }, [])

  return { sound, updateSound }
}
