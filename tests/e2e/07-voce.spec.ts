import { test, expect } from './fixtures'
import { chromium } from '@playwright/test'
import { copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProject, fixture, openSection, section, waitForServiceWorker } from './helpers'

/** huggingface.co accesibil din mediul de test? (în sesiunea cloud curentă e blocat de politica de rețea) */
async function hfReachable(): Promise<boolean> {
  try {
    const r = await fetch('https://huggingface.co/api/models/onnx-community/whisper-base', { signal: AbortSignal.timeout(8000) })
    return r.ok
  } catch {
    return false
  }
}

test('notă vocală din fișier audio + motorul ONNX (WASM servit de aplicație) rulează offline, audio la 16 kHz', async ({ page, goOffline }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  const pid = await createProject(page, 'Note vocale Bălcești')
  await page.goto(`./#/proiect/${pid}/raport/2026-10-22`)
  await openSection(page, 'Note vocale')
  await section(page, 'Note vocale').getByTestId('audio-input').setInputFiles(fixture('nota-ro.wav'))
  await expect(section(page, 'Note vocale').locator('.audio-item')).toHaveCount(1)
  await expect(section(page, 'Note vocale').locator('audio')).toHaveCount(1)
  await expect(section(page, 'Note vocale')).toContainText('descarcă modelul vocal')

  // pregătirea motorului (online, din aplicație — nu de pe CDN)
  const external: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('blob') && !u.protocol.startsWith('data')) external.push(r.url())
  })
  await page.goto('./#/setari')
  await page.getByRole('button', { name: 'Verifică motorul de transcriere' }).click()
  await expect(page.getByTestId('selftest-result')).toContainText('funcționează', { timeout: 60_000 })
  await expect(page.getByTestId('selftest-result')).toContainText('16000')

  // fără rețea: motorul se încarcă din cache-ul aplicației (capcana CDN-ului WASM e rezolvată)
  await goOffline()
  await page.reload()
  await page.getByRole('button', { name: 'Verifică motorul de transcriere' }).click()
  await expect(page.getByTestId('selftest-result')).toContainText('funcționează', { timeout: 60_000 })
  expect(external.filter((u) => /jsdelivr|unpkg|cdn/.test(u))).toEqual([])
})

test('înregistrare cu microfonul (MediaRecorder) — Chromium cu microfon simulat din fișier', async ({ server, browserName }) => {
  test.skip(browserName !== 'chromium', 'Microfonul simulat din fișier există doar în Chromium (--use-file-for-fake-audio-capture)')
  const wav = join(tmpdir(), 'sia-nota-ro.wav') // cale ASCII pentru Chromium
  copyFileSync(fixture('nota-ro.wav'), wav)
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`],
  })
  const ctx = await browser.newContext({ baseURL: server.url, permissions: ['microphone'] })
  const page = await ctx.newPage()
  await page.goto('./')
  const pid = await createProject(page, 'Înregistrare Tismana')
  await page.goto(`./#/proiect/${pid}/raport/2026-10-23`)
  await openSection(page, 'Note vocale')
  await page.getByRole('button', { name: 'Înregistrează notă vocală' }).click()
  await expect(page.getByRole('button', { name: /Oprește înregistrarea/ })).toBeVisible()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Oprește înregistrarea/ }).click()
  await expect(page.getByText('Nota vocală a fost salvată.')).toBeVisible()
  const info = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open('sia-teren')
      r.onsuccess = () => res(r.result)
    })
    return new Promise<{ mime: string; bytes: number; dur: number }>((res) => {
      const q = db.transaction('audio').objectStore('audio').getAll()
      q.onsuccess = () => res({ mime: q.result[0].mimeType, bytes: q.result[0].blob.buf.byteLength, dur: q.result[0].durationSec })
    })
  })
  expect(info.mime).toBe('audio/webm;codecs=opus')
  expect(info.bytes).toBeGreaterThan(2000)
  expect(info.dur).toBeGreaterThan(2)
  await browser.close()
})

test('microfon refuzat: mesaj clar, aplicația continuă', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Refuzul permisiunii se poate simula fiabil doar în Chromium')
  const pid = await createProject(page, 'Permisiuni refuzate')
  await page.goto(`./#/proiect/${pid}/raport/2026-10-24`)
  await page.context().clearPermissions()
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('refuzat', 'NotAllowedError'))
  })
  await openSection(page, 'Note vocale')
  await page.getByRole('button', { name: 'Înregistrează notă vocală' }).click()
  await expect(page.getByText(/Accesul la microfon este refuzat/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fotografie', exact: true })).toBeEnabled()
})

