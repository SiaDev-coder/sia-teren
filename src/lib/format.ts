/** Formate românești pentru dată, oră și numere. */

const dateFmt = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' })
const longDateFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** AAAA-LL-ZZ în ora locală */
export function isoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'AAAA-LL-ZZ' → Date la miezul nopții, ora locală */
export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 'AAAA-LL-ZZ' → 'ZZ.LL.AAAA' (fără dependență de Intl, pentru CSV) */
export function roDate(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

export function roDateFromTs(ts: number): string {
  return dateFmt.format(new Date(ts)).replace(/\s/g, '')
}

export function roDateTime(ts: number): string {
  const d = new Date(ts)
  return `${roDateFromTs(ts)} ${timeFmt.format(d)}`
}

export function roLongDate(s: string): string {
  const txt = longDateFmt.format(parseIsoDate(s))
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

/** Număr cu virgulă zecimală, fără separator de mii (potrivit pentru CSV/Excel RO). */
export function roNumber(n: number | null | undefined, maxDecimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  const fixed = Number(n.toFixed(maxDecimals))
  return String(fixed).replace('.', ',')
}

/** Citește un număr scris cu virgulă sau punct. '' → null */
export function parseRoNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '' || t === '-' ) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${roNumber(v, v < 10 ? 1 : 0)} ${units[i]}`
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

/** Dată reală AAAA-LL-ZZ (ex. 2026-02-31 nu e validă), între anii 2000 și 2100. */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (y < 2000 || y > 2100) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** Acord numeral românesc: 1 fotografie, 2–19 fotografii, 20+ de fotografii. */
export function roCount(n: number, one: string, many: string): string {
  if (n === 1) return `1 ${one}`
  const rest = n % 100
  return n === 0 || (rest >= 1 && rest <= 19) ? `${n} ${many}` : `${n} de ${many}`
}
