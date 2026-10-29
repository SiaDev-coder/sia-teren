import Dexie, { type EntityTable } from 'dexie'
import type { AudioNote, DailyReport, Finding, Photo, Project, SettingRow } from './types'

export const DB_NAME = 'sia-teren'
/** Versiunea curentă a schemei (apare și în manifestul copiei de siguranță). */
export const SCHEMA_VERSION = 2

export type SiaDb = Dexie & {
  projects: EntityTable<Project, 'id'>
  reports: EntityTable<DailyReport, 'id'>
  findings: EntityTable<Finding, 'id'>
  photos: EntityTable<Photo, 'id'>
  audio: EntityTable<AudioNote, 'id'>
  settings: EntityTable<SettingRow, 'key'>
}

/** Schema v1 (scheletul): doar proiecte și setări. Păstrată pentru migrare. */
export const SCHEMA_V1 = {
  projects: 'id, archived, lastUsedAt, updatedAt, deletedAt',
  settings: 'key',
}

/** Schema v2: rapoarte zilnice, constatări, fotografii, note vocale. */
export const SCHEMA_V2 = {
  projects: 'id, archived, lastUsedAt, updatedAt, deletedAt',
  reports: 'id, projectId, [projectId+date], date, status, updatedAt, deletedAt',
  findings: 'id, projectId, status, severity, dueDate, updatedAt, deletedAt',
  photos: 'id, projectId, ownerId, [ownerType+ownerId], updatedAt, deletedAt',
  audio: 'id, projectId, ownerId, [ownerType+ownerId], updatedAt, deletedAt',
  settings: 'key',
}

export function openDb(name = DB_NAME): SiaDb {
  const db = new Dexie(name) as SiaDb
  db.version(1).stores(SCHEMA_V1)
  db.version(2)
    .stores(SCHEMA_V2)
    .upgrade(async (tx) => {
      // Proiectele create în v1 pot să nu aibă toate câmpurile introduse ulterior.
      await tx
        .table('projects')
        .toCollection()
        .modify((p: Partial<Project>) => {
          p.archived = p.archived === 1 ? 1 : 0
          p.deletedAt = p.deletedAt ?? null
          p.lastUsedAt = p.lastUsedAt ?? p.updatedAt ?? p.createdAt ?? Date.now()
          for (const k of ['beneficiary', 'contractNo', 'lot', 'locality', 'county', 'contractor', 'supervisor', 'startDate'] as const) {
            if (typeof p[k] !== 'string') p[k] = ''
          }
        })
    })
  return db
}

export const db = openDb()