test('E2E 6: model vocal descărcat online, apoi OFFLINE transcrie un fișier audio în română → text nevid', async ({ page, goOffline }) => {
  test.setTimeout(30 * 60_000)
  test.skip(!(await hfReachable()), 'huggingface.co nu este accesibil din acest mediu (politica de rețea) — testul rulează când accesul e permis')
  await page.goto('./')
  await waitForServiceWorker(page)
  await page.goto('./#/setari')
  // implicit „base” (mai mic, mai rapid); E2E_ASR_MODEL=small măsoară modelul recomandat pentru română
  const model = process.env.E2E_ASR_MODEL === 'small' ? 'small' : 'base'
  await page.locator('select[name="voiceModel"]').selectOption(model)
  await page.getByRole('button', { name: 'Descarcă pentru folosire offline' }).click()
  await expect(page.getByTestId('model-size')).toContainText('MB', { timeout: 60_000 })
  await page.getByRole('dialog').getByRole('button', { name: 'Descarcă' }).click()
  await expect(page.getByText('Modelul vocal a fost descărcat.')).toBeVisible({ timeout: 25 * 60_000 })
  await expect(page.getByTestId(`model-${model}`)).toContainText('descărcat')

  await goOffline()
  await page.reload()
  const pid = await createProject(page, 'Transcriere offline Horezu')
  await page.goto(`./#/proiect/${pid}/raport/2026-10-26`)
  await openSection(page, 'Note vocale')
  await section(page, 'Note vocale').getByTestId('audio-input').setInputFiles(fixture('nota-ro.wav'))
  const t = section(page, 'Note vocale').getByTestId('transcript')
  await expect(t).toBeVisible({ timeout: 10 * 60_000 })
  const text = (await t.textContent())?.trim() ?? ''
  console.log('Transcriere:', text)
  expect(text.length).toBeGreaterThan(5)
  // inserare cu un tap într-un câmp al raportului
  await section(page, 'Note vocale').getByRole('button', { name: 'Inserează textul în…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Observații' }).click()
  await openSection(page, 'Vizite, SSM, observații')
  await expect(page.getByLabel('Observații')).toHaveValue(text)
})

test('fără acces la huggingface.co: „Descarcă” afișează un mesaj clar, nimic nu se blochează', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'un singur browser e suficient pentru mesaj')
  test.skip(await hfReachable(), 'huggingface.co este accesibil — se verifică descărcarea reală în E2E 6')
  await page.goto('./#/setari')
  await page.getByRole('button', { name: 'Descarcă pentru folosire offline' }).first().click()
  await expect(page.getByText(/Nu se poate afla mărimea modelului/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Descarcă pentru folosire offline' }).first()).toBeEnabled()
})

test('regresie V-08: transcriere întreruptă (aplicația închisă) se poate relua', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'logică independentă de browser')
  const pid = await createProject(page, 'Transcriere întreruptă')
  await page.goto(`./#/proiect/${pid}/raport/2026-10-22`)
  await openSection(page, 'Note vocale')
  await section(page, 'Note vocale').getByTestId('audio-input').setInputFiles(fixture('nota-ro.wav'))
  await expect(section(page, 'Note vocale').locator('.audio-item')).toHaveCount(1)
  // simulăm închiderea aplicației în timpul transcrierii: starea rămâne „pending” în baza de date
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open('sia-teren')
      r.onsuccess = () => res(r.result)
    })
    await new Promise<void>((res) => {
      const st = db.transaction('audio', 'readwrite').objectStore('audio')
      const q = st.getAll()
      q.onsuccess = () => {
        const a = q.result[0]
        a.transcriptStatus = 'pending'
        st.put(a).onsuccess = () => res()
      }
    })
    db.close()
  })
  await page.reload()
  await openSection(page, 'Note vocale')
  await expect(section(page, 'Note vocale')).toContainText('Transcrierea a fost întreruptă')
  await expect(section(page, 'Note vocale')).not.toContainText('Se transcrie pe telefon')
})
