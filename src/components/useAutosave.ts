import { useCallback, useEffect, useRef, useState } from 'react'
import { toast, errorMessage } from './ui'

export type SaveState = 'saved' | 'saving' | 'error'

/**
 * Salvare automată: fiecare modificare se scrie în IndexedDB după 250 ms de liniște
 * și imediat la ascunderea aplicației (apel, schimbare de aplicație, închidere).
 */
export function useAutosave<T extends object>(initial: T | null, save: (patch: Partial<T>) => Promise<void>) {
  const [value, setValue] = useState<T | null>(initial)
  const [state, setState] = useState<SaveState>('saved')
  const pending = useRef<Partial<T>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  }, [save])

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const p = pending.current
    if (Object.keys(p).length === 0) return
    pending.current = {}
    try {
      await saveRef.current(p)
      if (Object.keys(pending.current).length === 0) setState('saved')
    } catch (e) {
      pending.current = { ...p, ...pending.current }
      setState('error')
      toast(errorMessage(e), 'error')
    }
  }, [])

  const update = useCallback(
    (patch: Partial<T>) => {
      setValue((v) => (v ? { ...v, ...patch } : v))
      pending.current = { ...pending.current, ...patch }
      setState('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), 250)
    },
    [flush],
  )

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onPageHide = () => void flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      void flush()
    }
  }, [flush])

  return { value, setValue, update, flush, state }
}
