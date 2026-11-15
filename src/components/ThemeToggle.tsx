import type { Theme } from '../services/storage'
import { IconMoon, IconSun } from './icons/Icons'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

/** Sun/moon button that switches between light and dark mode. */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
    </button>
  )
}
