import type { Annotation, GpsFix } from '../db/types'
import { formatCoords, roDateTime } from './format'

export const MAX_SIDE = 2048
export const JPEG_QUALITY = 0.85

export interface ProcessedImage {
  blob: Blob
  width: number
  height: number
}

/** Calculează dimensiunile noi păstrând proporția, cu latura mare ≤ max. */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Imaginea nu a putut fi codificată.'))), type, quality),
  )
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // imageOrientation 'from-image' aplică orientarea EXIF (fotografii verticale corecte)
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* încercăm cu <img> mai jos */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Redimensionează la max. 2048 px pe latura mare, JPEG ~0,85, orientare corectă. */
export async function processPhoto(file: Blob): Promise<ProcessedImage> {
  let src: ImageBitmap | HTMLImageElement
  try {
    src = await decode(file)
  } catch {
    throw new Error('Fișierul ales nu este o imagine care poate fi citită.')
  }
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height
  const { width, height } = fitWithin(sw, sh)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Telefonul nu poate procesa imaginea.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, width, height)
  if ('close' in src) src.close()
  const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  return { blob, width, height }
}

/** Grosimea liniei relativ la imagine (aceeași proporție la orice mărime). */
export function strokeWidthFor(w: number, h: number): number {
  return Math.max(3, Math.round(Math.max(w, h) / 220))
}

export function drawAnnotations(ctx: CanvasRenderingContext2D, anns: Annotation[], w: number, h: number): void {
  const lw = strokeWidthFor(w, h)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const a of anns) {
    ctx.strokeStyle = a.color
    ctx.fillStyle = a.color
    ctx.lineWidth = lw
    const pts = a.points.map((p) => ({ x: p.x * w, y: p.y * h }))
    if (pts.length === 0) continue
    if (a.tool === 'free') {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
      ctx.stroke()
    } else if (a.tool === 'rect' && pts.length >= 2) {
      const [p, q] = pts
      ctx.strokeRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x), Math.abs(q.y - p.y))
    } else if (a.tool === 'ellipse' && pts.length >= 2) {
      const [p, q] = pts
      ctx.beginPath()
      ctx.ellipse((p.x + q.x) / 2, (p.y + q.y) / 2, Math.abs(q.x - p.x) / 2, Math.abs(q.y - p.y) / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (a.tool === 'arrow' && pts.length >= 2) {
      const [p, q] = pts
      const ang = Math.atan2(q.y - p.y, q.x - p.x)
      const head = lw * 5
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(q.x, q.y)
      ctx.lineTo(q.x - head * Math.cos(ang - Math.PI / 7), q.y - head * Math.sin(ang - Math.PI / 7))
      ctx.lineTo(q.x - head * Math.cos(ang + Math.PI / 7), q.y - head * Math.sin(ang + Math.PI / 7))
      ctx.closePath()
      ctx.fill()
    } else if (a.tool === 'text' && a.text) {
      const size = Math.round(lw * 7)
      ctx.font = `bold ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
      ctx.textBaseline = 'top'
      ctx.lineWidth = Math.max(2, lw * 0.8)
      ctx.strokeStyle = a.color === '#ffffff' || a.color === '#ffd400' ? '#000000' : '#ffffff'
      ctx.strokeText(a.text, pts[0].x, pts[0].y)
      ctx.fillText(a.text, pts[0].x, pts[0].y)
    }
  }
  ctx.restore()
}

export interface BandInfo {
  takenAt: number
  gps: GpsFix | null
  projectName: string
}

export function bandText(info: BandInfo): string {
  const parts = [roDateTime(info.takenAt)]
  parts.push(info.gps ? `GPS ${formatCoords(info.gps.lat, info.gps.lng)} (±${info.gps.accuracy} m)` : 'fără GPS')
  parts.push(info.projectName)
  return parts.join('  ·  ')
}

/**
 * Compune fotografia pentru export: original + adnotări + bandă de text arsă în imagine.
 * Originalul din baza de date rămâne neschimbat.
 */
export async function composeForExport(
  blob: Blob,
  annotations: Annotation[],
  info: BandInfo,
  maxSide = 1600,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const src = await decode(blob)
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height
  const { width, height } = fitWithin(sw, sh, maxSide)
  const fontSize = Math.max(14, Math.round(width / 48))
  const bandH = Math.round(fontSize * 2)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height + bandH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Telefonul nu poate procesa imaginea.')
  ctx.drawImage(src, 0, 0, width, height)
  if ('close' in src) src.close()
  drawAnnotations(ctx, annotations, width, height)
  ctx.fillStyle = '#111111'
  ctx.fillRect(0, height, width, bandH)
  ctx.fillStyle = '#ffffff'
  ctx.font = `${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.textBaseline = 'middle'
  let text = bandText(info)
  while (ctx.measureText(text).width > width - fontSize && text.length > 10) text = text.slice(0, -2)
  if (text !== bandText(info)) text = text.trimEnd() + '…'
  ctx.fillText(text, fontSize / 2, height + bandH / 2)
  const out = await canvasToBlob(canvas, 'image/jpeg', 0.85)
  return { bytes: new Uint8Array(await out.arrayBuffer()), width, height: height + bandH }
}

/** Convertește logo-ul încărcat în PNG (max. 600 px), ca să poată fi pus în PDF. */
export async function processLogo(file: Blob): Promise<Blob> {
  let src: ImageBitmap | HTMLImageElement
  try {
    src = await decode(file)
  } catch {
    throw new Error('Logo-ul ales nu este o imagine care poate fi citită.')
  }
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height
  const { width, height } = fitWithin(sw, sh, 600)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Telefonul nu poate procesa imaginea.')
  ctx.drawImage(src, 0, 0, width, height)
  if ('close' in src) src.close()
  return canvasToBlob(canvas, 'image/png')
}
