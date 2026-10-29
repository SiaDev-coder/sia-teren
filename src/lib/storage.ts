export interface StorageInfo {
  usage: number | null
  quota: number | null
  persisted: boolean | null
}

export async function storageInfo(): Promise<StorageInfo> {
  let usage: number | null = null
  let quota: number | null = null
  let persisted: boolean | null = null
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      usage = e.usage ?? null
      quota = e.quota ?? null
    }
  } catch {
    /* necunoscut */
  }
  try {
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted()
  } catch {
    /* necunoscut */
  }
  return { usage, quota, persisted }
}

export async function requestPersist(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch {
    /* nesuportat */
  }
  return null
}
