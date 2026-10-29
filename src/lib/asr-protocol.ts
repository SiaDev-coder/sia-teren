export type AsrDevice = 'webgpu' | 'wasm'
export type AsrModel = 'base' | 'small'

export const MODEL_IDS: Record<AsrModel, string> = {
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
}

export const MODEL_LABELS: Record<AsrModel, string> = {
  base: 'Whisper base (rapid)',
  small: 'Whisper small (recomandat pentru română)',
}

export function dtypeFor(device: AsrDevice): Record<string, string> {
  return device === 'webgpu'
    ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
    : { encoder_model: 'q8', decoder_model_merged: 'q8' }
}

/** Varianta ONNX Runtime WASM potrivită dispozitivului (vezi DECIZII.md). */
export function ortVariant(device: AsrDevice): string {
  return device === 'webgpu' ? 'ort-wasm-simd-threaded.asyncify' : 'ort-wasm-simd-threaded'
}

export const ORT_CACHE = 'sia-ort'

export type AsrRequest =
  | { type: 'info'; reqId: number; model: AsrModel; device: AsrDevice; ortBase: string }
  | { type: 'status'; reqId: number; model: AsrModel; device: AsrDevice; ortBase: string }
  | { type: 'download'; reqId: number; model: AsrModel; device: AsrDevice; ortBase: string }
  | { type: 'delete'; reqId: number; model: AsrModel; device: AsrDevice; ortBase: string; keepOrt: boolean }
  | { type: 'transcribe'; reqId: number; model: AsrModel; device: AsrDevice; ortBase: string; audio: Float32Array }
  | { type: 'selftest'; reqId: number; device: AsrDevice; ortBase: string; model: AsrModel }

export type AsrResponse =
  | { type: 'result'; reqId: number; data: unknown }
  | { type: 'error'; reqId: number; message: string }
  | { type: 'progress'; reqId: number; loaded: number; total: number; phase: 'runtime' | 'model' }
