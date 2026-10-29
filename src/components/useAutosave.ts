import { useCallback, useRef, useState } from 'react'
import { toast, errorMessage } from './ui'

export type SaveState = 'saved' | 'saving' | 'error'

/**
 * Salvare automată imediată: la fiecare modificare se scrie în IndexedDB înregistrarea completă,
 * în același moment (fără așteptare), ca nimic să nu se piardă la închidere, apel sau reîncărcare.
 * IndexedDB păstrează ordinea scrierilor pe același tabel, deci ultima valoare câștigă.
 */
export function useAutosave<T extends object>(initial: T, save: (full: T) => Promise<void>) {
  const [value, setValueState] = useState<T>(initial)
  const [state, setState] = useState<SaveState>('saved')
  const ref = useRef<T>(initial)
  const inFlight = useRef(0)
  const last = useRef<Promise<void>>(Promise.resolve())

  const write = useCallback(
    (full: T) => {
      inFlight.current++
      setState('saving')
      const p = save(full).then(
        () => {
          inFlight.current--
          if (inFlight.current === 0) setState('saved')
        },
        (e) => {
          inFlight.current--
          setState('error')
          toast(errorMessage(e), 'error')
        },
      )
      last.current = p
      return p
    },
    [save],
  )

  const update = useCallback(
    (patch: Partial<T>) => {
      ref.current = { ...ref.current, ...patch }
      setValueState(ref.current)
      void write(ref.current)
    },
    [write],
  )

  /** Înlocuiește valoarea locală fără a o scrie (ex. după o modificare făcută direct în baza de date). */
  const setValue = useCallback((v: T) => {
    ref.current = v
    setValueState(v)
  }, [])

  /** Așteaptă terminarea tuturor scrierilor pornite. */
  const flush = useCallback(async () => {
    await last.current
  }, [])

  /** Scrie valoarea curentă chiar dacă nu s-a modificat nimic (ex. ca raportul să existe înainte de o fotografie). */
  const saveNow = useCallback(() => write(ref.current), [write])

  return { value, setValue, update, flush, saveNow, state, current: ref }
}
