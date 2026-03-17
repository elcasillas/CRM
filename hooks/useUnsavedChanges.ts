import { useEffect } from 'react'

/** Registers a beforeunload warning when isDirty is true (browser close/reload/back). */
export function useBeforeUnload(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])
}

/** Returns true when current form values differ from the initial snapshot. */
export function formIsDirty<T>(current: T, initial: T | null | undefined): boolean {
  if (initial == null) return false
  return JSON.stringify(current) !== JSON.stringify(initial)
}
