import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import { db, SCHEMA_VERSION } from '../db/db'
import { getSettings, setSetting, type Settings } from '../db/settings'
import type { AudioNote, DailyReport, Finding, Photo, Project, BaseRecord } from '../db/types'
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
  await setSetting('lastBackupAt', now.getTime())
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
  projects.forEach((r) => {
    checkBase(r, 'proiect')
    if (typeof (r as Project).name !== 'string') throw new BackupError('Proiect fără denumire în copie.')
  })
  reports.forEach((r) => {
    checkBase(r, 'raport')
    const x = r as DailyReport
    if (typeof x.projectId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || !Array.isArray(x.personnel)) {
      throw new BackupError('Raport zilnic invalid în copie.')
    }
  })
  findings.forEach((r) => {
    checkBase(r, 'constatare')
    const x = r as Finding
    if (typeof x.projectId !== 'string' || typeof x.title !== 'string' || !Array.isArray(x.history)) {
      throw new BackupError('Constatare invalidă în copie.')
    }
  })
  const photos: Photo[] = photosM.map((r) => {
    checkBase(r, 'fotografie')
    const { file: f, mimeType, ...rest } = r as PhotoMeta
    const bytes = typeof f === 'string' ? entries[f] : undefined
    if (!bytes) throw new BackupError(`Lipsește fișierul fotografiei ${String(f)} din arhivă.`)
    return { ...rest, blob: new Blob([bytes as BlobPart], { type: mimeType || 'image/jpeg' }) } as Photo
  })
  const audio: AudioNote[] = audioM.map((r) => {
    checkBase(r, 'notă vocală')
    const { file: f, ...rest } = r as AudioMeta
    const bytes = typeof f === 'string' ? entries[f] : undefined
    if (!bytes) throw new BackupError(`Lipsește fișierul audio ${String(f)} din arhivă.`)
    return { ...rest, blob: new Blob([bytes as BlobPart], { type: rest.mimeType }) } as AudioNote
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
    projects: projects as Project[],
    reports: reports as DailyReport[],
    findings: findings as Finding[],
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
