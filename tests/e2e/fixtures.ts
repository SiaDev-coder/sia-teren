import { test as base, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port
      s.close(() => res(p))
    })
    s.on('error', rej)
  })
}

async function startPreview(): Promise<{ url: string; proc: ChildProcess }> {
  const port = await freePort()
  const proc = spawn(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  })
  const url = `http://127.0.0.1:${port}/`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { url, proc }
    } catch {
      /* încă pornește */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  proc.kill()
  throw new Error('Serverul de previzualizare nu a pornit')
}

interface Fixtures {
  /** Taie rețeaua: oprește serverul aplicației (pe toate browserele) și, pe Chromium, activează modul offline. */
  goOffline: () => Promise<void>
}

/**
 * Fiecare test primește propriul server `vite preview` (build-ul de producție) pe un port liber,
 * deci și o origine separată (IndexedDB curat). Pe un URL public (E2E_BASE_URL) se folosește acela.
 */
export const test = base.extend<Fixtures & { server: { url: string; proc: ChildProcess | null } }>({
  // eslint-disable-next-line no-empty-pattern -- forma cerută de Playwright pentru fixture fără dependențe
  server: async ({}, use) => {
    if (process.env.E2E_BASE_URL) {
      await use({ url: process.env.E2E_BASE_URL, proc: null })
      return
    }
    const s = await startPreview()
    await use(s)
    s.proc.kill()
  },
  baseURL: async ({ server }, use) => {
    await use(server.url)
  },
  goOffline: async ({ server, context, browserName }, use) => {
    await use(async () => {
      if (server.proc && server.proc.exitCode === null) {
        server.proc.kill()
        await new Promise((r) => setTimeout(r, 300))
      }
      // În WebKit, context.setOffline() din Playwright oprește și navigările servite de service worker
      // (limitare Playwright, nu a aplicației) — acolo oprirea serverului e condiția „fără rețea”.
      if (browserName === 'chromium' || !server.proc) await context.setOffline(true)
    })
  },
})

export { expect }
