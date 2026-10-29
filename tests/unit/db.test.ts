import { describe, it, expect, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { db, openDb, SCHEMA_V1, SCHEMA_VERSION } from '../../src/db/db'
import {
  createProject,
  getOrCreateReport,
  softDelete,
  restore,
  purgeTrash,
  updateReport,
  finalizeReport,
  reopenReport,
  copyFromPrevious,
  createFinding,
  changeFindingStatus,
  activeProjects,
  RestoreConflictError,
  TRASH_DAYS,
} from '../../src/db/repo'
import { backupReminderDue } from '../../src/lib/reminder'

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

const P = { beneficiary: '', contractNo: '', lot: '', locality: '', county: '', contractor: '', supervisor: '', startDate: '' }

describe('migrări de schemă', () => {
  it('v1 → v2: proiectele vechi primesc câmpurile noi, iar tabelele noi apar', async () => {
    const name = `migr-${Math.random()}`
    const v1 = new Dexie(name)
    v1.version(1).stores(SCHEMA_V1)
    await v1.table('projects').add({ id: 'p-vechi', name: 'Proiect din v1', createdAt: 1, updatedAt: 2 })
    await v1.table('settings').put({ key: 'companyName', value: 'Firma X' })
    v1.close()

    const v2 = openDb(name)
    await v2.open()
    expect(v2.verno).toBe(SCHEMA_VERSION)
    const p = await v2.projects.get('p-vechi')
    expect(p).toMatchObject({ name: 'Proiect din v1', archived: 0, deletedAt: null, lastUsedAt: 2, beneficiary: '', lot: '' })
    expect((await v2.settings.get('companyName'))?.value).toBe('Firma X')
    expect(v2.tables.map((t) => t.name).sort()).toEqual(['audio', 'findings', 'photos', 'projects', 'reports', 'settings'])
    await v2.reports.add({ id: 'r', projectId: 'p-vechi', date: '2026-01-01' } as never)
    expect(await v2.reports.where('[projectId+date]').equals(['p-vechi', '2026-01-01']).count()).toBe(1)
    v2.close()
    await Dexie.delete(name)
  })
})

describe('proiecte și rapoarte', () => {
  beforeEach(clearAll)

  it('ecranul principal: proiecte active, ultimul folosit primul; arhivatele lipsesc', async () => {
    const a = await createProject({ ...P, name: 'A' })
    await new Promise((r) => setTimeout(r, 5))
    const b = await createProject({ ...P, name: 'B' })
    await db.projects.update(a.id, { lastUsedAt: Date.now() + 1000 })
    const c = await createProject({ ...P, name: 'C' })
    await db.projects.update(c.id, { archived: 1 })
    const list = await activeProjects()
    expect(list.map((p) => p.name)).toEqual(['A', 'B'])
    void b
  })

  it('data raportului e unică per proiect: se deschide raportul existent', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const r1 = await getOrCreateReport(p.id, '2026-10-29')
    const [r2, r3] = await Promise.all([getOrCreateReport(p.id, '2026-10-29'), getOrCreateReport(p.id, '2026-10-29')])
    expect(r2.id).toBe(r1.id)
    expect(r3.id).toBe(r1.id)
    expect(await db.reports.count()).toBe(1)
  })

  it('finalizat = blocat la editare; „Redeschide” permite din nou modificări', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const r = await getOrCreateReport(p.id, '2026-10-29')
    await updateReport(r.id, { notes: 'ok' })
    await finalizeReport(r.id)
    await expect(updateReport(r.id, { notes: 'modificare' })).rejects.toThrow(/finalizat/)
    await reopenReport(r.id)
    await updateReport(r.id, { notes: 'modificare' })
    expect((await db.reports.get(r.id))?.notes).toBe('modificare')
  })

  it('„Copiază din ziua precedentă” copiază personalul și utilajele (cu ID-uri noi)', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const prev = await getOrCreateReport(p.id, '2026-10-27')
    await updateReport(prev.id, {
      personnel: [{ id: 'x1', category: 'Sudori', count: 2 }],
      equipment: [{ id: 'y1', name: 'Buldoexcavator', count: 1, hours: 8 }],
    })
    const today = await getOrCreateReport(p.id, '2026-10-29')
    expect(await copyFromPrevious(today.id)).toBe(true)
    const t = (await db.reports.get(today.id))!
    expect(t.personnel).toMatchObject([{ category: 'Sudori', count: 2 }])
    expect(t.equipment).toMatchObject([{ name: 'Buldoexcavator', count: 1, hours: 8 }])
    expect(t.personnel[0].id).not.toBe('x1')
    const first = await getOrCreateReport(p.id, '2026-10-01')
    expect(await copyFromPrevious(first.id)).toBe(false)
  })

  it('constatări: istoricul schimbărilor de stare cu data și ora', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const f = await createFinding(p.id, { title: 'Cămin fisurat', description: '', category: 'calitate', severity: 'majoră', location: '', gps: null, responsible: 'Ion', dueDate: '' })
    await changeFindingStatus(f.id, 'În lucru')
    await changeFindingStatus(f.id, 'Rezolvată')
    const h = (await db.findings.get(f.id))!.history
    expect(h.map((x) => [x.from, x.to])).toEqual([
      [null, 'Deschisă'],
      ['Deschisă', 'În lucru'],
      ['În lucru', 'Rezolvată'],
    ])
    expect(h.every((x) => typeof x.at === 'number' && x.at > 0)).toBe(true)
  })
})

describe('ștergere logică și Coș', () => {
  beforeEach(clearAll)

  it('ștergerea mută în Coș; restaurarea readuce; după 30 de zile se golește definitiv cu tot conținutul', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const r = await getOrCreateReport(p.id, '2026-10-29')
    await softDelete('projects', p.id)
    expect((await db.projects.get(p.id))?.deletedAt).toBeTypeOf('number')
    expect(await activeProjects()).toHaveLength(0)
    await restore('projects', p.id)
    expect(await activeProjects()).toHaveLength(1)

    await softDelete('projects', p.id)
    expect(await purgeTrash(Date.now() + (TRASH_DAYS - 1) * 864e5)).toBe(0)
    expect(await db.projects.get(p.id)).toBeDefined()
    expect(await purgeTrash(Date.now() + (TRASH_DAYS + 1) * 864e5)).toBe(1)
    expect(await db.projects.get(p.id)).toBeUndefined()
    expect(await db.reports.get(r.id)).toBeUndefined()
  })

  it('un raport șters nu blochează ziua; restaurarea lui cu o zi deja ocupată e refuzată clar', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const r1 = await getOrCreateReport(p.id, '2026-10-29')
    await softDelete('reports', r1.id)
    const r2 = await getOrCreateReport(p.id, '2026-10-29')
    expect(r2.id).not.toBe(r1.id)
    await expect(restore('reports', r1.id)).rejects.toBeInstanceOf(RestoreConflictError)
  })
})

describe('amintire backup', () => {
  const D = 864e5
  it('după 7 zile de la ultima copie și doar dacă există date noi', () => {
    const now = 100 * D
    expect(backupReminderDue(null, null, null, now)).toBe(false)
    expect(backupReminderDue(null, now - D, now - 3 * D, now)).toBe(false)
    expect(backupReminderDue(null, now - D, now - 8 * D, now)).toBe(true)
    expect(backupReminderDue(now - 8 * D, now - 9 * D, now - 20 * D, now)).toBe(false)
    expect(backupReminderDue(now - 8 * D, now - D, now - 20 * D, now)).toBe(true)
    expect(backupReminderDue(now - 2 * D, now - D, now - 20 * D, now)).toBe(false)
  })
})
