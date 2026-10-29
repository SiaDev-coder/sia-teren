import { db } from './db'
import { toStored } from './binary'
import { getSetting, setSetting } from './settings'
import { newId } from '../lib/ids'
import { isoDate } from '../lib/format'
import type {
  AudioNote,
  BaseRecord,
  DailyReport,
  Finding,
  FindingStatus,
  OwnerType,
  Photo,
  PhotoRole,
  Project,
  GpsFix,
  Annotation,
} from './types'

export const TRASH_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

export type TableName = 'projects' | 'reports' | 'findings' | 'photos' | 'audio'

function base(now = Date.now()): BaseRecord {
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null }
}

let persistAsked = false
/**
 * Marchează că există date noi (pentru amintirea de backup) și cere stocare persistentă după prima salvare.
 * Nu se așteaptă și nu se apelează din interiorul unei tranzacții (navigator.storage.persist() nu e IndexedDB).
 */
function markChanged(): void {
  const at = Date.now()
  void (async () => {
    try {
      await setSetting('lastDataChangeAt', at)
      if (persistAsked) return
      persistAsked = true
      if (await getSetting('persistRequested')) return
      let granted: boolean | null = null
      try {
        if (navigator.storage?.persist) granted = await navigator.storage.persist()
      } catch {
        granted = null
      }
      await setSetting('persistRequested', true)
      await setSetting('persistGranted', granted)
    } catch (e) {
      console.error('Marcare modificări:', e)
    }
  })()
}

// ---------- Proiecte ----------

export type ProjectInput = Pick<
  Project,
  'name' | 'beneficiary' | 'contractNo' | 'lot' | 'locality' | 'county' | 'contractor' | 'supervisor' | 'startDate'
>

export async function createProject(input: ProjectInput): Promise<Project> {
  const now = Date.now()
  const p: Project = { ...base(now), ...input, archived: 0, lastUsedAt: now }
  await db.projects.add(p)
  markChanged()
  return p
}

export async function updateProject(id: string, patch: Partial<ProjectInput>): Promise<void> {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() })
  markChanged()
}

export async function setProjectArchived(id: string, archived: boolean): Promise<void> {
  await db.projects.update(id, { archived: archived ? 1 : 0, updatedAt: Date.now() })
  markChanged()
}

export async function touchProject(id: string): Promise<void> {
  // Nu schimbă updatedAt: „ultima folosire” nu e o modificare de date.
  await db.projects.update(id, { lastUsedAt: Date.now() })
}

export async function activeProjects(): Promise<Project[]> {
  const all = await db.projects.toArray()
  return all.filter((p) => p.deletedAt === null && p.archived === 0).sort((a, b) => b.lastUsedAt - a.lastUsedAt)
}

export async function lastUsedProject(): Promise<Project | undefined> {
  return (await activeProjects())[0]
}

// ---------- Rapoarte zilnice ----------

export function emptyReport(projectId: string, date: string, now = Date.now()): DailyReport {
  return {
    ...base(now),
    projectId,
    date,
    weather: [],
    tempMorning: null,
    tempNoon: null,
    personnel: [],
    equipment: [],
    activities: [],
    materials: [],
    problems: '',
    instructions: '',
    instructionsFrom: '',
    visits: '',
    safety: '',
    notes: '',
    status: 'draft',
    finalizedAt: null,
  }
}

export async function findReport(projectId: string, date: string): Promise<DailyReport | undefined> {
  const list = await db.reports.where('[projectId+date]').equals([projectId, date]).toArray()
  return list.find((r) => r.deletedAt === null)
}

/** Data e unică per proiect: dacă raportul există deja, îl întoarce pe cel existent. */
export async function getOrCreateReport(projectId: string, date: string = isoDate()): Promise<DailyReport> {
  const r = await db.transaction('rw', db.reports, async () => {
    const existing = await findReport(projectId, date)
    if (existing) return { r: existing, created: false }
    const fresh = emptyReport(projectId, date)
    await db.reports.add(fresh)
    return { r: fresh, created: true }
  })
  if (r.created) markChanged()
  return r.r
}

