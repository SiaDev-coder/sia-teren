import { test, expect } from './fixtures'
import { createProject, expectSaved, fixture, section } from './helpers'
import { inspectPdf } from './pdf-utils'

test.use({ geolocation: { latitude: 44.9431, longitude: 23.1205, accuracy: 8 }, permissions: ['geolocation'] })

test('E2E 2: constatare cu GPS, foto înainte / după, schimbări de stare și istoric; filtre și depășite', async ({ page }, testInfo) => {
  const pid = await createProject(page, 'Rețea canalizare Bumbești')
  await page.getByRole('link', { name: /Constatări/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Nicio constatare' })).toBeVisible()
  await page.getByRole('button', { name: 'Constatare nouă' }).click()

  await page.getByLabel('Titlu').fill('Cămin C12 – capac spart')
  await page.getByLabel('Descriere').fill('Capacul de fontă e fisurat; risc de accident.')
  await page.getByLabel('Categorie').selectOption('SSM')
  await page.getByLabel('Gravitate').selectOption('critică')
  await page.getByLabel('Locație').fill('Str. Gării, cămin C12')
  await page.getByRole('button', { name: 'Adaugă poziția GPS' }).click()
  await expect(page.getByTestId('gps-value')).toContainText('44.943100, 23.120500')
  await expect(page.getByTestId('gps-value')).toContainText('±8 m')
  await page.getByLabel('Responsabil').fill('Echipa Popescu')
  await page.getByLabel('Termen').fill('2026-01-15') // în trecut → depășită
  await page.getByRole('button', { name: 'Salvează constatarea' }).click()

  await expect(page.getByRole('alert').filter({ hasText: 'Termen depășit' })).toBeVisible()
  // foto „înainte”
  await section(page, 'Fotografii „înainte”').getByTestId('gallery-input-before').setInputFiles([fixture('santier.jpg'), fixture('orientare6.jpg')])
  await expect(section(page, 'Fotografii „înainte”').locator('.thumb')).toHaveCount(2)

  // stări: Deschisă → În lucru → Rezolvată
  await page.getByRole('group', { name: 'Schimbă starea' }).getByRole('button', { name: 'În lucru' }).click()
  await expect(page.getByRole('group', { name: 'Schimbă starea' }).getByRole('button', { name: 'În lucru' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('group', { name: 'Schimbă starea' }).getByRole('button', { name: 'Rezolvată' }).click()
  await expect(page.getByTestId('history').locator('li')).toHaveCount(3)
  await expect(page.getByTestId('history').locator('li').first()).toContainText('În lucru → Rezolvată')
  await expect(page.getByRole('alert').filter({ hasText: 'Termen depășit' })).toHaveCount(0)

  // foto „după”
  const after = section(page, 'Fotografii „după”')
  if (!(await after.evaluate((d) => (d as HTMLDetailsElement).open))) await after.locator('summary').click()
  await after.getByTestId('gallery-input-after').setInputFiles(fixture('santier.jpg'))
  await expect(after.locator('.thumb')).toHaveCount(1)
  await page.getByRole('group', { name: 'Schimbă starea' }).getByRole('button', { name: 'Verificată' }).click()
  await expect(page.getByTestId('history').locator('li')).toHaveCount(4)

  // editare cu salvare automată
  await page.getByLabel('Descriere').fill('Capacul de fontă e fisurat; înlocuit cu capac nou D400.')
  await expectSaved(page)

  // fotografia cu orientare EXIF 6 (1600×1200 stocată, afișată vertical) → salvată 1200×1600
  const dims = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open('sia-teren')
      r.onsuccess = () => res(r.result)
    })
    return new Promise<string[]>((res) => {
      const q = db.transaction('photos').objectStore('photos').getAll()
      q.onsuccess = () => res(q.result.map((p: { width: number; height: number; role: string }) => `${p.role}:${p.width}x${p.height}`).sort())
    })
  })
  expect(dims).toEqual(['after:2048x1365', 'before:1200x1600', 'before:2048x1365'])

  // a doua constatare, depășită și neînchisă
  await page.goto(`./#/proiect/${pid}/constatare/noua`)
  await page.getByLabel('Titlu').fill('Lipsă semnalizare săpătură')
  await page.getByLabel('Gravitate').selectOption('majoră')
  await page.getByLabel('Responsabil').fill('Ion Vasilescu')
  await page.getByLabel('Termen').fill('2026-02-01')
  await page.getByRole('button', { name: 'Salvează constatarea' }).click()
  await expect(page.getByTestId('history')).toBeVisible()
  // a treia, în termen
  await page.goto(`./#/proiect/${pid}/constatare/noua`)
  await page.getByLabel('Titlu').fill('Documentație recepție incompletă')
  await page.getByLabel('Categorie').selectOption('documentație')
  await page.getByLabel('Termen').fill('2099-12-31')
  await page.getByRole('button', { name: 'Salvează constatarea' }).click()
  await expect(page.getByTestId('history')).toBeVisible()

  await page.goto(`./#/proiect/${pid}/constatari`)
  // implicit: neînchise (verificata nu apare); depășita e evidențiată și prima
  const items = page.getByRole('list', { name: 'Constatări' }).getByRole('listitem')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText('Lipsă semnalizare săpătură')
  await expect(items.first().locator('.list-item')).toHaveClass(/overdue/)
  await expect(items.first()).toContainText('Depășit')
  await expect(page.getByRole('alert').filter({ hasText: 'termenul depășit' })).toContainText('1')

  await section(page, 'Filtre').locator('summary').click()
  await page.getByLabel('Stare').selectOption('toate')
  await expect(items).toHaveCount(3)
  await page.getByLabel('Gravitate').selectOption('critică')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('Cămin C12')
  await page.getByLabel('Gravitate').selectOption('toate')
  await page.getByLabel('Responsabil').selectOption('Ion Vasilescu')
  await expect(items).toHaveCount(1)
  await page.getByLabel('Responsabil').selectOption('toți')
  await page.getByRole('checkbox', { name: /Doar depășite/ }).check()
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('Lipsă semnalizare')

  // PDF listă cu filtrele aplicate: toate
  await page.getByRole('checkbox', { name: /Doar depășite/ }).uncheck()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF listă' }).click()
  const d = await dl
  const path = testInfo.outputPath('constatari.pdf')
  await d.saveAs(path)
  const pdf = await inspectPdf(path)
  expect(pdf.header).toBe('%PDF-')
  for (const s of ['Listă constatări / neconformități', 'Cămin C12 – capac spart', 'Lipsă semnalizare săpătură', 'DEPĂȘIT', 'Fotografii „înainte”', 'Fotografii „după”', 'Istoric', 'Deschisă -> În lucru', 'Supervizor – Diriginte'])
    expect(pdf.text).toContain(s)
  expect(pdf.images).toBeGreaterThanOrEqual(3)

  // CSV
  const dl2 = page.waitForEvent('download')
  await page.getByRole('button', { name: 'CSV' }).click()
  const csvPath = testInfo.outputPath('c.csv')
  await (await dl2).saveAs(csvPath)
  const { readFileSync } = await import('node:fs')
  const csv = readFileSync(csvPath)
  expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const text = csv.toString('utf8')
  expect(text).toContain('Titlu;Descriere;Categorie')
  expect(text).toContain('44,943100;23,120500')
})
