import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addPhoto, photosFor, setAnnotations, softDelete, updatePhoto } from '../db/repo'
import type { OwnerType, Photo, PhotoRole } from '../db/types'
import { processPhoto, drawAnnotations } from '../lib/photo'
import { getPosition } from '../lib/gps'
import { formatCoords, roDateTime } from '../lib/format'
import { useObjectUrl } from './useObjectUrl'
import { Annotator } from './Annotator'
import { Sheet, confirmDialog, toast, errorMessage } from './ui'
import { IconCamera, IconEdit, IconImage, IconTrash } from './icons'

async function geolocationAllowed(): Promise<boolean> {
  try {
    const st = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    return st?.state !== 'denied'
  } catch {
    return true
  }
}

export interface PhotoSectionHandle {
  openCamera: () => void
}

interface Props {
  projectId: string
  ownerType: OwnerType
  ownerId: string
  role: PhotoRole
  disabled?: boolean
  label?: string
}

export const PhotoSection = forwardRef<PhotoSectionHandle, Props>(function PhotoSection(
  { projectId, ownerType, ownerId, role, disabled, label },
  ref,
) {
  const all = useLiveQuery(() => photosFor(ownerType, ownerId), [ownerType, ownerId])
  const photos = (all ?? []).filter((p) => (role === 'general' ? true : p.role === role))
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const [open, setOpen] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({ openCamera: () => camRef.current?.click() }), [])

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    const list = Array.from(files)
    setBusy(list.length)
    const ids: string[] = []
    let failed = 0
    for (const f of list) {
      try {
        const img = await processPhoto(f)
        const p = await addPhoto({ projectId, ownerType, ownerId, role, ...img, takenAt: Date.now(), gps: null })
        ids.push(p.id)
      } catch (e) {
        failed++
        toast(errorMessage(e), 'error')
      }
      setBusy((b) => b - 1)
    }
    if (ids.length) toast(ids.length === 1 ? 'Fotografie salvată.' : `${ids.length} fotografii salvate.`, 'ok')
    if (failed && !ids.length) return
    // GPS în fundal, dacă e permis: fotografia e deja salvată, coordonatele se adaugă când sosesc.
    if (ids.length && (await geolocationAllowed())) {
      const r = await getPosition()
      if (r.ok) for (const id of ids) await updatePhoto(id, { gps: r.fix })
    }
  }

  const current = photos.find((p) => p.id === open) ?? null

  return (
    <div>
      {label && <h3 style={{ fontSize: 17, margin: '4px 0 8px' }}>{label}</h3>}
      {photos.length > 0 ? (
        <div className="photos">
          {photos.map((p, i) => (
            <Thumb key={p.id} photo={p} index={i} onOpen={() => setOpen(p.id)} />
          ))}
        </div>
      ) : (
        <p className="muted small">Nicio fotografie încă.</p>
      )}
      {busy > 0 && <p className="muted small">Se procesează {busy} fotografii…</p>}
      {!disabled && (
        <div className="photo-actions">
          <button type="button" className="btn primary" onClick={() => camRef.current?.click()}>
            <IconCamera /> Fotografiază
          </button>
          <button type="button" className="btn" onClick={() => galRef.current?.click()}>
            <IconImage /> Din galerie
          </button>
        </div>
      )}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid={`camera-input-${role}`}
        onChange={(e) => {
          void onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid={`gallery-input-${role}`}
        onChange={(e) => {
          void onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {current && <PhotoViewer photo={current} readOnly={!!disabled} onClose={() => setOpen(null)} />}
    </div>
  )
})

function Thumb({ photo, index, onOpen }: { photo: Photo; index: number; onOpen: () => void }) {
  const url = useObjectUrl(photo.blob)
  return (
    <button type="button" className="thumb" onClick={onOpen} aria-label={`Deschide fotografia ${index + 1}`}>
      {url && <img src={url} alt="" loading="lazy" decoding="async" />}
      {photo.annotations.length > 0 && <span className="tag">adnotată</span>}
    </button>
  )
}

/** Previzualizare: originalul + stratul de adnotări desenat deasupra (fără a modifica originalul). */
function Composite({ photo }: { photo: Photo }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const url = useObjectUrl(photo.blob)
  useEffect(() => {
    if (!url) return
    const img = new Image()
    img.onload = () => {
      const c = ref.current
      if (!c) return
      c.width = photo.width
      c.height = photo.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, c.width, c.height)
      drawAnnotations(ctx, photo.annotations, c.width, c.height)
    }
    img.src = url
  }, [url, photo])
  return <canvas ref={ref} style={{ width: '100%', borderRadius: 10, background: '#000', display: 'block' }} aria-label="Fotografie" />
}

function PhotoViewer({ photo, readOnly, onClose }: { photo: Photo; readOnly: boolean; onClose: () => void }) {
  const [annotating, setAnnotating] = useState(false)
  const [caption, setCaption] = useState(photo.caption)
  if (annotating)
    return (
      <Annotator
        photo={photo}
        onCancel={() => setAnnotating(false)}
        onSave={async (a) => {
          await setAnnotations(photo.id, a)
          setAnnotating(false)
          toast('Adnotările au fost salvate.', 'ok')
        }}
      />
    )
  return (
    <Sheet title="Fotografie" onClose={onClose}>
      <div className="viewer stack">
        <Composite photo={photo} />
        <div className="muted small">
          {roDateTime(photo.takenAt)} ·{' '}
          {photo.gps ? `GPS ${formatCoords(photo.gps.lat, photo.gps.lng)} (±${photo.gps.accuracy} m)` : 'fără GPS'}
        </div>
        <label className="field">
          <span>Descriere</span>
          <input
            type="text"
            value={caption}
            disabled={readOnly}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => caption !== photo.caption && updatePhoto(photo.id, { caption })}
          />
        </label>
        {!readOnly && (
          <div className="grid2">
            <button className="btn primary" onClick={() => setAnnotating(true)}>
              <IconEdit /> Adnotează
            </button>
            <button
              className="btn danger"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'Ștergi fotografia?',
                  message: 'Fotografia ajunge în Coș și poate fi recuperată 30 de zile.',
                  confirmLabel: 'Șterge',
                  danger: true,
                })
                if (!ok) return
                await softDelete('photos', photo.id)
                onClose()
                toast('Fotografia a fost mutată în Coș.')
              }}
            >
              <IconTrash /> Șterge
            </button>
          </div>
        )}
        <button
          className="btn block"
          onClick={async () => {
            if (caption !== photo.caption) await updatePhoto(photo.id, { caption })
            onClose()
          }}
        >
          Închide
        </button>
      </div>
    </Sheet>
  )
}
