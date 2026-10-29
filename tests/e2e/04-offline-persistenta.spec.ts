import { test, expect } from './fixtures'
import { chromium, webkit, devices } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProject, expectSaved, fixture, section, waitForServiceWorker } from './helpers'
import { inspectPdf } from './pdf-utils'

test('E2E 3: offline — încărcare o dată → fără rețea → reîncărcare → creare date → PDF', async ({ page, goOffline }, testInfo) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  await goOffline()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Niciun proiect încă' })).toBeVisible()

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const pid = await createProject(page, 'Aducțiune apă Novaci (offline)')
  await page.goto(`./#/azi`)
  await expect(page.getByTestId('report-status')).toHaveText('Ciornă')
  await section(page, 'Personal').getByRole('button', { name: 'Adaugă categorie' }).click()
  await section(page, 'Personal').getByLabel('Categorie').fill('Instalatori')
  await section(page, 'Personal').getByLabel('Număr').fill('4')
  await section(page, 'Fotografii').getByTestId('camera-input-general').setInputFiles(fixture('santier.jpg'))
  await expect(section(page, 'Fotografii').locator('.thumb')).toHaveCount(1)
  await expectSaved(page)

  // PDF generat complet offline (pdf-lib + font din cache-ul service worker-ului)
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF raport zilnic' }).click()
  const path = testInfo.outputPath('offline.pdf')
  await (await dl).saveAs(path)
  const pdf = await inspectPdf(path)
  expect(pdf.header).toBe('%PDF-')
  expect(pdf.text).toContain('Aducțiune apă Novaci (offline)')
  expect(pdf.text).toContain('Instalatori')
  expect(pdf.images).toBeGreaterThanOrEqual(1)

  // constatare + CSV + copie de siguranță, tot offline
  await page.goto(`./#/proiect/${pid}/constatare/noua`)
  await page.getByLabel('Titlu').fill('Constatare offline')
  await page.getByRole('button', { name: 'Salvează constatarea' }).click()
  await expect(page.getByTestId('history')).toBeVisible()
  await page.goto('./#/backup')
  const dl2 = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Creează și descarcă pe telefon' }).click()
  expect((await dl2).suggestedFilename()).toMatch(/\.zip$/)
  expect(errors).toEqual([])
})

test('E2E 4: persistență — închid browserul, îl redeschid, datele sunt acolo', async ({ server, browserName }) => {
  const dir = mkdtempSync(join(tmpdir(), 'sia-profil-'))
  const type = browserName === 'webkit' ? webkit : chromium
  const dev = browserName === 'webkit' ? devices['iPhone 15'] : devices['Pixel 7']
  const { defaultBrowserType: _ignored, ...opts } = dev
  void _ignored
  try {
    let ctx = await type.launchPersistentContext(dir, { ...opts, baseURL: server.url, locale: 'ro-RO' })
    let page = ctx.pages()[0] ?? (await ctx.newPage())
    await page.goto('./')
    const pid = await createProject(page, 'Proiect persistent Șușița')
    await page.goto(`./#/proiect/${pid}/raport/2026-10-20`)
    await section(page, 'Probleme și instrucțiuni').locator('summary').click()
    await page.getByLabel('Probleme, întârzieri și cauze').fill('Ploaie torențială – lucrări oprite 3 ore.')
    await expectSaved(page)
    await section(page, 'Fotografii').getByTestId('camera-input-general').setInputFiles(fixture('santier.jpg'))
    await expect(section(page, 'Fotografii').locator('.thumb')).toHaveCount(1)
    await ctx.close()

    ctx = await type.launchPersistentContext(dir, { ...opts, baseURL: server.url, locale: 'ro-RO' })
    page = ctx.pages()[0] ?? (await ctx.newPage())
    await page.goto('./')
    await expect(page.getByRole('link', { name: /Proiect persistent Șușița/ })).toBeVisible()
    await page.goto(`./#/proiect/${pid}/raport/2026-10-20`)
    await section(page, 'Probleme și instrucțiuni').locator('summary').click()
    await expect(page.getByLabel('Probleme, întârzieri și cauze')).toHaveValue('Ploaie torențială – lucrări oprite 3 ore.')
    await expect(section(page, 'Fotografii').locator('.thumb img')).toHaveCount(1)
    // fotografia se poate încă afișa (binarul e intact)
    const ok = await section(page, 'Fotografii').locator('.thumb img').evaluate(async (img: HTMLImageElement) => {
      await img.decode()
      return img.naturalWidth > 0
    })
    expect(ok).toBe(true)
    await ctx.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
