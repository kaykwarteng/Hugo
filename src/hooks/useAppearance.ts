import { useCallback, useEffect, useState } from 'react'
import { defaultAppearance, loadAppearance, saveAppearance } from '../services/storage'
import type { AppearancePrefs } from '../types/appearance'
import { applyAppearance } from '../utils/appearance'

/** Font, text size and background preset, persisted in SQLite via API. */
export function useAppearance() {
  const [appearance, setAppearance] = useState<AppearancePrefs>(defaultAppearance())

  useEffect(() => {
    let cancelled = false
    void loadAppearance()
      .then((saved) => {
        if (!cancelled) setAppearance(saved)
      })
      .catch(() => {
        /* keep defaults when DB unavailable */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    applyAppearance(document.documentElement, appearance)
    void saveAppearance(appearance).catch(() => {
      /* DB unavailable; UI still reflects chosen appearance */
    })
  }, [appearance])

  const updateAppearance = useCallback((patch: Partial<AppearancePrefs>) => {
    setAppearance((current) => ({ ...current, ...patch }))
  }, [])

  const resetAppearance = useCallback(() => {
    setAppearance(defaultAppearance())
  }, [])

  return { appearance, updateAppearance, resetAppearance }
}
