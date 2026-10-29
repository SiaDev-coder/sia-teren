import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import { db, SCHEMA_VERSION } from '../db/db'
import { getSettings, setSetting, type Settings } from '../db/settings'
import {
  FINDING_CATEGORIES,
  FINDING_STATUSES,
  SEVERITIES,
  WEATHER_OPTIONS,
  type AudioNote,
  type DailyReport,
  type Finding,
  type Photo,
  type Project,
  type BaseRecord,
  type GpsFix,
  type Annotation,
} from '../db/types'
import { isValidIsoDate } from './format'
import { newId } from './ids'
import { extensionForMime } from './audio'
import { toStored } from '../db/binary'

export const BACKUP_APP = 'SIA Teren'

export interface BackupManifest {
  app: string
  schemaVersion: number
  appVersion: string
  createdAt: string
  counts: Record<string, number>
}

type PhotoMeta = Omit<Photo, 'blob'> & { file: string; mimeType: string }
type AudioMeta = Omit<AudioNote, 'blob'> & { file: string }

interface BackupData {
  projects: Project[]
  reports: DailyReport[]
  findings: Finding[]
  photos: PhotoMeta[]
  audio: AudioMeta[]
  settings: Partial<Omit<Settings, 'logo'>> & { logoFile?: string | null }
}

/** Setările care se copiază (nu și cele care țin de dispozitiv: model vocal, persistență). */
const PORTABLE_SETTINGS = ['companyName', 'userName', 'theme'] as const

async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer())
}

/** Se apelează doar după ce copia a fost efectiv trimisă sau descărcată. */
export async function markBackupDone(at = Date.now()): Promise<void> {
  await setSetting('lastBackupAt', at)
}

export async function createBackup(appVersion: string): Promise<{ blob: Blob; filename: string; manifest: BackupManifest }> {
  const [projects, reports, findings, photos, audio, settings] = await Promise.all([
    db.projects.toArray(),
    db.reports.toArray(),
    db.findings.toArray(),
    db.photos.toArray(),
    db.audio.toArray(),
    getSettings(),
  ])
  const files: Record<string, Uint8Array> = {}
  const photoMeta: PhotoMeta[] = []
  for (const p of photos) {
    const { blob, ...rest } = p
    const file = `foto/${p.id}.jpg`
    files[file] = await blobBytes(blob)
    photoMeta.push({ ...rest, file, mimeType: blob.type || 'image/jpeg' })
  }
  const audioMeta: AudioMeta[] = []
  for (const a of audio) {
    const { blob, ...rest } = a
    const file = `audio/${a.id}.${extensionForMime(a.mimeType)}`
    files[file] = await blobBytes(blob)
    audioMeta.push({ ...rest, file })
  }
  const s: BackupData['settings'] = {}
  for (const k of PORTABLE_SETTINGS) (s as Record<string, unknown>)[k] = settings[k]
  if (settings.logo) {
    files['foto/logo.png'] = await blobBytes(settings.logo)
    s.logoFile = 'foto/logo.png'
  }
  const data: BackupData = { projects, reports, findings, photos: photoMeta, audio: audioMeta, settings: s }
  const now = new Date()
  const manifest: BackupManifest = {
    app: BACKUP_APP,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    createdAt: now.toISOString(),
    counts: {
      proiecte: projects.length,
      rapoarte: reports.length,
      constatari: findings.length,
      fotografii: photos.length,
      audio: audio.length,
    },
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  files['date.json'] = strToU8(JSON.stringify(data))
  // fotografiile și audio sunt deja comprimate: le stocăm fără recompresie (mai rapid)
  const zipInput: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  for (const [k, v] of Object.entries(files)) zipInput[k] = [v, { level: k.endsWith('.json') ? 6 : 0 }]
  const zipped = zipSync(zipInput)
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return {
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    filename: `SIA-Teren_copie_${stamp}.zip`,
    manifest,
  }
}

export class BackupError extends Error {}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function checkBase(r: unknown, what: string): asserts r is BaseRecord {
  if (
    !isObj(r) ||
    typeof r.id !== 'string' ||
    !r.id ||
    typeof r.createdAt !== 'number' ||
    typeof r.updatedAt !== 'number' ||
    !(r.deletedAt === null || typeof r.deletedAt === 'number')
  ) {
    throw new BackupError(`Fișierul conține o înregistrare invalidă (${what}).`)
  }
}

// ---------- Normalizare: orice câmp lipsă sau de tip greșit primește o valoare sigură ----------
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d)
const rec = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {})

