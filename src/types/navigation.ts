/**
 * The app's four top-level destinations.
 *
 * Deliberately not a router: `App` stays a state machine, and every other
 * screen (setup, an active run, a result, a quiz's history, a stored attempt)
 * is a sub-state layered over one of these rather than a fifth destination.
 */
export type View = 'home' | 'create' | 'library' | 'results'

/** Label and icon key for each destination — one source of truth for wording. */
export const VIEWS: { id: View; label: string; shortLabel: string; icon: 'home' | 'plus' | 'library' | 'chart' }[] = [
  { id: 'home', label: 'Home', shortLabel: 'Home', icon: 'home' },
  { id: 'create', label: 'Create Quiz', shortLabel: 'Create', icon: 'plus' },
  { id: 'library', label: 'Quiz Library', shortLabel: 'Library', icon: 'library' },
  { id: 'results', label: 'Results', shortLabel: 'Results', icon: 'chart' },
]
