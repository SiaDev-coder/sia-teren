import type { AsrDevice, AsrModel, AsrRequest, AsrResponse } from './asr-protocol'
import { getSettings, setSetting, type VoiceModelState } from '../db/settings'
import { decodeTo16kMono } from './audio'

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: Progress) => void }>()

export interface Progress {
  loaded: number
  total: number
  phase: 'runtime' | 'model'
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/asr.worker.ts', import.meta.url), { type: 'module', name: 'transcriere' })
    worker.onmessage = (ev: MessageEvent<AsrResponse>) => {
      const m = ev.data
      const p = pending.get(m.reqId)
      if (!p) return
      if (m.type === 'progress') p.onProgress?.({ loaded: m.loaded, total: m.total, phase: m.phase })
      else {
        pending.delete(m.reqId)
        if (m.type === 'result') p.resolve(m.data)
        else p.reject(new Error(m.message))
      }
    }
    worker.onerror = (ev) => {
      for (const [, p] of pending) p.reject(new Error(`Motorul de transcriere s-a oprit: ${ev.message || 'eroare necunoscută'}`))
      pending.clear()
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

type DistOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

function call<T>(
  req: DistOmit<AsrRequest, 'reqId' | 'ortBase'>,
  onProgress?: (p: Progress) => void,
  transfer: Transferable[] = [],
): Promise<T> {
  const reqId = ++seq
  const ortBase = new URL('ort/', document.baseURI).href
  return new Promise<T>((resolve, reject) => {
    pending.set(reqId, { resolve: resolve as (v: unknown) => void, reject, onProgress })
    getWorker().postMessage({ ...req, reqId, ortBase }, transfer)
  })
}

let deviceCache: Promise<AsrDevice> | null = null
/** WebGPU doar dacă navigator.gpu.requestAdapter() întoarce un adaptor non-null; altfel WASM. */
export function detectDevice(): Promise<AsrDevice> {
  if (!deviceCache) {
    deviceCache = (async () => {
      try {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
        const adapter = await gpu?.requestAdapter()
        return adapter ? 'webgpu' : 'wasm'
      } catch {
        return 'wasm'
      }
    })()
  }
  return deviceCache
}

export async function defaultModel(): Promise<AsrModel> {
  return (await detectDevice()) === 'webgpu' ? 'small' : 'base'
}

export async function chosenModel(): Promise<AsrModel> {
  const s = await getSettings()
  return s.voiceModel ?? (await defaultModel())
}

export async function modelInfo(model: AsrModel) {
  const device = await detectDevice()
  return call<{ modelBytes: number; runtimeBytes: number; files: string[]; unknown: number }>({ type: 'info', model, device })
}

export async function downloadModel(model: AsrModel, onProgress: (p: Progress) => void): Promise<void> {
  const device = await detectDevice()
  await call({ type: 'download', model, device }, onProgress)
  const s = await getSettings()
  const list: VoiceModelState[] = s.voiceModelsReady.filter((m) => m.model !== model)
  list.push({ model, device, downloadedAt: Date.now() })
  await setSetting('voiceModelsReady', list)
}

export async function deleteModel(model: AsrModel): Promise<void> {
  const s = await getSettings()
  const ready = s.voiceModelsReady.find((m) => m.model === model)
  const device = ready?.device ?? (await detectDevice())
  const others = s.voiceModelsReady.filter((m) => m.model !== model)
  await call({ type: 'delete', model, device, keepOrt: others.length > 0 })
  await setSetting('voiceModelsReady', others)
}

export async function isModelCached(model: AsrModel): Promise<boolean> {
  const s = await getSettings()
  const ready = s.voiceModelsReady.find((m) => m.model === model)
  if (!ready) return false
  try {
    const r = await call<{ cached: boolean }>({ type: 'status', model, device: ready.device })
    return r.cached
  } catch {
    return false
  }
}

/** Modelul descărcat care va fi folosit la transcriere (cel ales, altfel oricare descărcat). */
export async function readyModel(): Promise<VoiceModelState | null> {
  const s = await getSettings()
  return s.voiceModelsReady.find((m) => m.model === s.voiceModel) ?? s.voiceModelsReady[0] ?? null
}

export async function transcribe(blob: Blob): Promise<string> {
  const ready = await readyModel()
  if (!ready) throw new Error('Modelul vocal nu este descărcat. Mergi la Mai mult → Setări → Model vocal.')
  let audio: Float32Array
  try {
    audio = await decodeTo16kMono(blob)
  } catch {
    throw new Error('Înregistrarea nu a putut fi decodată pe acest telefon. Nota rămâne salvată ca audio.')
  }
  const r = await call<{ text: string }>({ type: 'transcribe', model: ready.model, device: ready.device, audio }, undefined, [audio.buffer])
  return r.text
}

/** Ton de 1 s (440 Hz) ca fișier WAV generat în memorie, pentru verificarea lanțului audio. */
function testWav(sampleRate = 44100): Blob {
  const n = sampleRate
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000), true)
  return new Blob([buf], { type: 'audio/wav' })
}

export interface SelfTestResult {
  device: AsrDevice
  variant: string
  samples16k: number
}

/**
 * Verificare reală a motorului de transcriere pe acest dispozitiv: decodare + reeșantionare la 16 kHz
 * și rularea ONNX Runtime (binarul WASM servit de aplicație / din cache) pe un model minuscul.
 */
export async function selfTest(): Promise<SelfTestResult> {
  const device = await detectDevice()
  const audio = await decodeTo16kMono(testWav())
  if (Math.abs(audio.length - 16000) > 2) throw new Error(`Reeșantionarea audio a dat ${audio.length} eșantioane în loc de 16000.`)
  const r = await call<{ variant: string }>({ type: 'selftest', device, model: 'base' })
  return { device, variant: r.variant, samples16k: audio.length }
}
