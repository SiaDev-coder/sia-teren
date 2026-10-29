import { useSyncExternalStore } from 'react'

/** Rutare pe hash (#/...): merge offline și la deschiderea directă a oricărui link, pe orice găzduire. */
function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const getHash = () => window.location.hash || '#/'

export function useHashPath(): string {
  const h = useSyncExternalStore(subscribe, getHash, () => '#/')
  return h.replace(/^#/, '').split('?')[0] || '/'
}

export function useQuery(): URLSearchParams {
  const h = useSyncExternalStore(subscribe, getHash, () => '#/')
  const q = h.split('?')[1] ?? ''
  return new URLSearchParams(q)
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path}`
  if (opts.replace) {
    history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else window.location.hash = path
}


/** Potrivește un tipar de forma /proiect/:id/raport/:date */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const out: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) out[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return out
}
