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
