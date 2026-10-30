import { test as base, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { connect, createServer, type Socket } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
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

/**
 * Pentru un URL public (E2E_BASE_URL): proxy HTTP CONNECT local prin care trece tot traficul browserului.
 * „Fără rețea” = proxy-ul închide tunelurile și refuză conexiunile noi — rețeaua chiar dispare pentru
 * pagină și service worker, pe Chromium și pe WebKit (unde context.setOffline() strică reîncărcarea).
 * Dacă mediul are un proxy de ieșire (HTTPS_PROXY), tunelurile trec prin el.
 */
export async function startNetProxy(): Promise<{ url: string; cut: () => void; close: () => Promise<void> }> {
  const upstreamEnv = process.env.HTTPS_PROXY || process.env.https_proxy
  const upstream = upstreamEnv ? new URL(upstreamEnv) : null
  const sockets = new Set<Socket>()
  let blocked = false
  const server = createHttpServer((_req, res) => {
    res.writeHead(405).end()
  })
  server.on('connect', (req, client: Socket, head: Buffer) => {
    if (blocked) {
      // fără niciun răspuns: browserul vede o eroare de rețea, nu un răspuns HTTP
      client.destroy()
      return
    }
    const target = req.url ?? ''
    const [host, port] = target.split(':')
    const remote = upstream ? connect(Number(upstream.port || 80), upstream.hostname) : connect(Number(port || 443), host)
    sockets.add(client)
    sockets.add(remote)
    const drop = () => {
      client.destroy()
      remote.destroy()
      sockets.delete(client)
      sockets.delete(remote)
    }
    client.on('error', drop)
    remote.on('error', drop)
    client.on('close', drop)
    remote.on('close', drop)
    const pipe = (rest: Buffer) => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (rest.length) client.write(rest)
      if (head.length) remote.write(head)
      client.pipe(remote)
      remote.pipe(client)
    }
    remote.once('connect', () => {
      if (!upstream) return pipe(Buffer.alloc(0))
      remote.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`)
      let buf = Buffer.alloc(0)
      const onData = (d: Buffer) => {
        buf = Buffer.concat([buf, d])
        const end = buf.indexOf('\r\n\r\n')
        if (end < 0) return
        remote.off('data', onData)
        if (!/^HTTP\/1\.[01] 200/.test(buf.toString('latin1', 0, end))) {
          client.end('HTTP/1.1 502 Upstream\r\n\r\n')
          return drop()
        }
        pipe(buf.subarray(end + 4))
      }
      remote.on('data', onData)
    })
  })
  const port = await freePort()
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r))
  return {
    url: `http://127.0.0.1:${port}`,
    cut: () => {
      blocked = true
      for (const s of sockets) s.destroy()
      sockets.clear()
    },
    close: () =>
      new Promise((r) => {
        for (const s of sockets) s.destroy()
        server.close(() => r())
      }),
  }
}

interface Fixtures {
  /** Taie rețeaua: oprește serverul aplicației (pe toate browserele) și, pe Chromium, activează modul offline. */
  goOffline: () => Promise<void>
}

/**
 * Fiecare test primește propriul server `vite preview` (build-ul de producție) pe un port liber,
 * deci și o origine separată (IndexedDB curat). Pe un URL public (E2E_BASE_URL) se folosește acela.
 */
type NetProxy = Awaited<ReturnType<typeof startNetProxy>>

export const test = base.extend<Fixtures & { server: { url: string; proc: ChildProcess | null }; netProxy: NetProxy | null }>({
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
  // eslint-disable-next-line no-empty-pattern -- forma cerută de Playwright pentru fixture fără dependențe
  netProxy: async ({}, use) => {
    if (!process.env.E2E_BASE_URL) {
      await use(null)
      return
    }
    const p = await startNetProxy()
    await use(p)
    await p.close()
  },
  proxy: async ({ netProxy }, use) => {
    await use(netProxy ? { server: netProxy.url } : undefined)
  },
  baseURL: async ({ server }, use) => {
    await use(server.url)
  },
  goOffline: async ({ server, context, browserName, netProxy }, use) => {
    await use(async () => {
      if (netProxy) {
        netProxy.cut()
        return
      }
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
