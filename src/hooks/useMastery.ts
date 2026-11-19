import { useCallback, useEffect, useState } from 'react'
import type { QuestionMastery } from '../types/quiz'
import { apiClearMasteryScope, apiGetState, apiLoadMastery, apiSetState } from '../services/api'

const ENABLED_SCOPES_KEY = 'mastery.enabledScopes'

export function useMastery() {
  const [mastery, setMastery] = useState<Record<string, QuestionMastery>>({})
  const [enabledScopes, setEnabledScopesState] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const persistEnabledScopes = useCallback(async (next: string[]) => {
    setEnabledScopesState(next)
    await apiSetState(ENABLED_SCOPES_KEY, next).catch(() => {})
  }, [])

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const [m, enabled] = await Promise.all([
        apiLoadMastery(),
        apiGetState<string[]>(ENABLED_SCOPES_KEY).catch(() => [] as string[]),
      ])
      setMastery(m)
      setEnabledScopesState(
        Array.isArray(enabled) ? enabled.filter((x): x is string => typeof x === 'string') : [],
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load mastery')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isScopeEnabled = useCallback(
    (scopeId: string) => enabledScopes.includes(scopeId),
    [enabledScopes],
  )

  const setScopeEnabled = useCallback(
    async (scopeId: string, enabled: boolean) => {
      const next = enabled
        ? Array.from(new Set([...enabledScopes, scopeId]))
        : enabledScopes.filter((id) => id !== scopeId)
      await persistEnabledScopes(next)
    },
    [enabledScopes, persistEnabledScopes],
  )

  const resetScopeMastery = useCallback(async (scopeId: string) => {
    const nextMastery = await apiClearMasteryScope(scopeId)
    setMastery(nextMastery)
    // ensure enabled scopes/derived views stay in sync
    await refresh().catch(() => {})
  }, [refresh])

  return { mastery, enabledScopes, loading, error, refresh, isScopeEnabled, setScopeEnabled, resetScopeMastery }
}
