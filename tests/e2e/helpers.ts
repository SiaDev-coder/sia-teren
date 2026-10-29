import { expect, type Page, type BrowserContext } from '@playwright/test'
import { resolve } from 'node:path'

export const fixture = (name: string) => resolve(import.meta.dirname, '..', 'fixtures', name)

/** Așteaptă ca service worker-ul să controleze pagina (shell-ul aplicației e în cache). */
export async function waitForServiceWorker(page: Page) {
  // navigator.serviceWorker.ready se rezolvă când există un worker activ
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    if (reg.active?.state !== 'activated')
      await new Promise<void>((res) => reg.active!.addEventListener('statechange', () => reg.active?.state === 'activated' && res()))
  })
  // la prima vizită pagina nu e încă controlată: o reîncărcare o pune sub controlul SW
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 })
  }
}

export async function goOffline(context: BrowserContext, offline = true) {
  await context.setOffline(offline)
}

export async function createProject(page: Page, name: string, extra: Partial<Record<string, string>> = {}) {
  await page.goto('./#/proiect/nou')
  await page.getByLabel('Denumire proiect').fill(name)
  for (const [label, value] of Object.entries(extra)) await page.getByLabel(label, { exact: true }).fill(value!)
  await page.getByRole('button', { name: 'Creează proiectul' }).click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  return page.url().split('/proiect/')[1]
}

export async function expectSaved(page: Page) {
  await expect(page.getByTestId('save-state')).toHaveText('Salvat', { timeout: 10_000 })
}

/** Deschide o secțiune pliabilă după titlu. */
export async function openSection(page: Page, title: string) {
  const details = section(page, title)
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator('summary').first().click()
}

/** Secțiunea pliabilă al cărei titlu începe cu textul dat. */
export function section(page: Page, title: string) {
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.locator('details.section').filter({ has: page.locator('summary', { hasText: new RegExp(`^${esc}`) }) }).first()
}

/** Instantaneu complet al bazei de date (binarele ca SHA-256), pentru comparații „date identice”. */
export async function dbSnapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('sia-teren')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const hex = async (buf: ArrayBuffer) =>
      [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('')
    const norm = async (v: unknown): Promise<unknown> => {
      if (v && typeof v === 'object' && (v as { __bin?: number }).__bin === 1) {
        const b = v as { buf: ArrayBuffer; type: string }
        return { sha256: await hex(b.buf), bytes: b.buf.byteLength, type: b.type }
      }
      if (v instanceof Blob) return { sha256: await hex(await v.arrayBuffer()), bytes: v.size, type: v.type }
      if (Array.isArray(v)) return Promise.all(v.map(norm))
      if (v && typeof v === 'object') {
        const o: Record<string, unknown> = {}
        for (const k of Object.keys(v).sort()) o[k] = await norm((v as Record<string, unknown>)[k])
        return o
      }
      return v
    }
    const out: Record<string, unknown> = {}
    for (const store of [...db.objectStoreNames].sort()) {
      const rows = await new Promise<unknown[]>((res) => {
        const q = db.transaction(store).objectStore(store).getAll()
        q.onsuccess = () => res(q.result)
      })
      const skip = new Set(['lastBackupAt', 'lastDataChangeAt', 'persistRequested', 'persistGranted', 'lastPurgeAt'])
      // setările egale cu valoarea implicită sunt echivalente cu lipsa lor
      const defaults: Record<string, unknown> = { companyName: 'SIA Dynamic Solution SRL', theme: 'auto', userName: '', logo: null, voiceModel: null }
      const filtered =
        store === 'settings'
          ? rows.filter((r) => {
              const { key, value } = r as { key: string; value: unknown }
              return !skip.has(key) && !(key in defaults && defaults[key] === value)
            })
          : rows
      out[store] = await norm(filtered)
    }
    db.close()
    return out
  })
}
