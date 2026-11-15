import logoMark from '../assets/hugo-mark.svg'
import logoMarkDark from '../assets/hugo-mark-dark.svg'
import type { Theme } from '../services/storage'
import type { View } from '../types/navigation'
import { VIEWS } from '../types/navigation'
import { Spinner } from './Spinner'
import { ThemeToggle } from './ThemeToggle'
import {
  IconChart,
  IconHome,
  IconLibrary,
  IconPlus,
  IconSettings,
} from './icons/Icons'

interface AppNavProps {
  view: View
  onNavigate: (view: View) => void
  onOpenSettings: () => void
  theme: Theme
  onToggleTheme: () => void
  aiReady: boolean
  aiBusy: boolean
}

const ICON_MAP = {
  home: IconHome,
  plus: IconPlus,
  library: IconLibrary,
  chart: IconChart,
} as const

export function AppNav({
  view,
  onNavigate,
  onOpenSettings,
  theme,
  onToggleTheme,
  aiReady,
  aiBusy,
}: AppNavProps) {
  return (
    <>
      <header className="sticky top-0 z-30 overflow-visible border-b border-slate-200 bg-slate-100/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 overflow-visible px-4">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            aria-label="Hugo — go to home"
            className="flex shrink-0 items-center rounded-lg p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            <img
              src={theme === "dark" ? logoMarkDark : logoMark}
              alt=""
              aria-hidden
              className="size-9 rounded-lg sm:size-10"
            />
          </button>

          <nav aria-label="Main" className="ml-4 hidden min-w-0 flex-1 items-center gap-1 md:flex">
            {VIEWS.map((item) => {
              const active = view === item.id
              const Icon = ICON_MAP[item.icon]
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                    active
                      ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon size={16} className="shrink-0 opacity-80" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Settings"
              title={aiBusy ? 'AI is working…' : aiReady ? 'Settings · AI assistant on' : 'Settings'}
              className="relative flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <IconSettings size={18} />
              {aiBusy ? (
                <Spinner
                  label="AI is working"
                  className="absolute -right-1 -top-1 size-3.5 text-indigo-600 dark:text-indigo-400"
                />
              ) : (
                aiReady && (
                  <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-green-500 ring-2 ring-slate-100 dark:ring-slate-950" />
                )
              )}
            </button>
          </div>
        </div>
      </header>

      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <ul className="mx-auto flex max-w-lg items-stretch">
          {VIEWS.map((item) => {
            const active = view === item.id
            const Icon = ICON_MAP[item.icon]
            return (
              <li key={item.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500 ${
                    active
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icon size={20} className="shrink-0" />
                  {item.shortLabel}
                  <span
                    aria-hidden
                    className={`mt-0.5 h-0.5 w-6 rounded-full ${active ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-transparent'}`}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
