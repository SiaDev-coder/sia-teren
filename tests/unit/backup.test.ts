import { describe, it, expect, beforeEach } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { db } from '../../src/db/db'
import { createProject, getOrCreateReport, updateReport, createFinding, addPhoto, addAudio, softDelete } from '../../src/db/repo'
import { setSetting, getSettings } from '../../src/db/settings'
import { createBackup, parseBackup, restoreBackup, BackupError } from '../../src/lib/backup'

const P = { beneficiary: 'Primăria Șimian', contractNo: '3/2026', lot: 'CL2', locality: 'Șimian', county: 'Mehedinți', contractor: 'SIA', supervisor: 'Ing. Țurcanu', startDate: '2026-04-01' }

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

async function snapshot() {
  const blobToArr = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())]
  const photos = await Promise.all((await db.photos.toArray()).map(async ({ blob, ...p }) => ({ ...p, bytes: await blobToArr(blob), type: blob.type })))
  const audio = await Promise.all((await db.audio.toArray()).map(async ({ blob, ...a }) => ({ ...a, bytes: await blobToArr(blob), type: blob.type })))
  const s = await getSettings()
  return {
    projects: await db.projects.orderBy('id').toArray(),
    reports: await db.reports.orderBy('id').toArray(),
    findings: await db.findings.orderBy('id').toArray(),
    photos: photos.sort((a, b) => a.id.localeCompare(b.id)),
    audio: audio.sort((a, b) => a.id.localeCompare(b.id)),
    settings: { companyName: s.companyName, userName: s.userName, theme: s.theme, logo: s.logo ? await blobToArr(s.logo) : null },
  }
}

async function seed() {
  const p = await createProject({ ...P, name: 'Canalizare Șimian – etapa a II-a' })
  const r = await getOrCreateReport(p.id, '2026-10-28')
  await updateReport(r.id, {
    weather: ['ploaie'],
    tempMorning: 6.5,
    personnel: [{ id: 'a', category: 'Sudori', count: 2 }],
    activities: [{ id: 'b', description: 'Probă de presiune', quantity: 250, unit: 'm', location: 'T4' }],
    notes: 'Ședință cu dirigintele.',
  })
  const f = await createFinding(p.id, { title: 'Garnitură lipsă', description: 'ș ț ă î â', category: 'calitate', severity: 'majoră', location: 'C7', gps: { lat: 44.6, lng: 22.6, accuracy: 5, at: 1 }, responsible: 'Echipa 2', dueDate: '2026-11-02' })
  await addPhoto({ projectId: p.id, ownerType: 'report', ownerId: r.id, role: 'general', blob: new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])], { type: 'image/jpeg' }), width: 10, height: 8, takenAt: 5, gps: null })
  await addPhoto({ projectId: p.id, ownerType: 'finding', ownerId: f.id, role: 'before', blob: new Blob([new Uint8Array([0xff, 0xd8, 9, 9, 0xff, 0xd9])], { type: 'image/jpeg' }), width: 4, height: 3, takenAt: 6, gps: { lat: 1, lng: 2, accuracy: 3, at: 4 } })
  await addAudio({ projectId: p.id, ownerType: 'report', ownerId: r.id, blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm;codecs=opus' }), mimeType: 'audio/webm;codecs=opus', durationSec: 2.5 })
  const p2 = await createProject({ ...P, name: 'Proiect șters' })
  await softDelete('projects', p2.id)
  await setSetting('companyName', 'Firma Țării SRL')
  await setSetting('userName', 'Ionuț')
  await setSetting('logo', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
}

describe('copie de siguranță → restaurare', () => {
  beforeEach(clearAll)

  it('dus-întors identic (înlocuiește tot)', async () => {
    await seed()
    const before = await snapshot()
    const { blob, manifest, filename } = await createBackup('test')
    expect(filename).toMatch(/^SIA-Teren_copie_\d{4}-\d{2}-\d{2}_\d{4}\.zip$/)
    expect(manifest).toMatchObject({ app: 'SIA Teren', schemaVersion: 2, counts: { proiecte: 2, rapoarte: 1, constatari: 1, fotografii: 2, audio: 1 } })
    await clearAll()
    expect(await db.projects.count()).toBe(0)
    const parsed = await parseBackup(blob)
    await restoreBackup(parsed, 'replace')
    const after = await snapshot()
    expect(after).toEqual(before)
  })

  it('arhiva conține manifest.json, date.json, foto/ și audio/', async () => {
    await seed()
    const { blob } = await createBackup('test')
    const { unzipSync } = await import('fflate')
    const names = Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer())))
    expect(names).toContain('manifest.json')
    expect(names).toContain('date.json')
    expect(names.filter((n) => n.startsWith('foto/')).length).toBe(3) // 2 fotografii + logo
    expect(names.filter((n) => n.startsWith('audio/')).length).toBe(1)
  })

  it('„Adaugă / actualizează”: după id și updatedAt (mai nou câștigă)', async () => {
    await seed()
    const { blob } = await createBackup('test')
    const r = (await db.reports.toArray())[0]
    // modificare locală mai nouă decât copia: trebuie păstrată
    await updateReport(r.id, { notes: 'local mai nou' })
    // proiect local care nu e în copie: trebuie păstrat
    await createProject({ ...P, name: 'Doar local' })
    // proiect din copie șters definitiv local: trebuie readus
    const pr = (await db.projects.toArray()).find((x) => x.name === 'Canalizare Șimian – etapa a II-a')!
    await db.findings.clear()
    const res = await restoreBackup(await parseBackup(blob), 'merge')
    expect(res.added).toBe(1)
    expect((await db.reports.get(r.id))!.notes).toBe('local mai nou')
    expect((await db.projects.toArray()).map((p) => p.name)).toContain('Doar local')
    expect(await db.findings.count()).toBe(1)
    void pr
  })

  it('fișier corupt sau străin: mesaj clar și nimic nu se strică', async () => {
    await seed()
    const before = await snapshot()
    await expect(parseBackup(new Blob(['nu e zip']))).rejects.toThrow(BackupError)
    await expect(parseBackup(new Blob([zipSync({ 'altceva.txt': strToU8('x') }) as BlobPart]))).rejects.toThrow(/nu este o copie de siguranță SIA Teren/)
    const foreign = zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'Alt program', schemaVersion: 1 })), 'date.json': strToU8('{}') })
    await expect(parseBackup(new Blob([foreign as BlobPart]))).rejects.toThrow(/nu provine din aplicația SIA Teren/)
    const { blob } = await createBackup('test')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const damaged = bytes.slice(0, Math.floor(bytes.length / 2))
    await expect(parseBackup(new Blob([damaged]))).rejects.toThrow(BackupError)
    const future = zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'SIA Teren', schemaVersion: 99, createdAt: new Date().toISOString() })), 'date.json': strToU8('{}') })
    await expect(parseBackup(new Blob([future as BlobPart]))).rejects.toThrow(/versiune mai nouă/)
    const missingPhoto = zipSync({
      'manifest.json': strToU8(JSON.stringify({ app: 'SIA Teren', schemaVersion: 2, createdAt: new Date().toISOString() })),
      'date.json': strToU8(JSON.stringify({ projects: [], reports: [], findings: [], audio: [], photos: [{ id: 'x', createdAt: 1, updatedAt: 1, deletedAt: null, file: 'foto/x.jpg' }], settings: {} })),
    })
    await expect(parseBackup(new Blob([missingPhoto as BlobPart]))).rejects.toThrow(/Lipsește fișierul fotografiei/)
    expect(await snapshot()).toEqual(before)
  })
})
