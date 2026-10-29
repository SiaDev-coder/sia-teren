import { describe, it, expect, beforeEach } from 'vitest'
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate'
import { db } from '../../src/db/db'
import {
  createProject,
  getOrCreateReport,
  updateReport,
  finalizeReport,
  addPhoto,
  softDelete,
  restore,
  copyFromPrevious,
  saveReport,
  emptyReport,
  createFinding,
  saveFinding,
  changeFindingStatus,
  RestoreConflictError,
} from '../../src/db/repo'
import { getSetting } from '../../src/db/settings'
import { createBackup, parseBackup, restoreBackup, BackupError } from '../../src/lib/backup'
import { isValidIsoDate } from '../../src/lib/format'

const P = { beneficiary: '', contractNo: '', lot: '', locality: '', county: '', contractor: '', supervisor: '', startDate: '' }
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9])], { type: 'image/jpeg' })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('regresii din verificarea independentă', () => {
  it('V-02: „Copiază din ziua precedentă” sare peste zilele goale și nu șterge nimic dacă nu are ce copia', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const luni = await getOrCreateReport(p.id, '2026-10-26')
    await updateReport(luni.id, { personnel: [{ id: 'a', category: 'Sudori', count: 4 }] })
    await getOrCreateReport(p.id, '2026-10-28') // zi goală (ex. creată de o versiune veche)
    const joi = await getOrCreateReport(p.id, '2026-10-29')
    await updateReport(joi.id, { personnel: [{ id: 'b', category: 'Maistru', count: 1 }] })
    expect(await copyFromPrevious(joi.id)).toBe(true)
    expect((await db.reports.get(joi.id))!.personnel).toMatchObject([{ category: 'Sudori', count: 4 }])
    const prima = await getOrCreateReport(p.id, '2026-10-01')
    await updateReport(prima.id, { personnel: [{ id: 'c', category: 'X', count: 2 }] })
    expect(await copyFromPrevious(prima.id)).toBe(false)
    expect((await db.reports.get(prima.id))!.personnel).toMatchObject([{ category: 'X', count: 2 }])
  })

  it('V-03: un raport se creează doar la prima salvare; data rămâne unică', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const r = emptyReport(p.id, '2026-10-29')
    expect(await db.reports.count()).toBe(0)
    await saveReport({ notes: 'prima scriere' }, { ...r, notes: 'prima scriere' })
    expect((await db.reports.get(r.id))!.notes).toBe('prima scriere')
    // R-01: a doua fereastră pe aceeași zi încă necompletată → modificarea se combină în raportul existent
    const alt = emptyReport(p.id, '2026-10-29')
    const adopted = await saveReport({ visits: 'vizită ISU' }, { ...alt, visits: 'vizită ISU' })
    expect(adopted && adopted.id).toBe(r.id)
    expect(await db.reports.count()).toBe(1)
    const cur = (await db.reports.get(r.id))!
    expect(cur.notes).toBe('prima scriere')
    expect(cur.visits).toBe('vizită ISU')
  })

  it('R-02: două ferestre pe același raport nu își șterg una alteia câmpurile', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const r = await getOrCreateReport(p.id, '2026-10-29')
    await saveReport({ notes: 'A' }, { ...r, notes: 'A' })
    await saveReport({ safety: 'B' }, { ...r, safety: 'B' }) // fereastra B are încă notes=''
    const cur = (await db.reports.get(r.id))!
    expect(cur.notes).toBe('A')
    expect(cur.safety).toBe('B')
  })

  it('V-10: raportul finalizat nu primește fotografii, nu e suprascris de salvarea automată și nu recuperează fotografii', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const r = await getOrCreateReport(p.id, '2026-10-29')
    const ph = await addPhoto({ projectId: p.id, ownerType: 'report', ownerId: r.id, role: 'general', blob: jpeg(), width: 1, height: 1, takenAt: 1, gps: null })
    await softDelete('photos', ph.id)
    await finalizeReport(r.id)
    await expect(addPhoto({ projectId: p.id, ownerType: 'report', ownerId: r.id, role: 'general', blob: jpeg(), width: 1, height: 1, takenAt: 1, gps: null })).rejects.toThrow(/finalizat/)
    await expect(saveReport({ notes: 'tab vechi' }, { ...r, notes: 'tab vechi' })).rejects.toThrow(/finalizat/)
    await expect(restore('photos', ph.id)).rejects.toBeInstanceOf(RestoreConflictError)
    expect((await db.reports.get(r.id))!.status).toBe('final')
  })

  it('V-16: elementele unui proiect din Coș nu se recuperează separat', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const f = await createFinding(p.id, { title: 'T', description: '', category: 'calitate', severity: 'minoră', location: '', gps: null, responsible: '', dueDate: '' })
    await softDelete('findings', f.id)
    await softDelete('projects', p.id)
    await expect(restore('findings', f.id)).rejects.toThrow(/Recuperează întâi proiectul/)
  })

  it('V-14: salvarea automată nu golește titlul și nu suprascrie starea/istoricul', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const f = await createFinding(p.id, { title: 'Titlu bun', description: '', category: 'calitate', severity: 'minoră', location: '', gps: null, responsible: '', dueDate: '' })
    await changeFindingStatus(f.id, 'În lucru')
    await saveFinding({ title: '   ', description: 'nou', status: 'Deschisă' }, f) // starea veche nu se scrie
    const cur = (await db.findings.get(f.id))!
    expect(cur.title).toBe('Titlu bun')
    expect(cur.description).toBe('nou')
    expect(cur.status).toBe('În lucru')
    expect(cur.history).toHaveLength(2)
  })

  it('V-07: crearea copiei nu schimbă singură data ultimei copii', async () => {
    await createProject({ ...P, name: 'P' })
    await createBackup('test')
    expect(await getSetting('lastBackupAt')).toBeNull()
  })

  it('V-05 / V-06: copii cu manifest invalid sunt respinse; câmpurile lipsă se completează sigur', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const r = await getOrCreateReport(p.id, '2026-10-29')
    await createFinding(p.id, { title: 'T', description: '', category: 'calitate', severity: 'minoră', location: '', gps: null, responsible: 'Ion', dueDate: '' })
    void r
    const { blob } = await createBackup('test')
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    const bad = zipSync({ ...files, 'manifest.json': strToU8(JSON.stringify({ ...manifest, createdAt: 'ieri' })) })
    await expect(parseBackup(new Blob([bad as BlobPart]))).rejects.toBeInstanceOf(BackupError)

    const data = JSON.parse(strFromU8(files['date.json']))
    delete data.reports[0].equipment
    delete data.reports[0].weather
    data.reports[0].tempNoon = 'cald'
    delete data.findings[0].responsible
    data.findings[0].status = 'Inventată'
    data.findings[0].history = 'nimic'
    data.projects[0].name = 42
    const mutilated = zipSync({ ...files, 'date.json': strToU8(JSON.stringify(data)) })
    const parsed = await parseBackup(new Blob([mutilated as BlobPart]))
    await Promise.all(db.tables.map((t) => t.clear()))
    await restoreBackup(parsed, 'merge')
    const rr = (await db.reports.toArray())[0]
    expect(rr.equipment).toEqual([])
    expect(rr.weather).toEqual([])
    expect(rr.tempNoon).toBeNull()
    const ff = (await db.findings.toArray())[0]
    expect(ff.responsible).toBe('')
    expect(ff.status).toBe('Deschisă')
    expect(ff.history.length).toBe(1)
    expect((await db.projects.toArray())[0].name).toBe('Proiect fără nume')

    const noDate = JSON.parse(strFromU8(files['date.json']))
    noDate.reports[0].date = '2026-02-31'
    await expect(parseBackup(new Blob([zipSync({ ...files, 'date.json': strToU8(JSON.stringify(noDate)) }) as BlobPart]))).rejects.toThrow(/Raport zilnic invalid/)
  })

  it('V-12: validarea datelor din adresă', () => {
    expect(isValidIsoDate('2026-10-29')).toBe(true)
    expect(isValidIsoDate('2028-02-29')).toBe(true)
    expect(isValidIsoDate('2026-02-31')).toBe(false)
    expect(isValidIsoDate('0000-01-01')).toBe(false)
    expect(isValidIsoDate('9999-12-31')).toBe(false)
    expect(isValidIsoDate('2026-1-5')).toBe(false)
  })

  it('binarele sunt stocate ca ArrayBuffer în IndexedDB și citite înapoi ca Blob', async () => {
    const p = await createProject({ ...P, name: 'P' })
    const f = await createFinding(p.id, { title: 'T', description: '', category: 'calitate', severity: 'minoră', location: '', gps: null, responsible: '', dueDate: '' })
    await expect(addPhoto({ projectId: p.id, ownerType: 'report', ownerId: 'inexistent', role: 'general', blob: jpeg(), width: 1, height: 1, takenAt: 1, gps: null })).rejects.toThrow(/nu mai există/)
    const ph = await addPhoto({ projectId: p.id, ownerType: 'finding', ownerId: f.id, role: 'before', blob: jpeg(), width: 1, height: 1, takenAt: 1, gps: null })
    const raw = await new Promise<{ blob: { __bin: number; buf: ArrayBuffer } }>((res) => {
      const req = indexedDB.open('sia-teren')
      req.onsuccess = () => {
        const q = req.result.transaction('photos').objectStore('photos').get(ph.id)
        q.onsuccess = () => res(q.result)
      }
    })
    expect(raw.blob.__bin).toBe(1)
    expect(raw.blob.buf).toBeInstanceOf(ArrayBuffer)
    const back = await db.photos.get(ph.id)
    expect(back!.blob).toBeInstanceOf(Blob)
    expect(back!.blob.size).toBe(5)
  })
})
