import { test, expect } from './fixtures'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProject, dbSnapshot, expectSaved, fixture, section } from './helpers'

test('E2E 5: copie de siguranță → ștergi tot → restaurare → date identice; fișier corupt respins fără pagube', async ({ page }) => {
  await page.goto('./#/setari')
  await page.getByLabel('Numele tău (apare la „Întocmit”)').fill('Ionuț')
  await page.getByTestId('logo-input').setInputFiles(fixture('logo.png'))
  await expect(page.getByAltText('Logo firmă')).toBeVisible()

  const pid = await createProject(page, 'Canalizare Țicleni – lot 2', { 'Număr contract': '88/2026' })
  await page.goto(`./#/proiect/${pid}/raport/2026-10-21`)
  await section(page, 'Personal').getByRole('button', { name: 'Adaugă categorie' }).click()
  await section(page, 'Personal').getByLabel('Categorie').fill('Sudori PEHD')
  await section(page, 'Personal').getByLabel('Număr').fill('2')
  await section(page, 'Fotografii').getByTestId('gallery-input-general').setInputFiles([fixture('santier.jpg'), fixture('orientare6.jpg')])
  await expect(section(page, 'Fotografii').locator('.thumb')).toHaveCount(2)
  await expectSaved(page)
  await page.goto(`./#/proiect/${pid}/constatare/noua`)
  await page.getByLabel('Titlu').fill('Țeavă zgâriată în șanț')
  await page.getByRole('button', { name: 'Salvează constatarea' }).click()
  await section(page, 'Fotografii „înainte”').getByTestId('gallery-input-before').setInputFiles(fixture('santier.jpg'))
  await expect(section(page, 'Fotografii „înainte”').locator('.thumb')).toHaveCount(1)
  await page.getByRole('group', { name: 'Schimbă starea' }).getByRole('button', { name: 'În lucru' }).click()
  await expect(page.getByTestId('history').locator('li')).toHaveCount(2)

  const before = await dbSnapshot(page)
  expect((before.photos as unknown[]).length).toBe(3)

  // copie
  await page.goto('./#/backup')
  await expect(page.getByTestId('last-backup')).toContainText('niciodată')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Creează și descarcă pe telefon' }).click()
  const zipPath = join(tmpdir(), `sia-copie-${Date.now()}.zip`)
  await (await dl).saveAs(zipPath)
  await expect(page.getByTestId('last-backup')).not.toContainText('niciodată')

  // ștergi tot: proiectul → Coș → golire definitivă; logo eliminat
  await page.goto(`./#/proiect/${pid}`)
  await page.getByRole('button', { name: 'Șterge' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Șterge proiectul' }).click()
  await expect(page.getByText('Proiectul a fost mutat în Coș.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Proiecte' })).toBeVisible()
  await page.goto('./#/cos')
  await page.getByRole('button', { name: 'Golește coșul' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Golește coșul' }).click()
  await expect(page.getByRole('heading', { name: 'Coșul este gol' })).toBeVisible()
  await page.goto('./#/setari')
  await page.getByRole('button', { name: 'Elimină' }).click()
  await expect(page.getByAltText('Logo firmă')).toHaveCount(0)
  const empty = await dbSnapshot(page)
  expect(empty.projects).toEqual([])
  expect(empty.photos).toEqual([])

  // fișier corupt: mesaj clar, nimic stricat
  // cale fără diacritice: Chromium din Playwright nu încarcă fișiere din căi cu ă/ș (limitare a testului, nu a aplicației)
  const bad = join(tmpdir(), `sia-stricat-${Date.now()}.zip`)
  writeFileSync(bad, 'acesta nu este un zip')
  await page.goto('./#/backup')
  await expect(page.getByRole('heading', { level: 1, name: 'Copie de siguranță' })).toBeVisible()
  const fc = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Alege fișierul copiei…' }).click()
  await (await fc).setFiles(bad)
  await expect(page.getByTestId('restore-error')).toContainText('nu este o arhivă .zip validă')
  expect(await dbSnapshot(page)).toEqual(empty)

  // restaurare: înlocuiește tot
  const fc2 = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Alege fișierul copiei…' }).click()
  await (await fc2).setFiles(zipPath)
  await expect(page.getByTestId('restore-summary')).toContainText('1 proiecte, 1 rapoarte, 1 constatări, 3 fotografii')
  await page.getByRole('button', { name: 'Înlocuiește tot' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Înlocuiește tot' }).click()
  await expect(page.getByText(/Restaurare completă/)).toBeVisible()

  const after = await dbSnapshot(page)
  expect(after).toEqual(before)

  // regresie V-04: după restaurare, deschiderea raportului de azi nu dă eroare de tranzacție
  const errs: string[] = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto('./#/azi')
  await expect(page.getByTestId('report-status')).toHaveText('Ciornă')
  await section(page, 'Personal').getByRole('button', { name: 'Adaugă categorie' }).click()
  await expect(page.getByTestId('save-state')).toHaveText('Salvat')
  await expect(page.getByText(/Transaction|committed/)).toHaveCount(0)
  expect(errs).toEqual([])

  // aplicația afișează datele restaurate
  await page.goto(`./#/proiect/${pid}/raport/2026-10-21`)
  await expect(section(page, 'Personal').getByLabel('Categorie')).toHaveValue('Sudori PEHD')
  await expect(section(page, 'Fotografii').locator('.thumb')).toHaveCount(2)
})