function baseOf(r: Record<string, unknown>): BaseRecord {
  return { id: r.id as string, createdAt: r.createdAt as number, updatedAt: r.updatedAt as number, deletedAt: (r.deletedAt as number | null) ?? null }
}

function gpsOf(v: unknown): GpsFix | null {
  const g = rec(v)
  const lat = num(g.lat)
  const lng = num(g.lng)
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng, accuracy: num(g.accuracy) ?? 0, at: num(g.at) ?? 0 }
}

function normProject(v: unknown): Project {
  const r = rec(v)
  return {
    ...baseOf(r),
    name: str(r.name).trim() || 'Proiect fără nume',
    beneficiary: str(r.beneficiary),
    contractNo: str(r.contractNo),
    lot: str(r.lot),
    locality: str(r.locality),
    county: str(r.county),
    contractor: str(r.contractor),
    supervisor: str(r.supervisor),
    startDate: isValidIsoDate(str(r.startDate)) ? str(r.startDate) : '',
    archived: r.archived === 1 ? 1 : 0,
    lastUsedAt: num(r.lastUsedAt) ?? (r.updatedAt as number),
  }
}

function normReport(v: unknown): DailyReport {
  const r = rec(v)
  if (typeof r.projectId !== 'string' || !isValidIsoDate(str(r.date))) throw new BackupError('Raport zilnic invalid în copie (proiect sau dată).')
  const rows = <T>(x: unknown, f: (o: Record<string, unknown>) => T) => arr(x).map((o) => f(rec(o)))
  return {
    ...baseOf(r),
    projectId: r.projectId,
    date: str(r.date),
    weather: arr(r.weather).filter((w): w is (typeof WEATHER_OPTIONS)[number] => WEATHER_OPTIONS.includes(w as never)),
    tempMorning: num(r.tempMorning),
    tempNoon: num(r.tempNoon),
    personnel: rows(r.personnel, (o) => ({ id: str(o.id) || newId(), category: str(o.category), count: num(o.count) })),
    equipment: rows(r.equipment, (o) => ({ id: str(o.id) || newId(), name: str(o.name), count: num(o.count), hours: num(o.hours) })),
    activities: rows(r.activities, (o) => ({ id: str(o.id) || newId(), description: str(o.description), quantity: num(o.quantity), unit: str(o.unit), location: str(o.location) })),
    materials: rows(r.materials, (o) => ({ id: str(o.id) || newId(), name: str(o.name), quantity: num(o.quantity), unit: str(o.unit), document: str(o.document) })),
    problems: str(r.problems),
    instructions: str(r.instructions),
    instructionsFrom: str(r.instructionsFrom),
    visits: str(r.visits),
    safety: str(r.safety),
    notes: str(r.notes),
    status: r.status === 'final' ? 'final' : 'draft',
    finalizedAt: num(r.finalizedAt),
  }
}

function normFinding(v: unknown): Finding {
  const r = rec(v)
  if (typeof r.projectId !== 'string') throw new BackupError('Constatare invalidă în copie (fără proiect).')
  const status = oneOf(r.status, FINDING_STATUSES, 'Deschisă')
  const history = arr(r.history)
    .map(rec)
    .filter((h) => FINDING_STATUSES.includes(h.to as never) && num(h.at) !== null)
    .map((h) => ({ from: FINDING_STATUSES.includes(h.from as never) ? (h.from as Finding['status']) : null, to: h.to as Finding['status'], at: h.at as number }))
  return {
    ...baseOf(r),
    projectId: r.projectId,
    title: str(r.title).trim() || 'Constatare fără titlu',
    description: str(r.description),
    category: oneOf(r.category, FINDING_CATEGORIES, 'altele'),
    severity: oneOf(r.severity, SEVERITIES, 'minoră'),
    location: str(r.location),
    gps: r.gps ? gpsOf(r.gps) : null,
    responsible: str(r.responsible),
    dueDate: isValidIsoDate(str(r.dueDate)) ? str(r.dueDate) : '',
    status,
    history: history.length ? history : [{ from: null, to: status, at: r.createdAt as number }],
  }
}

function owner(r: Record<string, unknown>, what: string) {
  if ((r.ownerType !== 'report' && r.ownerType !== 'finding') || typeof r.ownerId !== 'string' || typeof r.projectId !== 'string')
    throw new BackupError(`${what} fără raport/constatare în copie.`)
  return { projectId: r.projectId, ownerType: r.ownerType as 'report' | 'finding', ownerId: r.ownerId }
}