/**
 * Salvarea automată a raportului: scrie doar câmpurile modificate peste versiunea din baza de date
 * (două ferestre deschise nu își șterg una alteia modificările). Prima scriere creează raportul;
 * dacă între timp ziua a fost creată în altă fereastră, modificarea se combină în acela, care este întors.
 * Un raport finalizat nu poate fi modificat.
 */
export async function saveReport(patch: Partial<DailyReport>, full: DailyReport): Promise<DailyReport | void> {
  const { id: _i, status: _s, finalizedAt: _f, deletedAt: _d, createdAt: _c, projectId: _p, date: _dt, ...fields } = patch
  void [_i, _s, _f, _d, _c, _p, _dt]
  const adopted = await db.transaction('rw', db.reports, async () => {
    const cur = await db.reports.get(full.id)
    if (cur) {
      if (cur.status === 'final') throw new Error('Raportul este finalizat. Apasă „Redeschide” pentru modificări.')
      await db.reports.put({ ...cur, ...fields, updatedAt: Date.now() })
      return undefined
    }
    const other = await findReport(full.projectId, full.date)
    if (other) {
      if (other.status === 'final') throw new Error('Raportul acestei zile a fost finalizat între timp. Redeschide-l pentru modificări.')
      const merged = { ...other, ...fields, updatedAt: Date.now() }
      await db.reports.put(merged)
      return merged
    }
    await db.reports.put({ ...full, status: 'draft', finalizedAt: null, deletedAt: null, updatedAt: Date.now() })
    return undefined
  })
  markChanged()
  return adopted
}

export async function updateReport(id: string, patch: Partial<DailyReport>): Promise<void> {
  const r = await db.reports.get(id)
  if (!r) throw new Error('Raportul nu mai există.')
  if (r.status === 'final' && !('status' in patch)) throw new Error('Raportul este finalizat. Apasă „Redeschide” pentru modificări.')
  await db.reports.update(id, { ...patch, updatedAt: Date.now() })
  markChanged()
}

/** Cel mai recent raport anterior care are personal sau utilaje (rapoartele goale sunt ignorate). */
export async function previousReport(projectId: string, date: string): Promise<DailyReport | undefined> {
  const list = await db.reports.where('projectId').equals(projectId).toArray()
  return list
    .filter((r) => r.deletedAt === null && r.date < date && (r.personnel.length > 0 || r.equipment.length > 0))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
}

/** Copiază personalul și utilajele din cel mai recent raport anterior. Întoarce false dacă nu există. */
export async function copyFromPrevious(reportId: string): Promise<boolean> {
  const r = await db.reports.get(reportId)
  if (!r) return false
  const prev = await previousReport(r.projectId, r.date)
  if (!prev) return false
  await updateReport(reportId, {
    personnel: prev.personnel.map((p) => ({ ...p, id: newId() })),
    equipment: prev.equipment.map((e) => ({ ...e, id: newId() })),
  })
  return true
}

export async function finalizeReport(id: string): Promise<void> {
  await updateReport(id, { status: 'final', finalizedAt: Date.now() })
}

export async function reopenReport(id: string): Promise<void> {
  await updateReport(id, { status: 'draft', finalizedAt: null })
}

// ---------- Constatări ----------

export type FindingInput = Pick<
  Finding,
  'title' | 'description' | 'category' | 'severity' | 'location' | 'gps' | 'responsible' | 'dueDate'
>

export async function createFinding(projectId: string, input: FindingInput): Promise<Finding> {
  const now = Date.now()
  const f: Finding = {
    ...base(now),
    projectId,
    ...input,
    status: 'Deschisă',
    history: [{ from: null, to: 'Deschisă', at: now }],
  }
  await db.findings.add(f)
  markChanged()
  return f
}

