/**
 * Fotografiile, audio-ul și logo-ul se păstrează în IndexedDB ca ArrayBuffer + tip MIME,
 * nu ca Blob: Safari/WebKit refuză Blob-uri în IndexedDB în anumite sesiuni
 * („Error preparing Blob/File data to be stored in object store”). În cod se lucrează tot cu Blob;
 * conversia se face la scriere (asincron, înainte de tranzacție) și la citire (sincron, hook „reading”).
 */
export interface StoredBinary {
  __bin: 1
  buf: ArrayBuffer
  type: string
}

export function isStored(v: unknown): v is StoredBinary {
  return typeof v === 'object' && v !== null && (v as StoredBinary).__bin === 1 && (v as StoredBinary).buf instanceof ArrayBuffer
}

export async function toStored(b: Blob): Promise<StoredBinary> {
  return { __bin: 1, buf: await b.arrayBuffer(), type: b.type }
}

export function fromStored(v: unknown): Blob {
  if (isStored(v)) return new Blob([v.buf], { type: v.type })
  if (v instanceof Blob) return v
  return new Blob([], { type: 'application/octet-stream' })
}
