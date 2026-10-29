export const TARGET_SAMPLE_RATE = 16000
export const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'] as const

/** Primul tip de înregistrare suportat (iPhone: audio/mp4). '' dacă niciunul. */
export function pickRecorderMime(isSupported: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string {
  for (const t of RECORDER_TYPES) {
    try {
      if (isSupported(t)) return t
    } catch {
      /* continuăm */
    }
  }
  return ''
}

export function extensionForMime(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'bin'
}

/** Amestecă toate canalele într-unul singur (medie). */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const len = channels[0].length
  const out = new Float32Array(len)
  for (const ch of channels) for (let i = 0; i < len; i++) out[i] += ch[i] / channels.length
  return out
}

/**
 * Reeșantionare prin interpolare liniară cu filtrare anti-aliasing simplă (medie pe fereastră)
 * la micșorare. Folosită când OfflineAudioContext nu există; altfel se folosește resampleWithWebAudio.
 */
export function resampleLinear(input: Float32Array, fromRate: number, toRate = TARGET_SAMPLE_RATE): Float32Array {
  if (fromRate === toRate) return input.slice()
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLen)
  const half = ratio > 1 ? Math.floor(ratio / 2) : 0
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    if (half > 0) {
      const c = Math.round(pos)
      let sum = 0
      let n = 0
      for (let k = c - half; k <= c + half; k++) {
        if (k >= 0 && k < input.length) {
          sum += input[k]
          n++
        }
      }
      out[i] = n ? sum / n : 0
    } else {
      const i0 = Math.floor(pos)
      const i1 = Math.min(i0 + 1, input.length - 1)
      const t = pos - i0
      out[i] = input[i0] * (1 - t) + input[i1] * t
    }
  }
  return out
}

/** Decodează un fișier audio și îl reeșantionează la 16 kHz mono Float32Array (formatul cerut de Whisper). */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const data = await blob.arrayBuffer()
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(data)
  } finally {
    void ctx.close()
  }
  return resampleWithWebAudio(decoded)
}

export async function resampleWithWebAudio(decoded: AudioBuffer): Promise<Float32Array> {
  if (typeof OfflineAudioContext === 'undefined') {
    const chans = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i))
    return resampleLinear(downmixToMono(chans), decoded.sampleRate)
  }
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE))
  // 1 canal la ieșire: Web Audio face automat downmix-ul canalelor la mono
  const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}