export async function updateFinding(id: string, patch: Partial<FindingInput>): Promise<void> {
  await db.findings.update(id, { ...patch, updatedAt: Date.now() })
  markChanged()
}

/**
 * Salvarea automată a unei constatări: scrie câmpurile editabile; starea, istoricul și ștergerea
 * rămân cele din baza de date. Un titlu golit nu se salvează (titlul e obligatoriu).
 */
export async function saveFinding(patch: Partial<Finding>, f: Pick<Finding, 'id'>): Promise<void> {
  const { id: _i, status: _s, history: _h, deletedAt: _d, createdAt: _c, projectId: _p, ...fields } = patch
  void [_i, _s, _h, _d, _c, _p]
  if (fields.title !== undefined && !fields.title.trim()) delete fields.title
  await db.transaction('rw', db.findings, async () => {
    const cur = await db.findings.get(f.id)
    if (!cur) throw new Error('Constatarea nu mai există.')
    await db.findings.put({ ...cur, ...fields, updatedAt: Date.now() })
  })
  markChanged()
}

export async function changeFindingStatus(id: string, to: FindingStatus): Promise<void> {
  await db.transaction('rw', db.findings, async () => {
    const f = await db.findings.get(id)
    if (!f) throw new Error('Constatarea nu mai există.')
    if (f.status === to) return
    const now = Date.now()
    await db.findings.update(id, {
      status: to,
      history: [...f.history, { from: f.status, to, at: now }],
      updatedAt: now,
    })
  })
  markChanged()
}

// ---------- Fotografii ----------

export interface NewPhoto {
  projectId: string
  ownerType: OwnerType
  ownerId: string
  role: PhotoRole
  blob: Blob
  width: number
  height: number
  takenAt: number
  gps: GpsFix | null
}

/** Fotografiile și notele vocale nu se mai pot adăuga într-un raport finalizat. */
async function assertOwnerEditable(ownerType: OwnerType, ownerId: string): Promise<void> {
  if (ownerType !== 'report') return
  const r = await db.reports.get(ownerId)
  if (r?.status === 'final') throw new Error('Raportul este finalizat. Apasă „Redeschide” pentru modificări.')
}

export async function addPhoto(p: NewPhoto): Promise<Photo> {
  await assertOwnerEditable(p.ownerType, p.ownerId)
  const photo: Photo = { ...base(), ...p, annotations: [], caption: '' }
  await db.photos.add({ ...photo, blob: (await toStored(p.blob)) as unknown as Blob })
  markChanged()
  return photo
}

export async function updatePhoto(id: string, patch: Partial<Pick<Photo, 'annotations' | 'caption' | 'gps'>>): Promise<void> {
  await db.photos.update(id, { ...patch, updatedAt: Date.now() })
  markChanged()
}

export async function setAnnotations(id: string, annotations: Annotation[]): Promise<void> {
  await updatePhoto(id, { annotations })
}

export async function photosFor(ownerType: OwnerType, ownerId: string): Promise<Photo[]> {
  const list = await db.photos.where('[ownerType+ownerId]').equals([ownerType, ownerId]).toArray()
  return list.filter((p) => p.deletedAt === null).sort((a, b) => a.takenAt - b.takenAt)
}

// ---------- Note vocale ----------

export async function addAudio(
  a: Pick<AudioNote, 'projectId' | 'ownerType' | 'ownerId' | 'blob' | 'mimeType' | 'durationSec'>,
): Promise<AudioNote> {
  await assertOwnerEditable(a.ownerType, a.ownerId)
  const note: AudioNote = { ...base(), ...a, transcript: '', transcriptStatus: 'none', transcriptError: '' }
  await db.audio.add({ ...note, blob: (await toStored(a.blob)) as unknown as Blob })
  markChanged()
  return note
}

export async function updateAudio(
  id: string,
  patch: Partial<Pick<AudioNote, 'transcript' | 'transcriptStatus' | 'transcriptError'>>,
): Promise<void> {
  await db.audio.update(id, { ...patch, updatedAt: Date.now() })
  markChanged()
}

