/// <reference lib="webworker" />
// Transcriere Whisper 100% pe dispozitiv, într-un Web Worker (interfața nu se blochează).
import ortFiles from './ort-files.json'
import { MODEL_IDS, ORT_CACHE, dtypeFor, ortVariant, type AsrDevice, type AsrModel, type AsrRequest, type AsrResponse } from '../lib/asr-protocol'

declare const self: DedicatedWorkerGlobalScope

type Transformers = typeof import('@huggingface/transformers')
let tf: Transformers | null = null
async function lib(): Promise<Transformers> {
  if (!tf) {
    tf = await import('@huggingface/transformers')
    tf.env.allowLocalModels = false
    tf.env.allowRemoteModels = true
    tf.env.useBrowserCache = true
    tf.env.useWasmCache = false // binarele ONNX Runtime le gestionăm noi (cache „sia-ort”)
  }
  return tf
}

const post = (m: AsrResponse) => self.postMessage(m)

interface OrtManifest {
  version: string
  files: Record<string, { wasmGz: string; mjs: string; wasmGzBytes: number; mjsBytes: number }>
}
const manifest = ortFiles as OrtManifest

/** Șterge din cache binarele ONNX Runtime ale versiunilor vechi ale aplicației. */
async function pruneOldRuntime() {
  const cache = await caches.open(ORT_CACHE)
  for (const req of await cache.keys()) if (!req.url.includes(`/ort/${manifest.version}/`)) await cache.delete(req)
}

