import { useCallback, useEffect, useState } from 'react'
import { loadTheme, saveTheme, type Theme } from '../services/storage'

/**
 * Dark/light mode. Priority: saved DB preference > OS preference > light.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  useEffect(() => {
    let cancelled = false
    void loadTheme()
      .then((saved) => {
        if (!cancelled && saved) setTheme(saved)
      })
      .catch(() => {
        /* keep OS/default theme when DB unavailable */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    void saveTheme(theme).catch(() => {
      /* DB unavailable; UI still reflects chosen theme */
    })
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggleTheme }
}