export async function audioFor(ownerType: OwnerType, ownerId: string): Promise<AudioNote[]> {
  const list = await db.audio.where('[ownerType+ownerId]').equals([ownerType, ownerId]).toArray()
  return list.filter((a) => a.deletedAt === null).sort((a, b) => a.createdAt - b.createdAt)
}

// ---------- Coș (ștergere logică) ----------

function table(name: TableName) {
  return db[name] as unknown as import('dexie').Table<BaseRecord, string>
}

export async function softDelete(name: TableName, id: string): Promise<void> {
  const now = Date.now()
  await table(name).update(id, { deletedAt: now, updatedAt: now })
  markChanged()
}

export class RestoreConflictError extends Error {}

export async function restore(name: TableName, id: string): Promise<void> {
  const rec = (await table(name).get(id)) as (BaseRecord & { projectId?: string; ownerType?: OwnerType; ownerId?: string }) | undefined
  if (!rec) return
  if (rec.projectId && name !== 'projects') {
    const p = await db.projects.get(rec.projectId)
    if (!p || p.deletedAt !== null) throw new RestoreConflictError('Proiectul acestui element este în Coș. Recuperează întâi proiectul.')
  }
  if ((name === 'photos' || name === 'audio') && rec.ownerId && rec.ownerType) {
    const owner = rec.ownerType === 'report' ? await db.reports.get(rec.ownerId) : await db.findings.get(rec.ownerId)
    if (!owner || owner.deletedAt !== null)
      throw new RestoreConflictError(`${rec.ownerType === 'report' ? 'Raportul' : 'Constatarea'} acestui element este în Coș. Recuperează-l întâi.`)
    if (rec.ownerType === 'report' && (owner as DailyReport).status === 'final')
      throw new RestoreConflictError('Raportul este finalizat. Redeschide-l înainte de a recupera elementul.')
  }
  if (name === 'reports') {
    const r = await db.reports.get(id)
    if (r && (await findReport(r.projectId, r.date))) {
      throw new RestoreConflictError('Există deja un raport pentru aceeași zi în acest proiect. Șterge-l pe acela înainte de restaurare.')
    }
  }
  await table(name).update(id, { deletedAt: null, updatedAt: Date.now() })
  markChanged()
}

/** Șterge definitiv o înregistrare și tot ce ține de ea. */
export async function hardDelete(name: TableName, id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.reports, db.findings, db.photos, db.audio], async () => {
    if (name === 'projects') {
      const reports = await db.reports.where('projectId').equals(id).primaryKeys()
      const findings = await db.findings.where('projectId').equals(id).primaryKeys()
      await db.reports.bulkDelete(reports)
      await db.findings.bulkDelete(findings)
      await db.photos.where('projectId').equals(id).delete()
      await db.audio.where('projectId').equals(id).delete()
      await db.projects.delete(id)
    } else if (name === 'reports' || name === 'findings') {
      await db.photos.where('ownerId').equals(id).delete()
      await db.audio.where('ownerId').equals(id).delete()
      await db[name].delete(id)
    } else {
      await table(name).delete(id)
    }
  })
}

/** Golește Coșul de elementele mai vechi de 30 de zile. Întoarce numărul de elemente șterse. */
export async function purgeTrash(now = Date.now()): Promise<number> {
  const limit = now - TRASH_DAYS * DAY
  let n = 0
  for (const name of ['projects', 'reports', 'findings', 'photos', 'audio'] as TableName[]) {
    const old = await table(name)
      .where('deletedAt')
      .between(0, limit, true, true)
      .toArray()
    for (const rec of old) {
      await hardDelete(name, rec.id)
      n++
    }
  }
  return n
}

export async function emptyTrash(): Promise<number> {
  return purgeTrash(Number.MAX_SAFE_INTEGER - 1)
}
