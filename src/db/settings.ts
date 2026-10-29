import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { toStored } from './binary'

export type Theme = 'auto' | 'light' | 'dark'
export type VoiceModelId = 'base' | 'small'

export interface VoiceModelState {
  model: VoiceModelId
  device: 'webgpu' | 'wasm'
  downloadedAt: number
}

export interface Settings {
  companyName: string
  userName: string
  theme: Theme
  logo: Blob | null
  /** modelul ales de utilizator (null = alegere automată) */
  voiceModel: VoiceModelId | null
  /** modelele descărcate pentru folosire offline */
  voiceModelsReady: VoiceModelState[]
  lastBackupAt: number | null
  lastDataChangeAt: number | null
  persistRequested: boolean
  persistGranted: boolean | null
  lastPurgeAt: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  companyName: 'SIA Dynamic Solution SRL',
  userName: '',
  theme: 'auto',
  logo: null,
  voiceModel: null,
  voiceModelsReady: [],
  lastBackupAt: null,
  lastDataChangeAt: null,
  persistRequested: false,
  persistGranted: null,
  lastPurgeAt: null,
}

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray()
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value
  return out as unknown as Settings
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.settings.get(key)
  return (row ? row.value : DEFAULT_SETTINGS[key]) as Settings[K]
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await db.settings.put({ key, value: value instanceof Blob ? await toStored(value) : value })
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(getSettings, [])
}