/** Citește din cache-ul „sia-ort”; dacă lipsește și e permis, descarcă din aplicație și pune în cache. */
async function cachedFetch(url: string, allowNetwork: boolean, onBytes?: (n: number) => void): Promise<Response> {
  const cache = await caches.open(ORT_CACHE)
  const hit = await cache.match(url)
  if (hit) return hit
  if (!allowNetwork) throw new Error('OFFLINE_MISSING')
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Fișierul ${url} nu a putut fi descărcat (${res.status}).`)
  let body: ArrayBuffer
  if (onBytes && res.body) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let n = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      n += value.length
      onBytes(n)
    }
    const all = new Uint8Array(n)
    let o = 0
    for (const c of chunks) {
      all.set(c, o)
      o += c.length
    }
    body = all.buffer
  } else body = await res.arrayBuffer()
  await cache.put(url, new Response(body, { headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream' } }))
  return (await cache.match(url))!
}

let ortReady: string | null = null
let factoryUrl: string | null = null

async function setupOrt(device: AsrDevice, base: string, allowNetwork: boolean, reqId?: number) {
  const variant = ortVariant(device)
  if (ortReady === variant) return
  const t = await lib()
  if (allowNetwork) await pruneOldRuntime()
  const f = manifest.files[variant]
  if (!f) throw new Error('Fișierele motorului de transcriere lipsesc din aplicație.')
  const total = f.wasmGzBytes + f.mjsBytes
  const mjsRes = await cachedFetch(new URL(f.mjs, base).href, allowNetwork)
  const mjsText = await mjsRes.text()
  const gzRes = await cachedFetch(new URL(f.wasmGz, base).href, allowNetwork, (n) => {
    if (reqId !== undefined) post({ type: 'progress', reqId, loaded: f.mjsBytes + n, total, phase: 'runtime' })
  })
  const stream = (await gzRes.blob()).stream().pipeThrough(new DecompressionStream('gzip'))
  const wasmBinary = await new Response(stream).arrayBuffer()
  const wasm = t.env.backends.onnx.wasm!
  if (factoryUrl) URL.revokeObjectURL(factoryUrl)
  factoryUrl = URL.createObjectURL(new Blob([mjsText], { type: 'text/javascript' }))
  wasm.wasmBinary = wasmBinary
  wasm.wasmPaths = { mjs: factoryUrl }
  wasm.numThreads = 1
  wasm.proxy = false
  ortReady = variant
}

type Asr = Awaited<ReturnType<Transformers['pipeline']>>
let current: { key: string; asr: Asr } | null = null

async function loadPipeline(model: AsrModel, device: AsrDevice, onProgress?: (loaded: number, total: number) => void): Promise<Asr> {
  const key = `${model}|${device}`
  if (current?.key === key) return current.asr
  if (current) {
    try {
      await (current.asr as unknown as { dispose?: () => Promise<void> }).dispose?.()
    } catch {
      /* ignorăm */
    }
    current = null
  }
  const t = await lib()
  const asr = await t.pipeline('automatic-speech-recognition', MODEL_IDS[model], {
    device,
    dtype: dtypeFor(device) as never,
    progress_callback: (info: { status: string; loaded?: number; total?: number }) => {
      if (info.status === 'progress_total' && onProgress && info.total) onProgress(info.loaded ?? 0, info.total)
    },
  })
  current = { key, asr }
  return asr
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg === 'OFFLINE_MISSING') return 'Modelul vocal nu este descărcat complet pe acest telefon. Descarcă-l din Setări → Model vocal, când ai internet.'
  if (/local_files_only|allowRemoteModels|Failed to fetch|NetworkError|Load failed/i.test(msg))
    return 'Modelul vocal nu este descărcat pe acest telefon sau nu există conexiune pentru descărcare. Descarcă-l din Setări → Model vocal, când ai internet.'
  if (/memory|Out of memory|RangeError|allocation|bad_alloc/i.test(msg))
    return 'Telefonul nu are destulă memorie pentru modelul vocal. Încearcă modelul „base” sau închide alte aplicații. Nota rămâne salvată ca audio.'
  return `Transcrierea nu a reușit pe acest dispozitiv (${msg}). Nota rămâne salvată ca audio.`
}

async function handle(req: AsrRequest) {
  const id = MODEL_IDS[req.model]
  const opts = { dtype: dtypeFor(req.device) as never, device: req.device }
  switch (req.type) {
    case 'info': {
      const t = await lib()
      const files = await t.ModelRegistry.get_pipeline_files('automatic-speech-recognition', id, opts)
      let total = 0
      let unknown = 0
      for (const f of files) {
        const meta = await t.ModelRegistry.get_file_metadata(id, f)
        if (!meta.exists) throw new Error(`Fișierul ${f} nu există în modelul ${id}.`)
        if (meta.size) total += meta.size
        else unknown++
      }
      const f = manifest.files[ortVariant(req.device)]
      return { modelBytes: total, runtimeBytes: f.wasmGzBytes + f.mjsBytes, files, unknown }
    }
    case 'status': {
      const t = await lib()
      const cached = await t.ModelRegistry.is_pipeline_cached('automatic-speech-recognition', id, opts)
      const cache = await caches.open(ORT_CACHE)
      const ort = await (async () => {
        try {
          const f = manifest.files[ortVariant(req.device)]
          return !!(await cache.match(new URL(f.wasmGz, req.ortBase).href)) && !!(await cache.match(new URL(f.mjs, req.ortBase).href))
        } catch {
          return false
        }
      })()
      return { cached: cached && ort }
    }
    case 'download': {
      await setupOrt(req.device, req.ortBase, true, req.reqId)
      await loadPipeline(req.model, req.device, (loaded, total) => post({ type: 'progress', reqId: req.reqId, loaded, total, phase: 'model' }))
      return { ok: true }
    }
    case 'delete': {
      const t = await lib()
      if (current?.key.startsWith(req.model + '|')) current = null
      const r = await t.ModelRegistry.clear_pipeline_cache('automatic-speech-recognition', id, opts)
      if (!req.keepOrt) {
        await caches.delete(ORT_CACHE)
        ortReady = null
      }
      return r
    }
    case 'transcribe': {
      await setupOrt(req.device, req.ortBase, true)
      const asr = await loadPipeline(req.model, req.device)
      const out = (await (asr as unknown as (a: Float32Array, o: object) => Promise<{ text: string } | { text: string }[]>)(req.audio, {
        language: 'romanian',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      })) as { text: string } | { text: string }[]
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim()
      return { text }
    }
  }
}

self.onmessage = async (ev: MessageEvent<AsrRequest>) => {
  const req = ev.data
  try {
    const data = await handle(req)
    post({ type: 'result', reqId: req.reqId, data })
  } catch (e) {
    console.error('[asr]', e)
    post({ type: 'error', reqId: req.reqId, message: req.type === 'info' ? infoError(e) : friendly(e) })
  }
}

function infoError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'Nu se poate afla mărimea modelului: nu există conexiune la huggingface.co.'
  return `Nu se poate afla mărimea modelului: ${msg}`
}