function normAnnotations(v: unknown): Annotation[] {
  return arr(v)
    .map(rec)
    .filter((a) => ['arrow', 'rect', 'ellipse', 'free', 'text'].includes(a.tool as string) && Array.isArray(a.points))
    .map((a) => ({
      id: str(a.id) || newId(),
      tool: a.tool as Annotation['tool'],
      color: str(a.color, '#e53935'),
      points: arr(a.points)
        .map(rec)
        .filter((p) => num(p.x) !== null && num(p.y) !== null)
        .map((p) => ({ x: p.x as number, y: p.y as number })),
      ...(typeof a.text === 'string' ? { text: a.text } : {}),
    }))
}

export interface ParsedBackup {
  manifest: BackupManifest
  projects: Project[]
  reports: DailyReport[]
  findings: Finding[]
  photos: Photo[]
  audio: AudioNote[]
  settings: Partial<Settings>
}

/** Citește și validează complet o copie de siguranță, fără să scrie nimic în baza de date. */
export async function parseBackup(file: Blob): Promise<ParsedBackup> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new BackupError('Fișierul nu este o arhivă .zip validă sau este deteriorat.')
  }
  const mf = entries['manifest.json']
  const dj = entries['date.json']
  if (!mf || !dj) throw new BackupError('Fișierul nu este o copie de siguranță SIA Teren (lipsesc manifest.json / date.json).')
  let manifest: BackupManifest
  let data: BackupData
  try {
    manifest = JSON.parse(strFromU8(mf))
    data = JSON.parse(strFromU8(dj))
  } catch {
    throw new BackupError('Copia de siguranță este deteriorată (date ilizibile).')
  }
  if (!isObj(manifest) || manifest.app !== BACKUP_APP) throw new BackupError('Fișierul nu provine din aplicația SIA Teren.')
  if (typeof manifest.createdAt !== 'string' || Number.isNaN(Date.parse(manifest.createdAt))) {
    throw new BackupError('Copia de siguranță este deteriorată (data copiei lipsește sau e invalidă).')
  }
  if (typeof manifest.schemaVersion !== 'number' || manifest.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError('Copia a fost făcută cu o versiune mai nouă a aplicației. Actualizează aplicația și încearcă din nou.')
  }
  if (!isObj(data)) throw new BackupError('Copia de siguranță este deteriorată.')
  const arr = (k: keyof BackupData) => {
    const v = data[k]
    if (!Array.isArray(v)) throw new BackupError(`Copia de siguranță este incompletă (${k}).`)
    return v as unknown[]
  }
  const projects = arr('projects')
  const reports = arr('reports')
  const findings = arr('findings')
  const photosM = arr('photos')
  const audioM = arr('audio')
  for (const [list, what] of [[projects, 'proiect'], [reports, 'raport'], [findings, 'constatare'], [photosM, 'fotografie'], [audioM, 'notă vocală']] as const)
    list.forEach((r) => checkBase(r, what))
  const photos: Photo[] = photosM.map((v) => {
    const r = rec(v)
    const f = r.file
    const bytes = typeof f === 'string' ? entries[f] : undefined
    if (!bytes) throw new BackupError(`Lipsește fișierul fotografiei ${String(f)} din arhivă.`)
    const width = num(r.width)
    const height = num(r.height)
    if (!width || !height || width <= 0 || height <= 0) throw new BackupError('Fotografie cu dimensiuni invalide în copie.')
    return {
      ...baseOf(r),
      ...owner(r, 'Fotografie'),
      role: oneOf(r.role, ['general', 'before', 'after'] as const, 'general'),
      blob: new Blob([bytes as BlobPart], { type: str(r.mimeType, 'image/jpeg') }),
      width,
      height,
      takenAt: num(r.takenAt) ?? (r.createdAt as number),
      gps: r.gps ? gpsOf(r.gps) : null,
      annotations: normAnnotations(r.annotations),
      caption: str(r.caption),
    }
  })
  const audio: AudioNote[] = audioM.map((v) => {
    const r = rec(v)
    const f = r.file
    const bytes = typeof f === 'string' ? entries[f] : undefined
    if (!bytes) throw new BackupError(`Lipsește fișierul audio ${String(f)} din arhivă.`)
    const mimeType = str(r.mimeType, 'audio/mp4')
    return {
      ...baseOf(r),
      ...owner(r, 'Notă vocală'),
      blob: new Blob([bytes as BlobPart], { type: mimeType }),
      mimeType,
      durationSec: num(r.durationSec) ?? 0,
      transcript: str(r.transcript),
      transcriptStatus: oneOf(r.transcriptStatus, ['none', 'done', 'error'] as const, 'none'),
      transcriptError: str(r.transcriptError),
    }
  })
  const settings: Partial<Settings> = {}
  if (isObj(data.settings)) {
    for (const k of PORTABLE_SETTINGS) {
      const v = (data.settings as Record<string, unknown>)[k]
      if (typeof v === 'string') (settings as Record<string, unknown>)[k] = v
    }
    const lf = data.settings.logoFile
    if (typeof lf === 'string' && entries[lf]) settings.logo = new Blob([entries[lf] as BlobPart], { type: 'image/png' })
  }
  return {
    manifest,
    projects: projects.map(normProject),
    reports: reports.map(normReport),
    findings: findings.map(normFinding),
    photos,
    audio,
    settings,
  }
}

