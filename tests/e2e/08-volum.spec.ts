import { test, expect } from './fixtures'

test('volum: 1.000 de rapoarte și 300 de constatări — listele rămân fluide', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Niciun proiect încă' })).toBeVisible()
  // date generate DOAR în test, scrise direct în IndexedDB (aceeași schemă ca aplicația)
  const pid = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('sia-teren')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const now = Date.now()
    const pid = crypto.randomUUID()
    const tx = db.transaction(['projects', 'reports', 'findings'], 'readwrite')
    tx.objectStore('projects').put({ id: pid, name: 'Proiect volum mare', beneficiary: '', contractNo: '', lot: '', locality: '', county: '', contractor: '', supervisor: '', startDate: '', archived: 0, lastUsedAt: now, createdAt: now, updatedAt: now, deletedAt: null })
    const start = new Date(2023, 0, 1)
    for (let i = 0; i < 1000; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      tx.objectStore('reports').put({
        id: crypto.randomUUID(), projectId: pid, date, weather: ['senin'], tempMorning: 5, tempNoon: 12,
        personnel: [{ id: 'a', category: 'Muncitori', count: 5 + (i % 7) }], equipment: [], activities: [{ id: 'b', description: `Activitate ${i}`, quantity: i, unit: 'm', location: '' }],
        materials: [], problems: '', instructions: '', instructionsFrom: '', visits: '', safety: '', notes: '', status: i % 3 ? 'final' : 'draft', finalizedAt: null,
        createdAt: now, updatedAt: now, deletedAt: null,
      })
    }
    const sev = ['minoră', 'majoră', 'critică']
    const st = ['Deschisă', 'În lucru', 'Rezolvată', 'Verificată', 'Anulată']
    for (let i = 0; i < 300; i++) {
      tx.objectStore('findings').put({
        id: crypto.randomUUID(), projectId: pid, title: `Constatare ${i}`, description: '', category: 'calitate', severity: sev[i % 3], location: '', gps: null,
        responsible: `Responsabil ${i % 10}`, dueDate: i % 2 ? '2024-01-01' : '2099-01-01', status: st[i % 5], history: [{ from: null, to: 'Deschisă', at: now }],
        createdAt: now - i, updatedAt: now, deletedAt: null,
      })
    }
    await new Promise((res, rej) => {
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    })
    db.close()
    return pid
  })

  let t0 = Date.now()
  await page.goto(`./#/proiect/${pid}`)
  await expect(page.getByRole('heading', { name: /Rapoarte zilnice/ })).toContainText('(1000)')
  await expect(page.getByRole('list', { name: 'Rapoarte zilnice' }).getByRole('listitem')).toHaveCount(60)
  const tReports = Date.now() - t0
  await page.getByRole('button', { name: /Arată mai multe \(940 rămase\)/ }).click()
  await expect(page.getByRole('list', { name: 'Rapoarte zilnice' }).getByRole('listitem')).toHaveCount(120)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

  t0 = Date.now()
  await page.goto(`./#/proiect/${pid}/constatari`)
  await expect(page.getByText(/din 300 constatări/)).toBeVisible()
  const tFindings = Date.now() - t0
  await page.locator('details.section summary', { hasText: 'Filtre' }).click()
  t0 = Date.now()
  await page.getByLabel('Stare').selectOption('toate')
  await expect(page.getByText('300 din 300 constatări')).toBeVisible()
  await page.getByLabel('Gravitate').selectOption('critică')
  await expect(page.getByText('100 din 300 constatări')).toBeVisible()
  const tFilter = Date.now() - t0
  console.log(`Volum: listă rapoarte ${tReports} ms, listă constatări ${tFindings} ms, două filtrări ${tFilter} ms`)
  expect(tReports).toBeLessThan(3000)
  expect(tFindings).toBeLessThan(3000)
  expect(tFilter).toBeLessThan(2000)
})
