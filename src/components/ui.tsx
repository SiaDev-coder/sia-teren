import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react'
import { parseRoNumber, roNumber } from '../lib/format'

// ---------- Mesaje scurte (toast) ----------
type ToastKind = 'info' | 'ok' | 'error'
interface ToastMsg {
  id: number
  text: string
  kind: ToastKind
}
let toasts: ToastMsg[] = []
const toastSubs = new Set<() => void>()
let toastSeq = 0
export function toast(text: string, kind: ToastKind = 'info', ms = kind === 'error' ? 6000 : 3000) {
  const id = ++toastSeq
  toasts = [...toasts, { id, text, kind }]
  toastSubs.forEach((f) => f())
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    toastSubs.forEach((f) => f())
  }, ms)
}
export function ToastHost() {
  const list = useSyncExternalStore(
    (cb) => {
      toastSubs.add(cb)
      return () => toastSubs.delete(cb)
    },
    () => toasts,
  )
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

// ---------- Dialog de confirmare ----------
interface ConfirmReq {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (v: boolean) => void
}
let confirmReq: ConfirmReq | null = null
const confirmSubs = new Set<() => void>()
export function confirmDialog(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq = { ...opts, resolve }
    confirmSubs.forEach((f) => f())
  })
}
function closeConfirm(v: boolean) {
  confirmReq?.resolve(v)
  confirmReq = null
  confirmSubs.forEach((f) => f())
}
export function ConfirmHost() {
  const req = useSyncExternalStore(
    (cb) => {
      confirmSubs.add(cb)
      return () => confirmSubs.delete(cb)
    },
    () => confirmReq,
  )
  if (!req) return null
  return (
    <Sheet title={req.title} onClose={() => closeConfirm(false)}>
      {req.message && <div className="stack">{req.message}</div>}
      <div className="actions">
        <button className="btn" onClick={() => closeConfirm(false)}>
          {req.cancelLabel ?? 'Renunță'}
        </button>
        <button className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={() => closeConfirm(true)} autoFocus>
          {req.confirmLabel ?? 'Confirmă'}
        </button>
      </div>
    </Sheet>
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

// ---------- Câmpuri de formular ----------
export function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  name?: string
  autoFocus?: boolean
  type?: 'text' | 'date' | 'search'
}) {
  return (
    <label className="field">
      <span>
        {props.label}
        {props.required && <span aria-hidden="true"> *</span>}
      </span>
      <input
        type={props.type ?? 'text'}
        name={props.name}
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        disabled={props.disabled}
        autoFocus={props.autoFocus}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <small className="hint">{props.hint}</small>}
    </label>
  )
}

export function TextArea(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  name?: string
  rows?: number
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <textarea
        name={props.name}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        rows={props.rows ?? 3}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}

/** Câmp numeric care acceptă virgulă zecimală (tastatură numerică pe telefon). */
export function NumberField(props: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  disabled?: boolean
  name?: string
  integer?: boolean
  allowNegative?: boolean
}) {
  const [text, setText] = useState(roNumber(props.value))
  const [focused, setFocused] = useState(false)
  const shown = focused ? text : roNumber(props.value)
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="text"
        inputMode={props.integer ? 'numeric' : props.allowNegative ? 'text' : 'decimal'}
        name={props.name}
        value={shown}
        disabled={props.disabled}
        onFocus={() => {
          setText(roNumber(props.value))
          setFocused(true)
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const raw = e.target.value
          const pattern = props.allowNegative ? /^-?[\d\s]*[,.]?\d*$/ : /^[\d\s]*[,.]?\d*$/
          if (raw !== '' && !pattern.test(raw)) return
          setText(raw)
          let n = parseRoNumber(raw)
          if (n !== null && props.integer) n = Math.round(n)
          props.onChange(n)
        }}
      />
    </label>
  )
}

export function SelectField<T extends string>(props: {
  label: string
  value: T
  options: readonly T[] | { value: T; label: string }[]
  onChange: (v: T) => void
  disabled?: boolean
  name?: string
}) {
  const opts = (props.options as readonly (T | { value: T; label: string })[]).map((o) =>
    typeof o === 'string' ? { value: o as T, label: o as string } : o,
  )
  return (
    <label className="field">
      <span>{props.label}</span>
      <select name={props.name} value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value as T)}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Section({
  title,
  count,
  defaultOpen = false,
  children,
  id,
}: {
  title: string
  count?: number | string
  defaultOpen?: boolean
  children: ReactNode
  id?: string
}) {
  return (
    <details className="section" open={defaultOpen} id={id}>
      <summary>
        {title}
        {count !== undefined && count !== 0 && count !== '' && <span className="count">({count})</span>}
      </summary>
      <div className="body">{children}</div>
    </details>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="progress">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