export type RestoreMode = 'replace' | 'merge'

export interface RestoreResult {
  added: number
  updated: number
  skipped: number
}

/** Restaurează o copie validată. Totul într-o singură tranzacție: ori reușește complet, ori nu schimbă nimic. */
export async function restoreBackup(p: ParsedBackup, mode: RestoreMode): Promise<RestoreResult> {
  const res: RestoreResult = { added: 0, updated: 0, skipped: 0 }
  // conversia binarelor se face înainte de tranzacție (operații asincrone în afara IndexedDB)
  const photos = await Promise.all(p.photos.map(async (x) => ({ ...x, blob: (await toStored(x.blob)) as unknown as Blob })))
  const audio = await Promise.all(p.audio.map(async (x) => ({ ...x, blob: (await toStored(x.blob)) as unknown as Blob })))
  const settings: Record<string, unknown> = { ...p.settings }
  if (p.settings.logo) settings.logo = await toStored(p.settings.logo)
  p = { ...p, photos, audio }
  const tables = [db.projects, db.reports, db.findings, db.photos, db.audio, db.settings]
  await db.transaction('rw', tables, async () => {
    if (mode === 'replace') {
      await Promise.all([db.projects.clear(), db.reports.clear(), db.findings.clear(), db.photos.clear(), db.audio.clear()])
      await db.projects.bulkAdd(p.projects)
      await db.reports.bulkAdd(p.reports)
      await db.findings.bulkAdd(p.findings)
      await db.photos.bulkAdd(p.photos)
      await db.audio.bulkAdd(p.audio)
      res.added = p.projects.length + p.reports.length + p.findings.length + p.photos.length + p.audio.length
      for (const [k, v] of Object.entries(settings)) await db.settings.put({ key: k, value: v })
    } else {
      const merge = async <T extends BaseRecord>(table: import('dexie').Table<T, string>, items: T[]) => {
        for (const it of items) {
          const cur = await table.get(it.id)
          if (!cur) {
            await table.add(it)
            res.added++
          } else if (it.updatedAt > cur.updatedAt) {
            await table.put(it)
            res.updated++
          } else res.skipped++
        }
      }
      await merge(db.projects as unknown as import('dexie').Table<Project, string>, p.projects)
      await merge(db.reports as unknown as import('dexie').Table<DailyReport, string>, p.reports)
      await merge(db.findings as unknown as import('dexie').Table<Finding, string>, p.findings)
      await merge(db.photos as unknown as import('dexie').Table<Photo, string>, p.photos)
      await merge(db.audio as unknown as import('dexie').Table<AudioNote, string>, p.audio)
      // rapoarte duplicate pe aceeași zi (create separat pe două telefoane): păstrăm unicitatea
      const all = (await db.reports.toArray()).filter((r) => r.deletedAt === null)
      const seen = new Map<string, DailyReport>()
      for (const r of all.sort((a, b) => b.updatedAt - a.updatedAt)) {
        const key = `${r.projectId}|${r.date}`
        if (seen.has(key)) await db.reports.update(r.id, { deletedAt: Date.now(), updatedAt: Date.now() })
        else seen.set(key, r)
      }
    }
    await db.settings.put({ key: 'lastDataChangeAt', value: Date.now() })
  })
  return res
}
