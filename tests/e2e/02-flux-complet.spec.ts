import { test, expect } from './fixtures'
import { createProject, expectSaved, fixture, openSection, section } from './helpers'
import { inspectPdf } from './pdf-utils'

test.describe.configure({ mode: 'serial' })

test('E2E 1: proiect → raport zilnic cu personal, utilaje, activitate, fotografie adnotată → finalizare → PDF valid', async ({ page }, testInfo) => {
  // Setări: firmă, nume, logo (apar în PDF)
  await page.goto('./#/setari')
  await page.getByLabel('Denumirea firmei (apare în antetul PDF)').fill('SIA Dynamic Solution SRL')
  await page.getByLabel('Numele tău (apare la „Întocmit”)').fill('Ionuț Șerban')
  await page.getByTestId('logo-input').setInputFiles(fixture('logo.png'))
  await expect(page.getByAltText('Logo firmă')).toBeVisible()

  await createProject(page, 'Reabilitare rețea apă Țânțăreni', { 'Număr contract': '45/2026', 'Lot (CL)': 'CL3', Localitate: 'Țânțăreni', Județ: 'Gorj' })
  await page.getByRole('link', { name: 'Raportul de azi' }).click()
  await expect(page.getByTestId('report-status')).toHaveText('Ciornă')

  // vreme + temperaturi
  await page.getByRole('checkbox', { name: 'ploaie' }).check()
  await page.getByRole('checkbox', { name: 'vânt puternic' }).check()
  await page.getByLabel('Temp. dimineață (°C)').fill('-2,5')
  await page.getByLabel('Temp. prânz (°C)').fill('8')

  // personal
  const pers = section(page, 'Personal')
  await pers.getByRole('button', { name: 'Adaugă categorie' }).click()
  await pers.getByLabel('Categorie').fill('Muncitori necalificați')
  await pers.getByLabel('Număr').fill('6')

  // utilaje
  await openSection(page, 'Utilaje')
  const ut = section(page, 'Utilaje')
  await ut.getByRole('button', { name: 'Adaugă utilaj' }).click()
  await ut.getByLabel('Denumire').fill('Excavator pe șenile')
  await ut.getByLabel('Număr').fill('1')
  await ut.getByLabel('Ore').fill('7,5')

  // activitate
  await openSection(page, 'Activități executate')
  const act = section(page, 'Activități executate')
  await act.getByRole('button', { name: 'Adaugă activitate' }).click()
  await act.getByLabel('Descriere').fill('Săpătură mecanizată pentru conductă PEHD De110')
  await act.getByLabel('Cantitate').fill('42,5')
  await act.getByLabel('Locație / tronson').fill('Tronson Ț3, str. Școlii')

  await openSection(page, 'Probleme și instrucțiuni')
  await page.getByLabel('Probleme, întârzieri și cauze').fill('Întârziere livrare țeavă — furnizorul a amânat cu o zi.')
  await expectSaved(page)

  // fotografie: 2 atingeri din ecranul raportului — butonul mare „Fotografie” deschide camera
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Fotografie', exact: true }).click()
  await (await chooser).setFiles(fixture('santier.jpg'))
  await expect(page.getByRole('button', { name: 'Deschide fotografia 1' })).toBeVisible()

  // adnotare: săgeată + cerc + text, apoi anulare pas
  await page.getByRole('button', { name: 'Deschide fotografia 1' }).click()
  await page.getByRole('button', { name: 'Adnotează' }).click()
  const canvas = page.getByTestId('annot-canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const drag = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * ((x1 + x2) / 2), box.y + box.height * ((y1 + y2) / 2), { steps: 4 })
    await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 4 })
    await page.mouse.up()
  }
  await page.getByRole('button', { name: 'Săgeată' }).click()
  await drag(0.2, 0.2, 0.45, 0.45)
  await page.getByRole('button', { name: 'Culoare galben' }).click()
  await page.getByRole('button', { name: 'Cerc' }).click()
  await drag(0.5, 0.4, 0.7, 0.65)
  await page.getByRole('button', { name: 'Dreptunghi' }).click()
  await drag(0.1, 0.7, 0.3, 0.9)
  await page.getByRole('button', { name: 'Anulează ultimul pas' }).click()
  await page.getByRole('button', { name: 'Text' }).click()
  await page.mouse.click(box.x + box.width * 0.05, box.y + box.height * 0.05)
  await page.getByRole('dialog', { name: 'Text pe fotografie' }).getByRole('textbox').fill('Fisură țeavă')
  await page.getByRole('button', { name: 'Adaugă textul' }).click()
  await page.getByRole('button', { name: 'Salvează adnotările' }).click()
  await expect(page.getByText('Adnotările au fost salvate.')).toBeVisible()
  await page.getByRole('button', { name: 'Închide' }).click()
  await expect(page.locator('.thumb .tag')).toHaveText('adnotată')
  const anns = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('sia-teren')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    return new Promise<{ tools: string[]; w: number; h: number; size: number }>((res) => {
      const req = db.transaction('photos').objectStore('photos').getAll()
      req.onsuccess = () => {
        const p = req.result[0]
        res({ tools: p.annotations.map((a: { tool: string }) => a.tool), w: p.width, h: p.height, size: p.blob.size })
      }
    })
  })
  expect(anns.tools).toEqual(['arrow', 'ellipse', 'text'])
  // redimensionată la max. 2048 px pe latura mare (originalul are 3000×2000)
  expect(Math.max(anns.w, anns.h)).toBe(2048)
  expect(anns.h).toBe(1365)

  // finalizare
  await page.getByRole('button', { name: 'Finalizează raportul' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizează' }).click()
  await expect(page.getByTestId('report-status')).toHaveText('Finalizat')
  await expect(page.getByLabel('Probleme, întârzieri și cauze')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Fotografie', exact: true })).toHaveCount(0)

  // PDF
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'PDF raport zilnic' }).click()
  const download = await dl
  expect(download.suggestedFilename()).toMatch(/^Raport_zilnic_\d{2}\.\d{2}\.\d{4}\.pdf$/)
  const path = testInfo.outputPath('raport.pdf')
  await download.saveAs(path)
  const pdf = await inspectPdf(path)
  expect(pdf.header).toBe('%PDF-')
  for (const s of [
    'SIA Dynamic Solution SRL',
    'Raport zilnic de șantier',
    'Reabilitare rețea apă Țânțăreni',
    'Muncitori necalificați',
    'Excavator pe șenile',
    '7,5',
    'Săpătură mecanizată pentru conductă PEHD De110',
    '42,5',
    'Întârziere livrare țeavă',
    'ploaie, vânt puternic',
    '-2,5 °C',
    'Întocmit',
    'Verificat',
    'Supervizor – Diriginte',
    'Ionuț Șerban',
    'Semnătura și ștampila:',
  ])
    expect(pdf.text).toContain(s)
  // logo + fotografia (cu adnotări și banda de text arse în imagine)
  expect(pdf.images).toBeGreaterThanOrEqual(2)

  // Redeschide
  await page.getByRole('button', { name: 'Redeschide' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Redeschide' }).click()
  await expect(page.getByTestId('report-status')).toHaveText('Ciornă')
  await expect(page.getByLabel('Probleme, întârzieri și cauze')).toBeEnabled()
})

test('raport: aceeași dată deschide raportul existent; „Copiază din ziua precedentă”; salvare la reîncărcare în mijlocul formularului', async ({ page }) => {
  const id = await createProject(page, 'Stație de epurare Brădet')
  await page.goto(`./#/proiect/${id}/raport/2026-10-27`)
  const pers = section(page, 'Personal')
  await pers.getByRole('button', { name: 'Adaugă categorie' }).click()
  await pers.getByLabel('Categorie').fill('Sudori')
  await pers.getByLabel('Număr').fill('3')
  await openSection(page, 'Utilaje')
  const ut = section(page, 'Utilaje')
  await ut.getByRole('button', { name: 'Adaugă utilaj' }).click()
  await ut.getByLabel('Denumire').fill('Macara')
  await expectSaved(page)

  await page.goto(`./#/proiect/${id}/raport/2026-10-28`)
  await expect(page.getByRole('heading', { name: /28 octombrie 2026/ })).toBeVisible()
  await page.getByRole('button', { name: /Copiază din ziua precedentă/ }).click()
  await expect(pers.getByLabel('Categorie')).toHaveValue('Sudori')
  await expect(pers.getByLabel('Număr')).toHaveValue('3')

  // scriu și reîncarc imediat (ca la un apel / închidere) — textul trebuie să rămână
  await openSection(page, 'Vizite, SSM, observații')
  await page.getByLabel('Observații').fill('Text scris chiar înainte de închidere — ăîșțâ')
  await page.waitForTimeout(400)
  await page.reload()
  await openSection(page, 'Vizite, SSM, observații')
  await expect(page.getByLabel('Observații')).toHaveValue('Text scris chiar înainte de închidere — ăîșțâ')

  // aceeași dată → același raport (nu se creează duplicat)
  await page.goto(`./#/proiect/${id}`)
  await expect(page.getByRole('list', { name: 'Rapoarte zilnice' }).getByRole('listitem')).toHaveCount(2)
  await page.goto(`./#/proiect/${id}/raport/2026-10-28`)
  await expect(pers.getByLabel('Categorie')).toHaveValue('Sudori')
  await page.goto(`./#/proiect/${id}`)
  await expect(page.getByRole('list', { name: 'Rapoarte zilnice' }).getByRole('listitem')).toHaveCount(2)
})
